const express = require('express');
const router = express.Router();

const {
  createOrUpdateInternship,
  getMyInternship,
  getStudentInternship,
  getAllInternships,
  approveInternship,
  updateInternshipStatus,
} = require('../controllers/studentInternshipController');

const { protect, authorize } = require('../middleware/auth');
const { objectIdParamValidator } = require('../utils/validators');
const validate = require('../middleware/validation');

router.use(protect);

// Student
router.post('/', authorize('student'), createOrUpdateInternship);
router.get('/me', authorize('student'), getMyInternship);

// Admin
router.get('/', authorize('admin'), getAllInternships);
router.put('/:id/approve', authorize('admin'), objectIdParamValidator('id'), validate, approveInternship);
router.put(
  '/:id/status',
  authorize('admin', 'supervisor'),
  objectIdParamValidator('id'),
  validate,
  updateInternshipStatus
);

// Supervisor / Admin
router.get(
  '/student/:studentId',
  authorize('supervisor', 'admin'),
  objectIdParamValidator('studentId'),
  validate,
  getStudentInternship
);

module.exports = router;
