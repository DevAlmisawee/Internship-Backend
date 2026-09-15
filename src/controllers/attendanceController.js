const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const Supervisor = require('../models/Supervisor');
const { asyncHandler } = require('../middleware/errorHandler');
const { createNotification } = require('../services/notificationService');

const computeHours = (checkIn, checkOut) => {
  if (!checkIn || !checkOut) return 0;
  const [inH, inM] = checkIn.split(':').map(Number);
  const [outH, outM] = checkOut.split(':').map(Number);
  const mins = outH * 60 + outM - (inH * 60 + inM);
  return mins > 0 ? Math.round((mins / 60) * 100) / 100 : 0;
};

/**
 * @route POST /api/attendance/checkin
 * Student checks in for the day. Creates today's attendance record if absent.
 */
const checkIn = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ userId: req.user._id });
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student profile not found' });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const time = req.body.time || new Date().toTimeString().slice(0, 5);

  let record = await Attendance.findOne({ studentId: student._id, date: today });
  if (record && record.checkIn) {
    return res.status(400).json({ success: false, message: 'Already checked in today' });
  }

  if (!record) {
    record = await Attendance.create({
      studentId: student._id,
      date: today,
      checkIn: time,
      status: 'Present',
    });
  } else {
    record.checkIn = time;
    record.status = 'Present';
    await record.save();
  }

  res.status(200).json({ success: true, message: 'Checked in', data: { attendance: record } });
});

/**
 * @route PUT /api/attendance/checkout
 * Student checks out for the day and total hours are computed.
 */
const checkOut = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ userId: req.user._id });
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student profile not found' });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const time = req.body.time || new Date().toTimeString().slice(0, 5);

  const record = await Attendance.findOne({ studentId: student._id, date: today });
  if (!record || !record.checkIn) {
    return res.status(400).json({ success: false, message: 'You must check in before checking out' });
  }

  record.checkOut = time;
  record.totalHours = computeHours(record.checkIn, time);
  await record.save();

  res.status(200).json({ success: true, message: 'Checked out', data: { attendance: record } });
});

/**
 * @route GET /api/attendance/me
 * Student views their own attendance history.
 */
const getMyAttendance = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ userId: req.user._id });
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student profile not found' });
  }

  const records = await Attendance.find({ studentId: student._id }).sort({ date: -1 });
  const stats = summarize(records);

  res.status(200).json({ success: true, message: 'Attendance retrieved', data: { records, stats } });
});

/**
 * @route GET /api/attendance/student/:studentId
 * Supervisor/Admin views a specific student's attendance history + summary.
 */
const getStudentAttendance = asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  if (req.user.role === 'supervisor') {
    const supervisor = await Supervisor.findOne({ userId: req.user._id });
    const isAssigned = supervisor?.assignedStudents.some((id) => id.toString() === studentId);
    if (!isAssigned) {
      return res.status(403).json({ success: false, message: 'This student is not assigned to you' });
    }
  }

  const records = await Attendance.find({ studentId }).sort({ date: -1 });
  const stats = summarize(records);

  res.status(200).json({ success: true, message: 'Attendance retrieved', data: { records, stats } });
});

/**
 * @route PUT /api/attendance/:id/confirm
 * Supervisor or Company confirms a student's attendance record (spec: Company Module).
 */
const confirmAttendance = asyncHandler(async (req, res) => {
  const record = await Attendance.findById(req.params.id);
  if (!record) {
    return res.status(404).json({ success: false, message: 'Attendance record not found' });
  }

  if (req.user.role === 'supervisor') {
    const supervisor = await Supervisor.findOne({ userId: req.user._id });
    const isAssigned = supervisor?.assignedStudents.some(
      (id) => id.toString() === record.studentId.toString()
    );
    if (!isAssigned) {
      return res.status(403).json({ success: false, message: 'This student is not assigned to you' });
    }
  }

  record.confirmed = true;
  record.confirmedBy = req.user._id;
  await record.save();

  const student = await Student.findById(record.studentId);
  if (student?.userId) {
    await createNotification(
      student.userId,
      'Attendance Confirmed',
      `Your attendance for ${record.date.toDateString()} has been confirmed.`
    );
  }

  res.status(200).json({ success: true, message: 'Attendance confirmed', data: { attendance: record } });
});

/**
 * @route POST /api/attendance/manual
 * Supervisor/Admin manually records or corrects a student's attendance for a given date.
 */
const recordManualAttendance = asyncHandler(async (req, res) => {
  const { studentId, date, checkIn: ci, checkOut: co, status, notes } = req.body;

  if (req.user.role === 'supervisor') {
    const supervisor = await Supervisor.findOne({ userId: req.user._id });
    const isAssigned = supervisor?.assignedStudents.some((id) => id.toString() === studentId);
    if (!isAssigned) {
      return res.status(403).json({ success: false, message: 'This student is not assigned to you' });
    }
  }

  const day = new Date(date);
  day.setHours(0, 0, 0, 0);

  const record = await Attendance.findOneAndUpdate(
    { studentId, date: day },
    {
      studentId,
      date: day,
      ...(ci !== undefined && { checkIn: ci }),
      ...(co !== undefined && { checkOut: co }),
      ...(ci !== undefined && co !== undefined && { totalHours: computeHours(ci, co) }),
      ...(status !== undefined && { status }),
      ...(notes !== undefined && { notes }),
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  res.status(200).json({ success: true, message: 'Attendance recorded', data: { attendance: record } });
});

/** Computes attendance percentage + present/absent/late counts from a set of records. */
function summarize(records) {
  const total = records.length;
  if (total === 0) {
    return { totalDays: 0, present: 0, absent: 0, late: 0, excused: 0, attendancePercentage: 0, totalHours: 0 };
  }
  const present = records.filter((r) => r.status === 'Present').length;
  const absent = records.filter((r) => r.status === 'Absent').length;
  const late = records.filter((r) => r.status === 'Late').length;
  const excused = records.filter((r) => r.status === 'Excused').length;
  const totalHours = records.reduce((sum, r) => sum + (r.totalHours || 0), 0);
  const attendancePercentage = Math.round(((present + late) / total) * 1000) / 10;

  return { totalDays: total, present, absent, late, excused, attendancePercentage, totalHours };
}

module.exports = {
  checkIn,
  checkOut,
  getMyAttendance,
  getStudentAttendance,
  confirmAttendance,
  recordManualAttendance,
  summarize,
};
