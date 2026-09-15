const mongoose = require('mongoose');

/**
 * A University Coordinator: the academic-side counterpart to Supervisor
 * (which represents the company-side overseer). A coordinator belongs to
 * exactly one university and only ever sees the students assigned to them
 * — never another coordinator's students, and never Admin/Company data.
 */
const coordinatorSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    department: {
      type: String,
      trim: true,
      default: '',
    },
    position: {
      type: String,
      trim: true,
      default: '',
    },
    assignedUniversity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'University',
      default: null,
    },
    assignedStudents: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
      },
    ],
    // Free-form notes a coordinator keeps per student, keyed by studentId.
    // Kept here (rather than on Student) so only the owning coordinator's
    // notes are ever exposed, matching the "never see another coordinator's
    // data" requirement even if a student is later reassigned.
    notes: [
      {
        studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
        text: { type: String, maxlength: 2000 },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Coordinator', coordinatorSchema);
