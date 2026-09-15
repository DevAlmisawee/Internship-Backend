const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const Student = require('../models/Student');
const Coordinator = require('../models/Coordinator');
const University = require('../models/University');
const StudentInternship = require('../models/StudentInternship');
const StudentPerformance = require('../models/StudentPerformance');
const Report = require('../models/Report');
const Attendance = require('../models/Attendance');
const Notification = require('../models/Notification');
const { asyncHandler } = require('../middleware/errorHandler');
const { sendEmail, emailTemplates } = require('../services/emailService');
const { createNotification } = require('../services/notificationService');

const genTempPassword = () => crypto.randomBytes(6).toString('hex'); // 12 chars

/* ════════════════════════════════════════════════════════════════════════
   ADMIN — Coordinator Management
   ════════════════════════════════════════════════════════════════════════ */

/**
 * @route POST /api/coordinators
 * @access Admin. Creates the User + Coordinator profile in one step and
 * emails the coordinator their temporary password, mirroring how a
 * university would actually onboard staff (admin-provisioned, not
 * self-registered).
 */
const createCoordinator = asyncHandler(async (req, res) => {
  const { name, email, phone, department, position, assignedUniversity } = req.body;

  if (!name || !email) {
    return res.status(400).json({ success: false, message: 'Name and email are required' });
  }

  const existing = await User.findOne({ email });
  if (existing) {
    return res.status(400).json({ success: false, message: 'Email already exists' });
  }

  let university = null;
  if (assignedUniversity) {
    university = await University.findById(assignedUniversity);
    if (!university) {
      return res.status(404).json({ success: false, message: 'University not found' });
    }
  }

  const tempPassword = genTempPassword();
  const user = await User.create({ name, email, password: tempPassword, role: 'coordinator', phone });
  const coordinator = await Coordinator.create({
    userId: user._id,
    department: department || '',
    position: position || '',
    assignedUniversity: university?._id || null,
  });

  const template = emailTemplates.coordinatorAccountCreated(name, email, tempPassword, university?.universityName);
  sendEmail({ to: email, ...template });

  res.status(201).json({
    success: true,
    message: 'Coordinator created. Login details have been emailed to them.',
    data: { coordinator, user },
  });
});

/**
 * @route GET /api/coordinators
 * @access Admin. Supports search, university filter, and pagination.
 */
const getCoordinators = asyncHandler(async (req, res) => {
  const { search = '', university, page = 1, limit = 10 } = req.query;

  const filter = {};
  if (university) filter.assignedUniversity = university;

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);

  let query = Coordinator.find(filter)
    .populate('userId', 'name email phone isActive')
    .populate('assignedUniversity', 'universityName abbreviation')
    .sort({ createdAt: -1 });

  let coordinators = await query;

  if (search) {
    const s = search.toLowerCase();
    coordinators = coordinators.filter(
      (c) => c.userId?.name?.toLowerCase().includes(s) || c.userId?.email?.toLowerCase().includes(s)
    );
  }

  const total = coordinators.length;
  const page_ = coordinators.slice((pageNum - 1) * limitNum, pageNum * limitNum);

  res.status(200).json({
    success: true,
    message: 'Coordinators retrieved',
    data: {
      coordinators: page_.map((c) => ({
        _id: c._id,
        userId: c.userId,
        department: c.department,
        position: c.position,
        assignedUniversity: c.assignedUniversity,
        studentCount: c.assignedStudents.length,
        createdAt: c.createdAt,
      })),
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    },
  });
});

/**
 * @route GET /api/coordinators/:id
 * @access Admin
 */
const getCoordinatorAdmin = asyncHandler(async (req, res) => {
  const coordinator = await Coordinator.findById(req.params.id)
    .populate('userId', 'name email phone isActive')
    .populate('assignedUniversity', 'universityName abbreviation')
    .populate({ path: 'assignedStudents', populate: { path: 'userId', select: 'name email' } });

  if (!coordinator) {
    return res.status(404).json({ success: false, message: 'Coordinator not found' });
  }

  res.status(200).json({ success: true, message: 'Coordinator retrieved', data: { coordinator } });
});

/**
 * @route PUT /api/coordinators/:id
 * @access Admin. Edits both the User (name/phone) and Coordinator
 * (department/position/assignedUniversity) documents in one call, mirroring
 * adminController.updateStudentProfile's pattern.
 */
const updateCoordinator = asyncHandler(async (req, res) => {
  const coordinator = await Coordinator.findById(req.params.id);
  if (!coordinator) {
    return res.status(404).json({ success: false, message: 'Coordinator not found' });
  }

  const { name, phone, department, position, assignedUniversity } = req.body;

  if (name !== undefined || phone !== undefined) {
    await User.findByIdAndUpdate(coordinator.userId, {
      ...(name !== undefined && { name }),
      ...(phone !== undefined && { phone }),
    });
  }

  if (assignedUniversity !== undefined) {
    if (assignedUniversity) {
      const uni = await University.findById(assignedUniversity);
      if (!uni) return res.status(404).json({ success: false, message: 'University not found' });
    }
    coordinator.assignedUniversity = assignedUniversity || null;
  }
  if (department !== undefined) coordinator.department = department;
  if (position !== undefined) coordinator.position = position;
  await coordinator.save();

  const updated = await Coordinator.findById(coordinator._id)
    .populate('userId', 'name email phone')
    .populate('assignedUniversity', 'universityName abbreviation');

  res.status(200).json({ success: true, message: 'Coordinator updated', data: { coordinator: updated } });
});

/**
 * @route PUT /api/coordinators/:id/reset-password
 * @access Admin. Generates a new temp password and emails it, same idea as
 * the account-creation flow.
 */
const resetCoordinatorPassword = asyncHandler(async (req, res) => {
  const coordinator = await Coordinator.findById(req.params.id).populate('userId', 'name email');
  if (!coordinator) {
    return res.status(404).json({ success: false, message: 'Coordinator not found' });
  }

  const tempPassword = genTempPassword();
  const user = await User.findById(coordinator.userId._id).select('+password');
  user.password = tempPassword;
  await user.save();

  const template = emailTemplates.coordinatorAccountCreated(coordinator.userId.name, coordinator.userId.email, tempPassword, null);
  sendEmail({ to: coordinator.userId.email, subject: 'Your InternIQ Coordinator Password Was Reset', html: template.html });

  res.status(200).json({ success: true, message: 'Password reset. New credentials have been emailed.', data: {} });
});

/**
 * @route PUT /api/coordinators/:id/students/:studentId
 * @desc  Assign a student to this coordinator. Setting Student.coordinator
 * and Student.university keeps the relationship queryable from both sides.
 * @access Admin
 */
const assignStudentToCoordinator = asyncHandler(async (req, res) => {
  const { id: coordinatorId, studentId } = req.params;

  const [coordinator, student] = await Promise.all([Coordinator.findById(coordinatorId), Student.findById(studentId)]);
  if (!coordinator) return res.status(404).json({ success: false, message: 'Coordinator not found' });
  if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

  if (!coordinator.assignedStudents.some((s) => String(s) === String(student._id))) {
    coordinator.assignedStudents.push(student._id);
    await coordinator.save();
  }

  student.coordinator = coordinator._id;
  if (coordinator.assignedUniversity) student.university = coordinator.assignedUniversity;
  await student.save();

  const coordinatorUser = await User.findById(coordinator.userId);
  await createNotification(
    student.userId,
    'University Coordinator Assigned',
    `${coordinatorUser?.name || 'A coordinator'} has been assigned as your university coordinator.`
  );

  res.status(200).json({ success: true, message: 'Student assigned to coordinator', data: {} });
});

/**
 * @route DELETE /api/coordinators/:id/students/:studentId
 * @access Admin
 */
const removeStudentFromCoordinator = asyncHandler(async (req, res) => {
  const { id: coordinatorId, studentId } = req.params;

  const coordinator = await Coordinator.findById(coordinatorId);
  if (!coordinator) return res.status(404).json({ success: false, message: 'Coordinator not found' });

  coordinator.assignedStudents = coordinator.assignedStudents.filter((s) => String(s) !== String(studentId));
  await coordinator.save();

  await Student.findOneAndUpdate({ _id: studentId, coordinator: coordinatorId }, { coordinator: null });

  res.status(200).json({ success: true, message: 'Student removed from coordinator', data: {} });
});

/* ════════════════════════════════════════════════════════════════════════
   COORDINATOR — Self-service
   ════════════════════════════════════════════════════════════════════════ */

const findOwnCoordinator = async (userId) => Coordinator.findOne({ userId });

/**
 * @route GET /api/coordinators/me/profile
 */
const getProfile = asyncHandler(async (req, res) => {
  const coordinator = await Coordinator.findOne({ userId: req.user._id })
    .populate('userId', 'name email phone')
    .populate('assignedUniversity', 'universityName abbreviation logo website');

  if (!coordinator) {
    return res.status(404).json({ success: false, message: 'Coordinator profile not found' });
  }

  res.status(200).json({ success: true, message: 'Profile retrieved', data: { coordinator } });
});

/**
 * @route PUT /api/coordinators/me/profile
 * @desc  A coordinator can edit their own name/phone/department/position,
 * but not their university or student list — those are admin-controlled.
 */
const updateProfile = asyncHandler(async (req, res) => {
  const coordinator = await findOwnCoordinator(req.user._id);
  if (!coordinator) {
    return res.status(404).json({ success: false, message: 'Coordinator profile not found' });
  }

  const { name, phone, department, position } = req.body;
  if (name !== undefined || phone !== undefined) {
    await User.findByIdAndUpdate(req.user._id, {
      ...(name !== undefined && { name }),
      ...(phone !== undefined && { phone }),
    });
  }
  if (department !== undefined) coordinator.department = department;
  if (position !== undefined) coordinator.position = position;
  await coordinator.save();

  const updated = await Coordinator.findById(coordinator._id).populate('userId', 'name email phone');
  res.status(200).json({ success: true, message: 'Profile updated', data: { coordinator: updated } });
});

/**
 * @route GET /api/coordinators/me/dashboard
 * @desc  Stats + chart data scoped to this coordinator's assigned students only.
 */
const getDashboard = asyncHandler(async (req, res) => {
  const coordinator = await findOwnCoordinator(req.user._id);
  if (!coordinator) {
    return res.status(404).json({ success: false, message: 'Coordinator profile not found' });
  }
  const studentIds = coordinator.assignedStudents;

  const [internships, performances, pendingReports, students, notifications] = await Promise.all([
    StudentInternship.find({ studentId: { $in: studentIds } }, 'studentId status companyId companyName'),
    StudentPerformance.find({ studentId: { $in: studentIds } }, 'studentId prediction.result prediction.performanceScore'),
    Report.countDocuments({ studentId: { $in: studentIds }, status: { $ne: 'Reviewed' } }),
    Student.find({ _id: { $in: studentIds } }, 'department faculty'),
    Notification.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(8),
  ]);

  const statusCounts = internships.reduce((acc, i) => { acc[i.status] = (acc[i.status] || 0) + 1; return acc; }, {});

  const gradeCounts = { Excellent: 0, Good: 0, Average: 0, Fair: 0, Poor: 0, Pending: 0 };
  performances.forEach((p) => {
    const r = p.prediction?.result || 'Pending';
    gradeCounts[r] = (gradeCounts[r] || 0) + 1;
  });
  const highPerformers   = gradeCounts.Excellent + gradeCounts.Good;
  const mediumPerformers = gradeCounts.Average;
  const lowPerformers    = gradeCounts.Fair + gradeCounts.Poor;
  const atRisk           = gradeCounts.Poor;

  const departmentCounts = students.reduce((acc, s) => {
    const key = s.department || 'Unspecified';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const companyCounts = internships.reduce((acc, i) => {
    const key = i.companyName || 'Unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  res.status(200).json({
    success: true,
    message: 'Dashboard retrieved',
    data: {
      cards: {
        totalStudents: studentIds.length,
        activeInterns: statusCounts.Active || 0,
        completedInternship: statusCounts.Completed || 0,
        highPerformers,
        mediumPerformers,
        lowPerformers,
        predictedAtRisk: atRisk,
        pendingReports,
      },
      charts: {
        performanceDistribution: gradeCounts,
        departmentDistribution: departmentCounts,
        companyDistribution: companyCounts,
        predictionDistribution: gradeCounts,
      },
      notifications,
    },
  });
});

/**
 * @route GET /api/coordinators/me/students
 * @desc  This coordinator's assigned students only, with search + filters +
 * pagination. Joins in current placement + latest ML prediction.
 */
const getMyStudents = asyncHandler(async (req, res) => {
  const coordinator = await findOwnCoordinator(req.user._id);
  if (!coordinator) {
    return res.status(404).json({ success: false, message: 'Coordinator profile not found' });
  }

  const { search = '', department, faculty, level, internshipStatus, prediction, page = 1, limit = 10 } = req.query;
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);

  const match = { _id: { $in: coordinator.assignedStudents } };
  if (department) match.department = department;
  if (faculty) match.faculty = faculty;
  if (level) match.level = level;

  const pipeline = [
    { $match: match },
    { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
    { $lookup: { from: 'studentinternships', localField: '_id', foreignField: 'studentId', as: 'internship' } },
    { $unwind: { path: '$internship', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'studentperformances', localField: '_id', foreignField: 'studentId', as: 'performance' } },
    { $unwind: { path: '$performance', preserveNullAndEmptyArrays: true } },
  ];

  if (search) {
    const rx = new RegExp(search, 'i');
    pipeline.push({ $match: { $or: [{ 'user.name': rx }, { matricNumber: rx }] } });
  }
  if (internshipStatus) pipeline.push({ $match: { 'internship.status': internshipStatus } });
  if (prediction) pipeline.push({ $match: { 'performance.prediction.result': prediction } });

  pipeline.push({ $sort: { 'user.name': 1 } });

  const countPipeline = [...pipeline, { $count: 'total' }];
  const dataPipeline = [...pipeline, { $skip: (pageNum - 1) * limitNum }, { $limit: limitNum }];

  const [countResult, rows] = await Promise.all([
    Student.aggregate(countPipeline),
    Student.aggregate(dataPipeline),
  ]);
  const total = countResult[0]?.total || 0;

  const students = rows.map((s) => ({
    _id: s._id,
    name: s.user.name,
    email: s.user.email,
    profilePicture: s.profilePicture,
    matricNumber: s.matricNumber,
    department: s.department,
    faculty: s.faculty,
    level: s.level,
    semester: s.semester,
    company: s.internship?.companyName || null,
    internshipStatus: s.internship?.status || null,
    attendance: s.performance?.features?.attendance ?? null,
    performanceScore: s.performance?.prediction?.performanceScore ?? null,
    predictedGrade: s.performance?.prediction?.result || 'Pending',
    confidence: s.performance?.prediction?.confidence ?? null,
  }));

  res.status(200).json({
    success: true,
    message: 'Students retrieved',
    data: { students, pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) } },
  });
});

/**
 * @route GET /api/coordinators/me/students/:studentId
 * @desc  Full profile for one assigned student. Rejects if the student
 * isn't actually assigned to this coordinator — the ownership check that
 * keeps one coordinator from ever seeing another's students.
 */
const getStudentDetail = asyncHandler(async (req, res) => {
  const coordinator = await findOwnCoordinator(req.user._id);
  if (!coordinator) {
    return res.status(404).json({ success: false, message: 'Coordinator profile not found' });
  }
  if (!coordinator.assignedStudents.some((s) => String(s) === req.params.studentId)) {
    return res.status(403).json({ success: false, message: 'This student is not assigned to you' });
  }

  const [student, internship, performance, attendanceSummary, reports] = await Promise.all([
    Student.findById(req.params.studentId).populate('userId', 'name email phone'),
    StudentInternship.findOne({ studentId: req.params.studentId }),
    StudentPerformance.findOne({ studentId: req.params.studentId }),
    Attendance.aggregate([
      { $match: { studentId: new mongoose.Types.ObjectId(req.params.studentId) } },
      { $group: { _id: null, present: { $sum: { $cond: [{ $in: ['$status', ['Present', 'Late']] }, 1, 0] } }, total: { $sum: 1 } } },
    ]),
    Report.find({ studentId: req.params.studentId }).sort({ createdAt: -1 }).limit(5),
  ]);

  if (!student) {
    return res.status(404).json({ success: false, message: 'Student not found' });
  }

  const notes = coordinator.notes
    .filter((n) => String(n.studentId) === req.params.studentId)
    .sort((a, b) => b.createdAt - a.createdAt);

  const att = attendanceSummary[0];
  const attendancePercentage = att && att.total > 0 ? Math.round((att.present / att.total) * 100) : null;

  res.status(200).json({
    success: true,
    message: 'Student detail retrieved',
    data: { student, internship, performance, attendancePercentage, recentReports: reports, notes },
  });
});

/**
 * @route POST /api/coordinators/me/students/:studentId/notes
 */
const addStudentNote = asyncHandler(async (req, res) => {
  const coordinator = await findOwnCoordinator(req.user._id);
  if (!coordinator) {
    return res.status(404).json({ success: false, message: 'Coordinator profile not found' });
  }
  if (!coordinator.assignedStudents.some((s) => String(s) === req.params.studentId)) {
    return res.status(403).json({ success: false, message: 'This student is not assigned to you' });
  }

  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ success: false, message: 'Note text is required' });
  }

  coordinator.notes.push({ studentId: req.params.studentId, text: text.trim() });
  await coordinator.save();

  res.status(201).json({ success: true, message: 'Note added', data: { notes: coordinator.notes.filter((n) => String(n.studentId) === req.params.studentId) } });
});

module.exports = {
  createCoordinator,
  getCoordinators,
  getCoordinatorAdmin,
  updateCoordinator,
  resetCoordinatorPassword,
  assignStudentToCoordinator,
  removeStudentFromCoordinator,
  getProfile,
  updateProfile,
  getDashboard,
  getMyStudents,
  getStudentDetail,
  addStudentNote,
};
