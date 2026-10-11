const ApiError = require('../../utils/apiError');

const IMAGE_EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
};

function validateImageFile({
  file,
  maxBytes,
  supportedMimeTypes = Object.keys(IMAGE_EXTENSIONS),
  label = 'Image',
  missingMessage = null,
  mismatchMessage = null,
}) {
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    const imageLabel = label.toLowerCase() === 'avatar' ? 'profile' : label.toLowerCase();
    throw ApiError.badRequest(missingMessage || `Select a ${imageLabel} image to upload.`);
  }
  if (file.buffer.length > maxBytes) {
    const maxSizeMb = maxBytes / (1024 * 1024);
    throw ApiError.badRequest(`${label} images must be ${maxSizeMb} MB or smaller.`);
  }

  let signatureMatches = false;
  if (file.mimetype === 'image/jpeg' && supportedMimeTypes.includes('image/jpeg')) {
    signatureMatches = file.buffer.length >= 3
      && file.buffer[0] === 0xff
      && file.buffer[1] === 0xd8
      && file.buffer[2] === 0xff;
  } else if (file.mimetype === 'image/png' && supportedMimeTypes.includes('image/png')) {
    signatureMatches = file.buffer.length >= 8
      && file.buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (!signatureMatches) {
    throw ApiError.badRequest(mismatchMessage || `The ${label.toLowerCase()} file does not match a supported JPEG or PNG image.`);
  }
  return IMAGE_EXTENSIONS[file.mimetype];
}

module.exports = { validateImageFile, IMAGE_EXTENSIONS };
