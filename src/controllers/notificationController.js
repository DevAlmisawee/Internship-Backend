const Notification = require('../models/Notification');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * @route GET /api/notifications
 * Returns the logged-in user's notifications, newest first.
 */
const getMyNotifications = asyncHandler(async (req, res) => {
  const notifications = await Notification.find({ userId: req.user._id }).sort({ createdAt: -1 });
  const unreadCount = notifications.filter((n) => !n.read).length;
  res.status(200).json({
    success: true,
    message: 'Notifications retrieved',
    data: { notifications, unreadCount },
  });
});

/**
 * @route PUT /api/notifications/:id/read
 */
const markAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { read: true },
    { new: true }
  );
  if (!notification) {
    return res.status(404).json({ success: false, message: 'Notification not found' });
  }
  res.status(200).json({ success: true, message: 'Notification marked as read', data: { notification } });
});

/**
 * @route PUT /api/notifications/read-all
 */
const markAllAsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ userId: req.user._id, read: false }, { read: true });
  res.status(200).json({ success: true, message: 'All notifications marked as read', data: {} });
});

/**
 * @route DELETE /api/notifications/:id
 */
const deleteNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!notification) {
    return res.status(404).json({ success: false, message: 'Notification not found' });
  }
  res.status(200).json({ success: true, message: 'Notification deleted', data: {} });
});

module.exports = { getMyNotifications, markAsRead, markAllAsRead, deleteNotification };
