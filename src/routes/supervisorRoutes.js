const express = require('express');
const router = express.Router();

const {
  getProfile,
  updateProfile,
  getAssignedStudents,
  createEvaluation,
  getEvaluations,
} = require('../controllers/supervisorController');

const { protect, authorize } = require('../middleware/auth');

router.use(protect, authorize('supervisor'));

router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.get('/students', getAssignedStudents);
router.post('/evaluations', createEvaluation);
router.get('/evaluations', getEvaluations);

module.exports = router;
