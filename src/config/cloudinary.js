const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET,
});

/**
 * Uploads a local file buffer/path to Cloudinary.
 * @param {string} filePath - local path of the file to upload
 * @param {string} folder - cloudinary folder, e.g. 'interniq/cv'
 * @param {string} resourceType - 'image' | 'raw' | 'auto'
 */
const uploadToCloudinary = (filePath, folder = 'interniq', resourceType = 'auto') => {
  return cloudinary.uploader.upload(filePath, {
    folder,
    resource_type: resourceType,
  });
};

const deleteFromCloudinary = (publicId, resourceType = 'auto') => {
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
};

module.exports = { cloudinary, uploadToCloudinary, deleteFromCloudinary };
