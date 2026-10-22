import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, copyFile, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {patchFiles, preparationFiles, targetFiles, prepareStartupSource, verifyStartupSource} from '../scripts/startup-source-artifact.js';

const server = new URL('../', import.meta.url);
const receipt = '.startup-source-artifact.json';
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'mws prepared source '));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const root = pathToFileURL(directory + '/');
  const files = [...preparationFiles, ...targetFiles, 'scripts/startup-source-artifact.js',
    'scripts/prepare-startup-source.js', 'scripts/verify-startup-source.js',
    'src/patch-online-pos-handoff-route.js', 'src/routes/kat-online-ordering.js'];
  for (const file of files) {
    await mkdir(dirname(join(directory, file)), {recursive: true});
    await copyFile(new URL(file, server), new URL(file, root));
  }
  await writeFile(new URL('package.json', root), '{"type":"module"}');
  return root;
}

test('prepared artifact preserves the actual six-patch output and verifies without file writes', async t => {
  const root = await fixture(t);
  // Baseline uses the original commands, not a reimplementation of their logic.
  for (const file of preparationFiles) execFileSync(process.execPath, [fileURLToPath(new URL(file, root))], {cwd: root});
  const before = await Promise.all(targetFiles.map(file => readFile(new URL(file, root))));
  await prepareStartupSource(root);
  for (let i = 0; i < targetFiles.length; i++) assert.deepEqual(await readFile(new URL(targetFiles[i], root)), before[i]);
  const receiptBefore = await readFile(new URL(receipt, root));
  await verifyStartupSource(root);
  await verifyStartupSource(root);
  execFileSync(process.execPath, [fileURLToPath(new URL('scripts/patch-pos-return-diagnostics.js', root))], {cwd: root});
  await verifyStartupSource(root); // actual retained Render prerequisite
  assert.deepEqual(await readFile(new URL(receipt, root)), receiptBefore);
  execFileSync(process.execPath, [fileURLToPath(new URL('src/patch-online-pos-handoff-route.js', root))], {cwd: root});
  await verifyStartupSource(root); // retained later patch remains restart-compatible
  const index = new URL('src/index.js', root);
  await writeFile(index, (await readFile(index, 'utf8')) + '\n// unexpected runtime change\n');
  await assert.rejects(verifyStartupSource(root), /stale or incomplete/);
});

test('missing, malformed, stale and failed preparation fail before any database work', async t => {
  const root = await fixture(t);
  await assert.rejects(verifyStartupSource(root), /ENOENT/);
  await writeFile(new URL(receipt, root), '{}');
  await assert.rejects(verifyStartupSource(root), /Invalid/);
  await prepareStartupSource(root);
  const patch = new URL(patchFiles[0], root);
  await writeFile(patch, 'throw new Error("isolated build failure");');
  await assert.rejects(verifyStartupSource(root), /stale or incomplete/);
  await assert.rejects(prepareStartupSource(root));
  await assert.rejects(readFile(new URL(receipt, root)), /ENOENT/);
  // The real start verifier exits nonzero; the fixture contains no Prisma or DB module.
  assert.throws(() => execFileSync(process.execPath, [fileURLToPath(new URL('scripts/verify-startup-source.js', root))], {cwd: root, stdio: 'pipe'}));
});

test('build preparation keeps frontend-only build and all retained runtime operations in order', async () => {
  const rootPackage = JSON.parse(await readFile(new URL('../../package.json', import.meta.url)));
  const serverPackage = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  assert.equal(rootPackage.scripts.build, 'npm run build:client');
  assert.match(rootPackage.scripts['build:server'], /npm run prepare:server && npm run prisma:generate -w server/);
  assert.match(rootPackage.scripts['prepare:server'], / && node server\/scripts\/prepare-startup-source\.js$/);
  const retained = [
    'src/seed-invoice-profile-dimotsios.js', 'src/patch-online-pos-handoff-route.js',
    'src/patch-store-pos-online-checkout.js', 'src/patch-store-transactions-online-reconcile.js',
    'src/patch-owner-products-price-sync.js', 'src/patch-owner-shifts-transfer-report.js',
    'src/patch-close-shift-permission.js', 'src/patch-multi-pos-shifts.js',
    'src/patch-multi-pos-close-guard.js', 'src/patch-pilot-backup-verify.js',
    'src/patch-kat-offline-checkout-idempotency.js', 'src/patch-safe-vault-adjustment-alert.js',
    'src/patch-safe-vault-close-alert.js', 'src/patch-pos-sale-item-description.js',
    'src/online-transaction-actor-fix.js', 'src/online-recipe-stock-repair.js',
    'src/repair-kat009-duplicate-sale.js', 'src/index.js',
  ];
  assert.deepEqual(serverPackage.scripts.start.split(' && '),
    ['node scripts/verify-startup-source.js', ...retained.map(file => `node ${file}`)]);
});
