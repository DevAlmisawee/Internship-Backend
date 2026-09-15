const express = require('express');
const router = express.Router();

const {
  getUniversities,
  getUniversity,
  createUniversity,
  updateUniversity,
  toggleUniversityStatus,
  deleteUniversity,
  getMyUniversityProfile,
  updateMyUniversityProfile,
  getMyUniversityDashboard,
  getMyCoordinators,
  createMyCoordinator,
} = require('../controllers/universityController');

const { protect, authorize } = require('../middleware/auth');
const { objectIdParamValidator } = require('../utils/validators');
const validate = require('../middleware/validation');

router.use(protect);

/* ── University self-service (must come before the generic /:id admin routes) ── */
router.use('/me', authorize('university'));
router.get('/me/profile', getMyUniversityProfile);
router.put('/me/profile', updateMyUniversityProfile);
router.get('/me/dashboard', getMyUniversityDashboard);
router.get('/me/coordinators', getMyCoordinators);
router.post('/me/coordinators', createMyCoordinator);

// A coordinator may read their own university; everything else is admin-only.
router.get('/:id', objectIdParamValidator('id'), validate, authorize('admin', 'coordinator'), getUniversity);

router.use(authorize('admin'));
router.get('/', getUniversities);
router.post('/', createUniversity);
router.put('/:id', objectIdParamValidator('id'), validate, updateUniversity);
router.put('/:id/status', objectIdParamValidator('id'), validate, toggleUniversityStatus);
router.delete('/:id', objectIdParamValidator('id'), validate, deleteUniversity);

module.exports = router;
