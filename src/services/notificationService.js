const Notification = require('../models/Notification');

/**
 * Creates an in-app notification for a user.
 */
const createNotification = async (userId, title, message) => {
  try {
    return await Notification.create({ userId, title, message });
  } catch (error) {
    console.error(`Failed to create notification: ${error.message}`);
    return null;
  }
};

/**
 * Creates the same notification for multiple users at once.
 */
const createBulkNotifications = async (userIds, title, message) => {
  try {
    const docs = userIds.map((userId) => ({ userId, title, message }));
    return await Notification.insertMany(docs);
  } catch (error) {
    console.error(`Failed to create bulk notifications: ${error.message}`);
    return null;
  }
};

module.exports = { createNotification, createBulkNotifications };
