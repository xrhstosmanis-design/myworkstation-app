import {prepareStartupSource} from './startup-source-artifact.js';

prepareStartupSource(new URL('../', import.meta.url)).catch(() => {
  console.error('Startup source preparation failed; build rejected.');
  process.exitCode = 1;
});
