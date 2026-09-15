const express = require('express');
const router = express.Router();

const {
  checkIn,
  checkOut,
  getMyAttendance,
  getStudentAttendance,
  confirmAttendance,
  recordManualAttendance,
} = require('../controllers/attendanceController');

const { protect, authorize } = require('../middleware/auth');
const { objectIdParamValidator } = require('../utils/validators');
const validate = require('../middleware/validation');

router.use(protect);

// Student
router.post('/checkin', authorize('student'), checkIn);
router.put('/checkout', authorize('student'), checkOut);
router.get('/me', authorize('student'), getMyAttendance);

// Supervisor / Admin / Company
router.get(
  '/student/:studentId',
  authorize('supervisor', 'admin', 'company'),
  objectIdParamValidator('studentId'),
  validate,
  getStudentAttendance
);
router.put(
  '/:id/confirm',
  authorize('supervisor', 'admin', 'company'),
  objectIdParamValidator('id'),
  validate,
  confirmAttendance
);
router.post('/manual', authorize('supervisor', 'admin'), recordManualAttendance);

module.exports = router;
