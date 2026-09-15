const crypto = require('crypto');
const User = require('../models/User');
const Student = require('../models/Student');
const Company = require('../models/Company');
const Supervisor = require('../models/Supervisor');
const Coordinator = require('../models/Coordinator');
const University = require('../models/University');
const generateToken = require('../utils/generateToken');
const { sendEmail, emailTemplates } = require('../services/emailService');
const { asyncHandler } = require('../middleware/errorHandler');

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: (Number(process.env.JWT_COOKIE_EXPIRES) || 7) * 24 * 60 * 60 * 1000,
});

/**
 * @route POST /api/auth/register
 * Creates a User, plus the matching role-specific profile document
 * (Student / Company / Supervisor). Admin accounts have no extra profile.
 */
const register = asyncHandler(async (req, res) => {
  const { name, email, password, role = 'student', phone } = req.body;

  const existing = await User.findOne({ email });
  if (existing) {
    return res.status(400).json({ success: false, message: 'Email already exists' });
  }

  const user = await User.create({ name, email, password, role, phone });

  // Create the matching role profile
  if (role === 'student') {
    await Student.create({ userId: user._id });
  } else if (role === 'company') {
    await Company.create({ userId: user._id, companyName: name, approved: false });
  } else if (role === 'supervisor') {
    await Supervisor.create({ userId: user._id });
  } else if (role === 'coordinator') {
    await Coordinator.create({ userId: user._id });
  } else if (role === 'university') {
    await University.create({ userId: user._id, universityName: name, status: 'active' });
  }

  const token = generateToken(user);

  const template = emailTemplates.welcome(user.name);
  sendEmail({ to: user.email, ...template });

  res
    .status(201)
    .cookie('token', token, cookieOptions())
    .json({
      success: true,
      message: 'Registration successful',
      data: { user, token },
    });
});

/**
 * @route POST /api/auth/login
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  }

  if (!user.isActive) {
    return res.status(403).json({ success: false, message: 'This account has been deactivated' });
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  }

  const token = generateToken(user);

  res
    .status(200)
    .cookie('token', token, cookieOptions())
    .json({
      success: true,
      message: 'Login successful',
      data: { user, token },
    });
});

/**
 * @route POST /api/auth/logout
 * Stateless JWT: server just clears the cookie. Client should also
 * discard any token it stored (e.g. in localStorage).
 */
const logout = asyncHandler(async (req, res) => {
  res.clearCookie('token');
  res.status(200).json({ success: true, message: 'Logged out successfully', data: {} });
});

/**
 * @route POST /api/auth/forgot-password
 * Generates a reset token, stores its hash + expiry, emails the raw token link.
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  // Respond the same way whether or not the user exists, to avoid leaking which emails are registered
  const genericResponse = {
    success: true,
    message: 'If that email exists, a password reset link has been sent.',
  };

  if (!user) {
    return res.status(200).json(genericResponse);
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

  user.passwordResetToken = hashedToken;
  user.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1 hour
  await user.save({ validateBeforeSave: false });

  const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${rawToken}`;
  const template = emailTemplates.passwordReset(resetUrl);
  await sendEmail({ to: user.email, ...template });

  res.status(200).json(genericResponse);
});

/**
 * @route POST /api/auth/reset-password
 * Body: { token, password }
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  }).select('+password +passwordResetToken +passwordResetExpires');

  if (!user) {
    return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
  }

  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  res.status(200).json({ success: true, message: 'Password reset successful', data: {} });
});

/**
 * @route PUT /api/auth/change-password
 * Requires authentication. Body: { oldPassword, newPassword }
 */
const changePassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select('+password');
  const isMatch = await user.comparePassword(oldPassword);

  if (!isMatch) {
    return res.status(401).json({ success: false, message: 'Old password is incorrect' });
  }

  user.password = newPassword;
  await user.save();

  res.status(200).json({ success: true, message: 'Password changed successfully', data: {} });
});

/**
 * @route GET /api/auth/me
 * Returns the currently authenticated user (handy for the React frontend on app load).
 */
const getMe = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, message: 'Current user', data: { user: req.user } });
});

module.exports = {
  register,
  login,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
  getMe,
};
