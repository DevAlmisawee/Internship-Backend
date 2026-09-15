const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const Student = require('../models/Student');
const Supervisor = require('../models/Supervisor');
const Company = require('../models/Company');
const StudentInternship = require('../models/StudentInternship');
const { asyncHandler } = require('../middleware/errorHandler');
const { createNotification } = require('../services/notificationService');

const ACTIVE_STATUSES = ['Active', 'Completed'];
const CONTACT_FIELDS = 'name email role profilePicture';

const orderPair = (a, b) => [a.toString(), b.toString()].sort();

const dedupeContacts = (contacts, excludeId) => {
  const seen = new Set();
  return contacts.filter((c) => {
    if (!c) return false;
    const id = c._id.toString();
    if (id === excludeId.toString() || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

/**
 * @route GET /api/conversations/contacts
 * @desc  Who the logged-in user is allowed to start a conversation with.
 *        student    -> their assigned supervisor + their placement company + admins
 *        supervisor -> their assigned students + admins
 *        company    -> their current/past interns + admins
 *        admin      -> everyone
 */
const getContacts = asyncHandler(async (req, res) => {
  const { role, _id: userId } = req.user;
  let contacts = [];

  if (role === 'student') {
    const student = await Student.findOne({ userId }).populate({
      path: 'supervisorId',
      populate: { path: 'userId', select: CONTACT_FIELDS },
    });
    if (student?.supervisorId?.userId) contacts.push(student.supervisorId.userId);

    if (student) {
      const placement = await StudentInternship.findOne({ studentId: student._id, status: { $in: ACTIVE_STATUSES } })
        .sort({ createdAt: -1 })
        .populate({ path: 'companyId', populate: { path: 'userId', select: CONTACT_FIELDS } });
      if (placement?.companyId?.userId) contacts.push(placement.companyId.userId);
    }

    contacts.push(...(await User.find({ role: 'admin' }).select(CONTACT_FIELDS).limit(5)));
  } else if (role === 'supervisor') {
    const supervisor = await Supervisor.findOne({ userId }).populate({
      path: 'assignedStudents',
      populate: { path: 'userId', select: CONTACT_FIELDS },
    });
    (supervisor?.assignedStudents || []).forEach((s) => { if (s.userId) contacts.push(s.userId); });
    contacts.push(...(await User.find({ role: 'admin' }).select(CONTACT_FIELDS).limit(5)));
  } else if (role === 'company') {
    const company = await Company.findOne({ userId });
    if (company) {
      const placements = await StudentInternship.find({ companyId: company._id, status: { $in: ACTIVE_STATUSES } })
        .populate({ path: 'studentId', populate: { path: 'userId', select: CONTACT_FIELDS } });
      placements.forEach((p) => { if (p.studentId?.userId) contacts.push(p.studentId.userId); });
    }
    contacts.push(...(await User.find({ role: 'admin' }).select(CONTACT_FIELDS).limit(5)));
  } else if (role === 'admin') {
    contacts = await User.find({ _id: { $ne: userId } }).select(CONTACT_FIELDS).sort({ name: 1 }).limit(200);
  }

  res.status(200).json({
    success: true,
    message: 'Contacts retrieved',
    data: { contacts: dedupeContacts(contacts, userId) },
  });
});

/**
 * @route GET /api/conversations
 * @desc  List every conversation the logged-in user is part of, with the
 *        other participant populated and an unread count.
 */
const getConversations = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const conversations = await Conversation.find({
    $or: [{ participantOne: userId }, { participantTwo: userId }],
  })
    .sort({ lastMessageAt: -1 })
    .populate('participantOne', CONTACT_FIELDS)
    .populate('participantTwo', CONTACT_FIELDS);

  const results = await Promise.all(
    conversations.map(async (c) => {
      const other = c.participantOne._id.toString() === userId.toString() ? c.participantTwo : c.participantOne;
      const unreadCount = await Message.countDocuments({ conversationId: c._id, senderId: other._id, readAt: null });
      return {
        _id: c._id,
        participant: other,
        lastMessage: c.lastMessage,
        lastMessageAt: c.lastMessageAt,
        unreadCount,
      };
    })
  );

  res.status(200).json({ success: true, message: 'Conversations retrieved', data: { conversations: results } });
});

/**
 * @route POST /api/conversations
 * @desc  Find or create a 1:1 conversation with another user.
 * @body  { participantId }
 */
const openConversation = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { participantId } = req.body;

  if (!participantId) {
    return res.status(400).json({ success: false, message: 'participantId is required' });
  }
  if (participantId === userId.toString()) {
    return res.status(400).json({ success: false, message: "You can't start a conversation with yourself" });
  }

  const target = await User.findById(participantId).select(CONTACT_FIELDS);
  if (!target) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  const [a, b] = orderPair(userId, participantId);
  let conversation = await Conversation.findOne({ participantOne: a, participantTwo: b });
  if (!conversation) {
    conversation = await Conversation.create({ participantOne: a, participantTwo: b });
  }

  res.status(200).json({
    success: true,
    message: 'Conversation ready',
    data: { conversationId: conversation._id, participant: target },
  });
});

const assertParticipant = (conversation, userId) => {
  const ids = [conversation.participantOne.toString(), conversation.participantTwo.toString()];
  return ids.includes(userId.toString());
};

/** @route GET /api/conversations/:id/messages */
const getMessages = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id);
  if (!conversation) {
    return res.status(404).json({ success: false, message: 'Conversation not found' });
  }
  if (!assertParticipant(conversation, req.user._id)) {
    return res.status(403).json({ success: false, message: 'You are not part of this conversation' });
  }

  const messages = await Message.find({ conversationId: conversation._id }).sort({ createdAt: 1 });
  res.status(200).json({ success: true, message: 'Messages retrieved', data: { messages } });
});

/** @route POST /api/conversations/:id/messages  (multipart, optional "attachment") */
const sendMessage = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const conversation = await Conversation.findById(req.params.id);
  if (!conversation) {
    return res.status(404).json({ success: false, message: 'Conversation not found' });
  }
  if (!assertParticipant(conversation, userId)) {
    return res.status(403).json({ success: false, message: 'You are not part of this conversation' });
  }

  const { text } = req.body;
  const attachments = req.file ? [{ url: `/uploads/${req.file.filename}`, fileName: req.file.originalname }] : [];

  if (!text?.trim() && attachments.length === 0) {
    return res.status(400).json({ success: false, message: 'Message must have text or an attachment' });
  }

  const message = await Message.create({
    conversationId: conversation._id,
    senderId: userId,
    text: text?.trim() || '',
    attachments,
  });

  conversation.lastMessage = text?.trim() || (attachments[0]?.fileName ? `📎 ${attachments[0].fileName}` : '');
  conversation.lastMessageAt = message.createdAt;
  await conversation.save();

  const otherId = conversation.participantOne.toString() === userId.toString() ? conversation.participantTwo : conversation.participantOne;
  await createNotification(otherId, 'New message', `${req.user.name} sent you a message.`);

  res.status(201).json({ success: true, message: 'Message sent', data: { message } });
});

/** @route PUT /api/conversations/:id/read — marks every message from the OTHER participant as read */
const markConversationRead = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const conversation = await Conversation.findById(req.params.id);
  if (!conversation) {
    return res.status(404).json({ success: false, message: 'Conversation not found' });
  }
  if (!assertParticipant(conversation, userId)) {
    return res.status(403).json({ success: false, message: 'You are not part of this conversation' });
  }

  await Message.updateMany(
    { conversationId: conversation._id, senderId: { $ne: userId }, readAt: null },
    { $set: { readAt: new Date() } }
  );

  res.status(200).json({ success: true, message: 'Conversation marked read' });
});

module.exports = {
  getContacts,
  getConversations,
  openConversation,
  getMessages,
  sendMessage,
  markConversationRead,
};
