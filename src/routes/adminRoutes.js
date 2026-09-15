const express = require('express');
const router = express.Router();

const {
  getDashboard,
  getUsers,
  getUserDetail,
  updateStudentProfile,
  deleteUser,
  toggleUserActive,
  approveCompany,
  assignSupervisor,
} = require('../controllers/adminController');

const { protect, authorize } = require('../middleware/auth');
const { objectIdParamValidator } = require('../utils/validators');
const validate = require('../middleware/validation');

router.use(protect, authorize('admin'));

router.get('/dashboard', getDashboard);
router.get('/users', getUsers);
router.get('/users/:id', objectIdParamValidator('id'), validate, getUserDetail);
router.put('/students/:studentId', objectIdParamValidator('studentId'), validate, updateStudentProfile);
router.delete('/users/:id', objectIdParamValidator('id'), validate, deleteUser);
router.put('/users/:id/deactivate', objectIdParamValidator('id'), validate, toggleUserActive);
router.put('/company/:id/approve', objectIdParamValidator('id'), validate, approveCompany);
router.put('/supervisors/:supervisorId/assign/:studentId', assignSupervisor);

module.exports = router;
