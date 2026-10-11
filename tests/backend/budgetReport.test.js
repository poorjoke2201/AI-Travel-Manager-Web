const test = require('node:test');
const assert = require('node:assert/strict');
const fontkit = require('../../server/node_modules/fontkit');
const fontResources = require('../../server/node_modules/pdfmake/build/vfs_fonts');
const zlib = require('node:zlib');
const {
  buildReportDefinition,
  createReportStream,
  formatPaise,
} = require('../../server/src/services/expenses/budgetReport.service');
const { buildBudgetAggregation } = require('../../server/src/services/expenses/budget.service');

const ownerId = '507f1f77bcf86cd799439011';
const guestId = '507f1f77bcf86cd799439013';

function reportFixture() {
  const trip = {
    _id: '507f1f77bcf86cd799439099',
    userId: ownerId,
    tripName: 'Report Test Trip',
    destination: 'Test City',
    isGroupTrip: true,
    startDate: '2026-10-09',
    endDate: '2026-10-10',
    budget: 300,
    budgetSummary: {},
    groupMembers: [{ _id: guestId, name: 'Guest', status: 'accepted' }],
  };
  const expenses = [{
    amountPaise: 12550,
    category: 'food',
    description: 'Shared meal',
    date: '2026-10-09',
    paidBy: ownerId,
    paymentMethod: 'UPI',
    receipt: null,
    splits: [
      { memberId: ownerId, sharePaise: 6275 },
      { memberId: guestId, sharePaise: 6275 },
    ],
  }];
  const settlements = [{ fromMember: guestId, toMember: ownerId, amountPaise: 1000, date: '2026-10-09', method: 'UPI', note: null }];
  return {
    trip,
    expenses,
    settlements,
    aggregation: buildBudgetAggregation(trip, expenses, settlements),
  };
}

async function collectPdf(stream) {
  const chunks = [];
  const complete = new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  stream.end();
  await complete;
  return Buffer.concat(chunks);
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, 8 + data.length)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 8 + data.length);
  return chunk;
}

function tinyPngDataUri() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  const image = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(Buffer.from([0, 30, 120, 210, 255]))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${image.toString('base64')}`;
}

test('bundled embedded Roboto TTF contains the Indian rupee glyph', () => {
  const font = fontkit.create(Buffer.from(fontResources['Roboto-Regular.ttf'], 'base64'));
  assert.notEqual(font.glyphForCodePoint(0x20b9).id, 0);
  assert.equal(formatPaise(123456), '₹1,234.56');
});

test('PDF smoke tests render full, person, category, and day reports with an embedded TTF', async () => {
  const fixture = reportFixture();
  const reports = [
    { type: 'full' },
    { type: 'person', personId: ownerId },
    { type: 'category', category: 'food' },
    { type: 'day', day: 1 },
  ];

  for (const filters of reports) {
    const definition = buildReportDefinition(fixture.trip, fixture, filters);
    assert.ok(definition.content.length > 5);
    const stream = await createReportStream(fixture.trip, fixture, filters);
    const output = await collectPdf(stream);
    assert.equal(output.subarray(0, 5).toString(), '%PDF-');
    assert.match(output.toString('latin1'), /\/FontFile2/);
    assert.ok(output.length > 1000);
  }
});

test('everyone person report contains page breaks between person sections', () => {
  const fixture = reportFixture();
  const definition = buildReportDefinition(fixture.trip, fixture, { type: 'person' });
  assert.ok(definition.content.some((entry) => entry.pageBreak === 'before'));
});

test('budget PDF embeds attached receipt images in an appendix', async () => {
  const fixture = reportFixture();
  fixture.receiptImages = [{
    date: '2026-10-09',
    description: 'Shared meal',
    dataUri: tinyPngDataUri(),
  }];
  const definition = buildReportDefinition(fixture.trip, fixture, { type: 'full' });
  assert.ok(definition.content.some((entry) => entry.text === 'Receipt images'));
  assert.ok(definition.content.some((entry) => entry.image === fixture.receiptImages[0].dataUri));
  const output = await collectPdf(await createReportStream(fixture.trip, fixture, { type: 'full' }));
  assert.equal(output.subarray(0, 5).toString(), '%PDF-');
  assert.match(output.toString('latin1'), /\/Subtype \/Image/);
});
