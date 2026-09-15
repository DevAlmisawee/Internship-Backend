const Report = require('../models/Report');
const Student = require('../models/Student');
const Supervisor = require('../models/Supervisor');
const { asyncHandler } = require('../middleware/errorHandler');
const { createNotification } = require('../services/notificationService');

/**
 * @route POST /api/reports
 * Student submits a Weekly, Monthly, or Final report.
 */
const submitReport = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ userId: req.user._id });
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student profile not found' });
  }

  const { type, weekNumber, month, title, summary } = req.body;

  const file = req.file
    ? { url: `/uploads/${req.file.filename}`, fileName: req.file.originalname }
    : { url: '', fileName: '' };

  const report = await Report.create({
    studentId: student._id,
    type,
    weekNumber: weekNumber || null,
    month: month || '',
    title,
    summary: summary || '',
    file,
    status: 'Submitted',
    submittedAt: new Date(),
  });

  if (student.supervisorId) {
    const supervisor = await Supervisor.findById(student.supervisorId);
    if (supervisor?.userId) {
      await createNotification(
        supervisor.userId,
        'New Report Submitted',
        `A student submitted a ${type.toLowerCase()} report: "${title}". Please review.`
      );
    }
  }

  res.status(201).json({ success: true, message: 'Report submitted', data: { report } });
});

/**
 * @route GET /api/reports/me
 * Student views their own reports.
 */
const getMyReports = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ userId: req.user._id });
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student profile not found' });
  }

  const filter = { studentId: student._id };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.type) filter.type = req.query.type;

  const reports = await Report.find(filter).sort({ createdAt: -1 });
  res.status(200).json({ success: true, message: 'Reports retrieved', data: { reports } });
});

/**
 * @route GET /api/reports/student/:studentId
 * Supervisor/Admin views a specific student's reports.
 */
const getStudentReports = asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  if (req.user.role === 'supervisor') {
    const supervisor = await Supervisor.findOne({ userId: req.user._id });
    const isAssigned = supervisor?.assignedStudents.some((id) => id.toString() === studentId);
    if (!isAssigned) {
      return res.status(403).json({ success: false, message: 'This student is not assigned to you' });
    }
  }

  const reports = await Report.find({ studentId }).sort({ createdAt: -1 });
  res.status(200).json({ success: true, message: 'Reports retrieved', data: { reports } });
});

/**
 * @route PUT /api/reports/:id/review
 * Supervisor assesses report quality.
 * Body: { qualityScore (0-10), supervisorComment }
 */
const reviewReport = asyncHandler(async (req, res) => {
  const supervisor = await Supervisor.findOne({ userId: req.user._id });
  if (!supervisor) {
    return res.status(404).json({ success: false, message: 'Supervisor profile not found' });
  }

  const report = await Report.findById(req.params.id).populate('studentId');
  if (!report) {
    return res.status(404).json({ success: false, message: 'Report not found' });
  }

  const isAssigned = supervisor.assignedStudents.some(
    (id) => id.toString() === report.studentId._id.toString()
  );
  if (!isAssigned) {
    return res.status(403).json({ success: false, message: 'This student is not assigned to you' });
  }

  const { qualityScore, supervisorComment } = req.body;

  report.qualityScore = qualityScore;
  report.supervisorComment = supervisorComment || '';
  report.status = 'Reviewed';
  report.reviewedBy = supervisor._id;
  report.reviewedAt = new Date();
  await report.save();

  if (report.studentId.userId) {
    await createNotification(
      report.studentId.userId,
      'Report Reviewed',
      `Your report "${report.title}" has been reviewed. Quality score: ${qualityScore}/10.`
    );
  }

  res.status(200).json({ success: true, message: 'Report reviewed', data: { report } });
});

/**
 * @route GET /api/reports/export
 * Exports reports as CSV. Scoped: student sees own, supervisor sees assigned students', admin sees all.
 */
const exportReports = asyncHandler(async (req, res) => {
  let filter = {};

  if (req.user.role === 'student') {
    const student = await Student.findOne({ userId: req.user._id });
    filter.studentId = student._id;
  } else if (req.user.role === 'supervisor') {
    const supervisor = await Supervisor.findOne({ userId: req.user._id });
    filter.studentId = { $in: supervisor.assignedStudents };
  }

  const reports = await Report.find(filter)
    .populate({ path: 'studentId', populate: { path: 'userId', select: 'name email' } })
    .sort({ createdAt: -1 });

  const headers = ['Student', 'Email', 'Type', 'Title', 'Status', 'Quality Score', 'Submitted At'];
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = reports.map((r) =>
    [
      r.studentId?.userId?.name || '',
      r.studentId?.userId?.email || '',
      r.type,
      r.title,
      r.status,
      r.qualityScore ?? '',
      r.submittedAt ? new Date(r.submittedAt).toISOString() : '',
    ]
      .map(escape)
      .join(',')
  );
  const csv = [headers.map(escape).join(','), ...rows].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="reports_export.csv"');
  res.status(200).send(csv);
});

module.exports = {
  submitReport,
  getMyReports,
  getStudentReports,
  reviewReport,
  exportReports,
};
