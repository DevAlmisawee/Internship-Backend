const mongoose = require('mongoose');

/**
 * Daily activity log entry submitted by a student, reviewed by their supervisor.
 * Count of "Approved" logs feeds the ML "Activity_Log_Frequency" feature.
 */
const activityLogSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    date: {
      type: Date,
      required: [true, 'Date is required'],
    },
    title: {
      type: String,
      required: [true, 'Activity title is required'],
      trim: true,
      maxlength: 150,
    },
    description: {
      type: String,
      required: [true, 'Activity description is required'],
      maxlength: 3000,
    },
    hoursWorked: {
      type: Number,
      min: 0,
      max: 24,
      required: [true, 'Hours worked is required'],
    },
    skillsLearned: {
      type: [String],
      default: [],
    },
    challengesEncountered: {
      type: String,
      maxlength: 2000,
      default: '',
    },
    solutionsApplied: {
      type: String,
      maxlength: 2000,
      default: '',
    },
    evidence: [
      {
        url: { type: String, default: '' },
        fileName: { type: String, default: '' },
        fileType: { type: String, default: '' }, // image | pdf | document
      },
    ],
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending',
    },
    reviewComment: {
      type: String,
      maxlength: 1000,
      default: '',
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supervisor',
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

activityLogSchema.index({ studentId: 1, date: -1 });
activityLogSchema.index({ studentId: 1, status: 1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
