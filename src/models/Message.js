const mongoose = require('mongoose');

/**
 * A single message within a Conversation. Since conversations are
 * strictly 1:1, a single `readAt` timestamp is enough to represent a
 * read receipt — there's only ever one possible reader (the other
 * participant).
 */
const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    text: {
      type: String,
      trim: true,
      maxlength: 4000,
      default: '',
    },
    attachments: [
      {
        url: { type: String, default: '' },
        fileName: { type: String, default: '' },
      },
    ],
    readAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

messageSchema.index({ conversationId: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);
