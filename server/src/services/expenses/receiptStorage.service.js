const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const Expense = require('../../models/Expense');
const Receipt = require('../../models/Receipt');
const ApiError = require('../../utils/apiError');
const { validateImageFile } = require('../media/imageValidation.service');

const RECEIPT_DIRECTORY = path.resolve(__dirname, '../../../uploads/receipts');
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

function validateReceiptFile(file) {
  return validateImageFile({
    file,
    maxBytes: MAX_RECEIPT_BYTES,
    label: 'Receipt',
    missingMessage: 'Select a JPEG or PNG receipt image to upload.',
    mismatchMessage: 'The receipt file content does not match a supported JPEG or PNG image.',
  });
}

function receiptFilePath(filename) {
  if (!/^[a-f\d-]{36}\.(?:jpg|png)$/.test(filename)) {
    throw ApiError.badRequest('Invalid receipt file reference.');
  }
  const resolved = path.resolve(RECEIPT_DIRECTORY, filename);
  if (path.dirname(resolved) !== RECEIPT_DIRECTORY) {
    throw ApiError.badRequest('Invalid receipt file reference.');
  }
  return resolved;
}

async function saveReceipt(userId, tripId, file) {
  const extension = validateReceiptFile(file);
  const filename = `${randomUUID()}${extension}`;
  const storedPath = receiptFilePath(filename);
  await fs.mkdir(RECEIPT_DIRECTORY, { recursive: true });
  const receipt = await Receipt.create({
    tripId,
    uploadedBy: userId,
    filename,
    mimeType: file.mimetype,
    size: file.buffer.length,
  });
  try {
    await fs.writeFile(storedPath, file.buffer, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    await Receipt.deleteOne({ _id: receipt._id, tripId });
    throw error;
  }
  return { _id: receipt._id, mimeType: receipt.mimeType, size: receipt.size };
}

async function getReceipt(tripId, receiptId) {
  const receipt = await Receipt.findOne({ _id: receiptId, tripId }).lean();
  if (!receipt) throw ApiError.notFound('Receipt not found.');
  return { ...receipt, path: receiptFilePath(receipt.filename) };
}

async function assertReceiptBelongsToTrip(tripId, receiptId) {
  if (!receiptId) return;
  const receipt = await Receipt.exists({ _id: receiptId, tripId });
  if (!receipt) throw ApiError.badRequest('The selected receipt does not belong to this trip.');
}

async function receiptDataUri(receipt) {
  const content = await fs.readFile(receipt.path);
  return `data:${receipt.mimeType};base64,${content.toString('base64')}`;
}

async function deleteReceiptIfUnused(tripId, receiptId) {
  if (!receiptId) return;
  const isReferenced = await Expense.exists({ tripId, receipt: String(receiptId) });
  if (isReferenced) return;
  const receipt = await Receipt.findOneAndDelete({ _id: receiptId, tripId });
  if (!receipt) return;
  await fs.unlink(receiptFilePath(receipt.filename));
}

async function discardUnattachedReceipt(userId, tripId, receiptId) {
  const receipt = await Receipt.findOne({ _id: receiptId, tripId });
  if (!receipt) return;
  if (String(receipt.uploadedBy) !== String(userId)) {
    throw ApiError.forbidden('Only the uploader can discard an unattached receipt.');
  }
  await deleteReceiptIfUnused(tripId, receiptId);
}

async function deleteTripReceipts(tripId) {
  const receipts = await Receipt.find({ tripId }).lean();
  for (const receipt of receipts) {
    try {
      await fs.unlink(receiptFilePath(receipt.filename));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  await Receipt.deleteMany({ tripId });
}

module.exports = {
  MAX_RECEIPT_BYTES,
  validateReceiptFile,
  receiptFilePath,
  saveReceipt,
  getReceipt,
  assertReceiptBelongsToTrip,
  receiptDataUri,
  deleteReceiptIfUnused,
  discardUnattachedReceipt,
  deleteTripReceipts,
};
