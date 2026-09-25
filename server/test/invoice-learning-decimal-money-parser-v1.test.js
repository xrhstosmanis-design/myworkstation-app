import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../client/src/invoice-learning-lab-bootstrap.js', import.meta.url), 'utf8');
const expression = source.match(/const money=(v=>\{[^\n]+\});/)?.[1];

assert.ok(expression, 'invoice learning money parser must remain discoverable');
const money = Function(`return (${expression})`)();

test('invoice learning preserves calculated values with exactly three decimals', () => {
  assert.equal(money(2.485), 2.485);
  assert.equal(money(2.006), 2.006);
  assert.equal(money('2.485'), 2.485);
  assert.equal(money('2.006'), 2.006);
});

test('invoice learning still parses Greek formatted totals and decimal commas', () => {
  assert.equal(money('2.485,00 €'), 2485);
  assert.equal(money('1,18'), 1.18);
  assert.equal(money('15.280,00'), 15280);
});
