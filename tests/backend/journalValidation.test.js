const test = require('node:test');
const assert = require('node:assert/strict');
const JournalEntry = require('../../server/src/models/JournalEntry');
const { journalCreateSchema, journalUpdateSchema } = require('../../server/src/validators/journal.validator');

test('journal entries validate location, date-only values, note length, and optional trip association', () => {
  const valid = {
    placeName: 'City museum',
    city: 'Mysuru',
    state: 'Karnataka',
    note: 'A saved memory.',
    visitedOn: '2026-10-09',
    tripId: '507f1f77bcf86cd799439011',
  };
  assert.equal(journalCreateSchema.safeParse(valid).success, true);
  assert.equal(journalCreateSchema.safeParse({ ...valid, visitedOn: '2026-02-30' }).success, false);
  assert.equal(journalCreateSchema.safeParse({ ...valid, tripId: 'not-an-id' }).success, false);
  assert.equal(journalCreateSchema.safeParse({ ...valid, note: 'x'.repeat(5001) }).success, false);
});

test('journal photo removals accept only generated image filenames', () => {
  assert.equal(journalUpdateSchema.safeParse({
    removePhotos: ['550e8400-e29b-41d4-a716-446655440000.jpg'],
  }).success, true);
  assert.equal(journalUpdateSchema.safeParse({ removePhotos: ['../../secret.jpg'] }).success, false);
});

test('journal model enforces a five-photo maximum', () => {
  const photos = Array.from({ length: 6 }, (_, index) => ({
    filename: `550e8400-e29b-41d4-a716-44665544000${index}.jpg`,
    mimeType: 'image/jpeg',
  }));
  const entry = new JournalEntry({
    userId: '507f1f77bcf86cd799439011',
    placeName: 'City museum',
    city: 'Mysuru',
    visitedOn: new Date('2026-10-09T00:00:00.000Z'),
    photos,
  });
  assert.match(entry.validateSync().errors.photos.message, /at most five photos/);
});
