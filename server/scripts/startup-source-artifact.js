import {readFile, writeFile, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const patchFiles = [
  'scripts/patch-efood-pelican-routes.js',
  'src/patch-invoice-learning-workspace-route.js',
  'src/patch-invoice-learning-ai-route.js',
  'src/patch-invoice-learning-supplier-profiles.js',
  'src/patch-invoice-learning-ifantis-price-scale-v2.js',
  'src/patch-commerce-azure-supplier-profile-runtime.js',
];
// Render runs this existing file-only prerequisite before the workspace start.
// Prepare its identical output before sealing the artifact; Render can retain
// its command as an idempotent no-op without invalidating the receipt.
export const preparationFiles = ['scripts/patch-pos-return-diagnostics.js', ...patchFiles];
export const targetFiles = [
  'src/index.js',
  'src/routes/platform-invoice-learning-ai.js',
  'src/routes/commerce-azure-invoice-reader.js',
];
const artifactFiles = [
  'scripts/startup-source-artifact.js', 'scripts/prepare-startup-source.js',
  'scripts/verify-startup-source.js', ...preparationFiles, ...targetFiles,
];
const receiptPath = '.startup-source-artifact.json';
const digest = value => createHash('sha256').update(value).digest('hex');

function canonical(path, bytes) {
  if (path !== 'src/index.js') return bytes;
  // The retained patch-online-pos-handoff-route adds exactly these two lines
  // after this check. A later start must accept that known, idempotent result.
  // Every other byte remains covered; repeated copies are invalid.
  let source = bytes.toString('utf8');
  for (const line of [
    'import katOnlinePosHandoffRoutes from "./routes/kat-online-pos-handoff.js";\n',
    'app.use("/api/public/kat/pos-handoff",katOnlinePosHandoffRoutes);\n',
  ]) {
    const count = source.split(line).length - 1;
    if (count > 1) throw new Error('Duplicate retained handoff preparation');
    source = source.replace(line, '');
  }
  return source;
}

async function snapshot(root) {
  const entries = [];
  for (const path of artifactFiles) {
    entries.push([path, digest(canonical(path, await readFile(new URL(path, root))))]);
  }
  return Object.fromEntries(entries);
}

export async function prepareStartupSource(root) {
  // Never retain a previous success receipt when a new preparation fails.
  await rm(new URL(receiptPath, root), {force: true});
  for (const path of preparationFiles) {
    execFileSync(process.execPath, [fileURLToPath(new URL(path, root))], {
      cwd: root, stdio: 'pipe', timeout: 30000,
    });
  }
  const receipt = {version: 1, files: await snapshot(root)};
  await writeFile(new URL(receiptPath, root), JSON.stringify(receipt) + '\n');
}

export async function verifyStartupSource(root) {
  const receipt = JSON.parse(await readFile(new URL(receiptPath, root), 'utf8'));
  if (receipt.version !== 1 || !receipt.files || Array.isArray(receipt.files)) {
    throw new Error('Invalid startup source artifact');
  }
  const actual = await snapshot(root);
  if (Object.keys(receipt.files).length !== artifactFiles.length ||
      artifactFiles.some(path => receipt.files[path] !== actual[path])) {
    throw new Error('Startup source artifact is stale or incomplete');
  }
}
