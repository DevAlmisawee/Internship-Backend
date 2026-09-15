const Company = require('../models/Company');
const Internship = require('../models/Internship');
const Application = require('../models/Application');
const StudentInternship = require('../models/StudentInternship');
const Student = require('../models/Student');
const Supervisor = require('../models/Supervisor');
const User = require('../models/User');
const { asyncHandler } = require('../middleware/errorHandler');
const { uploadToCloudinary } = require('../config/cloudinary');
const { createNotification } = require('../services/notificationService');

/**
 * @route POST /api/company
 * Creates/completes a company profile for the logged-in company user.
 * (The base record is auto-created at registration; this fills in details.)
 */
const createOrUpdateCompany = asyncHandler(async (req, res) => {
  const { companyName, industry, address, website, description } = req.body;

  const company = await Company.findOneAndUpdate(
    { userId: req.user._id },
    {
      ...(companyName !== undefined && { companyName }),
      ...(industry !== undefined && { industry }),
      ...(address !== undefined && { address }),
      ...(website !== undefined && { website }),
      ...(description !== undefined && { description }),
    },
    { new: true, upsert: true, runValidators: true }
  );

  res.status(200).json({ success: true, message: 'Company profile saved', data: { company } });
});

/**
 * @route GET /api/company
 * Lists companies. Admins see all; the public/students see only approved companies.
 */
const getCompanies = asyncHandler(async (req, res) => {
  const filter = req.user?.role === 'admin' ? {} : { approved: true };
  const companies = await Company.find(filter).populate('userId', 'name email');
  res.status(200).json({ success: true, message: 'Companies retrieved', data: { companies } });
});

/**
 * @route GET /api/company/:id
 */
const getCompanyById = asyncHandler(async (req, res) => {
  const company = await Company.findById(req.params.id).populate('userId', 'name email');
  if (!company) {
    return res.status(404).json({ success: false, message: 'Company not found' });
  }
  res.status(200).json({ success: true, message: 'Company retrieved', data: { company } });
});

/**
 * @route PUT /api/company/:id
 * Company can edit its own profile; admin can edit any.
 */
const updateCompany = asyncHandler(async (req, res) => {
  const company = await Company.findById(req.params.id);
  if (!company) {
    return res.status(404).json({ success: false, message: 'Company not found' });
  }

  if (req.user.role !== 'admin' && company.userId.toString() !== req.user._id.toString()) {
    return res.status(403).json({ success: false, message: 'Not authorized to edit this company' });
  }

  const allowedFields = ['companyName', 'industry', 'address', 'website', 'description'];
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) company[field] = req.body[field];
  });

  await company.save();
  res.status(200).json({ success: true, message: 'Company updated', data: { company } });
});

/**
 * @route DELETE /api/company/:id
 * Admin only (enforced via route middleware).
 */
const deleteCompany = asyncHandler(async (req, res) => {
  const company = await Company.findByIdAndDelete(req.params.id);
  if (!company) {
    return res.status(404).json({ success: false, message: 'Company not found' });
  }
  // Cascade: remove the company's internships too
  await Internship.deleteMany({ companyId: company._id });
  res.status(200).json({ success: true, message: 'Company deleted', data: {} });
});

/**
 * @route POST /api/company/logo
 * Uploads a company logo (multipart/form-data, field name "logo").
 */
const uploadLogo = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No logo file uploaded' });
  }

  const result = await uploadToCloudinary(req.file.path, 'interniq/logos', 'image');

  const company = await Company.findOneAndUpdate(
    { userId: req.user._id },
    { logo: { url: result.secure_url, publicId: result.public_id } },
    { new: true }
  );

  res.status(200).json({ success: true, message: 'Logo uploaded', data: { company } });
});

/**
 * @route GET /api/company/dashboard
 * Company dashboard: internships posted, applications received, accepted/rejected counts.
 */
const getDashboard = asyncHandler(async (req, res) => {
  const company = await Company.findOne({ userId: req.user._id });
  if (!company) {
    return res.status(404).json({ success: false, message: 'Company profile not found' });
  }

  const [internshipsPosted, applicationsReceived, accepted, rejected] = await Promise.all([
    Internship.countDocuments({ companyId: company._id }),
    Application.countDocuments({ companyId: company._id }),
    Application.countDocuments({ companyId: company._id, status: 'Accepted' }),
    Application.countDocuments({ companyId: company._id, status: 'Rejected' }),
  ]);

  res.status(200).json({
    success: true,
    message: 'Company dashboard stats',
    data: { internshipsPosted, applicationsReceived, accepted, rejected },
  });
});

/**
 * @route GET /api/company/students
 * @desc  Students currently (or previously) placed at this company, via
 *        their StudentInternship record, each with their current
 *        university supervisor if one has been assigned.
 */
const getOrgStudents = asyncHandler(async (req, res) => {
  const company = await Company.findOne({ userId: req.user._id });
  if (!company) {
    return res.status(404).json({ success: false, message: 'Company profile not found' });
  }

  const students = await StudentInternship.find({ companyId: company._id })
    .populate({ path: 'studentId', populate: { path: 'userId', select: 'name email' } })
    .populate({ path: 'universitySupervisorId', populate: { path: 'userId', select: 'name email' } })
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, message: 'Students retrieved', data: { students } });
});

/**
 * @route GET /api/company/supervisors
 * @desc  Supervisors added by this company.
 */
const getOrgSupervisors = asyncHandler(async (req, res) => {
  const company = await Company.findOne({ userId: req.user._id });
  if (!company) {
    return res.status(404).json({ success: false, message: 'Company profile not found' });
  }

  const supervisors = await Supervisor.find({ companyId: company._id }).populate('userId', 'name email');
  res.status(200).json({ success: true, message: 'Supervisors retrieved', data: { supervisors } });
});

/**
 * @route POST /api/company/supervisors
 * @desc  Creates a supervisor account (User + Supervisor profile) tied to
 *        this company. Mirrors the account-creation pattern in
 *        authController.register, minus the auto-login token.
 */
const addOrgSupervisor = asyncHandler(async (req, res) => {
  const company = await Company.findOne({ userId: req.user._id });
  if (!company) {
    return res.status(404).json({ success: false, message: 'Company profile not found' });
  }

  const { name, email, password, phone, department, office } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'Name, email and password are required' });
  }

  const existing = await User.findOne({ email });
  if (existing) {
    return res.status(400).json({ success: false, message: 'Email already exists' });
  }

  const user = await User.create({ name, email, password, role: 'supervisor', phone });
  const supervisor = await Supervisor.create({ userId: user._id, companyId: company._id, department, office });
  const populated = await Supervisor.findById(supervisor._id).populate('userId', 'name email');

  res.status(201).json({ success: true, message: 'Supervisor added', data: { supervisor: populated } });
});

/**
 * @route PUT /api/company/students/:internshipId/supervisor
 * @desc  Assigns (or reassigns) which of the company's supervisors is
 *        responsible for a placed student. Keeps Student.supervisorId and
 *        Supervisor.assignedStudents in sync so the assignment is visible
 *        everywhere else in the app (messaging contacts, the supervisor's
 *        own Performance/Attendance/Tasks views), not just on this record.
 */
const assignStudentSupervisor = asyncHandler(async (req, res) => {
  const company = await Company.findOne({ userId: req.user._id });
  if (!company) {
    return res.status(404).json({ success: false, message: 'Company profile not found' });
  }

  const { supervisorId } = req.body;
  if (!supervisorId) {
    return res.status(400).json({ success: false, message: 'supervisorId is required' });
  }

  const placement = await StudentInternship.findById(req.params.internshipId);
  if (!placement) {
    return res.status(404).json({ success: false, message: 'Placement not found' });
  }
  if (!placement.companyId || placement.companyId.toString() !== company._id.toString()) {
    return res.status(403).json({ success: false, message: 'This placement does not belong to your organization' });
  }

  const supervisor = await Supervisor.findById(supervisorId);
  if (!supervisor || !supervisor.companyId || supervisor.companyId.toString() !== company._id.toString()) {
    return res.status(400).json({ success: false, message: 'Invalid supervisor for this organization' });
  }

  // Unassign from the previous supervisor's roster, if this is a reassignment
  if (placement.universitySupervisorId && placement.universitySupervisorId.toString() !== supervisorId) {
    await Supervisor.findByIdAndUpdate(placement.universitySupervisorId, { $pull: { assignedStudents: placement.studentId } });
  }

  placement.universitySupervisorId = supervisorId;
  await placement.save();

  await Student.findByIdAndUpdate(placement.studentId, { supervisorId });
  await Supervisor.findByIdAndUpdate(supervisorId, { $addToSet: { assignedStudents: placement.studentId } });

  const student = await Student.findById(placement.studentId);
  if (student?.userId) {
    await createNotification(student.userId, 'Supervisor Assigned', 'You have been assigned a university supervisor for your internship.');
  }

  const populated = await StudentInternship.findById(placement._id)
    .populate({ path: 'studentId', populate: { path: 'userId', select: 'name email' } })
    .populate({ path: 'universitySupervisorId', populate: { path: 'userId', select: 'name email' } });

  res.status(200).json({ success: true, message: 'Supervisor assigned', data: { placement: populated } });
});

module.exports = {
  createOrUpdateCompany,
  getCompanies,
  getCompanyById,
  updateCompany,
  deleteCompany,
  uploadLogo,
  getDashboard,
  getOrgStudents,
  getOrgSupervisors,
  addOrgSupervisor,
  assignStudentSupervisor,
};
