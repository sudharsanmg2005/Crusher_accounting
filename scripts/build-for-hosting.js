import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const run = (command, cwd) => {
  console.log(`\n> ${command} (${path.basename(cwd)})`);
  const result = spawnSync(command, {
    cwd,
    stdio: 'inherit',
    shell: true,
    env: process.env
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
};

run('npm install --include=dev', path.join(root, 'frontend'));
run('npm run build', path.join(root, 'frontend'));
run('npm install', path.join(root, 'backend'));

console.log('\nHosting build complete.');
