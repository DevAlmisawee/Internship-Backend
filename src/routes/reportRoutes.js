const express = require('express');
const router = express.Router();

const {
  submitReport,
  getMyReports,
  getStudentReports,
  reviewReport,
  exportReports,
} = require('../controllers/reportController');

const { protect, authorize } = require('../middleware/auth');
const { uploadReportFile } = require('../middleware/upload');
const { objectIdParamValidator } = require('../utils/validators');
const validate = require('../middleware/validation');

router.use(protect);

router.get('/export', exportReports);

// Student
router.post('/', authorize('student'), uploadReportFile, submitReport);
router.get('/me', authorize('student'), getMyReports);

// Supervisor / Admin
router.get(
  '/student/:studentId',
  authorize('supervisor', 'admin'),
  objectIdParamValidator('studentId'),
  validate,
  getStudentReports
);
router.put(
  '/:id/review',
  authorize('supervisor'),
  objectIdParamValidator('id'),
  validate,
  reviewReport
);

module.exports = router;
