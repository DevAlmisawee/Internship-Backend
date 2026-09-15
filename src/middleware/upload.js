const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${base}-${Date.now()}${ext}`);
  },
});

// Allowed file types per upload purpose
const imageTypes = /jpeg|jpg|png|webp/;
const documentTypes = /pdf|doc|docx/;

const fileFilter = (allowedRegex) => (req, file, cb) => {
  const extOk = allowedRegex.test(path.extname(file.originalname).toLowerCase());
  const mimeOk = allowedRegex.test(file.mimetype);
  if (extOk && mimeOk) {
    return cb(null, true);
  }
  cb(new Error(`Invalid file type. Allowed: ${allowedRegex}`));
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const uploadImage = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: fileFilter(imageTypes),
});

const uploadDocument = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: fileFilter(documentTypes),
});

// Evidence for activity logs: image, PDF, or document (spec: Daily Activity Log -> Evidence)
const evidenceTypes = /jpeg|jpg|png|webp|pdf|doc|docx/;
const uploadEvidence = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: fileFilter(evidenceTypes),
});

// Report files (weekly/monthly/final SIWES reports): PDF/DOC
const uploadReportFile = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: fileFilter(documentTypes),
});

// Passport photograph (spec: Student Profile -> Passport Photograph)
const uploadPassportPhoto = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: fileFilter(imageTypes),
});

// Message attachments (chat): image, PDF, or document
const uploadMessageAttachment = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: fileFilter(evidenceTypes),
});

// CV upload accepts PDF/DOC, photo/logo uploads accept images
module.exports = {
  uploadCV: uploadDocument.single('cv'),
  uploadResume: uploadDocument.single('resume'),
  uploadPhoto: uploadImage.single('profilePicture'),
  uploadLogo: uploadImage.single('logo'),
  uploadPassportPhoto: uploadPassportPhoto.single('passportPhoto'),
  uploadEvidence: uploadEvidence.array('evidence', 5),
  uploadReportFile: uploadReportFile.single('file'),
  uploadMessageAttachment: uploadMessageAttachment.single('attachment'),
};
