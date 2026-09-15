const express = require('express');
const router = express.Router();

const {
  getInternships,
  getInternshipById,
  createInternship,
  updateInternship,
  deleteInternship,
} = require('../controllers/internshipController');

const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validation');
const { internshipValidator, objectIdParamValidator, paginationValidator } = require('../utils/validators');

// Browsing internships requires login (per spec, students/companies/admin all use the API)
router.get('/', protect, paginationValidator, validate, getInternships);
router.get('/:id', protect, objectIdParamValidator('id'), validate, getInternshipById);

// Company only: create
router.post('/', protect, authorize('company'), internshipValidator, validate, createInternship);

// Company (owner) or admin: update/delete
router.put(
  '/:id',
  protect,
  authorize('company', 'admin'),
  objectIdParamValidator('id'),
  validate,
  updateInternship
);
router.delete(
  '/:id',
  protect,
  authorize('company', 'admin'),
  objectIdParamValidator('id'),
  validate,
  deleteInternship
);

module.exports = router;
