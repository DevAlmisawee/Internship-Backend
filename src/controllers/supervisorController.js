const Supervisor = require('../models/Supervisor');
const Student = require('../models/Student');
const Evaluation = require('../models/Evaluation');
const { asyncHandler } = require('../middleware/errorHandler');
const { createNotification } = require('../services/notificationService');

/**
 * @route GET /api/supervisors/profile
 */
const getProfile = asyncHandler(async (req, res) => {
  const supervisor = await Supervisor.findOne({ userId: req.user._id }).populate(
    'userId',
    'name email phone'
  );
  if (!supervisor) {
    return res.status(404).json({ success: false, message: 'Supervisor profile not found' });
  }
  res.status(200).json({ success: true, message: 'Supervisor profile', data: { supervisor } });
});

/**
 * @route PUT /api/supervisors/profile
 */
const updateProfile = asyncHandler(async (req, res) => {
  const { department, office, phone } = req.body;

  const supervisor = await Supervisor.findOneAndUpdate(
    { userId: req.user._id },
    {
      ...(department !== undefined && { department }),
      ...(office !== undefined && { office }),
      ...(phone !== undefined && { phone }),
    },
    { new: true, runValidators: true }
  );

  if (!supervisor) {
    return res.status(404).json({ success: false, message: 'Supervisor profile not found' });
  }

  res.status(200).json({ success: true, message: 'Profile updated', data: { supervisor } });
});

/**
 * @route GET /api/supervisors/students
 * Returns the students assigned to the logged-in supervisor.
 */
const getAssignedStudents = asyncHandler(async (req, res) => {
  const supervisor = await Supervisor.findOne({ userId: req.user._id }).populate({
    path: 'assignedStudents',
    populate: { path: 'userId', select: 'name email phone' },
  });

  if (!supervisor) {
    return res.status(404).json({ success: false, message: 'Supervisor profile not found' });
  }

  res.status(200).json({
    success: true,
    message: 'Assigned students retrieved',
    data: { students: supervisor.assignedStudents },
  });
});

/**
 * @route POST /api/supervisors/evaluations
 * Supervisor evaluates one of their assigned students using the full rubric
 * (spec: Supervisor Evaluation Form).
 * Body: {
 *   studentId,
 *   technicalSkills, communicationSkills, problemSolvingAbility, teamwork,
 *   professionalism, punctuality, adaptability,   // each 0-10
 *   overallScore,   // optional — auto-computed as the average if omitted
 *   feedbackComments,
 * }
 */
const createEvaluation = asyncHandler(async (req, res) => {
  const {
    studentId,
    technicalSkills,
    communicationSkills,
    problemSolvingAbility,
    teamwork,
    professionalism,
    punctuality,
    adaptability,
    overallScore,
    feedbackComments,
    reportUrl,
  } = req.body;

  const supervisor = await Supervisor.findOne({ userId: req.user._id });
  if (!supervisor) {
    return res.status(404).json({ success: false, message: 'Supervisor profile not found' });
  }

  const isAssigned = supervisor.assignedStudents.some((id) => id.toString() === studentId);
  if (!isAssigned) {
    return res.status(403).json({ success: false, message: 'This student is not assigned to you' });
  }

  const evaluation = await Evaluation.create({
    supervisorId: supervisor._id,
    studentId,
    technicalSkills,
    communicationSkills,
    problemSolvingAbility,
    teamwork,
    professionalism,
    punctuality,
    adaptability,
    overallScore,
    feedbackComments,
    reportUrl,
  });

  const student = await Student.findById(studentId);
  if (student?.userId) {
    await createNotification(
      student.userId,
      'Evaluation Results Available',
      `Your supervisor submitted a new performance evaluation. Overall score: ${evaluation.overallScore}/10.`
    );
  }

  res.status(201).json({ success: true, message: 'Evaluation submitted', data: { evaluation } });
});

/**
 * @route GET /api/supervisors/evaluations
 * Lists evaluations submitted by the logged-in supervisor.
 */
const getEvaluations = asyncHandler(async (req, res) => {
  const supervisor = await Supervisor.findOne({ userId: req.user._id });
  if (!supervisor) {
    return res.status(404).json({ success: false, message: 'Supervisor profile not found' });
  }

  const evaluations = await Evaluation.find({ supervisorId: supervisor._id })
    .populate({ path: 'studentId', populate: { path: 'userId', select: 'name email' } })
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, message: 'Evaluations retrieved', data: { evaluations } });
});

module.exports = {
  getProfile,
  updateProfile,
  getAssignedStudents,
  createEvaluation,
  getEvaluations,
};
