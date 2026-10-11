const pdfMake = require('pdfmake');
const fontResources = require('pdfmake/build/vfs_fonts');
const fontkit = require('fontkit');
const { CATEGORIES } = require('./budget.service');

const FONT_NAMES = ['Roboto-Regular.ttf', 'Roboto-Medium.ttf', 'Roboto-Italic.ttf', 'Roboto-MediumItalic.ttf'];
let fontReady = false;

function ensureFont() {
  if (fontReady) return;
  for (const name of FONT_NAMES) {
    const encoded = fontResources[name];
    if (!encoded) throw new Error(`The bundled PDF font ${name} is unavailable.`);
    pdfMake.virtualfs.writeFileSync(name, Buffer.from(encoded, 'base64'));
  }
  const regularFont = fontkit.create(Buffer.from(fontResources['Roboto-Regular.ttf'], 'base64'));
  if (!regularFont.glyphForCodePoint(0x20b9)?.id) {
    throw new Error('The bundled PDF font does not contain the Indian rupee glyph.');
  }
  pdfMake.setFonts({
    Roboto: {
      normal: 'Roboto-Regular.ttf',
      bold: 'Roboto-Medium.ttf',
      italics: 'Roboto-Italic.ttf',
      bolditalics: 'Roboto-MediumItalic.ttf',
    },
  });
  pdfMake.setLocalAccessPolicy(() => false);
  pdfMake.setUrlAccessPolicy(() => false);
  fontReady = true;
}

function formatPaise(value) {
  const paise = typeof value === 'bigint' ? value : BigInt(Math.trunc(Number(value) || 0));
  const sign = paise < 0n ? '-' : '';
  const absolute = paise < 0n ? -paise : paise;
  const rupees = absolute / 100n;
  const remainder = absolute % 100n;
  return `${sign}₹${new Intl.NumberFormat('en-IN').format(Number(rupees))}.${String(remainder).padStart(2, '0')}`;
}

function cleanText(value, fallback = '—') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function getMemberMap(trip, aggregation) {
  const names = new Map((aggregation.perPerson || []).map((person) => [String(person.memberId), person.name]));
  if (trip.userId) names.set(String(trip.userId), 'Trip lead');
  for (const member of trip.groupMembers || []) {
    const memberId = member.userId ? String(member.userId) : member._id ? String(member._id) : null;
    if (memberId && member.name) names.set(memberId, member.name);
  }
  return names;
}

function getDayLabel(expense, trip) {
  const start = trip.startDate instanceof Date ? trip.startDate.toISOString().slice(0, 10) : String(trip.startDate || '').slice(0, 10);
  const end = trip.endDate instanceof Date ? trip.endDate.toISOString().slice(0, 10) : String(trip.endDate || '').slice(0, 10);
  if (start && expense.date < start) return `Before trip · ${expense.date}`;
  if (end && expense.date > end) return `After trip · ${expense.date}`;
  const dayNumber = Math.floor((Date.parse(`${expense.date}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86_400_000) + 1;
  return `Day ${dayNumber} · ${expense.date}`;
}

function cell(text, options = {}) {
  return { text: text === '' ? '' : cleanText(text), ...options };
}

function moneyCell(value, bold = false) {
  return cell(formatPaise(value), { alignment: 'right', bold });
}

function sumPaise(items, key) {
  return items.reduce((sum, item) => sum + BigInt(item[key] || 0), 0n);
}

function tableSection(title, headers, rows, widths, { totals } = {}) {
  const body = [headers.map((header, index) => cell(header, { bold: true, alignment: index > 0 ? 'right' : 'left' }))];
  for (const row of rows) body.push(row);
  if (totals) body.push(totals.map((item, index) => (
    typeof item === 'number' || typeof item === 'bigint'
      ? moneyCell(item, true)
      : cell(item, { bold: true, alignment: index > 0 ? 'right' : 'left' })
  )));
  return [
    { text: title, style: 'sectionTitle', margin: [0, 14, 0, 6], keepWithHeaderRows: 1 },
    {
      table: { headerRows: 1, widths, body, dontBreakRows: true },
      layout: 'lightHorizontalLines',
      fontSize: 8,
      margin: [0, 0, 0, 4],
    },
  ];
}

function reportHeader(trip, filters, names, reportType) {
  const filterParts = [];
  if (filters.personId) filterParts.push(`Person: ${names.get(filters.personId) || filters.personId}`);
  if (filters.category) filterParts.push(`Category: ${filters.category}`);
  if (filters.day !== undefined) filterParts.push(`Day: ${filters.day}`);
  if (filters.from || filters.to) filterParts.push(`Date range: ${filters.from || '—'} to ${filters.to || '—'}`);
  if (filters.paymentMethod) filterParts.push(`Payment method: ${filters.paymentMethod}`);
  const startDate = trip.startDate instanceof Date ? trip.startDate.toISOString().slice(0, 10) : String(trip.startDate || '').slice(0, 10);
  const endDate = trip.endDate instanceof Date ? trip.endDate.toISOString().slice(0, 10) : String(trip.endDate || '').slice(0, 10);
  return [
    { text: 'AI Travel Manager · Budget report', style: 'eyebrow' },
    { text: `${cleanText(trip.tripName, 'Trip')} — ${reportTypeLabel(reportType)}`, style: 'title' },
    { text: `${cleanText(trip.destination)} · ${startDate || 'Dates unavailable'} to ${endDate || 'Dates unavailable'}`, style: 'subTitle' },
    { text: `Generated: ${new Date().toISOString().slice(0, 10)}`, style: 'smallMeta' },
    { text: `Filters: ${filterParts.length ? filterParts.join(' · ') : 'None'}`, style: 'smallMeta', margin: [0, 0, 0, 10] },
  ];
}

function reportTypeLabel(type) {
  return ({ full: 'Full trip', person: 'Per person', category: 'Per category', day: 'Per day' })[type] || 'Full trip';
}

function expenseLedger(expenses, names, trip, { personId = null } = {}) {
  const rows = expenses.map((expense) => {
    const split = personId ? expense.splits?.find((item) => String(item.memberId) === personId) : null;
    const row = [
      cell(`${expense.date}\n${getDayLabel(expense, trip)}`),
      cell(expense.category),
      cell(expense.description),
      cell(names.get(String(expense.paidBy)) || 'Former trip member'),
      moneyCell(expense.amountPaise),
      cell(expense.receipt ? 'Yes' : 'No', { alignment: 'center' }),
    ];
    if (personId) row.push(moneyCell(split?.sharePaise || 0));
    return row;
  });
  const amountTotal = expenses.reduce((sum, expense) => sum + BigInt(expense.amountPaise), 0n);
  const totals = ['TOTAL', '', '', '', amountTotal, ''];
  if (personId) {
    totals.push(expenses.reduce((sum, expense) => (
      sum + BigInt(expense.splits?.find((split) => String(split.memberId) === personId)?.sharePaise || 0)
    ), 0n));
  }
  return tableSection(
    personId ? 'Expenses involving this person' : 'Expense ledger',
    personId ? ['Date / day', 'Category', 'Description', 'Paid by', 'Total', 'Receipt', 'Person share']
      : ['Date / day', 'Category', 'Description', 'Paid by', 'Amount', 'Receipt'],
    rows,
    personId ? [70, 54, '*', 64, 56, 35, 64] : [75, 58, '*', 72, 62, 38],
    { totals }
  );
}

function buildFullReport(trip, data, filters, names) {
  const { aggregation, expenses, settlements } = data;
  const content = [
    ...reportHeader(trip, filters, names, 'full'),
    ...tableSection('Trip budget summary', ['Metric', 'Amount'], [
      [cell('Total budget'), moneyCell(aggregation.totalBudgetPaise)],
      [cell('Filtered spending'), moneyCell(aggregation.spentPaise)],
      [cell('Remaining after filtered spending'), moneyCell(aggregation.remainingPaise)],
      [cell('Trip days'), cell(String(aggregation.tripDays), { alignment: 'right' })],
      [cell('Budget per trip day'), moneyCell(aggregation.dailyBudgetPaise)],
    ], ['*', 100]),
    ...tableSection('Category totals', ['Category', 'Planned', 'Actual', 'Remaining'], aggregation.categories.map((item) => [
      cell(item.category), moneyCell(item.plannedPaise), moneyCell(item.actualPaise), moneyCell(item.remainingPaise),
    ]), ['*', 85, 85, 85], {
      totals: [
        'TOTAL',
        sumPaise(aggregation.categories, 'plannedPaise'),
        sumPaise(aggregation.categories, 'actualPaise'),
        sumPaise(aggregation.categories, 'remainingPaise'),
      ],
    }),
    ...tableSection('Day-wise spending', ['Day / date', 'Expenses', 'Total'], aggregation.perDay.map((item) => [
      cell(`${item.dayLabel}\n${item.date}`),
      cell(String(item.expensesCount), { alignment: 'right' }),
      moneyCell(item.totalPaise),
    ]), ['*', 60, 95], {
      totals: ['TOTAL', String(expenses.length), sumPaise(aggregation.perDay, 'totalPaise')],
    }),
    ...tableSection('Per-person totals', ['Person', 'Paid', 'Share', 'Balance'], aggregation.perPerson.map((person) => [
      cell(person.name), moneyCell(person.paidPaise), moneyCell(person.sharePaise), moneyCell(person.balancePaise),
    ]), ['*', 90, 90, 90], {
      totals: [
        'TOTAL',
        sumPaise(aggregation.perPerson, 'paidPaise'),
        sumPaise(aggregation.perPerson, 'sharePaise'),
        sumPaise(aggregation.perPerson, 'balancePaise'),
      ],
    }),
    ...tableSection('Suggested settlements', ['From', 'To', 'Amount'], aggregation.suggestedSettlements.map((suggestion) => [
      cell(names.get(suggestion.fromMember) || suggestion.fromName),
      cell(names.get(suggestion.toMember) || suggestion.toName),
      moneyCell(suggestion.amountPaise),
    ]), ['*', '*', 100], {
      totals: ['TOTAL', '', sumPaise(aggregation.suggestedSettlements, 'amountPaise')],
    }),
  ];
  if (settlements.length) {
    content.push(...tableSection('Recorded settlements', ['Date', 'From', 'To', 'Method', 'Amount'], settlements.map((item) => [
      cell(item.date), cell(names.get(String(item.fromMember)) || 'Former trip member'), cell(names.get(String(item.toMember)) || 'Former trip member'), cell(item.method), moneyCell(item.amountPaise),
    ]), [70, '*', '*', 70, 85], {
      totals: ['TOTAL', '', '', '', sumPaise(settlements, 'amountPaise')],
    }));
  }
  content.push(...expenseLedger(expenses, names, trip));
  return content;
}

function buildPersonReport(trip, data, filters, names) {
  const people = filters.personId
    ? data.aggregation.perPerson.filter((person) => person.memberId === filters.personId)
    : data.aggregation.perPerson.filter((person) => person.paidPaise || person.sharePaise
      || person.settlementsPaidPaise || person.settlementsReceivedPaise);
  const content = [...reportHeader(trip, filters, names, 'person')];
  people.forEach((person, index) => {
    if (index) content.push({ text: '', pageBreak: 'before' });
    content.push({ text: person.name, style: 'sectionTitle', margin: [0, 12, 0, 5] });
    content.push(...tableSection('Person totals', ['Metric', 'Amount'], [
      [cell('Paid'), moneyCell(person.paidPaise)],
      [cell('Share'), moneyCell(person.sharePaise)],
      [cell('Balance'), moneyCell(person.balancePaise)],
    ], ['*', 100]));
    content.push(...tableSection('Share by category', ['Category', 'Share'], CATEGORIES.map((category) => [
      cell(category), moneyCell(person.categorySharePaise?.[category] || 0),
    ]), ['*', 100], {
      totals: ['TOTAL', sumPaise(Object.values(person.categorySharePaise || {}).map((sharePaise) => ({ sharePaise })), 'sharePaise')],
    }));
    const dayShares = data.aggregation.perDay.map((day) => {
      const key = day.day === null
        ? `${day.dayLabel.startsWith('Before') ? 'before' : 'after'}:${day.date}`
        : `trip:${day.day}`;
      return [cell(`${day.dayLabel} · ${day.date}`), moneyCell(person.daySharePaise?.[key] || 0)];
    }).filter((row) => row[1].text !== formatPaise(0));
    content.push(...tableSection('Share by day', ['Day', 'Share'], dayShares, ['*', 100], {
      totals: ['TOTAL', sumPaise(Object.values(person.daySharePaise || {}).map((sharePaise) => ({ sharePaise })), 'sharePaise')],
    }));
    content.push(...expenseLedger(data.expenses.filter((expense) => String(expense.paidBy) === person.memberId
      || expense.splits?.some((split) => String(split.memberId) === person.memberId)), names, trip, { personId: person.memberId }));
    const settlements = data.settlements.filter((item) => String(item.fromMember) === person.memberId || String(item.toMember) === person.memberId);
    if (settlements.length) {
      content.push(...tableSection('Settlements', ['Date', 'Direction', 'Other member', 'Method', 'Amount'], settlements.map((item) => {
        const paid = String(item.fromMember) === person.memberId;
        const otherId = paid ? item.toMember : item.fromMember;
        return [
          cell(item.date),
          cell(paid ? 'Paid' : 'Received'),
          cell(names.get(String(otherId)) || 'Former trip member'),
          cell(item.method),
          moneyCell(item.amountPaise),
        ];
      }), [70, 65, '*', 70, 85], {
        totals: ['TOTAL', '', '', '', sumPaise(settlements.filter((item) => String(item.fromMember) === person.memberId || String(item.toMember) === person.memberId), 'amountPaise')],
      }));
    }
  });
  return content;
}

function buildCategoryReport(trip, data, filters, names) {
  const selected = data.expenses;
  const category = filters.category;
  const byDay = new Map();
  const byPerson = new Map();
  for (const expense of selected) {
    const dayKey = getDayLabel(expense, trip);
    byDay.set(dayKey, (byDay.get(dayKey) || 0) + expense.amountPaise);
    for (const split of expense.splits || []) {
      const id = String(split.memberId);
      byPerson.set(id, (byPerson.get(id) || 0) + split.sharePaise);
    }
  }
  return [
    ...reportHeader(trip, filters, names, 'category'),
    ...tableSection(`${category} totals by day`, ['Day', 'Amount'], Array.from(byDay.entries()).map(([day, amount]) => [
      cell(day), moneyCell(amount),
    ]), ['*', 100], {
      totals: ['TOTAL', sumPaise(data.expenses, 'amountPaise')],
    }),
    ...tableSection(`${category} shares by person`, ['Person', 'Share'], Array.from(byPerson.entries()).map(([id, amount]) => [
      cell(names.get(id) || 'Former trip member'), moneyCell(amount),
    ]), ['*', 100], {
      totals: ['TOTAL', sumPaise(Array.from(byPerson.values()).map((sharePaise) => ({ sharePaise })), 'sharePaise')],
    }),
    ...expenseLedger(selected, names, trip),
  ];
}

function buildDayReport(trip, data, filters, names) {
  const byCategory = new Map();
  const byPerson = new Map();
  for (const expense of data.expenses) {
    byCategory.set(expense.category, (byCategory.get(expense.category) || 0) + expense.amountPaise);
    for (const split of expense.splits || []) {
      const memberId = String(split.memberId);
      byPerson.set(memberId, (byPerson.get(memberId) || 0) + split.sharePaise);
    }
  }
  return [
    ...reportHeader(trip, filters, names, 'day'),
    ...tableSection('Totals by category', ['Category', 'Amount'], Array.from(byCategory.entries()).map(([category, amount]) => [
      cell(category), moneyCell(amount),
    ]), ['*', 100], {
      totals: ['TOTAL', sumPaise(data.expenses, 'amountPaise')],
    }),
    ...tableSection('Shares by person', ['Person', 'Share'], Array.from(byPerson.entries()).map(([memberId, amount]) => [
      cell(names.get(memberId) || 'Former trip member'), moneyCell(amount),
    ]), ['*', 100], {
      totals: ['TOTAL', sumPaise(Array.from(byPerson.values()).map((sharePaise) => ({ sharePaise })), 'sharePaise')],
    }),
    ...expenseLedger(data.expenses, names, trip),
  ];
}

function buildReportDefinition(trip, data, filters = {}) {
  const names = getMemberMap(trip, data.aggregation);
  let content;
  if (filters.type === 'person') content = buildPersonReport(trip, data, filters, names);
  else if (filters.type === 'category') content = buildCategoryReport(trip, data, filters, names);
  else if (filters.type === 'day') content = buildDayReport(trip, data, filters, names);
  else content = buildFullReport(trip, data, filters, names);
  if (data.receiptImages?.length) {
    content.push({ text: 'Receipt images', style: 'sectionTitle', pageBreak: 'before', margin: [0, 0, 0, 10] });
    data.receiptImages.forEach((receipt, index) => {
      if (index) content.push({ text: '', pageBreak: 'before' });
      content.push(
        { text: `${cleanText(receipt.date)} · ${cleanText(receipt.description, 'Expense receipt')}`, style: 'smallMeta', margin: [0, 0, 0, 8] },
        { image: receipt.dataUri, fit: [500, 620], alignment: 'center' }
      );
    });
  }

  return {
    pageSize: 'A4',
    pageMargins: [36, 46, 36, 50],
    defaultStyle: { font: 'Roboto', fontSize: 9, color: '#1c1917' },
    styles: {
      eyebrow: { fontSize: 8, bold: true, color: '#0f766e', characterSpacing: 0.8, margin: [0, 0, 0, 4] },
      title: { fontSize: 19, bold: true, margin: [0, 0, 0, 3] },
      subTitle: { fontSize: 10, color: '#57534e', margin: [0, 0, 0, 3] },
      smallMeta: { fontSize: 8, color: '#78716c' },
      sectionTitle: { fontSize: 12, bold: true, color: '#292524' },
    },
    header: (currentPage, pageCount) => ({
      text: currentPage > 1 ? 'AI Travel Manager · Budget report' : '',
      alignment: 'right',
      fontSize: 8,
      color: '#78716c',
      margin: [36, 20, 36, 0],
    }),
    footer: (currentPage, pageCount) => ({
      columns: [
        { text: 'Amounts are shown in INR; attached receipt images follow the report.', alignment: 'left' },
        { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right' },
      ],
      fontSize: 8,
      color: '#78716c',
      margin: [36, 15, 36, 0],
    }),
    content,
  };
}

async function createReportStream(trip, data, filters) {
  ensureFont();
  const definition = buildReportDefinition(trip, data, filters);
  const pdf = pdfMake.createPdf(definition);
  return pdf.getStream();
}

function safeFilename(value) {
  return String(value || 'trip')
    .normalize('NFKD')
    .replace(/[^\w-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 70) || 'trip';
}

function buildReportFilename(trip, filters, personName = null, generatedDate = new Date().toISOString().slice(0, 10)) {
  const tripName = safeFilename(trip.tripName);
  const reportType = safeFilename(filters.type || 'full');
  const person = personName ? `_${safeFilename(personName)}` : '';
  return `${tripName}_${reportType}${person}_${generatedDate}.pdf`;
}

module.exports = {
  buildReportDefinition,
  buildReportFilename,
  createReportStream,
  formatPaise,
};
