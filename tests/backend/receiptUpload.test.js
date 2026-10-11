const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_RECEIPT_BYTES,
  receiptFilePath,
  validateReceiptFile,
} = require('../../server/src/services/expenses/receiptStorage.service');
const { validateImageFile } = require('../../server/src/services/media/imageValidation.service');
const { MAX_AVATAR_BYTES } = require('../../server/src/services/profile/profile.service');

test('receipt validation accepts matching JPEG and PNG signatures only', () => {
  assert.equal(validateReceiptFile({
    mimetype: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
  }), '.jpg');
  assert.equal(validateReceiptFile({
    mimetype: 'image/png',
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  }), '.png');
  assert.throws(() => validateReceiptFile({
    mimetype: 'image/png',
    buffer: Buffer.from('<svg></svg>'),
  }), /does not match/);
  assert.throws(() => validateReceiptFile({
    mimetype: 'image/jpeg',
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  }), /does not match/);
});

test('receipt validation rejects missing and oversized images', () => {
  assert.throws(() => validateReceiptFile(undefined), /Select a JPEG or PNG/);
  assert.throws(() => validateReceiptFile({
    mimetype: 'image/png',
    buffer: Buffer.alloc(MAX_RECEIPT_BYTES + 1, 0),
  }), /5 MB or smaller/);
});

test('receipt file resolution accepts generated names and rejects path traversal', () => {
  const filePath = receiptFilePath('a06d1145-9d1b-4a14-82c1-1181ea1aa0aa.png');
  assert.match(filePath, /uploads[\\/]receipts[\\/]a06d1145-9d1b-4a14-82c1-1181ea1aa0aa\.png$/);
  assert.throws(() => receiptFilePath('..\\secret.png'), /Invalid receipt file reference/);
});

test('shared image validation enforces the separate 2 MB avatar limit', () => {
  assert.equal(validateImageFile({
    file: {
      mimetype: 'image/jpeg',
      buffer: Buffer.from([0xff, 0xd8, 0xff]),
    },
    maxBytes: MAX_AVATAR_BYTES,
    label: 'Avatar',
  }), '.jpg');
  assert.throws(() => validateImageFile({
    file: {
      mimetype: 'image/png',
      buffer: Buffer.alloc(MAX_AVATAR_BYTES + 1),
    },
    maxBytes: MAX_AVATAR_BYTES,
    label: 'Avatar',
  }), /2 MB or smaller/);
});
