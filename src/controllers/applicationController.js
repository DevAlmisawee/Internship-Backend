const Application = require('../models/Application');
const Internship = require('../models/Internship');
const Student = require('../models/Student');
const Company = require('../models/Company');
const StudentInternship = require('../models/StudentInternship');
const { asyncHandler } = require('../middleware/errorHandler');
const { uploadToCloudinary } = require('../config/cloudinary');
const { sendEmail, emailTemplates } = require('../services/emailService');
const { createNotification } = require('../services/notificationService');

/**
 * Estimates an end date from an internship's free-text `duration` field
 * (e.g. "3 months", "12 weeks", "6-month"). Falls back to 3 months when the
 * text can't be parsed, since posted internships don't carry explicit
 * start/end dates the way a manually-entered placement does.
 */
const estimateEndDate = (startDate, durationText) => {
  const end = new Date(startDate);
  const match = /(\d+)\s*(day|week|month|year)/i.exec(durationText || '');
  const amount = match ? parseInt(match[1], 10) : 3;
  const unit = match ? match[2].toLowerCase() : 'month';

  if (unit === 'day') end.setDate(end.getDate() + amount);
  else if (unit === 'week') end.setDate(end.getDate() + amount * 7);
  else if (unit === 'year') end.setFullYear(end.getFullYear() + amount);
  else end.setMonth(end.getMonth() + amount);

  return end;
};

/**
 * @route POST /api/applications
 * Student applies to an internship. Accepts multipart/form-data with
 * an optional "resume" file, plus internshipId and coverLetter fields.
 */
const createApplication = asyncHandler(async (req, res) => {
  const { internshipId, coverLetter } = req.body;

  const internship = await Internship.findById(internshipId);
  if (!internship) {
    return res.status(404).json({ success: false, message: 'Internship not found' });
  }
  if (internship.status !== 'open') {
    return res.status(400).json({ success: false, message: 'This internship is no longer accepting applications' });
  }

  const student = await Student.findOne({ userId: req.user._id });
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student profile not found' });
  }

  const existing = await Application.findOne({ studentId: student._id, internshipId });
  if (existing) {
    return res.status(400).json({ success: false, message: 'You have already applied to this internship' });
  }

  let resume = { url: '', publicId: '' };
  if (req.file) {
    const result = await uploadToCloudinary(req.file.path, 'interniq/resumes', 'raw');
    resume = { url: result.secure_url, publicId: result.public_id };
  } else if (student.cv?.url) {
    // Fall back to the CV already on file
    resume = student.cv;
  }

  const application = await Application.create({
    studentId: student._id,
    internshipId,
    companyId: internship.companyId,
    coverLetter,
    resume,
  });

  // Notify + email the student that their application was submitted
  await createNotification(
    req.user._id,
    'Application Submitted',
    `Your application for "${internship.title}" was submitted successfully.`
  );
  const template = emailTemplates.applicationConfirmation(internship.title);
  sendEmail({ to: req.user.email, ...template });

  // Notify the company of a new applicant
  const company = await Company.findById(internship.companyId);
  if (company) {
    await createNotification(
      company.userId,
      'New Application Received',
      `A new application was received for "${internship.title}".`
    );
  }

  res.status(201).json({ success: true, message: 'Application submitted', data: { application } });
});

/**
 * @route GET /api/applications
 * Returns applications scoped to the requester's role:
 *  - student: their own applications
 *  - company: applications to their internships
 *  - admin: all applications
 */
const getApplications = asyncHandler(async (req, res) => {
  let filter = {};

  if (req.user.role === 'student') {
    const student = await Student.findOne({ userId: req.user._id });
    filter.studentId = student?._id;
  } else if (req.user.role === 'company') {
    const company = await Company.findOne({ userId: req.user._id });
    filter.companyId = company?._id;
  }
  // admin: no filter, sees all

  if (req.query.status) {
    filter.status = req.query.status;
  }
  if (req.query.internshipId) {
    filter.internshipId = req.query.internshipId;
  }

  const applications = await Application.find(filter)
    .populate('studentId', 'matricNumber department')
    .populate({ path: 'studentId', populate: { path: 'userId', select: 'name email' } })
    .populate('internshipId', 'title location deadline')
    .populate('companyId', 'companyName')
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, message: 'Applications retrieved', data: { applications } });
});

/**
 * @route GET /api/applications/:id
 */
const getApplicationById = asyncHandler(async (req, res) => {
  const application = await Application.findById(req.params.id)
    .populate({ path: 'studentId', populate: { path: 'userId', select: 'name email phone' } })
    .populate('internshipId')
    .populate('companyId', 'companyName');

  if (!application) {
    return res.status(404).json({ success: false, message: 'Application not found' });
  }

  res.status(200).json({ success: true, message: 'Application retrieved', data: { application } });
});

/**
 * @route PUT /api/applications/:id
 * Company (owner) or admin updates status: Pending | Reviewed | Accepted | Rejected.
 */
const updateApplicationStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['Pending', 'Reviewed', 'Accepted', 'Rejected'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: `Status must be one of: ${validStatuses.join(', ')}` });
  }

  const application = await Application.findById(req.params.id)
    .populate('internshipId')
    .populate({ path: 'studentId', populate: { path: 'userId', select: 'name email' } });

  if (!application) {
    return res.status(404).json({ success: false, message: 'Application not found' });
  }

  if (req.user.role === 'company') {
    const company = await Company.findOne({ userId: req.user._id });
    if (!company || application.companyId.toString() !== company._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this application' });
    }
  }

  application.status = status;
  await application.save();

  const studentUser = application.studentId?.userId;
  if (studentUser) {
    const title = application.internshipId?.title || 'the internship';

    if (status === 'Accepted') {
      // The student officially becomes an intern of this organisation: create
      // (or update, if they already had a placement record) their
      // StudentInternship so they show up under the company's "My Interns"
      // and can be managed from there — see StudentInternship model notes.
      const placementCompany = await Company.findById(application.companyId);
      const startDate = new Date();
      const endDate = estimateEndDate(startDate, application.internshipId?.duration);

      await StudentInternship.findOneAndUpdate(
        { studentId: application.studentId._id },
        {
          studentId: application.studentId._id,
          applicationId: application._id,
          companyId: application.companyId,
          companyName: placementCompany?.companyName || 'Unknown company',
          companyAddress: placementCompany?.address || '',
          position: application.internshipId?.title || '',
          duration: application.internshipId?.duration || '',
          startDate,
          endDate,
          status: 'Active',
          approvedBy: req.user._id,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
      );

      await createNotification(studentUser._id, 'Application Accepted', `Your application for "${title}" was accepted!`);
      sendEmail({ to: studentUser.email, ...emailTemplates.applicationAccepted(title) });
    } else if (status === 'Rejected') {
      await createNotification(studentUser._id, 'Application Rejected', `Your application for "${title}" was not successful.`);
      sendEmail({ to: studentUser.email, ...emailTemplates.applicationRejected(title) });
    } else {
      await createNotification(studentUser._id, 'Application Status Updated', `Your application for "${title}" is now "${status}".`);
    }
  }

  res.status(200).json({ success: true, message: 'Application status updated', data: { application } });
});

/**
 * @route DELETE /api/applications/:id
 * Student can withdraw their own pending application; admin can delete any.
 */
const deleteApplication = asyncHandler(async (req, res) => {
  const application = await Application.findById(req.params.id);
  if (!application) {
    return res.status(404).json({ success: false, message: 'Application not found' });
  }

  if (req.user.role === 'student') {
    const student = await Student.findOne({ userId: req.user._id });
    if (!student || application.studentId.toString() !== student._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this application' });
    }
  } else if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Not authorized to delete this application' });
  }

  await application.deleteOne();
  res.status(200).json({ success: true, message: 'Application withdrawn', data: {} });
});

module.exports = {
  createApplication,
  getApplications,
  getApplicationById,
  updateApplicationStatus,
  deleteApplication,
};
