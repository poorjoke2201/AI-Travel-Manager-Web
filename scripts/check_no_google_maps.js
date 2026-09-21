const fs = require('fs');
const path = require('path');

const root = process.cwd();
const blocked = [
  'maps.googleapis.com',
  'GOOGLE_MAPS_API_KEY',
  'googlemaps',
];

const excluded = new Set([
  '.env',
  '.env.example',
  'README.md',
  'docs',
  'itinerary_engine_agent_prompt.md',
  'itinerary_engine_pseudocode.md',
  'docs/architecture.md',
  'docs/setup.md',
  'docs/CURRENT_STATE.md',
  'docs/GEOAPIFY_NOTES.md',
  'scripts/check_no_google_maps.js',
]);

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['.git', 'node_modules', '.venv', 'dist', 'build'].includes(entry.name)) continue;
      files.push(...walk(full));
    } else if (/(\.(js|json|env|example|txt|yml|yaml))$/i.test(entry.name)) {
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (excluded.has(rel) || rel.startsWith('docs/')) continue;
      files.push(full);
    }
  }
  return files;
}

const files = walk(root);
const offenders = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  for (const pattern of blocked) {
    if (text.includes(pattern)) {
      offenders.push({ file: path.relative(root, file), pattern });
      break;
    }
  }
}

if (offenders.length) {
  console.error('Runtime Google Maps references still present:');
  for (const offender of offenders) {
    console.error(`- ${offender.file} :: ${offender.pattern}`);
  }
  process.exit(1);
}

console.log('No active runtime Google Maps references found.');
