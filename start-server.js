import { spawn } from 'child_process';
import { networkInterfaces } from 'os';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverDir = resolve(__dirname, 'server');
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || '0.0.0.0';

console.log('=== Street Racer Multiplayer Server ===\n');
console.log('[1/2] Checking server dependencies...');

const install = spawn('npm', ['install', '--silent'], {
  cwd: serverDir,
  stdio: 'inherit',
  shell: true,
});

install.on('close', (code) => {
  if (code !== 0) {
    console.error('Failed to install server dependencies. Run manually:');
    console.error('  cd server && npm install');
    process.exit(1);
  }

  console.log('[2/2] Starting game server...');
  console.log(`  Health:    http://127.0.0.1:${port}/health`);
  console.log(`  WebSocket: ws://127.0.0.1:${port}`);
  for (const ip of getLanAddresses()) {
    console.log(`  LAN:       ws://${ip}:${port}`);
  }
  console.log('  Press Ctrl+C to stop\n');

  const server = spawn('node', ['src/index.js'], {
    cwd: serverDir,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      HOST: host,
      PORT: String(port),
    },
  });

  server.on('close', (c) => {
    console.log(`\nServer stopped (exit code ${c}).`);
    process.exit(c ?? 0);
  });
});

process.on('SIGINT', () => {
  console.log('\nShutting down...');
  process.exit(0);
});

function getLanAddresses() {
  const result = [];
  const nets = networkInterfaces();
  for (const entries of Object.values(nets)) {
    for (const net of entries || []) {
      if (net.family === 'IPv4' && !net.internal) result.push(net.address);
    }
  }
  return result;
}
