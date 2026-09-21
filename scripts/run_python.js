const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const requestedScript = process.argv[2];

function resolvePython() {
  const candidates = process.platform === 'win32'
    ? [
        path.join(rootDir, '.venv', 'Scripts', 'python.exe'),
        path.join(rootDir, '.venv', 'Scripts', 'python'),
      ]
    : [
        path.join(rootDir, '.venv', 'bin', 'python'),
        '/usr/bin/python3',
        '/usr/local/bin/python3',
        'python3',
        'python',
      ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }

  return process.env.PYTHON || 'python';
}

const pythonBin = resolvePython();
const args = requestedScript ? [requestedScript, ...process.argv.slice(3)] : process.argv.slice(2);

const child = spawn(pythonBin, args, {
  cwd: rootDir,
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error(`Failed to launch Python: ${error.message}`);
  process.exit(1);
});
