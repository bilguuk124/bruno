const { spawn } = require('child_process');
const path = require('path');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m'
};

const log = {
  info: (msg) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  label: (label, msg) => console.log(`${colors.bright}${colors.magenta}[${label}]${colors.reset} ${msg}`)
};

const rootDir = path.join(__dirname, '..');
const webDir = path.join(rootDir, 'packages/bruno-app');
const electronDir = path.join(rootDir, 'packages/bruno-electron');

let electronProcess = null;
let detectedPort = null;
let fallbackTimer = null;

// rsbuild prints "Local:    http://localhost:<port>/" on startup, with ANSI
// codes between the label and the URL, and on Windows sometimes on stderr — so
// strip colours and watch both streams. Fall back to a default port if the
// banner never parses, otherwise Electron would never launch.
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
const portRegex = /Local:\s*http:\/\/localhost:(\d+)/;
const FALLBACK_PORT = process.env.BRUNO_DEV_PORT || '3000';
const FALLBACK_DELAY_MS = 90000;

console.log(`\n${colors.bright}${colors.yellow}🚀 Starting Bruno development environment...${colors.reset}\n`);

// Start the rsbuild dev server
const webProcess = spawn('npm', ['run', 'dev'], {
  cwd: webDir,
  stdio: ['inherit', 'pipe', 'pipe'],
  shell: true
});

const useDetectedPort = (port, source) => {
  if (detectedPort) {
    return;
  }
  clearTimeout(fallbackTimer);
  detectedPort = port;
  log.success(`Detected dev server on port ${colors.bright}${detectedPort}${colors.reset} (${source})`);
  startElectron(detectedPort);
};

const scanForPort = (data) => {
  if (detectedPort) {
    return;
  }
  const match = stripAnsi(data.toString()).match(portRegex);
  if (match) {
    useDetectedPort(match[1], 'rsbuild');
  }
};

webProcess.stdout.on('data', (data) => {
  process.stdout.write(data);
  scanForPort(data);
});

webProcess.stderr.on('data', (data) => {
  process.stderr.write(data);
  scanForPort(data);
});

webProcess.on('close', (code) => {
  log.info(`Web process exited with code ${code}`);
  cleanup();
});

fallbackTimer = setTimeout(() => {
  if (!detectedPort) {
    log.warn(`Could not read the dev-server port from rsbuild output; assuming ${FALLBACK_PORT}`);
    useDetectedPort(FALLBACK_PORT, 'fallback');
  }
}, FALLBACK_DELAY_MS);

function startElectron(port) {
  log.info(`Starting Electron with ${colors.cyan}BRUNO_DEV_PORT=${port}${colors.reset}`);

  electronProcess = spawn('npm', ['run', 'dev'], {
    cwd: electronDir,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      BRUNO_DEV_PORT: port
    }
  });

  electronProcess.on('close', (code) => {
    log.info(`Electron process exited with code ${code}`);
    cleanup();
  });
}

function cleanup() {
  clearTimeout(fallbackTimer);
  if (webProcess && !webProcess.killed) {
    webProcess.kill();
  }
  if (electronProcess && !electronProcess.killed) {
    electronProcess.kill();
  }
  process.exit(0);
}

// Handle termination signals
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
