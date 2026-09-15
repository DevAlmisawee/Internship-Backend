const mongoose = require('mongoose');

/**
 * A student's own internship placement record, as described in the spec's
 * "Internship Information" section. This is distinct from the `Internship`
 * model (which represents job-board style postings that companies list and
 * students apply to via `Application`). A student can arrive at this record
 * either by:
 *   - having an `Application` accepted for a posted `Internship`, or
 *   - an admin/student entering an externally-sourced placement directly
 *     (company name/address typed in, not linked to a platform `Company`).
 *
 * This record is what "Internship Information" in the Student Module refers
 * to, and is what Attendance / ActivityLog / Report / Evaluation entries
 * logically belong to.
 */
const studentInternshipSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      unique: true,
    },
    // Set only if this placement originated from an accepted platform Application
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
      default: null,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      default: null,
    },
    companyName: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
    },
    companyAddress: {
      type: String,
      trim: true,
      default: '',
    },
    companySupervisorName: {
      type: String,
      trim: true,
      default: '',
    },
    companySupervisorEmail: {
      type: String,
      trim: true,
      default: '',
    },
    companySupervisorPhone: {
      type: String,
      trim: true,
      default: '',
    },
    universitySupervisorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supervisor',
      default: null,
    },
    position: {
      type: String,
      trim: true,
      default: '',
    },
    duration: {
      type: String,
      trim: true,
      default: '',
    },
    startDate: {
      type: Date,
      required: [true, 'Internship start date is required'],
    },
    endDate: {
      type: Date,
      required: [true, 'Internship end date is required'],
    },
    status: {
      type: String,
      enum: ['Pending Approval', 'Active', 'Completed', 'Terminated'],
      default: 'Pending Approval',
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('StudentInternship', studentInternshipSchema);
