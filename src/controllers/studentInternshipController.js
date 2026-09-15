const StudentInternship = require('../models/StudentInternship');
const Student = require('../models/Student');
const Supervisor = require('../models/Supervisor');
const { asyncHandler } = require('../middleware/errorHandler');
const { createNotification } = require('../services/notificationService');

/**
 * @route POST /api/student-internships
 * Student enters their internship placement information
 * (spec: Student Module -> "Internship Information").
 */
const createOrUpdateInternship = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ userId: req.user._id });
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student profile not found' });
  }

  const {
    companyName,
    companyAddress,
    companySupervisorName,
    companySupervisorEmail,
    companySupervisorPhone,
    position,
    duration,
    startDate,
    endDate,
  } = req.body;

  const existing = await StudentInternship.findOne({ studentId: student._id });

  const payload = {
    studentId: student._id,
    companyName,
    companyAddress,
    companySupervisorName,
    companySupervisorEmail,
    companySupervisorPhone,
    universitySupervisorId: student.supervisorId || null,
    position,
    duration,
    startDate,
    endDate,
  };

  let record;
  if (existing) {
    Object.assign(existing, payload);
    // Editing after approval resets it for re-approval
    if (existing.status !== 'Pending Approval') existing.status = 'Pending Approval';
    await existing.save();
    record = existing;
  } else {
    record = await StudentInternship.create(payload);
  }

  res.status(200).json({
    success: true,
    message: 'Internship information saved and pending admin approval',
    data: { internship: record },
  });
});

/**
 * @route GET /api/student-internships/me
 */
const getMyInternship = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ userId: req.user._id });
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student profile not found' });
  }

  const internship = await StudentInternship.findOne({ studentId: student._id }).populate({
    path: 'universitySupervisorId',
    populate: { path: 'userId', select: 'name email' },
  });

  res.status(200).json({ success: true, message: 'Internship record retrieved', data: { internship } });
});

/**
 * @route GET /api/student-internships/student/:studentId
 * Supervisor/Admin view.
 */
const getStudentInternship = asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  if (req.user.role === 'supervisor') {
    const supervisor = await Supervisor.findOne({ userId: req.user._id });
    const isAssigned = supervisor?.assignedStudents.some((id) => id.toString() === studentId);
    if (!isAssigned) {
      return res.status(403).json({ success: false, message: 'This student is not assigned to you' });
    }
  }

  const internship = await StudentInternship.findOne({ studentId });
  res.status(200).json({ success: true, message: 'Internship record retrieved', data: { internship } });
});

/**
 * @route GET /api/student-internships
 * Admin: list all, with optional ?status= filter.
 */
const getAllInternships = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;

  const internships = await StudentInternship.find(filter)
    .populate({ path: 'studentId', populate: { path: 'userId', select: 'name email' } })
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, message: 'Internships retrieved', data: { internships } });
});

/**
 * @route PUT /api/student-internships/:id/approve
 * Admin approves a student's internship placement.
 */
const approveInternship = asyncHandler(async (req, res) => {
  const internship = await StudentInternship.findById(req.params.id).populate('studentId');
  if (!internship) {
    return res.status(404).json({ success: false, message: 'Internship record not found' });
  }

  internship.status = 'Active';
  internship.approvedBy = req.user._id;
  await internship.save();

  if (internship.studentId?.userId) {
    await createNotification(
      internship.studentId.userId,
      'Internship Placement Approved',
      `Your internship placement at ${internship.companyName} has been approved.`
    );
  }

  res.status(200).json({ success: true, message: 'Internship approved', data: { internship } });
});

/**
 * @route PUT /api/student-internships/:id/status
 * Admin/Supervisor marks internship Completed / Terminated.
 */
const updateInternshipStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['Active', 'Completed', 'Terminated'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status' });
  }

  const internship = await StudentInternship.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true }
  );
  if (!internship) {
    return res.status(404).json({ success: false, message: 'Internship record not found' });
  }

  res.status(200).json({ success: true, message: 'Internship status updated', data: { internship } });
});

module.exports = {
  createOrUpdateInternship,
  getMyInternship,
  getStudentInternship,
  getAllInternships,
  approveInternship,
  updateInternshipStatus,
};
