const mongoose = require('mongoose');

/**
 * Weekly / Monthly / Final SIWES-style report submitted by a student
 * and assessed by their supervisor. "qualityScore" feeds the ML
 * "Report_Quality" feature.
 */
const reportSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    type: {
      type: String,
      enum: ['Weekly', 'Monthly', 'Final'],
      required: [true, 'Report type is required'],
    },
    weekNumber: {
      type: Number,
      min: 1,
      default: null,
    },
    month: {
      type: String,
      default: '',
    },
    title: {
      type: String,
      required: [true, 'Report title is required'],
      trim: true,
    },
    summary: {
      type: String,
      maxlength: 5000,
      default: '',
    },
    file: {
      url: { type: String, default: '' },
      fileName: { type: String, default: '' },
    },
    status: {
      type: String,
      enum: ['Pending', 'Submitted', 'Reviewed'],
      default: 'Pending',
    },
    qualityScore: {
      // 0-10, matches StudentPerformance.features.reportQuality range
      type: Number,
      min: 0,
      max: 10,
      default: null,
    },
    supervisorComment: {
      type: String,
      maxlength: 2000,
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
    submittedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

reportSchema.index({ studentId: 1, status: 1 });

module.exports = mongoose.model('Report', reportSchema);
