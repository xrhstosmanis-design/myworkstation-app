import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const target = read('.node-version').trim();
assert.match(target, /^22\.\d+\.\d+$/, 'Keep the reviewed Node 22 release line');
const parts = value => value.replace(/^v/, '').split('.').map(Number);
const atLeast = (actual, minimum) => {
  const a = parts(actual), b = parts(minimum);
  return a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] >= b[2]));
};
assert(atLeast(target, '22.23.4'), 'Target must include the October security fixes');
assert(atLeast(process.versions.node, target), `Run checks on Node ${target} or a later Node 22 patch`);
const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.engines.node, `>=${target} <23`);
assert.match(read('render.yaml'), new RegExp('key: NODE_VERSION\\s+value: ["\']?' + target.replaceAll('.', '\\.') + '["\']?\\s'));
assert(read('ops/wholesale-lab/Dockerfile').startsWith(`FROM node:${target}-bookworm AS build\n`));
assert(read('AGENTS.md').includes(`Use Node.js ${target}`));
let count = 0;
for (const file of readdirSync(new URL('.github/workflows/', root))) {
  if (!/\.ya?ml$/.test(file)) continue;
  const workflow = read(`.github/workflows/${file}`);
  for (const step of workflow.split(/(?=^\s+- (?:name:|uses:))/m)) {
    if (!/uses: actions\/setup-node@/.test(step)) continue;
    assert.match(step, /node-version-file: ['"]?\.node-version['"]?(?:\s|$)/, `${file}: use the shared runtime pin`);
    assert(!/\bnode-version:/.test(step), `${file}: avoid an overriding runtime pin`);
    count++;
  }
}
assert(count > 0, 'No Node workflows were checked');
console.log(JSON.stringify({check: 'runtime-policy', node: process.version, target, workflowSteps: count, status: 'PASS'}));
