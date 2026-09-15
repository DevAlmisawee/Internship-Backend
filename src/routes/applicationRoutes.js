const express = require('express');
const router = express.Router();

const {
  createApplication,
  getApplications,
  getApplicationById,
  updateApplicationStatus,
  deleteApplication,
} = require('../controllers/applicationController');

const { protect, authorize } = require('../middleware/auth');
const { uploadResume } = require('../middleware/upload');
const validate = require('../middleware/validation');
const { applicationValidator, objectIdParamValidator } = require('../utils/validators');

router.use(protect);

// Student applies (resume upload optional; falls back to stored CV)
router.post('/', authorize('student'), uploadResume, applicationValidator, validate, createApplication);

// Scoped list: student sees own, company sees theirs, admin sees all
router.get('/', getApplications);

router.get('/:id', objectIdParamValidator('id'), validate, getApplicationById);

// Company (owner) or admin updates status
router.put(
  '/:id',
  authorize('company', 'admin'),
  objectIdParamValidator('id'),
  validate,
  updateApplicationStatus
);

// Student withdraws own application, or admin deletes any
router.delete('/:id', authorize('student', 'admin'), objectIdParamValidator('id'), validate, deleteApplication);

module.exports = router;
