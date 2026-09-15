const Task = require('../models/Task');
const Supervisor = require('../models/Supervisor');
const Student = require('../models/Student');
const { asyncHandler } = require('../middleware/errorHandler');
const { createNotification } = require('../services/notificationService');

// ─────────────────────────────────────────────────────────────────────────────
// SUPERVISOR ACTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @route POST /api/tasks
 * Supervisor creates a task and assigns it to one of their students.
 */
const createTask = asyncHandler(async (req, res) => {
  const supervisor = await Supervisor.findOne({ userId: req.user._id });
  if (!supervisor) {
    return res.status(404).json({ success: false, message: 'Supervisor profile not found' });
  }

  const { title, description, assignedTo, dueDate, priority } = req.body;

  // Ensure the target student is actually assigned to this supervisor
  const isAssigned = supervisor.assignedStudents.some(
    (id) => id.toString() === assignedTo
  );
  if (!isAssigned) {
    return res.status(403).json({
      success: false,
      message: 'You can only assign tasks to students under your supervision',
    });
  }

  const task = await Task.create({
    title,
    description,
    supervisorId: supervisor._id,
    assignedTo,
    dueDate,
    priority: priority || 'Medium',
  });

  // Notify the student
  const student = await Student.findById(assignedTo).populate('userId', 'name _id');
  if (student?.userId) {
    await createNotification(
      student.userId._id,
      'New Task Assigned',
      `Your supervisor assigned you a new task: "${title}". Due: ${new Date(dueDate).toDateString()}.`
    );
  }

  res.status(201).json({ success: true, message: 'Task created and assigned', data: { task } });
});

/**
 * @route GET /api/tasks/supervisor
 * Returns all tasks created by this supervisor.
 * Optional filters: ?assignedTo=studentId, ?status=Pending
 */
const getSupervisorTasks = asyncHandler(async (req, res) => {
  const supervisor = await Supervisor.findOne({ userId: req.user._id });
  if (!supervisor) {
    return res.status(404).json({ success: false, message: 'Supervisor profile not found' });
  }

  const filter = { supervisorId: supervisor._id };
  if (req.query.assignedTo) filter.assignedTo = req.query.assignedTo;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.priority) filter.priority = req.query.priority;

  const tasks = await Task.find(filter)
    .populate({ path: 'assignedTo', populate: { path: 'userId', select: 'name email' } })
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, message: 'Tasks retrieved', data: { tasks } });
});

/**
 * @route PUT /api/tasks/:id
 * Supervisor updates task details (title, description, dueDate, priority, status).
 * Cannot reassign a task to a different student after creation.
 */
const updateTask = asyncHandler(async (req, res) => {
  const supervisor = await Supervisor.findOne({ userId: req.user._id });
  const task = await Task.findById(req.params.id);

  if (!task) {
    return res.status(404).json({ success: false, message: 'Task not found' });
  }
  if (task.supervisorId.toString() !== supervisor._id.toString()) {
    return res.status(403).json({ success: false, message: 'Not authorized to edit this task' });
  }

  const allowed = ['title', 'description', 'dueDate', 'priority', 'status'];
  allowed.forEach((field) => {
    if (req.body[field] !== undefined) task[field] = req.body[field];
  });

  await task.save();
  res.status(200).json({ success: true, message: 'Task updated', data: { task } });
});

/**
 * @route DELETE /api/tasks/:id
 * Supervisor deletes one of their tasks.
 */
const deleteTask = asyncHandler(async (req, res) => {
  const supervisor = await Supervisor.findOne({ userId: req.user._id });
  const task = await Task.findById(req.params.id);

  if (!task) {
    return res.status(404).json({ success: false, message: 'Task not found' });
  }
  if (task.supervisorId.toString() !== supervisor._id.toString()) {
    return res.status(403).json({ success: false, message: 'Not authorized to delete this task' });
  }

  await task.deleteOne();
  res.status(200).json({ success: true, message: 'Task deleted', data: {} });
});

/**
 * @route POST /api/tasks/:id/feedback
 * Supervisor reviews a submitted task and provides:
 *  - comment
 *  - rating (1–5)
 *  - recommendation: Excellent | Good | Average | Fair | Poor
 * Status is automatically set to 'Completed' after feedback.
 */
const giveTaskFeedback = asyncHandler(async (req, res) => {
  const supervisor = await Supervisor.findOne({ userId: req.user._id });
  const task = await Task.findById(req.params.id);

  if (!task) {
    return res.status(404).json({ success: false, message: 'Task not found' });
  }
  if (task.supervisorId.toString() !== supervisor._id.toString()) {
    return res.status(403).json({ success: false, message: 'Not authorized to review this task' });
  }
  if (task.status !== 'Submitted') {
    return res.status(400).json({
      success: false,
      message: 'Can only give feedback on tasks the student has submitted',
    });
  }

  const { comment, rating, recommendation } = req.body;

  const validRecommendations = ['Excellent', 'Good', 'Average', 'Fair', 'Poor'];
  if (recommendation && !validRecommendations.includes(recommendation)) {
    return res.status(400).json({
      success: false,
      message: `Recommendation must be one of: ${validRecommendations.join(', ')}`,
    });
  }

  task.feedback = {
    comment: comment || '',
    rating: rating || null,
    reviewedAt: new Date(),
  };
  task.recommendation = recommendation || '';
  task.status = 'Completed';

  await task.save();

  // Notify the student
  const student = await Student.findById(task.assignedTo).populate('userId', '_id');
  if (student?.userId) {
    await createNotification(
      student.userId._id,
      'Task Feedback Received',
      `Your supervisor reviewed your task "${task.title}" and rated it: ${recommendation || 'see feedback'}.`
    );
  }

  res.status(200).json({ success: true, message: 'Feedback submitted', data: { task } });
});

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT ACTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @route GET /api/tasks/student
 * Returns all tasks assigned to the logged-in student.
 */
const getStudentTasks = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ userId: req.user._id });
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student profile not found' });
  }

  const filter = { assignedTo: student._id };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.priority) filter.priority = req.query.priority;

  const tasks = await Task.find(filter)
    .populate({
      path: 'supervisorId',
      populate: { path: 'userId', select: 'name email' },
    })
    .sort({ dueDate: 1 }); // sort by nearest due date first

  res.status(200).json({ success: true, message: 'Tasks retrieved', data: { tasks } });
});

/**
 * @route PUT /api/tasks/:id/submit
 * Student submits their work on a task.
 * Body: { text, fileUrl }
 * Status changes from Pending/In Progress -> Submitted.
 */
const submitTask = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ userId: req.user._id });
  const task = await Task.findById(req.params.id);

  if (!task) {
    return res.status(404).json({ success: false, message: 'Task not found' });
  }
  if (task.assignedTo.toString() !== student._id.toString()) {
    return res.status(403).json({ success: false, message: 'This task is not assigned to you' });
  }
  if (['Completed', 'Submitted'].includes(task.status)) {
    return res.status(400).json({
      success: false,
      message: `Task is already ${task.status}`,
    });
  }

  const { text, fileUrl } = req.body;
  if (!text && !fileUrl) {
    return res.status(400).json({
      success: false,
      message: 'Provide a submission text or file URL',
    });
  }

  task.submission = { text: text || '', fileUrl: fileUrl || '', submittedAt: new Date() };
  task.status = 'Submitted';
  await task.save();

  // Notify supervisor
  const supervisor = await Supervisor.findById(task.supervisorId).populate('userId', '_id name');
  if (supervisor?.userId) {
    await createNotification(
      supervisor.userId._id,
      'Task Submitted',
      `Student submitted task "${task.title}". Please review and provide feedback.`
    );
  }

  res.status(200).json({ success: true, message: 'Task submitted successfully', data: { task } });
});

/**
 * @route PUT /api/tasks/:id/start
 * Student marks a task as "In Progress".
 */
const startTask = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ userId: req.user._id });
  const task = await Task.findById(req.params.id);

  if (!task) {
    return res.status(404).json({ success: false, message: 'Task not found' });
  }
  if (task.assignedTo.toString() !== student._id.toString()) {
    return res.status(403).json({ success: false, message: 'This task is not assigned to you' });
  }
  if (task.status !== 'Pending') {
    return res.status(400).json({ success: false, message: `Task is already ${task.status}` });
  }

  task.status = 'In Progress';
  await task.save();

  res.status(200).json({ success: true, message: 'Task marked as In Progress', data: { task } });
});

/**
 * @route GET /api/tasks/:id
 * Get single task detail. Both supervisor (if owner) and student (if assigned) can access.
 */
const getTaskById = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id)
    .populate({ path: 'supervisorId', populate: { path: 'userId', select: 'name email' } })
    .populate({ path: 'assignedTo', populate: { path: 'userId', select: 'name email' } });

  if (!task) {
    return res.status(404).json({ success: false, message: 'Task not found' });
  }

  // Access control: only the assigned student, their supervisor, or admin can see it
  if (req.user.role === 'student') {
    const student = await Student.findOne({ userId: req.user._id });
    if (task.assignedTo._id.toString() !== student._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
  } else if (req.user.role === 'supervisor') {
    const supervisor = await Supervisor.findOne({ userId: req.user._id });
    if (task.supervisorId._id.toString() !== supervisor._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
  }

  res.status(200).json({ success: true, message: 'Task retrieved', data: { task } });
});

module.exports = {
  createTask,
  getSupervisorTasks,
  updateTask,
  deleteTask,
  giveTaskFeedback,
  getStudentTasks,
  submitTask,
  startTask,
  getTaskById,
};
