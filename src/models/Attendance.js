const mongoose = require('mongoose');

/**
 * Daily attendance record for a student's internship.
 * Aggregated attendance % feeds the ML "Attendance" feature.
 */
const attendanceSchema = new mongoose.Schema(
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
    checkIn: {
      type: String, // "HH:mm"
      default: '',
    },
    checkOut: {
      type: String, // "HH:mm"
      default: '',
    },
    status: {
      type: String,
      enum: ['Present', 'Absent', 'Late', 'Excused', 'Half Day'],
      default: 'Present',
    },
    totalHours: {
      type: Number,
      min: 0,
      max: 24,
      default: 0,
    },
    // Company/supervisor confirmation (spec: Company Module -> "confirm student attendance")
    confirmed: {
      type: Boolean,
      default: false,
    },
    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    notes: {
      type: String,
      maxlength: 500,
      default: '',
    },
  },
  { timestamps: true }
);

// One attendance record per student per day
attendanceSchema.index({ studentId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
