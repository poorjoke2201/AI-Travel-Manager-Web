/**
 * Normalizes city names across all three CSVs to a single canonical form.
 * Run with: node scripts/normalizeCities.js
 */
const fs = require('fs');
const path = require('path');

// canonical name -> all variants (lowercase for matching)
const CITY_MAP = {
  'Bangalore': ['bangalore', 'bengaluru', 'bangaluru', 'bengalore'],
  'Mumbai': ['mumbai', 'bombay'],
  'Chennai': ['chennai', 'madras'],
  'Kolkata': ['kolkata', 'calcutta'],
  'Pune': ['pune', 'poona'],
  'Hyderabad': ['hyderabad'],
  'Delhi': ['delhi', 'new delhi', 'ncr', 'delhi ncr'],
  'Ahmedabad': ['ahmedabad', 'ahemdabad'],
  'Allahabad': ['allahabad', 'prayagraj'],
  'Aurangabad': ['aurangabad', 'aurangabadbihar'],
  'Bhubaneswar': ['bhubaneswar', 'bhubaneshwar'],
  'Chandigarh': ['chandigarh'],
  'Coimbatore': ['coimbatore'],
  'Dehradun': ['dehradun'],
  'Goa': ['goa', 'central-goa'],
  'Gurgaon': ['gurgaon', 'gurugram'],
  'Jaipur': ['jaipur'],
  'Jodhpur': ['jodhpur'],
  'Kochi': ['kochi', 'cochin'],
  'Lonavala': ['lonavala', 'lonavla'],
  'Lucknow': ['lucknow'],
  'Ludhiana': ['ludhiana'],
  'Mangalore': ['mangalore', 'mangaluru'],
  'Mount Abu': ['mount abu', 'mount-abu'],
  'Mysore': ['mysore', 'mysuru'],
  'Nagpur': ['nagpur'],
  'Nashik': ['nashik'],
  'Noida': ['noida', 'noida-1'],
  'Pondicherry': ['pondicherry', 'puducherry'],
  'Port Blair': ['port blair', 'port-blair'],
  'Raipur': ['raipur'],
  'Sawai Madhopur': ['sawai madhopur', 'sawai-madhopur'],
  'Thiruvananthapuram': ['thiruvananthapuram', 'thiruvanthapuram', 'trivandrum'],
  'Varanasi': ['varanasi', 'banaras', 'benares'],
  'Vijayawada': ['vijayawada'],
  'Visakhapatnam': ['visakhapatnam', 'vizag'],
  'Cooch Behar': ['cooch behar', 'cooch-behar'],
  'Shirdi': ['shirdi', 'shirdi-city'],
  'Aligarh': ['aligarh', 'al®garh'],
  'Kanpur': ['kanpur', 'k?npur'],
  'Kanyakumari': ['kanyakumari'],
  'Amravati': ['amravati'],
};

// Build reverse lookup: variant -> canonical
const reverseMap = {};
for (const [canonical, variants] of Object.entries(CITY_MAP)) {
  for (const v of variants) {
    reverseMap[v.toLowerCase()] = canonical;
  }
}

function normalizeCity(city) {
  if (!city || !city.trim()) return city;
  const trimmed = city.trim();
  const canonical = reverseMap[trimmed.toLowerCase()];
  if (canonical) return canonical;
  // Title-case as fallback for inconsistent casing
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function processCSV(filePath, cityColumn) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  if (!lines.length) return;

  const header = lines[0];
  const cols = parseCSVLine(header);
  const cityIdx = cols.findIndex(c => c.trim().toLowerCase() === cityColumn.toLowerCase());
  if (cityIdx === -1) {
    console.error(`Column "${cityColumn}" not found in ${filePath}`);
    return;
  }

  let changed = 0;
  const newLines = lines.map((line, i) => {
    if (i === 0 || !line.trim()) return line;
    const fields = parseCSVLine(line);
    if (!fields[cityIdx]) return line;
    const original = fields[cityIdx];
    const normalized = normalizeCity(original);
    if (normalized !== original) {
      changed++;
      fields[cityIdx] = normalized;
      return fieldsToCSVLine(fields);
    }
    return line;
  });

  fs.writeFileSync(filePath, newLines.join('\n'), 'utf8');
  console.log(`${path.basename(filePath)}: ${changed} city names normalized.`);
}

// Minimal CSV parser that handles quoted fields
function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function fieldsToCSVLine(fields) {
  return fields.map(f => {
    if (f.includes(',') || f.includes('"') || f.includes('\n')) {
      return '"' + f.replace(/"/g, '""') + '"';
    }
    return f;
  }).join(',');
}

const dataDir = path.join(__dirname, '..', 'data');
processCSV(path.join(dataDir, 'master_hotels.csv'), 'city');
processCSV(path.join(dataDir, 'master_pois.csv'), 'city');
processCSV(path.join(dataDir, 'master_restaurants.csv'), 'city');
console.log('Done.');
