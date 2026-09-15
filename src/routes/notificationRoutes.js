const express = require('express');
const router = express.Router();

const {
  getMyNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} = require('../controllers/notificationController');

const { protect } = require('../middleware/auth');
const { objectIdParamValidator } = require('../utils/validators');
const validate = require('../middleware/validation');

router.use(protect);

router.get('/', getMyNotifications);
router.put('/read-all', markAllAsRead);
router.put('/:id/read', objectIdParamValidator('id'), validate, markAsRead);
router.delete('/:id', objectIdParamValidator('id'), validate, deleteNotification);

module.exports = router;
