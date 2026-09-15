const University = require('../models/University');
const Coordinator = require('../models/Coordinator');
const Student = require('../models/Student');
const User = require('../models/User');
const StudentPerformance = require('../models/StudentPerformance');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * @route GET /api/universities
 * @access Admin. Supports search, status filter, and pagination.
 */
const getUniversities = asyncHandler(async (req, res) => {
  const { search = '', status, page = 1, limit = 10 } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (search) filter.$text = { $search: search };

  const skip = (Number(page) - 1) * Number(limit);

  const [universities, total] = await Promise.all([
    University.find(filter).populate('userId', 'name email phone isActive').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    University.countDocuments(filter),
  ]);

  // Attach lightweight counts per university (coordinators + students) in one pass
  const ids = universities.map((u) => u._id);
  const [coordCounts, studentCounts] = await Promise.all([
    Coordinator.aggregate([
      { $match: { assignedUniversity: { $in: ids } } },
      { $group: { _id: '$assignedUniversity', count: { $sum: 1 } } },
    ]),
    Student.aggregate([
      { $match: { university: { $in: ids } } },
      { $group: { _id: '$university', count: { $sum: 1 } } },
    ]),
  ]);
  const coordMap = Object.fromEntries(coordCounts.map((c) => [String(c._id), c.count]));
  const studentMap = Object.fromEntries(studentCounts.map((c) => [String(c._id), c.count]));

  const data = universities.map((u) => ({
    ...u.toObject(),
    coordinatorCount: coordMap[String(u._id)] || 0,
    studentCount: studentMap[String(u._id)] || 0,
  }));

  res.status(200).json({
    success: true,
    message: 'Universities retrieved',
    data: { universities: data, total, page: Number(page), pages: Math.ceil(total / Number(limit)) },
  });
});

/**
 * @route GET /api/universities/:id
 * @access Admin, and coordinators viewing their own assigned university
 */
const getUniversity = asyncHandler(async (req, res) => {
  if (req.user.role === 'coordinator') {
    const own = await Coordinator.findOne({ userId: req.user._id });
    if (!own || String(own.assignedUniversity) !== req.params.id) {
      return res.status(403).json({ success: false, message: 'You can only view your own university' });
    }
  }

  const university = await University.findById(req.params.id).populate('userId', 'name email phone isActive');
  if (!university) {
    return res.status(404).json({ success: false, message: 'University not found' });
  }

  const [coordinators, studentCount] = await Promise.all([
    Coordinator.find({ assignedUniversity: university._id }).populate('userId', 'name email phone'),
    Student.countDocuments({ university: university._id }),
  ]);

  res.status(200).json({
    success: true,
    message: 'University retrieved',
    data: { university, coordinators, studentCount },
  });
});

/**
 * @route POST /api/universities
 * @access Admin. Creates the login account (User, role='university') and the
 * University profile together in one step — the university then logs in
 * directly and manages its own coordinators, mirroring how a Company
 * account works.
 */
const createUniversity = asyncHandler(async (req, res) => {
  const { universityName, email, password, abbreviation, phone, address, state, country, website } = req.body;

  if (!universityName || !universityName.trim()) {
    return res.status(400).json({ success: false, message: 'University name is required' });
  }
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required to create the university\'s login' });
  }

  const [existingName, existingEmail] = await Promise.all([
    University.findOne({ universityName: universityName.trim() }),
    User.findOne({ email }),
  ]);
  if (existingName) {
    return res.status(400).json({ success: false, message: 'A university with this name already exists' });
  }
  if (existingEmail) {
    return res.status(400).json({ success: false, message: 'Email already exists' });
  }

  const user = await User.create({ name: universityName.trim(), email, password, role: 'university', phone });
  const university = await University.create({
    userId: user._id,
    universityName: universityName.trim(),
    abbreviation, phone, address, state, country, website,
    status: 'active',
  });

  const populated = await University.findById(university._id).populate('userId', 'name email phone isActive');

  res.status(201).json({ success: true, message: 'University created', data: { university: populated } });
});

/**
 * @route PUT /api/universities/:id
 * @access Admin
 */
const updateUniversity = asyncHandler(async (req, res) => {
  const allowed = ['universityName', 'abbreviation', 'phone', 'address', 'state', 'country', 'website', 'logo'];
  const updates = {};
  allowed.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

  const university = await University.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true }).populate('userId', 'name email phone isActive');
  if (!university) {
    return res.status(404).json({ success: false, message: 'University not found' });
  }

  res.status(200).json({ success: true, message: 'University updated', data: { university } });
});

/**
 * @route PUT /api/universities/:id/status
 * @access Admin. Body: { status: 'active' | 'inactive' }
 */
const toggleUniversityStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['active', 'inactive'].includes(status)) {
    return res.status(400).json({ success: false, message: "Status must be 'active' or 'inactive'" });
  }

  const university = await University.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!university) {
    return res.status(404).json({ success: false, message: 'University not found' });
  }

  res.status(200).json({ success: true, message: `University ${status === 'active' ? 'activated' : 'deactivated'}`, data: { university } });
});

/**
 * @route DELETE /api/universities/:id
 * @access Admin. Blocked if coordinators are still assigned, to avoid
 * silently orphaning coordinator accounts.
 */
const deleteUniversity = asyncHandler(async (req, res) => {
  const coordinatorCount = await Coordinator.countDocuments({ assignedUniversity: req.params.id });
  if (coordinatorCount > 0) {
    return res.status(400).json({
      success: false,
      message: `Cannot delete: ${coordinatorCount} coordinator(s) are still assigned to this university. Reassign or remove them first.`,
    });
  }

  const university = await University.findByIdAndDelete(req.params.id);
  if (!university) {
    return res.status(404).json({ success: false, message: 'University not found' });
  }
  await User.findByIdAndDelete(university.userId);

  res.status(200).json({ success: true, message: 'University deleted', data: {} });
});

/* ════════════════════════════════════════════════════════════════════════
   UNIVERSITY — Self-service (its own dashboard, once logged in)
   ════════════════════════════════════════════════════════════════════════ */

const findOwnUniversity = (userId) => University.findOne({ userId });

/**
 * @route GET /api/universities/me/profile
 */
const getMyUniversityProfile = asyncHandler(async (req, res) => {
  const university = await findOwnUniversity(req.user._id).then((u) => u && University.findById(u._id).populate('userId', 'name email phone'));
  if (!university) {
    return res.status(404).json({ success: false, message: 'University profile not found' });
  }
  res.status(200).json({ success: true, message: 'Profile retrieved', data: { university } });
});

/**
 * @route PUT /api/universities/me/profile
 */
const updateMyUniversityProfile = asyncHandler(async (req, res) => {
  const university = await findOwnUniversity(req.user._id);
  if (!university) {
    return res.status(404).json({ success: false, message: 'University profile not found' });
  }

  const { name, phone, abbreviation, address, state, country, website } = req.body;
  if (name !== undefined || phone !== undefined) {
    await User.findByIdAndUpdate(req.user._id, {
      ...(name !== undefined && { name }),
      ...(phone !== undefined && { phone }),
    });
  }
  const allowed = { abbreviation, address, state, country, website };
  Object.entries(allowed).forEach(([k, v]) => { if (v !== undefined) university[k] = v; });
  if (name !== undefined) university.universityName = name;
  await university.save();

  const updated = await University.findById(university._id).populate('userId', 'name email phone');
  res.status(200).json({ success: true, message: 'Profile updated', data: { university: updated } });
});

/**
 * @route GET /api/universities/me/dashboard
 * @desc  University-wide stats aggregated across ALL its coordinators —
 * this is the one view that isn't scoped to a single coordinator's roster.
 */
const getMyUniversityDashboard = asyncHandler(async (req, res) => {
  const university = await findOwnUniversity(req.user._id);
  if (!university) {
    return res.status(404).json({ success: false, message: 'University profile not found' });
  }

  const [coordinators, students] = await Promise.all([
    Coordinator.find({ assignedUniversity: university._id }).populate('userId', 'name email'),
    Student.find({ university: university._id }, '_id department'),
  ]);
  const studentIds = students.map((s) => s._id);

  const performances = await StudentPerformance.find({ studentId: { $in: studentIds } }, 'prediction.result');
  const gradeCounts = { Excellent: 0, Good: 0, Average: 0, Fair: 0, Poor: 0, Pending: 0 };
  performances.forEach((p) => {
    const r = p.prediction?.result || 'Pending';
    gradeCounts[r] = (gradeCounts[r] || 0) + 1;
  });

  const departmentCounts = students.reduce((acc, s) => {
    const key = s.department || 'Unspecified';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  res.status(200).json({
    success: true,
    message: 'Dashboard retrieved',
    data: {
      cards: {
        totalCoordinators: coordinators.length,
        totalStudents: studentIds.length,
        highPerformers: gradeCounts.Excellent + gradeCounts.Good,
        atRisk: gradeCounts.Poor,
      },
      charts: { performanceDistribution: gradeCounts, departmentDistribution: departmentCounts },
      coordinators: coordinators.map((c) => ({ _id: c._id, name: c.userId?.name, email: c.userId?.email, studentCount: c.assignedStudents.length })),
    },
  });
});

/**
 * @route GET /api/universities/me/coordinators
 */
const getMyCoordinators = asyncHandler(async (req, res) => {
  const university = await findOwnUniversity(req.user._id);
  if (!university) {
    return res.status(404).json({ success: false, message: 'University profile not found' });
  }
  const coordinators = await Coordinator.find({ assignedUniversity: university._id }).populate('userId', 'name email phone isActive').sort({ createdAt: -1 });
  res.status(200).json({ success: true, message: 'Coordinators retrieved', data: { coordinators } });
});

/**
 * @route POST /api/universities/me/coordinators
 * @desc  A university creates its own coordinator account directly — the
 * self-service counterpart to admin's createCoordinator, mirroring exactly
 * how Company.addOrgSupervisor lets a company create its own supervisors.
 */
const createMyCoordinator = asyncHandler(async (req, res) => {
  const university = await findOwnUniversity(req.user._id);
  if (!university) {
    return res.status(404).json({ success: false, message: 'University profile not found' });
  }

  const { name, email, password, phone, department, position } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'Name, email and password are required' });
  }

  const existing = await User.findOne({ email });
  if (existing) {
    return res.status(400).json({ success: false, message: 'Email already exists' });
  }

  const user = await User.create({ name, email, password, role: 'coordinator', phone });
  const coordinator = await Coordinator.create({
    userId: user._id,
    department: department || '',
    position: position || '',
    assignedUniversity: university._id,
  });
  const populated = await Coordinator.findById(coordinator._id).populate('userId', 'name email phone');

  res.status(201).json({ success: true, message: 'Coordinator added', data: { coordinator: populated } });
});

module.exports = {
  getUniversities,
  getUniversity,
  createUniversity,
  updateUniversity,
  toggleUniversityStatus,
  deleteUniversity,
  getMyUniversityProfile,
  updateMyUniversityProfile,
  getMyUniversityDashboard,
  getMyCoordinators,
  createMyCoordinator,
};
