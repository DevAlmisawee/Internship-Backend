const ActivityLog = require('../models/ActivityLog');
const Student = require('../models/Student');
const Supervisor = require('../models/Supervisor');
const { asyncHandler } = require('../middleware/errorHandler');
const { createNotification } = require('../services/notificationService');

/**
 * @route POST /api/activity-logs
 * Student submits a daily activity log entry.
 */
const createActivityLog = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ userId: req.user._id });
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student profile not found' });
  }

  const {
    date,
    title,
    description,
    hoursWorked,
    skillsLearned,
    challengesEncountered,
    solutionsApplied,
  } = req.body;

  const evidence = (req.files || []).map((f) => ({
    url: `/uploads/${f.filename}`,
    fileName: f.originalname,
    fileType: f.mimetype.startsWith('image/') ? 'image' : f.mimetype === 'application/pdf' ? 'pdf' : 'document',
  }));

  const log = await ActivityLog.create({
    studentId: student._id,
    date,
    title,
    description,
    hoursWorked,
    skillsLearned: Array.isArray(skillsLearned)
      ? skillsLearned
      : (skillsLearned || '').split(',').map((s) => s.trim()).filter(Boolean),
    challengesEncountered,
    solutionsApplied,
    evidence,
  });

  // Notify assigned supervisor
  if (student.supervisorId) {
    const supervisor = await Supervisor.findById(student.supervisorId);
    if (supervisor?.userId) {
      await createNotification(
        supervisor.userId,
        'New Activity Log Submitted',
        `A student submitted a new activity log: "${title}". Please review.`
      );
    }
  }

  res.status(201).json({ success: true, message: 'Activity log submitted', data: { log } });
});

/**
 * @route GET /api/activity-logs/me
 * Student views their own activity logs.
 */
const getMyActivityLogs = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ userId: req.user._id });
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student profile not found' });
  }

  const filter = { studentId: student._id };
  if (req.query.status) filter.status = req.query.status;

  const logs = await ActivityLog.find(filter).sort({ date: -1 });
  res.status(200).json({ success: true, message: 'Activity logs retrieved', data: { logs } });
});

/**
 * @route GET /api/activity-logs/student/:studentId
 * Supervisor/Admin views a specific student's activity logs.
 */
const getStudentActivityLogs = asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  if (req.user.role === 'supervisor') {
    const supervisor = await Supervisor.findOne({ userId: req.user._id });
    const isAssigned = supervisor?.assignedStudents.some((id) => id.toString() === studentId);
    if (!isAssigned) {
      return res.status(403).json({ success: false, message: 'This student is not assigned to you' });
    }
  }

  const filter = { studentId };
  if (req.query.status) filter.status = req.query.status;

  const logs = await ActivityLog.find(filter).sort({ date: -1 });
  res.status(200).json({ success: true, message: 'Activity logs retrieved', data: { logs } });
});

/**
 * @route PUT /api/activity-logs/:id/review
 * Supervisor approves or rejects a student's activity log.
 * Body: { status: 'Approved' | 'Rejected', reviewComment }
 */
const reviewActivityLog = asyncHandler(async (req, res) => {
  const supervisor = await Supervisor.findOne({ userId: req.user._id });
  if (!supervisor) {
    return res.status(404).json({ success: false, message: 'Supervisor profile not found' });
  }

  const log = await ActivityLog.findById(req.params.id).populate('studentId');
  if (!log) {
    return res.status(404).json({ success: false, message: 'Activity log not found' });
  }

  const isAssigned = supervisor.assignedStudents.some(
    (id) => id.toString() === log.studentId._id.toString()
  );
  if (!isAssigned) {
    return res.status(403).json({ success: false, message: 'This student is not assigned to you' });
  }

  const { status, reviewComment } = req.body;
  if (!['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ success: false, message: "Status must be 'Approved' or 'Rejected'" });
  }

  log.status = status;
  log.reviewComment = reviewComment || '';
  log.reviewedBy = supervisor._id;
  log.reviewedAt = new Date();
  await log.save();

  if (log.studentId.userId) {
    await createNotification(
      log.studentId.userId,
      `Activity Log ${status}`,
      `Your activity log "${log.title}" was ${status.toLowerCase()} by your supervisor.`
    );
  }

  res.status(200).json({ success: true, message: `Activity log ${status.toLowerCase()}`, data: { log } });
});

module.exports = {
  createActivityLog,
  getMyActivityLogs,
  getStudentActivityLogs,
  reviewActivityLog,
};
