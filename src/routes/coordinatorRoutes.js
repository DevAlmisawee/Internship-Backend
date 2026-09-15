const express = require('express');
const router = express.Router();

const {
  createCoordinator,
  getCoordinators,
  getCoordinatorAdmin,
  updateCoordinator,
  resetCoordinatorPassword,
  assignStudentToCoordinator,
  removeStudentFromCoordinator,
  getProfile,
  updateProfile,
  getDashboard,
  getMyStudents,
  getStudentDetail,
  addStudentNote,
} = require('../controllers/coordinatorController');

const { protect, authorize } = require('../middleware/auth');
const { objectIdParamValidator } = require('../utils/validators');
const validate = require('../middleware/validation');

router.use(protect);

/* ── Coordinator self-service (must come before the generic /:id admin routes) ── */
router.use('/me', authorize('coordinator'));
router.get('/me/profile', getProfile);
router.put('/me/profile', updateProfile);
router.get('/me/dashboard', getDashboard);
router.get('/me/students', getMyStudents);
router.get('/me/students/:studentId', objectIdParamValidator('studentId'), validate, getStudentDetail);
router.post('/me/students/:studentId/notes', objectIdParamValidator('studentId'), validate, addStudentNote);

/* ── Admin — Coordinator Management ── */
router.use(authorize('admin'));
router.get('/', getCoordinators);
router.post('/', createCoordinator);
router.get('/:id', objectIdParamValidator('id'), validate, getCoordinatorAdmin);
router.put('/:id', objectIdParamValidator('id'), validate, updateCoordinator);
router.put('/:id/reset-password', objectIdParamValidator('id'), validate, resetCoordinatorPassword);
router.put('/:id/students/:studentId', assignStudentToCoordinator);
router.delete('/:id/students/:studentId', removeStudentFromCoordinator);

module.exports = router;
