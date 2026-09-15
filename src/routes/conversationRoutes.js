const express = require('express');
const router = express.Router();

const {
  getContacts,
  getConversations,
  openConversation,
  getMessages,
  sendMessage,
  markConversationRead,
} = require('../controllers/conversationController');

const { protect } = require('../middleware/auth');
const { uploadMessageAttachment } = require('../middleware/upload');
const { objectIdParamValidator } = require('../utils/validators');
const validate = require('../middleware/validation');

router.use(protect);

router.get('/contacts', getContacts);
router.get('/', getConversations);
router.post('/', openConversation);

router.get('/:id/messages', objectIdParamValidator('id'), validate, getMessages);
router.post('/:id/messages', objectIdParamValidator('id'), validate, uploadMessageAttachment, sendMessage);
router.put('/:id/read', objectIdParamValidator('id'), validate, markConversationRead);

module.exports = router;
