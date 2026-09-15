const StudentPerformance = require('../models/StudentPerformance');
const Student = require('../models/Student');
const Supervisor = require('../models/Supervisor');
const Company = require('../models/Company');
const Coordinator = require('../models/Coordinator');
const StudentInternship = require('../models/StudentInternship');
const TrainingRecord = require('../models/TrainingRecord');
const Attendance = require('../models/Attendance');
const ActivityLog = require('../models/ActivityLog');
const Report = require('../models/Report');
const { summarize } = require('./attendanceController');
const { asyncHandler } = require('../middleware/errorHandler');
const { predictPerformance, evaluateDataset, getTestEvaluation } = require('../services/mlService');
const { createNotification } = require('../services/notificationService');

/**
 * @route POST /api/performance
 * Supervisor submits the 12 feature scores for one of their students.
 * The backend immediately calls the ML model and stores the prediction.
 *
 * Body: {
 *   studentId,
 *   supervisorRecommendation,  (optional text)
 *   features: {
 *     cgpa, attendance, technicalSkills, communication, teamwork,
 *     problemSolving, projects, leadership, initiative,
 *     punctuality, behavior, companyEvaluation
 *   }
 * }
 */
const submitPerformance = asyncHandler(async (req, res) => {
  const supervisor = await Supervisor.findOne({ userId: req.user._id });
  if (!supervisor) {
    return res.status(404).json({ success: false, message: 'Supervisor profile not found' });
  }

  const { studentId, features, supervisorRecommendation } = req.body;

  // Only allow this supervisor to submit for their own assigned students
  const isAssigned = supervisor.assignedStudents.some(
    (id) => id.toString() === studentId
  );
  if (!isAssigned) {
    return res.status(403).json({
      success: false,
      message: 'You can only submit performance data for students under your supervision',
    });
  }

  const student = await Student.findById(studentId);
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student not found' });
  }

  // ── Call the ML model ────────────────────────────────────────────────────
  console.log(`[Performance] Requesting ML prediction for student ${studentId}`);
  const mlResult = await predictPerformance(features);
  console.log(`[Performance] ML result:`, mlResult);

  // ── Upsert the performance record ────────────────────────────────────────
  const existing = await StudentPerformance.findOne({ studentId });

  // Build the history entry to append
  const historyEntry = {
    features,
    result: mlResult.result,
    performanceScore: mlResult.performanceScore,
    confidence: mlResult.confidence,
    predictedAt: new Date(),
  };

  let performance;

  if (existing) {
    // Update features + prediction; push old prediction to history
    existing.features = features;
    existing.supervisorRecommendation = supervisorRecommendation || existing.supervisorRecommendation;
    existing.prediction = {
      result: mlResult.result,
      performanceScore: mlResult.performanceScore,
      confidence: mlResult.confidence,
      predictedAt: new Date(),
      mlModelVersion: mlResult.modelVersion,
      rawResponse: mlResult.rawResponse,
      error: mlResult.error,
    };
    existing.predictionHistory.push(historyEntry);
    await existing.save();
    performance = existing;
  } else {
    performance = await StudentPerformance.create({
      studentId,
      supervisorId: supervisor._id,
      features,
      supervisorRecommendation: supervisorRecommendation || '',
      prediction: {
        result: mlResult.result,
        performanceScore: mlResult.performanceScore,
        confidence: mlResult.confidence,
        predictedAt: new Date(),
        mlModelVersion: mlResult.modelVersion,
        rawResponse: mlResult.rawResponse,
        error: mlResult.error,
      },
      predictionHistory: [historyEntry],
    });
  }

  // ── Notify the student of their prediction ───────────────────────────────
  if (student.userId) {
    await createNotification(
      student.userId,
      'Performance Evaluation Completed',
      `Your internship performance has been evaluated. Predicted outcome: ${mlResult.result}.`
    );
  }

  const message = mlResult.error
    ? `Features saved. ML model unavailable — used fallback. Prediction: ${mlResult.result}`
    : `Features submitted. ML prediction: ${mlResult.result}`;

  res.status(200).json({
    success: true,
    message,
    data: {
      performance,
      prediction: mlResult.result,
      performanceScore: mlResult.performanceScore,
      confidence: mlResult.confidence,
      usingFallback: !!mlResult.error,
      fallbackReason: mlResult.error || null,
    },
  });
});

/**
 * @route GET /api/performance/student/:studentId
 * Supervisor or admin retrieves performance record for a specific student.
 */
const getStudentPerformance = asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  // If supervisor, confirm the student is theirs
  if (req.user.role === 'supervisor') {
    const supervisor = await Supervisor.findOne({ userId: req.user._id });
    const isAssigned = supervisor?.assignedStudents.some(
      (id) => id.toString() === studentId
    );
    if (!isAssigned) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
  }

  const performance = await StudentPerformance.findOne({ studentId })
    .populate({ path: 'studentId', populate: { path: 'userId', select: 'name email' } })
    .populate({ path: 'supervisorId', populate: { path: 'userId', select: 'name email' } });

  if (!performance) {
    return res.status(404).json({
      success: false,
      message: 'No performance record found for this student',
    });
  }

  res.status(200).json({ success: true, message: 'Performance retrieved', data: { performance } });
});

/**
 * @route GET /api/performance/my
 * Student views their own performance record and ML prediction.
 */
const getMyPerformance = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ userId: req.user._id });
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student profile not found' });
  }

  const performance = await StudentPerformance.findOne({ studentId: student._id }).populate({
    path: 'supervisorId',
    populate: { path: 'userId', select: 'name email' },
  });

  if (!performance) {
    return res.status(404).json({
      success: false,
      message: 'Your performance has not been evaluated yet',
    });
  }

  // Students only see their current prediction + history, not raw ML response
  const safePerformance = {
    features: performance.features,
    supervisorRecommendation: performance.supervisorRecommendation,
    prediction: {
      result: performance.prediction.result,
      performanceScore: performance.prediction.performanceScore,
      confidence: performance.prediction.confidence,
      predictedAt: performance.prediction.predictedAt,
    },
    predictionHistory: performance.predictionHistory.map((h) => ({
      result: h.result,
      performanceScore: h.performanceScore,
      confidence: h.confidence,
      predictedAt: h.predictedAt,
    })),
    supervisor: performance.supervisorId,
    updatedAt: performance.updatedAt,
  };

  res.status(200).json({
    success: true,
    message: 'Your performance record',
    data: { performance: safePerformance },
  });
});

/**
 * @route GET /api/performance/supervisor
 * Supervisor gets performance records for ALL their assigned students.
 */
const getSupervisorPerformances = asyncHandler(async (req, res) => {
  const supervisor = await Supervisor.findOne({ userId: req.user._id });
  if (!supervisor) {
    return res.status(404).json({ success: false, message: 'Supervisor profile not found' });
  }

  const performances = await StudentPerformance.find({ supervisorId: supervisor._id })
    .populate({ path: 'studentId', populate: { path: 'userId', select: 'name email' } })
    .sort({ updatedAt: -1 });

  // Summary stats
  const counts = { Excellent: 0, Good: 0, Average: 0, Fair: 0, Poor: 0, Pending: 0 };
  performances.forEach((p) => {
    const r = p.prediction?.result || 'Pending';
    counts[r] = (counts[r] || 0) + 1;
  });

  res.status(200).json({
    success: true,
    message: 'Performance records retrieved',
    data: { performances, summary: counts, total: performances.length },
  });
});

/**
 * @route GET /api/performance/company
 * @desc  Company views ML performance records for every student currently
 *        (or previously) placed at their organization, via StudentInternship.
 *        Read-only — companies don't submit evaluations, that's the
 *        university supervisor's job — but they can see the outcome.
 */
const getOrgPerformances = asyncHandler(async (req, res) => {
  const company = await Company.findOne({ userId: req.user._id });
  if (!company) {
    return res.status(404).json({ success: false, message: 'Company profile not found' });
  }

  const placements = await StudentInternship.find({ companyId: company._id }, 'studentId');
  const studentIds = placements.map((p) => p.studentId);

  const performances = await StudentPerformance.find({ studentId: { $in: studentIds } })
    .populate({ path: 'studentId', populate: { path: 'userId', select: 'name email' } })
    .populate({ path: 'supervisorId', populate: { path: 'userId', select: 'name email' } })
    .sort({ updatedAt: -1 });

  const counts = { Excellent: 0, Good: 0, Average: 0, Fair: 0, Poor: 0, Pending: 0 };
  performances.forEach((p) => {
    const r = p.prediction?.result || 'Pending';
    counts[r] = (counts[r] || 0) + 1;
  });

  res.status(200).json({
    success: true,
    message: 'Performance records retrieved',
    data: { performances, summary: counts, total: performances.length, totalInterns: studentIds.length },
  });
});

/**
 * @route GET /api/performance/coordinator
 * @desc  University coordinator views ML performance records for their
 *        assigned students only — never another coordinator's students.
 *        Read-only, same shape as getOrgPerformances for the company side.
 */
const getCoordinatorPerformances = asyncHandler(async (req, res) => {
  const coordinator = await Coordinator.findOne({ userId: req.user._id });
  if (!coordinator) {
    return res.status(404).json({ success: false, message: 'Coordinator profile not found' });
  }

  const performances = await StudentPerformance.find({ studentId: { $in: coordinator.assignedStudents } })
    .populate({ path: 'studentId', populate: { path: 'userId', select: 'name email' } })
    .populate({ path: 'supervisorId', populate: { path: 'userId', select: 'name email' } })
    .sort({ updatedAt: -1 });

  const counts = { Excellent: 0, Good: 0, Average: 0, Fair: 0, Poor: 0, Pending: 0 };
  performances.forEach((p) => {
    const r = p.prediction?.result || 'Pending';
    counts[r] = (counts[r] || 0) + 1;
  });

  res.status(200).json({
    success: true,
    message: 'Performance records retrieved',
    data: { performances, summary: counts, total: performances.length, totalStudents: coordinator.assignedStudents.length },
  });
});

/**
 * @route POST /api/performance/predict-only
 * Supervisor sends features and gets an ML prediction WITHOUT saving to DB.
 * Useful for a "preview" / "what-if" before committing.
 */
const predictOnly = asyncHandler(async (req, res) => {
  const { features } = req.body;

  if (!features) {
    return res.status(400).json({ success: false, message: 'features object is required' });
  }

  const mlResult = await predictPerformance(features);

  res.status(200).json({
    success: true,
    message: 'Prediction result (not saved)',
    data: {
      prediction: mlResult.result,
      confidence: mlResult.confidence,
      modelVersion: mlResult.modelVersion,
      usingFallback: !!mlResult.error,
      fallbackReason: mlResult.error || null,
    },
  });
});

/**
 * @route GET /api/performance/admin
 * Admin gets all performance records across all students.
 */
const getAllPerformances = asyncHandler(async (req, res) => {
  const { prediction, page = 1, limit = 20 } = req.query;
  const filter = prediction ? { 'prediction.result': prediction } : {};

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  const [performances, total] = await Promise.all([
    StudentPerformance.find(filter)
      .populate({ path: 'studentId', populate: { path: 'userId', select: 'name email' } })
      .populate({ path: 'supervisorId', populate: { path: 'userId', select: 'name' } })
      .sort({ updatedAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    StudentPerformance.countDocuments(filter),
  ]);

  const counts = { Excellent: 0, Good: 0, Average: 0, Fair: 0, Poor: 0, Pending: 0 };
  const all = await StudentPerformance.find({}, 'prediction.result');
  all.forEach((p) => {
    const r = p.prediction?.result || 'Pending';
    counts[r] = (counts[r] || 0) + 1;
  });

  res.status(200).json({
    success: true,
    message: 'All performance records',
    data: {
      performances,
      summary: counts,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    },
  });
});

/**
 * @route GET /api/performance/training-evaluation
 * Admin-only. Scores the entire imported training dataset (TrainingRecord
 * collection) against its known ground-truth labels and returns model
 * accuracy / confusion matrix / per-class metrics, computed live on each
 * call via the ML API's vectorized /evaluate endpoint (fast -- one
 * model.predict() call across the whole batch, not a loop).
 *
 * NOTE: this reflects accuracy on the FULL dataset (including rows the
 * model was originally trained on), so it will read higher than the
 * model's held-out test accuracy reported elsewhere (~63%) -- that's
 * expected, not a sign the model improved. It's a live sanity-check that
 * the model's predictions still line up with the labeled data, not a
 * substitute for the proper train/test evaluation.
 */
const getTrainingDataEvaluation = asyncHandler(async (req, res) => {
  const records = await TrainingRecord.find().lean();

  if (records.length === 0) {
    return res.status(404).json({
      success: false,
      message: 'No training records found. Import the dataset first (see scripts/importTrainingData.js).',
    });
  }

  const payload = records.map((r) => ({ ...r.features, actual: r.performance }));

  let summary;
  try {
    summary = await evaluateDataset(payload);
  } catch (err) {
    return res.status(502).json({ success: false, message: `ML evaluation failed: ${err.message}` });
  }

  res.status(200).json({
    success: true,
    message: 'Training dataset evaluation',
    data: summary,
  });
});

/**
 * @route GET /api/performance/test-evaluation
 * Admin-only. Returns the model's genuine held-out test evaluation (accuracy,
 * weighted precision/recall/F1, ROC-AUC, confusion matrix), as computed once
 * during training on data withheld from the model (~63% accuracy).
 *
 * This is the figure that should be presented as the model's real accuracy.
 * It is deliberately separate from GET /training-evaluation above, which
 * re-scores the model against the full imported dataset (including rows it
 * was trained on) and reads higher (~90%) -- that endpoint is a live
 * sanity check, not a substitute for this one.
 */
const getModelTestEvaluation = asyncHandler(async (req, res) => {
  let evaluation;
  try {
    evaluation = await getTestEvaluation();
  } catch (err) {
    return res.status(502).json({ success: false, message: `Failed to fetch test evaluation: ${err.message}` });
  }

  res.status(200).json({
    success: true,
    message: 'Held-out test evaluation',
    data: evaluation,
  });
});

/**
 * @route GET /api/performance/auto-features/:studentId
 * @desc  Supervisor/Admin only. Computes 3 of the 9 ML features from real,
 *        already-existing records instead of the supervisor guessing them
 *        by hand: attendance % (Attendance records), activity log frequency
 *        (ActivityLog entries in the last 30 days), and average report
 *        quality (Reviewed Report.qualityScore). The remaining 6 features
 *        (GPA, course scores, aptitude, supervisor evaluation, completion
 *        time, feedback rating) genuinely have no other source in this
 *        system and stay manually entered.
 */
const getAutoFeatures = asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  if (req.user.role === 'supervisor') {
    const supervisor = await Supervisor.findOne({ userId: req.user._id });
    const isAssigned = supervisor?.assignedStudents.some((id) => id.toString() === studentId);
    if (!isAssigned) {
      return res.status(403).json({ success: false, message: 'This student is not assigned to you' });
    }
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [attendanceRecords, logCount, reviewedReports] = await Promise.all([
    Attendance.find({ studentId }),
    ActivityLog.countDocuments({ studentId, date: { $gte: thirtyDaysAgo } }),
    Report.find({ studentId, status: 'Reviewed', qualityScore: { $ne: null } }, 'qualityScore'),
  ]);

  const attendanceStats = summarize(attendanceRecords);
  const avgQuality = reviewedReports.length > 0
    ? reviewedReports.reduce((sum, r) => sum + r.qualityScore, 0) / reviewedReports.length
    : null;

  res.status(200).json({
    success: true,
    message: 'Auto-computed features retrieved',
    data: {
      attendance: attendanceStats.totalDays > 0 ? attendanceStats.attendancePercentage : null,
      attendanceSource: `${attendanceStats.totalDays} recorded day${attendanceStats.totalDays !== 1 ? 's' : ''}`,
      activityLogFrequency: Math.min(logCount, 29),
      activityLogSource: `${logCount} entr${logCount !== 1 ? 'ies' : 'y'} in the last 30 days`,
      reportQuality: avgQuality != null ? Math.round(avgQuality * 10) / 10 : null,
      reportQualitySource: `${reviewedReports.length} reviewed report${reviewedReports.length !== 1 ? 's' : ''}`,
    },
  });
});

module.exports = {
  submitPerformance,
  getStudentPerformance,
  getMyPerformance,
  getSupervisorPerformances,
  getOrgPerformances,
  getCoordinatorPerformances,
  predictOnly,
  getAllPerformances,
  getTrainingDataEvaluation,
  getModelTestEvaluation,
  getAutoFeatures,
};
