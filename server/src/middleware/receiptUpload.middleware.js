const { createImageUpload } = require('./imageUpload.middleware');

const receiveReceiptUpload = createImageUpload({
  fieldName: 'receipt',
  maxBytes: 5 * 1024 * 1024,
  label: 'Receipt',
});

module.exports = { receiveReceiptUpload };
