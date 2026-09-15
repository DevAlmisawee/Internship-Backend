const express = require('express');
const router = express.Router();

const {
  getProfile,
  updateProfile,
  uploadCV,
  uploadPassportPhoto,
  getMyApplications,
  toggleSavedInternship,
  getSavedInternships,
  getDashboard,
} = require('../controllers/studentController');

const { protect, authorize } = require('../middleware/auth');
const { uploadCV: uploadCVMiddleware, uploadPassportPhoto: uploadPassportPhotoMiddleware } = require('../middleware/upload');
const { objectIdParamValidator } = require('../utils/validators');
const validate = require('../middleware/validation');

// All student routes require auth + student role
router.use(protect, authorize('student'));

router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.post('/cv', uploadCVMiddleware, uploadCV);
router.post('/passport-photo', uploadPassportPhotoMiddleware, uploadPassportPhoto);
router.get('/applications', getMyApplications);
router.get('/saved', getSavedInternships);
router.post('/saved/:internshipId', objectIdParamValidator('internshipId'), validate, toggleSavedInternship);
router.get('/dashboard', getDashboard);

module.exports = router;
