const mongoose = require('mongoose');

/**
 * A row of the ML model's labeled training dataset
 * (internship_performance_prediction/data/internship_data.csv), imported
 * into MongoDB so the admin dashboard can ask the ML API to score the full
 * dataset live via /evaluate and show accuracy / confusion-matrix metrics.
 *
 * This is NOT tied to a real Student — it's the model's training data, kept
 * separate from `StudentPerformance` (which stores real per-student
 * predictions). Populated via `scripts/importTrainingData.js`.
 */
const trainingRecordSchema = new mongoose.Schema(
  {
    internId: {
      // Original Intern_ID column from the dataset (e.g. "INT0001")
      type: String,
      required: true,
      unique: true,
    },
    features: {
      GPA: { type: Number, required: true },
      Course_Scores: { type: Number, required: true },
      Aptitude_Score: { type: Number, required: true },
      Attendance: { type: Number, required: true },
      Supervisor_Evaluation: { type: Number, required: true },
      Report_Quality: { type: Number, required: true },
      Activity_Log_Frequency: { type: Number, required: true },
      Completion_Time: { type: Number, required: true },
      Feedback_Rating: { type: Number, required: true },
    },
    performance: {
      // Ground-truth label: Poor | Fair | Average | Good | Excellent
      type: String,
      required: true,
      enum: ['Poor', 'Fair', 'Average', 'Good', 'Excellent'],
    },
    performanceScore: {
      // Ground-truth numeric score (0-100), if present in the source dataset
      type: Number,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('TrainingRecord', trainingRecordSchema);
