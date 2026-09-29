import { spawnSync } from 'node:child_process';

// Render invokes prisma:push at every boot. Production schema changes need
// separate review so an application deploy cannot drop populated tables.
if (process.env.NODE_ENV === 'production') {
  console.log('Production startup: Prisma schema push skipped; apply reviewed migrations separately.');
  process.exit(0);
}

const result = spawnSync('prisma', ['db', 'push'], { stdio: 'inherit', shell: process.platform === 'win32' });
if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
