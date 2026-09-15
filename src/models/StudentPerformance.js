const mongoose = require('mongoose');

/**
 * Stores the 9 performance features matching the ML training dataset exactly.
 *
 * Dataset columns → field names:
 *   GPA                    → gpa               (0.0 – 4.0)
 *   Course_Scores          → courseScores       (0 – 100)
 *   Aptitude_Score         → aptitudeScore      (0 – 100)
 *   Attendance             → attendance         (0 – 100, percentage)
 *   Supervisor_Evaluation  → supervisorEvaluation (0 – 10)
 *   Report_Quality         → reportQuality      (0 – 10)
 *   Activity_Log_Frequency → activityLogFrequency (0 – 29, count)
 *   Completion_Time        → completionTime     (1 – 7, lower = faster)
 *   Feedback_Rating        → feedbackRating     (1 – 5)
 *
 * Performance_Score (target) is mapped to labels:
 *   >= 85  → Excellent
 *   70–84  → Good
 *   55–69  → Average
 *   40–54  → Fair
 *   < 40   → Poor
 */
const studentPerformanceSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      unique: true,
    },
    supervisorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supervisor',
      required: true,
    },

    // ── The 9 ML features (matching dataset exactly) ─────────────────────────
    features: {
      gpa: {
        type: Number,
        min: 0,
        max: 4.0,
        required: [true, 'GPA is required'],
      },
      courseScores: {
        type: Number,
        min: 0,
        max: 100,
        required: [true, 'Course Scores is required'],
      },
      aptitudeScore: {
        type: Number,
        min: 0,
        max: 100,
        required: [true, 'Aptitude Score is required'],
      },
      attendance: {
        type: Number,
        min: 0,
        max: 100,
        required: [true, 'Attendance is required'],
      },
      supervisorEvaluation: {
        type: Number,
        min: 0,
        max: 10,
        required: [true, 'Supervisor Evaluation is required'],
      },
      reportQuality: {
        type: Number,
        min: 0,
        max: 10,
        required: [true, 'Report Quality is required'],
      },
      activityLogFrequency: {
        type: Number,
        min: 0,
        max: 29,
        required: [true, 'Activity Log Frequency is required'],
      },
      completionTime: {
        type: Number,
        min: 1,
        max: 7,
        required: [true, 'Completion Time is required'],
      },
      feedbackRating: {
        type: Number,
        min: 1,
        max: 5,
        required: [true, 'Feedback Rating is required'],
      },
    },

    // Supervisor's written comments / recommendation
    supervisorRecommendation: {
      type: String,
      maxlength: 2000,
      default: '',
    },

    // ── ML Prediction ────────────────────────────────────────────────────────
    prediction: {
      result: {
        type: String,
        enum: ['Excellent', 'Good', 'Average', 'Fair', 'Poor', 'Pending'],
        default: 'Pending',
      },
      performanceScore: {
        // Raw numeric score returned by ML model (0–100), if available
        type: Number,
        default: null,
      },
      confidence: {
        type: Number,
        min: 0,
        max: 1,
        default: null,
      },
      predictedAt: {
        type: Date,
        default: null,
      },
      mlModelVersion: {
        type: String,
        default: '',
      },
      rawResponse: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
      },
      error: {
        type: String,
        default: '',
      },
    },

    // ── Full history of every prediction for this student ────────────────────
    predictionHistory: [
      {
        features: { type: mongoose.Schema.Types.Mixed },
        result: { type: String },
        performanceScore: { type: Number },
        confidence: { type: Number },
        predictedAt: { type: Date },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('StudentPerformance', studentPerformanceSchema);
