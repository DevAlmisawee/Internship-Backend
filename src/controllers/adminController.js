const User = require('../models/User');
const Student = require('../models/Student');
const Company = require('../models/Company');
const Internship = require('../models/Internship');
const Application = require('../models/Application');
const Supervisor = require('../models/Supervisor');
const Coordinator = require('../models/Coordinator');
const University = require('../models/University');
const StudentInternship = require('../models/StudentInternship');
const Attendance = require('../models/Attendance');
const StudentPerformance = require('../models/StudentPerformance');
const ActivityLog = require('../models/ActivityLog');
const { asyncHandler } = require('../middleware/errorHandler');
const { sendEmail, emailTemplates } = require('../services/emailService');
const { createNotification } = require('../services/notificationService');

/**
 * @route GET /api/admin/dashboard
 * Admin dashboard: totals across the whole platform.
 */
const getDashboard = asyncHandler(async (req, res) => {
  const [
    totalStudents,
    totalSupervisors,
    totalCompanies,
    approvedCompanies,
    pendingCompanies,
    totalInternships,
    totalApplications,
    acceptedApplications,
    rejectedApplications,
    activeInternships,
    completedInternships,
    pendingInternshipApprovals,
    attendanceStats,
    performanceRecords,
    predictionCounts,
    recentActivityLogs,
    totalUniversities,
    totalCoordinators,
  ] = await Promise.all([
    Student.countDocuments(),
    Supervisor.countDocuments(),
    Company.countDocuments(),
    Company.countDocuments({ approved: true }),
    Company.countDocuments({ approved: false }),
    Internship.countDocuments(),
    Application.countDocuments(),
    Application.countDocuments({ status: 'Accepted' }),
    Application.countDocuments({ status: 'Rejected' }),
    StudentInternship.countDocuments({ status: 'Active' }),
    StudentInternship.countDocuments({ status: 'Completed' }),
    StudentInternship.countDocuments({ status: 'Pending Approval' }),
    Attendance.aggregate([
      {
        $group: {
          _id: null,
          present: { $sum: { $cond: [{ $in: ['$status', ['Present', 'Late']] }, 1, 0] } },
          total: { $sum: 1 },
        },
      },
    ]),
    StudentPerformance.find({}, 'prediction.performanceScore prediction.result'),
    StudentPerformance.aggregate([{ $group: { _id: '$prediction.result', count: { $sum: 1 } } }]),
    ActivityLog.find().sort({ createdAt: -1 }).limit(10).populate({
      path: 'studentId',
      populate: { path: 'userId', select: 'name' },
    }),
    University.countDocuments(),
    Coordinator.countDocuments(),
  ]);

  const scored = performanceRecords.filter((p) => typeof p.prediction?.performanceScore === 'number');
  const averagePerformance = scored.length
    ? Math.round(
        (scored.reduce((sum, p) => sum + p.prediction.performanceScore, 0) / scored.length) * 10
      ) / 10
    : null;

  const attendancePercentage = attendanceStats[0]
    ? Math.round((attendanceStats[0].present / attendanceStats[0].total) * 1000) / 10
    : 0;

  const predictionSummary = predictionCounts.reduce((acc, p) => {
    acc[p._id || 'Pending'] = p.count;
    return acc;
  }, {});

  res.status(200).json({
    success: true,
    message: 'Admin dashboard stats',
    data: {
      totalStudents,
      totalSupervisors,
      totalCompanies,
      approvedCompanies,
      pendingCompanies,
      totalInternships,
      totalApplications,
      acceptedApplications,
      rejectedApplications,
      activeInternships,
      completedInternships,
      pendingInternshipApprovals,
      attendanceStatistics: {
        attendancePercentage,
        totalRecords: attendanceStats[0]?.total || 0,
      },
      averageStudentPerformance: averagePerformance,
      predictionSummary,
      totalUniversities,
      totalCoordinators,
      recentActivityLogs: recentActivityLogs.map((log) => ({
        studentName: log.studentId?.userId?.name || 'Unknown',
        title: log.title,
        status: log.status,
        date: log.date,
      })),
    },
  });
});

/**
 * @route GET /api/admin/users
 * Supports ?role= filter and basic pagination.
 */
const getUsers = asyncHandler(async (req, res) => {
  const { role, search, page = 1, limit = 20 } = req.query;
  const filter = role ? { role } : {};
  if (search && search.trim()) {
    const rx = new RegExp(search.trim(), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    User.countDocuments(filter),
  ]);

  // Student/supervisor results need their profile document's own _id (not
  // User._id) for callers that assign/link them elsewhere (e.g. supervisor
  // assignment, coordinator assignment), since those relationships are
  // keyed off the Student/Supervisor profile documents, not the User doc.
  let profileIdByUserId = {};
  if (role === 'student') {
    const studentDocs = await Student.find({ userId: { $in: users.map((u) => u._id) } }, 'userId');
    profileIdByUserId = Object.fromEntries(studentDocs.map((s) => [String(s.userId), s._id]));
  } else if (role === 'supervisor') {
    const supervisorDocs = await Supervisor.find({ userId: { $in: users.map((u) => u._id) } }, 'userId');
    profileIdByUserId = Object.fromEntries(supervisorDocs.map((s) => [String(s.userId), s._id]));
  }

  res.status(200).json({
    success: true,
    message: 'Users retrieved',
    data: {
      users: users.map((u) => ({ ...u.toObject(), profileId: profileIdByUserId[String(u._id)] })),
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    },
  });
});

/**
 * @route DELETE /api/admin/users/:id
 * Removes a user and any role-specific profile document tied to them.
 */
const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  if (user.role === 'student') {
    await Student.findOneAndDelete({ userId: user._id });
  } else if (user.role === 'company') {
    const company = await Company.findOneAndDelete({ userId: user._id });
    if (company) await Internship.deleteMany({ companyId: company._id });
  } else if (user.role === 'supervisor') {
    await Supervisor.findOneAndDelete({ userId: user._id });
  } else if (user.role === 'coordinator') {
    const coordinator = await Coordinator.findOneAndDelete({ userId: user._id });
    // Unlink any students left pointing at the deleted coordinator so
    // getMyStudents-style ownership checks don't dangle.
    if (coordinator) await Student.updateMany({ coordinator: coordinator._id }, { coordinator: null });
  } else if (user.role === 'university') {
    const university = await University.findOneAndDelete({ userId: user._id });
    if (university) {
      // Deleting a university cascades to its coordinators and unlinks
      // their students, same reasoning as the coordinator branch above.
      const coordinators = await Coordinator.find({ assignedUniversity: university._id });
      const coordinatorUserIds = coordinators.map((c) => c.userId);
      await Coordinator.deleteMany({ assignedUniversity: university._id });
      await User.deleteMany({ _id: { $in: coordinatorUserIds } });
      await Student.updateMany({ university: university._id }, { university: null, coordinator: null });
    }
  }

  await user.deleteOne();

  res.status(200).json({ success: true, message: 'User deleted', data: {} });
});

/**
 * @route PUT /api/admin/users/:id/deactivate
 * Soft alternative to deletion.
 */
const toggleUserActive = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }
  user.isActive = !user.isActive;
  await user.save();
  res.status(200).json({
    success: true,
    message: `User ${user.isActive ? 'activated' : 'deactivated'}`,
    data: { user },
  });
});

/**
 * @route PUT /api/admin/company/:id/approve
 */
const approveCompany = asyncHandler(async (req, res) => {
  const company = await Company.findById(req.params.id).populate('userId', 'name email');
  if (!company) {
    return res.status(404).json({ success: false, message: 'Company not found' });
  }

  company.approved = true;
  await company.save();

  await createNotification(
    company.userId._id,
    'Company Approved',
    'Your company account has been approved. You can now post internships.'
  );
  sendEmail({ to: company.userId.email, ...emailTemplates.companyApproved(company.companyName) });

  res.status(200).json({ success: true, message: 'Company approved', data: { company } });
});

/**
 * @route PUT /api/admin/supervisors/:supervisorId/assign/:studentId
 * Assigns a student to a supervisor (bidirectional reference).
 */
const assignSupervisor = asyncHandler(async (req, res) => {
  const { supervisorId, studentId } = req.params;

  const supervisor = await Supervisor.findById(supervisorId).populate('userId', 'name');
  const student = await Student.findById(studentId).populate('userId', 'name');

  if (!supervisor) {
    return res.status(404).json({ success: false, message: 'Supervisor not found' });
  }
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student not found' });
  }

  if (!supervisor.assignedStudents.some((id) => id.toString() === studentId)) {
    supervisor.assignedStudents.push(studentId);
    await supervisor.save();
  }
  student.supervisorId = supervisor._id;
  await student.save();

  await createNotification(
    student.userId._id,
    'Supervisor Assigned',
    `${supervisor.userId.name} has been assigned as your supervisor.`
  );

  res.status(200).json({ success: true, message: 'Supervisor assigned', data: { student, supervisor } });
});

/**
 * @route GET /api/admin/users/:id
 * @desc  Full detail for the admin single-user profile page: the User doc
 *        plus whatever role-specific profile is linked (Student/Supervisor/
 *        Company), and for students, their latest ML performance record.
 */
const getUserDetail = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  let profile = null;
  let performance = null;

  if (user.role === 'student') {
    profile = await Student.findOne({ userId: user._id }).populate({
      path: 'supervisorId',
      populate: { path: 'userId', select: 'name email' },
    });
    if (profile) {
      performance = await StudentPerformance.findOne({ studentId: profile._id });
    }
  } else if (user.role === 'supervisor') {
    profile = await Supervisor.findOne({ userId: user._id });
  } else if (user.role === 'company') {
    profile = await Company.findOne({ userId: user._id });
  } else if (user.role === 'coordinator') {
    profile = await Coordinator.findOne({ userId: user._id }).populate('assignedUniversity', 'universityName abbreviation');
  } else if (user.role === 'university') {
    profile = await University.findOne({ userId: user._id });
  }

  res.status(200).json({ success: true, message: 'User detail retrieved', data: { user, profile, performance } });
});

/**
 * @route PUT /api/admin/students/:studentId
 * @desc  Admin edits a student's profile on their behalf. studentId is the
 *        Student document's _id, not the User's _id. Updates both the User
 *        (name, phone) and Student (matricNumber, department, faculty,
 *        level, cgpa, bio) documents in one call.
 */
const updateStudentProfile = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.studentId);
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student not found' });
  }

  const { name, phone, matricNumber, department, faculty, level, cgpa, bio } = req.body;

  if (name !== undefined || phone !== undefined) {
    await User.findByIdAndUpdate(student.userId, {
      ...(name !== undefined && { name }),
      ...(phone !== undefined && { phone }),
    });
  }

  const updates = { matricNumber, department, faculty, level, cgpa, bio };
  Object.entries(updates).forEach(([key, value]) => {
    if (value !== undefined) student[key] = value;
  });
  await student.save();

  const user = await User.findById(student.userId);
  res.status(200).json({ success: true, message: 'Student profile updated', data: { user, student } });
});

module.exports = {
  getDashboard,
  getUsers,
  getUserDetail,
  updateStudentProfile,
  deleteUser,
  toggleUserActive,
  approveCompany,
  assignSupervisor,
};
