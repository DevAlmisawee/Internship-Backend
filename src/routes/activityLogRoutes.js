const express = require('express');
const router = express.Router();

const {
  createActivityLog,
  getMyActivityLogs,
  getStudentActivityLogs,
  reviewActivityLog,
} = require('../controllers/activityLogController');

const { protect, authorize } = require('../middleware/auth');
const { uploadEvidence } = require('../middleware/upload');
const { objectIdParamValidator } = require('../utils/validators');
const validate = require('../middleware/validation');

router.use(protect);

// Student
router.post('/', authorize('student'), uploadEvidence, createActivityLog);
router.get('/me', authorize('student'), getMyActivityLogs);

// Supervisor / Admin
router.get(
  '/student/:studentId',
  authorize('supervisor', 'admin'),
  objectIdParamValidator('studentId'),
  validate,
  getStudentActivityLogs
);
router.put(
  '/:id/review',
  authorize('supervisor'),
  objectIdParamValidator('id'),
  validate,
  reviewActivityLog
);

module.exports = router;
