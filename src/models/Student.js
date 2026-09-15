const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    matricNumber: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    department: {
      type: String,
      trim: true,
      default: '',
    },
    faculty: {
      type: String,
      trim: true,
      default: '',
    },
    level: {
      type: String,
      trim: true,
      default: '',
    },
    passportPhoto: {
      url: { type: String, default: '' },
      publicId: { type: String, default: '' },
    },
    cgpa: {
      type: Number,
      min: 0,
      max: 5,
    },
    skills: {
      type: [String],
      default: [],
    },
    cv: {
      url: { type: String, default: '' },
      publicId: { type: String, default: '' },
    },
    bio: {
      type: String,
      maxlength: 1000,
      default: '',
    },
    savedInternships: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Internship',
      },
    ],
    supervisorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supervisor',
      default: null,
    },
    // University-side linkage — separate from supervisorId (company-side).
    university: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'University',
      default: null,
    },
    coordinator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Coordinator',
      default: null,
    },
    semester: {
      type: String,
      trim: true,
      default: '',
    },
    graduationYear: {
      type: Number,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Student', studentSchema);
