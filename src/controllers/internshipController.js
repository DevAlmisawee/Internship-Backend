const Internship = require('../models/Internship');
const Company = require('../models/Company');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * @route GET /api/internships
 * Supports:
 *  - search: ?search=keyword (matches title, description, category via text index)
 *  - filter: ?location=, ?category=, ?company=, ?paid=true|false, ?remote=true|false
 *  - sort:   ?sort=newest|oldest|deadline|company|location
 *  - pagination: ?page=1&limit=10
 */
const getInternships = asyncHandler(async (req, res) => {
  const {
    search,
    location,
    category,
    company,
    paid,
    remote,
    sort = 'newest',
    page = 1,
    limit = 10,
  } = req.query;

  const filter = { status: 'open' };

  if (search) {
    filter.$text = { $search: search };
  }
  if (location) {
    filter.location = { $regex: location, $options: 'i' };
  }
  if (category) {
    filter.category = { $regex: category, $options: 'i' };
  }
  if (company) {
    // Resolve company name -> companyId(s)
    const matchingCompanies = await Company.find({
      companyName: { $regex: company, $options: 'i' },
    }).select('_id');
    filter.companyId = { $in: matchingCompanies.map((c) => c._id) };
  }
  if (paid === 'true') {
    filter.stipend = { $gt: 0 };
  } else if (paid === 'false') {
    filter.stipend = { $eq: 0 };
  }
  if (remote === 'true') {
    filter.remote = true;
  } else if (remote === 'false') {
    filter.remote = false;
  }

  const sortMap = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    deadline: { deadline: 1 },
    company: { companyId: 1 },
    location: { location: 1 },
  };
  const sortOption = sortMap[sort] || sortMap.newest;

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
  const skip = (pageNum - 1) * limitNum;

  const [internships, total] = await Promise.all([
    Internship.find(filter)
      .populate('companyId', 'companyName logo industry')
      .sort(sortOption)
      .skip(skip)
      .limit(limitNum),
    Internship.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    message: 'Internships retrieved',
    data: {
      internships,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    },
  });
});

/**
 * @route GET /api/internships/:id
 */
const getInternshipById = asyncHandler(async (req, res) => {
  const internship = await Internship.findById(req.params.id).populate(
    'companyId',
    'companyName logo industry website description'
  );
  if (!internship) {
    return res.status(404).json({ success: false, message: 'Internship not found' });
  }
  res.status(200).json({ success: true, message: 'Internship retrieved', data: { internship } });
});

/**
 * @route POST /api/internships
 * Company only. Creates an internship tied to the logged-in company's profile.
 */
const createInternship = asyncHandler(async (req, res) => {
  const company = await Company.findOne({ userId: req.user._id });
  if (!company) {
    return res.status(404).json({ success: false, message: 'Company profile not found' });
  }
  if (!company.approved) {
    return res.status(403).json({
      success: false,
      message: 'Your company must be approved by an admin before posting internships',
    });
  }

  const {
    title,
    description,
    location,
    remote,
    duration,
    stipend,
    requirements,
    deadline,
    category,
  } = req.body;

  const internship = await Internship.create({
    title,
    description,
    companyId: company._id,
    location,
    remote,
    duration,
    stipend,
    requirements,
    deadline,
    category,
  });

  res.status(201).json({ success: true, message: 'Internship created', data: { internship } });
});

/**
 * @route PUT /api/internships/:id
 * Company can edit only its own internships; admin can edit any.
 */
const updateInternship = asyncHandler(async (req, res) => {
  const internship = await Internship.findById(req.params.id);
  if (!internship) {
    return res.status(404).json({ success: false, message: 'Internship not found' });
  }

  if (req.user.role !== 'admin') {
    const company = await Company.findOne({ userId: req.user._id });
    if (!company || internship.companyId.toString() !== company._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to edit this internship' });
    }
  }

  const allowedFields = [
    'title',
    'description',
    'location',
    'remote',
    'duration',
    'stipend',
    'requirements',
    'deadline',
    'category',
    'status',
  ];
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) internship[field] = req.body[field];
  });

  await internship.save();
  res.status(200).json({ success: true, message: 'Internship updated', data: { internship } });
});

/**
 * @route DELETE /api/internships/:id
 * Company can delete only its own internships; admin can delete any.
 */
const deleteInternship = asyncHandler(async (req, res) => {
  const internship = await Internship.findById(req.params.id);
  if (!internship) {
    return res.status(404).json({ success: false, message: 'Internship not found' });
  }

  if (req.user.role !== 'admin') {
    const company = await Company.findOne({ userId: req.user._id });
    if (!company || internship.companyId.toString() !== company._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this internship' });
    }
  }

  await internship.deleteOne();
  res.status(200).json({ success: true, message: 'Internship deleted', data: {} });
});

module.exports = {
  getInternships,
  getInternshipById,
  createInternship,
  updateInternship,
  deleteInternship,
};
