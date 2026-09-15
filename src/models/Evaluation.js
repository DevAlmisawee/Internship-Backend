const mongoose = require('mongoose');

/**
 * Supervisor Evaluation Form, per spec section 4:
 * Technical Skills, Communication Skills, Problem Solving Ability, Teamwork,
 * Professionalism, Punctuality, Adaptability, Overall Performance Score,
 * Feedback Comments.
 *
 * `overallScore` is auto-computed as the average of the seven rubric
 * criteria unless explicitly overridden, and feeds the ML
 * "Supervisor_Evaluation" feature (0-10 scale).
 */
const criterionField = {
  type: Number,
  min: 0,
  max: 10,
  required: true,
};

const evaluationSchema = new mongoose.Schema(
  {
    supervisorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supervisor',
      required: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },

    // ── Rubric (0-10 each) ──────────────────────────────────────────
    technicalSkills: criterionField,
    communicationSkills: criterionField,
    problemSolvingAbility: criterionField,
    teamwork: criterionField,
    professionalism: criterionField,
    punctuality: criterionField,
    adaptability: criterionField,

    // ── Overall ──────────────────────────────────────────────────────
    overallScore: {
      type: Number,
      min: 0,
      max: 10,
    },
    feedbackComments: {
      type: String,
      maxlength: 3000,
      default: '',
    },

    // Legacy fields kept for backward compatibility with existing records
    score: {
      type: Number,
      min: 0,
      max: 100,
    },
    comments: {
      type: String,
      maxlength: 3000,
      default: '',
    },
    reportUrl: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

// Auto-compute overallScore as the mean of the 7 rubric criteria when not explicitly set
evaluationSchema.pre('validate', function (next) {
  const criteria = [
    this.technicalSkills,
    this.communicationSkills,
    this.problemSolvingAbility,
    this.teamwork,
    this.professionalism,
    this.punctuality,
    this.adaptability,
  ];

  if ((this.overallScore === undefined || this.overallScore === null) && criteria.every((c) => c !== undefined && c !== null)) {
    const avg = criteria.reduce((sum, c) => sum + c, 0) / criteria.length;
    this.overallScore = Math.round(avg * 10) / 10;
  }

  // Keep legacy fields in sync so any old code reading score/comments still works
  if (this.overallScore !== undefined && this.overallScore !== null) {
    this.score = Math.round(this.overallScore * 10); // scale 0-10 -> 0-100
  }
  if (this.feedbackComments && !this.comments) {
    this.comments = this.feedbackComments;
  }

  next();
});

module.exports = mongoose.model('Evaluation', evaluationSchema);
