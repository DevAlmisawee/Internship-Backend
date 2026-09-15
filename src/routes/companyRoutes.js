const express = require('express');
const router = express.Router();

const {
  createOrUpdateCompany,
  getCompanies,
  getCompanyById,
  updateCompany,
  deleteCompany,
  uploadLogo,
  getDashboard,
  getOrgStudents,
  getOrgSupervisors,
  addOrgSupervisor,
  assignStudentSupervisor,
} = require('../controllers/companyController');

const { protect, authorize } = require('../middleware/auth');
const { uploadLogo: uploadLogoMiddleware } = require('../middleware/upload');
const { objectIdParamValidator } = require('../utils/validators');
const validate = require('../middleware/validation');

// Public-ish: anyone authenticated can browse companies (filtered to approved unless admin)
router.get('/', protect, getCompanies);

// Company-only routes — registered before the /:id wildcard below, since
// Express would otherwise match "/students" as an :id param on that route.
router.post('/', protect, authorize('company'), createOrUpdateCompany);
router.post('/logo', protect, authorize('company'), uploadLogoMiddleware, uploadLogo);
router.get('/dashboard/stats', protect, authorize('company'), getDashboard);
router.get('/students', protect, authorize('company'), getOrgStudents);
router.get('/supervisors', protect, authorize('company'), getOrgSupervisors);
router.post('/supervisors', protect, authorize('company'), addOrgSupervisor);
router.put('/students/:internshipId/supervisor', protect, authorize('company'), objectIdParamValidator('internshipId'), validate, assignStudentSupervisor);

router.get('/:id', protect, objectIdParamValidator('id'), validate, getCompanyById);

// Company (own profile) or admin
router.put('/:id', protect, authorize('company', 'admin'), objectIdParamValidator('id'), validate, updateCompany);

// Admin only
router.delete('/:id', protect, authorize('admin'), objectIdParamValidator('id'), validate, deleteCompany);

module.exports = router;
