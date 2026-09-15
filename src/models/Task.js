const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Task title is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Task description is required'],
      trim: true,
    },
    supervisorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supervisor',
      required: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    dueDate: {
      type: Date,
      required: [true, 'Due date is required'],
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High'],
      default: 'Medium',
    },
    status: {
      type: String,
      enum: ['Pending', 'In Progress', 'Submitted', 'Completed', 'Overdue'],
      default: 'Pending',
    },
    // Student submits work here
    submission: {
      text: { type: String, default: '' },
      fileUrl: { type: String, default: '' },
      submittedAt: { type: Date },
    },
    // Supervisor feedback after reviewing submission
    feedback: {
      comment: { type: String, default: '' },
      rating: {
        type: Number,
        min: 1,
        max: 5,
      },
      reviewedAt: { type: Date },
    },
    // Recommendation from supervisor on this specific task
    recommendation: {
      type: String,
      enum: ['Excellent', 'Good', 'Average', 'Fair', 'Poor', ''],
      default: '',
    },
  },
  { timestamps: true }
);

// Index for fast lookups by supervisor and assigned student
taskSchema.index({ supervisorId: 1, assignedTo: 1 });
taskSchema.index({ assignedTo: 1, status: 1 });

module.exports = mongoose.model('Task', taskSchema);
