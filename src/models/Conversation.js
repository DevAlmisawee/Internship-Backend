const mongoose = require('mongoose');

/**
 * A 1:1 conversation thread between two users (student, supervisor,
 * company, or admin). participantOne/participantTwo are always stored
 * in ascending ObjectId order so a lookup for a given pair is a single
 * indexed query, regardless of who initiated it.
 */
const conversationSchema = new mongoose.Schema(
  {
    participantOne: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    participantTwo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    lastMessage: {
      type: String,
      default: '',
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

conversationSchema.index({ participantOne: 1, participantTwo: 1 }, { unique: true });

module.exports = mongoose.model('Conversation', conversationSchema);
