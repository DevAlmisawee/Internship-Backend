const Student = require('../models/Student');
const Application = require('../models/Application');
const Internship = require('../models/Internship');
const Attendance = require('../models/Attendance');
const ActivityLog = require('../models/ActivityLog');
const Report = require('../models/Report');
const StudentPerformance = require('../models/StudentPerformance');
const { asyncHandler } = require('../middleware/errorHandler');
const { uploadToCloudinary } = require('../config/cloudinary');
const { summarize: summarizeAttendance } = require('./attendanceController');

/**
 * @route GET /api/students/profile
 */
const getProfile = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ userId: req.user._id }).populate(
    'userId',
    'name email phone profilePicture'
  );

  if (!student) {
    return res.status(404).json({ success: false, message: 'Student profile not found' });
  }

  res.status(200).json({ success: true, message: 'Student profile', data: { student } });
});

/**
 * @route PUT /api/students/profile
 */
const updateProfile = asyncHandler(async (req, res) => {
  const { department, faculty, level, cgpa, skills, bio, matricNumber } = req.body;

  const student = await Student.findOneAndUpdate(
    { userId: req.user._id },
    {
      ...(department !== undefined && { department }),
      ...(faculty !== undefined && { faculty }),
      ...(level !== undefined && { level }),
      ...(cgpa !== undefined && { cgpa }),
      ...(skills !== undefined && { skills }),
      ...(bio !== undefined && { bio }),
      ...(matricNumber !== undefined && { matricNumber }),
    },
    { new: true, runValidators: true }
  );

  if (!student) {
    return res.status(404).json({ success: false, message: 'Student profile not found' });
  }

  res.status(200).json({ success: true, message: 'Profile updated', data: { student } });
});

/**
 * @route POST /api/students/cv
 * Uploads a CV (multipart/form-data, field name "cv") to Cloudinary.
 */
const uploadCV = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No CV file uploaded' });
  }

  const result = await uploadToCloudinary(req.file.path, 'interniq/cv', 'raw');

  const student = await Student.findOneAndUpdate(
    { userId: req.user._id },
    { cv: { url: result.secure_url, publicId: result.public_id } },
    { new: true }
  );

  res.status(200).json({ success: true, message: 'CV uploaded successfully', data: { student } });
});

/**
 * @route POST /api/students/passport-photo
 * Uploads a passport photograph (spec: Student Profile -> Passport Photograph).
 */
const uploadPassportPhoto = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No photo uploaded' });
  }

  const result = await uploadToCloudinary(req.file.path, 'interniq/passport-photos', 'image');

  const student = await Student.findOneAndUpdate(
    { userId: req.user._id },
    { passportPhoto: { url: result.secure_url, publicId: result.public_id } },
    { new: true }
  );

  res.status(200).json({ success: true, message: 'Passport photo uploaded successfully', data: { student } });
});

/**
 * @route GET /api/students/applications
 */
const getMyApplications = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ userId: req.user._id });
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student profile not found' });
  }

  const applications = await Application.find({ studentId: student._id })
    .populate('internshipId', 'title location duration deadline status')
    .populate('companyId', 'companyName')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    message: 'Applications retrieved',
    data: { applications },
  });
});

/**
 * @route POST /api/students/saved/:internshipId
 * Toggles save/unsave for an internship.
 */
const toggleSavedInternship = asyncHandler(async (req, res) => {
  const { internshipId } = req.params;

  const internship = await Internship.findById(internshipId);
  if (!internship) {
    return res.status(404).json({ success: false, message: 'Internship not found' });
  }

  const student = await Student.findOne({ userId: req.user._id });
  const alreadySaved = student.savedInternships.some((id) => id.toString() === internshipId);

  if (alreadySaved) {
    student.savedInternships = student.savedInternships.filter((id) => id.toString() !== internshipId);
  } else {
    student.savedInternships.push(internshipId);
  }
  await student.save();

  res.status(200).json({
    success: true,
    message: alreadySaved ? 'Internship removed from saved list' : 'Internship saved',
    data: { savedInternships: student.savedInternships },
  });
});

/**
 * @route GET /api/students/saved
 */
const getSavedInternships = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ userId: req.user._id }).populate('savedInternships');
  res.status(200).json({
    success: true,
    message: 'Saved internships retrieved',
    data: { savedInternships: student?.savedInternships || [] },
  });
});

/**
 * @route GET /api/students/dashboard
 * Student dashboard stats: applications submitted/accepted/rejected/pending, saved count.
 */
const getDashboard = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ userId: req.user._id });
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student profile not found' });
  }

  const [submitted, accepted, rejected, pending, activityLogCounts, reportCounts, performance] =
    await Promise.all([
      Application.countDocuments({ studentId: student._id }),
      Application.countDocuments({ studentId: student._id, status: 'Accepted' }),
      Application.countDocuments({ studentId: student._id, status: 'Rejected' }),
      Application.countDocuments({ studentId: student._id, status: 'Pending' }),
      ActivityLog.aggregate([
        { $match: { studentId: student._id } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Report.aggregate([
        { $match: { studentId: student._id } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      StudentPerformance.findOne({ studentId: student._id }),
    ]);

  const attendanceStats = summarizeAttendance(await Attendance.find({ studentId: student._id }));

  res.status(200).json({
    success: true,
    message: 'Student dashboard stats',
    data: {
      applicationsSubmitted: submitted,
      accepted,
      rejected,
      pending,
      savedInternships: student.savedInternships.length,
      attendance: attendanceStats,
      activityLogs: activityLogCounts.reduce((acc, c) => ({ ...acc, [c._id]: c.count }), {}),
      reports: reportCounts.reduce((acc, c) => ({ ...acc, [c._id]: c.count }), {}),
      prediction: performance?.prediction || null,
    },
  });
});

module.exports = {
  getProfile,
  updateProfile,
  uploadCV,
  uploadPassportPhoto,
  getMyApplications,
  toggleSavedInternship,
  getSavedInternships,
  getDashboard,
};
