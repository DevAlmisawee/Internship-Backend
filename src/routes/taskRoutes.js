const express = require('express');
const router = express.Router();

const {
  createTask,
  getSupervisorTasks,
  updateTask,
  deleteTask,
  giveTaskFeedback,
  getStudentTasks,
  submitTask,
  startTask,
  getTaskById,
} = require('../controllers/taskController');

const { protect, authorize } = require('../middleware/auth');
const { body } = require('express-validator');
const validate = require('../middleware/validation');
const { objectIdParamValidator } = require('../utils/validators');

// ── Supervisor routes ────────────────────────────────────────────────────────
router.post(
  '/',
  protect,
  authorize('supervisor'),
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('description').trim().notEmpty().withMessage('Description is required'),
    body('assignedTo').notEmpty().isMongoId().withMessage('assignedTo must be a valid student ID'),
    body('dueDate').notEmpty().isISO8601().withMessage('dueDate must be a valid date'),
    body('priority').optional().isIn(['Low', 'Medium', 'High']),
  ],
  validate,
  createTask
);

router.get('/supervisor', protect, authorize('supervisor'), getSupervisorTasks);

router.post(
  '/:id/feedback',
  protect,
  authorize('supervisor'),
  objectIdParamValidator('id'),
  [
    body('comment').optional().isString(),
    body('rating').optional().isFloat({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('recommendation')
      .optional()
      .isIn(['Excellent', 'Good', 'Average', 'Fair', 'Poor'])
      .withMessage('Invalid recommendation value'),
  ],
  validate,
  giveTaskFeedback
);

router.put(
  '/:id',
  protect,
  authorize('supervisor'),
  objectIdParamValidator('id'),
  validate,
  updateTask
);

router.delete(
  '/:id',
  protect,
  authorize('supervisor'),
  objectIdParamValidator('id'),
  validate,
  deleteTask
);

// ── Student routes ────────────────────────────────────────────────────────────
router.get('/student', protect, authorize('student'), getStudentTasks);

router.put(
  '/:id/start',
  protect,
  authorize('student'),
  objectIdParamValidator('id'),
  validate,
  startTask
);

router.put(
  '/:id/submit',
  protect,
  authorize('student'),
  objectIdParamValidator('id'),
  [
    body('text').optional().isString(),
    body('fileUrl').optional().isURL().withMessage('fileUrl must be a valid URL'),
  ],
  validate,
  submitTask
);

// ── Shared ────────────────────────────────────────────────────────────────────
router.get(
  '/:id',
  protect,
  authorize('supervisor', 'student', 'admin'),
  objectIdParamValidator('id'),
  validate,
  getTaskById
);

module.exports = router;
