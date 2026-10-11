const multer = require('multer');
const ApiError = require('../utils/apiError');

function createImageUpload({
  fieldName,
  maxBytes,
  label = 'Image',
  maxFiles = 1,
  maxFields = 0,
  supportedMimeTypes = ['image/jpeg', 'image/png'],
}) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: maxFiles, fields: maxFields, parts: maxFiles + maxFields },
    fileFilter(req, file, callback) {
      if (!supportedMimeTypes.includes(file.mimetype)) {
        callback(ApiError.badRequest(`Only JPEG and PNG ${label.toLowerCase()} images are supported.`));
        return;
      }
      callback(null, true);
    },
  });

  return (req, res, next) => {
    const parseUpload = maxFiles > 1
      ? upload.array(fieldName, maxFiles)
      : upload.single(fieldName);
    parseUpload(req, res, (error) => {
      if (!error) {
        next();
        return;
      }
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        next(ApiError.badRequest(`${label} images must be ${maxBytes / (1024 * 1024)} MB or smaller.`));
        return;
      }
      if (error instanceof multer.MulterError
        && ['LIMIT_FILE_COUNT', 'LIMIT_UNEXPECTED_FILE'].includes(error.code)) {
        const noun = maxFiles === 1 ? 'image' : 'images';
        next(ApiError.badRequest(`You can upload up to ${maxFiles} ${label.toLowerCase()} ${noun}.`));
        return;
      }
      next(error);
    });
  };
}

module.exports = { createImageUpload };
