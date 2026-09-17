const {test} = require('node:test');
const assert = require('node:assert/strict');
const {decode} = require('../tools/ruby-marshal.cjs');
const {importStorySource} = require('../tools/import-story-source.cjs');
const marshal = (...bytes) => Buffer.from([4, 8, ...bytes]);

test('source reader decodes signed fixnums and rejects other Marshal versions', () => {
  assert.equal(decode(marshal(105, 15)), 10);
  assert.equal(decode(marshal(105, 241)), -10);
  assert.equal(decode(marshal(105, 2, 0, 1)), 256);
  assert.equal(decode(marshal(105, 255, 128)), -128);
  assert.throws(() => decode(Buffer.from([4, 9, 48])), /4.8/);
});

test('source reader keeps string/object references without executing Ruby', () => {
  const data = decode(marshal(91, 7, 34, 8, 97, 98, 99, 64, 6));
  assert.deepEqual(data, ['abc', 'abc']);
  assert.throws(() => decode(marshal(64, 6)), /reference/);
  assert.throws(() => decode(marshal(34, 8, 97)), /Truncated/);
  assert.throws(() => decode(marshal(91, 250)), /length/);
  assert.throws(() => decode(marshal(48, 48)), /Trailing/);
});

test('source reader decodes native RGSS tile tables exactly', () => {
  const table = Buffer.alloc(24);
  [3, 1, 1, 2, 2].forEach((n, i) => table.writeInt32LE(n, i * 4));
  table.writeInt16LE(384, 20); table.writeInt16LE(-1, 22);
  const result = decode(Buffer.concat([marshal(117, 58, 10, 84, 97, 98, 108, 101, 29), table]));
  assert.deepEqual(result, {$class: 'Table', dim: 3, x: 1, y: 1, z: 2, values: [384, -1]});
});

test('source importer refuses to overwrite the original source tree', () => {
  assert.throws(() => importStorySource(__dirname, __dirname), /outside/);
  assert.throws(() => importStorySource(__dirname, `${__dirname}/generated`), /outside/);
});
