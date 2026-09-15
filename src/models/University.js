const mongoose = require('mongoose');

const universitySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    universityName: {
      type: String,
      required: [true, 'University name is required'],
      trim: true,
      unique: true,
    },
    abbreviation: {
      type: String,
      trim: true,
      uppercase: true,
      default: '',
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    address: {
      type: String,
      trim: true,
      default: '',
    },
    state: {
      type: String,
      trim: true,
      default: '',
    },
    country: {
      type: String,
      trim: true,
      default: '',
    },
    logo: {
      url: { type: String, default: '' },
      publicId: { type: String, default: '' },
    },
    website: {
      type: String,
      trim: true,
      default: '',
    },
    // Active universities can have coordinators assigned and students linked.
    // Deactivating one doesn't delete data — it just hides it from new
    // assignment flows, mirroring how Company uses `approved` rather than
    // hard-deleting records.
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
  },
  { timestamps: true }
);

universitySchema.index({ universityName: 'text', abbreviation: 'text' });

module.exports = mongoose.model('University', universitySchema);
