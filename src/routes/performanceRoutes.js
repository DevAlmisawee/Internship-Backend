const express = require('express');
const router = express.Router();

const {
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
} = require('../controllers/performanceController');

const { protect, authorize } = require('../middleware/auth');
const { body } = require('express-validator');
const validate = require('../middleware/validation');
const { objectIdParamValidator } = require('../utils/validators');

/**
 * Validation for the 9 ML features — ranges match the training dataset exactly.
 *
 * Feature              | Dataset Column           | Range
 * ---------------------|--------------------------|----------
 * gpa                  | GPA                      | 0.0 – 4.0
 * courseScores         | Course_Scores            | 0 – 100
 * aptitudeScore        | Aptitude_Score           | 0 – 100
 * attendance           | Attendance               | 0 – 100 (%)
 * supervisorEvaluation | Supervisor_Evaluation    | 0 – 10
 * reportQuality        | Report_Quality           | 0 – 10
 * activityLogFrequency | Activity_Log_Frequency   | 0 – 29
 * completionTime       | Completion_Time          | 1 – 7
 * feedbackRating       | Feedback_Rating          | 1 – 5
 */
const featureValidators = [
  body('features.gpa')
    .isFloat({ min: 0, max: 4.0 })
    .withMessage('GPA must be between 0.0 and 4.0'),
  body('features.courseScores')
    .isFloat({ min: 0, max: 100 })
    .withMessage('Course Scores must be between 0 and 100'),
  body('features.aptitudeScore')
    .isFloat({ min: 0, max: 100 })
    .withMessage('Aptitude Score must be between 0 and 100'),
  body('features.attendance')
    .isFloat({ min: 0, max: 100 })
    .withMessage('Attendance must be between 0 and 100 (percentage)'),
  body('features.supervisorEvaluation')
    .isFloat({ min: 0, max: 10 })
    .withMessage('Supervisor Evaluation must be between 0 and 10'),
  body('features.reportQuality')
    .isFloat({ min: 0, max: 10 })
    .withMessage('Report Quality must be between 0 and 10'),
  body('features.activityLogFrequency')
    .isFloat({ min: 0, max: 29 })
    .withMessage('Activity Log Frequency must be between 0 and 29'),
  body('features.completionTime')
    .isFloat({ min: 1, max: 7 })
    .withMessage('Completion Time must be between 1 and 7'),
  body('features.feedbackRating')
    .isFloat({ min: 1, max: 5 })
    .withMessage('Feedback Rating must be between 1 and 5'),
];

// ── Supervisor ────────────────────────────────────────────────────────────────

// Submit features → call ML model → save prediction
router.post(
  '/',
  protect,
  authorize('supervisor'),
  [
    body('studentId').notEmpty().isMongoId().withMessage('Valid studentId is required'),
    body('supervisorRecommendation').optional().isString().isLength({ max: 2000 }),
    ...featureValidators,
  ],
  validate,
  submitPerformance
);

// Preview prediction without saving to DB
router.post(
  '/predict-only',
  protect,
  authorize('supervisor'),
  featureValidators,
  validate,
  predictOnly
);

// All performance records for this supervisor's students
router.get('/supervisor', protect, authorize('supervisor'), getSupervisorPerformances);

// Performance record for one specific student
router.get(
  '/student/:studentId',
  protect,
  authorize('supervisor', 'admin'),
  objectIdParamValidator('studentId'),
  validate,
  getStudentPerformance
);

// Real attendance %, activity log frequency, and report quality — computed
// from actual records, to pre-fill the evaluation form instead of guessing
router.get(
  '/auto-features/:studentId',
  protect,
  authorize('supervisor', 'admin'),
  objectIdParamValidator('studentId'),
  validate,
  getAutoFeatures
);

// ── Student ───────────────────────────────────────────────────────────────────

// Student views their own prediction result
router.get('/my', protect, authorize('student'), getMyPerformance);

// ── Company ───────────────────────────────────────────────────────────────────

// Performance records for every student placed at this company
router.get('/company', protect, authorize('company'), getOrgPerformances);

// ── Coordinator ───────────────────────────────────────────────────────────────

// Performance records for this coordinator's assigned students only
router.get('/coordinator', protect, authorize('coordinator'), getCoordinatorPerformances);

// ── Admin ─────────────────────────────────────────────────────────────────────

// All performance records platform-wide
router.get('/admin', protect, authorize('admin'), getAllPerformances);

// Live model accuracy / confusion matrix against the full training dataset
// (in-sample "sanity check" -- reads higher than real accuracy, see controller docstring)
router.get('/training-evaluation', protect, authorize('admin'), getTrainingDataEvaluation);

// Genuine held-out test accuracy / confusion matrix (the model's real performance)
router.get('/test-evaluation', protect, authorize('admin'), getModelTestEvaluation);

module.exports = router;
