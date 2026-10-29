// Synthetic files only. No database, provider, SMTP, payment or stock action.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';
import PDFDocument from 'pdfkit';
import {PrismaClient} from '@prisma/client';
import {createWorker} from 'tesseract.js';

const server = createRequire(new URL('../../server/package.json', import.meta.url));
const client = createRequire(new URL('../../client/package.json', import.meta.url));
// PDF.js keeps a process-global fake worker. Its server and browser versions
// must be exercised in separate processes, matching the real application.
if (process.argv[2] === '--pdf') {
  const name = process.argv[3];
  assert(['server', 'client'].includes(name));
  const require = name === 'server' ? server : client;
  const pdfjs = await import(pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);
  const task = pdfjs.getDocument({data: new Uint8Array(readFileSync(0)), useSystemFonts: true, isEvalSupported: false});
  try {
    const document = await task.promise;
    assert.equal(document.numPages, 1);
    const page = await document.getPage(1);
    const text = (await page.getTextContent()).items.map(item => item.str).join(' ');
    assert.match(text, /MyWorkStation Node runtime compatibility/);
    console.log(`${name} PDF.js: synthetic PDF text extraction PASS`);
  } finally {
    await task.destroy();
  }
  process.exit(0);
}
const image = await sharp({create: {width: 48, height: 32, channels: 3, background: '#fff'}})
  .resize(24, 16).png().toBuffer();
const meta = await sharp(image).metadata();
assert.equal(meta.width, 24);
assert.equal(meta.height, 16);
const doc = new PDFDocument({compress: false});
const chunks = [];
const completed = new Promise((resolve, reject) => {
  doc.on('data', chunk => chunks.push(chunk));
  doc.on('end', resolve);
  doc.on('error', reject);
});
doc.text('MyWorkStation Node runtime compatibility');
doc.end();
await completed;
const pdf = Buffer.concat(chunks);
for (const name of ['server', 'client']) {
  const output = execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--pdf', name],
    {input: pdf, encoding: 'utf8', timeout: 30000});
  process.stdout.write(output);
}
// Generated Prisma import/constructor only; deliberately never connect to a DB.
const prisma = new PrismaClient();
await prisma.$disconnect();
assert.equal(typeof createWorker, 'function');
console.log(JSON.stringify({check: 'runtime-compatibility', node: process.version,
  sharp: meta.format, prisma: 'generated client constructor', tesseract: 'module load only; recognition NOT TESTED',
  externalRequests: 0, status: 'PASS'}));
