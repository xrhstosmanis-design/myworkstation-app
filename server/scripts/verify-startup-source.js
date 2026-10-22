import {verifyStartupSource} from './startup-source-artifact.js';

verifyStartupSource(new URL('../', import.meta.url)).catch(() => {
  console.error('Startup source artifact missing or stale. Run npm run build:server before starting.');
  process.exitCode = 1;
});
