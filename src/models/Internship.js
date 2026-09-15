const mongoose = require('mongoose');

const internshipSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    location: {
      type: String,
      trim: true,
      default: '',
    },
    remote: {
      type: Boolean,
      default: false,
    },
    duration: {
      type: String,
      trim: true,
      default: '',
    },
    stipend: {
      type: Number,
      default: 0,
      min: 0,
    },
    requirements: {
      type: [String],
      default: [],
    },
    deadline: {
      type: Date,
      required: [true, 'Application deadline is required'],
    },
    category: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['open', 'closed'],
      default: 'open',
    },
  },
  { timestamps: true }
);

// Text index to support search by title/description/category
internshipSchema.index({ title: 'text', description: 'text', category: 'text' });
internshipSchema.index({ location: 1 });
internshipSchema.index({ deadline: 1 });

module.exports = mongoose.model('Internship', internshipSchema);
