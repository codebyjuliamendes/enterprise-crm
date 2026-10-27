'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { toCents, fromCents } = require('../src/domain/money');
const { sqliteUtcToIso } = require('../src/domain/dates');
const { ownerScope } = require('../src/domain/roles');
const { anonymizedContactFields } = require('../src/domain/anonymize');

test('toCents converts decimal amounts without floating point drift', () => {
  assert.equal(toCents(0), 0);
  assert.equal(toCents(10.5), 1050);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(toCents(19.99), 1999);
  assert.equal(toCents(150000), 15_000_000);
});

test('toCents rejects negative, non-finite and sub-cent amounts', () => {
  assert.throws(() => toCents(-1), RangeError);
  assert.throws(() => toCents(Number.NaN), TypeError);
  assert.throws(() => toCents(Infinity), TypeError);
  assert.throws(() => toCents(1.005), /two decimal places/);
  assert.throws(() => toCents(1e13), RangeError);
});

test('fromCents returns the decimal amount', () => {
  assert.equal(fromCents(1999), 19.99);
  assert.equal(fromCents(null), 0);
});

test('sqliteUtcToIso marks SQLite timestamps as UTC', () => {
  assert.equal(sqliteUtcToIso('2024-05-01 13:45:00'), '2024-05-01T13:45:00Z');
  assert.equal(sqliteUtcToIso(null), null);
  assert.equal(sqliteUtcToIso('2024-05-01T13:45:00.000Z'), '2024-05-01T13:45:00.000Z');
});

test('ownerScope restricts only sales reps', () => {
  assert.equal(ownerScope({ id: 3, role: 'sales' }), 3);
  for (const role of ['admin', 'manager', 'viewer'])
    assert.equal(ownerScope({ id: 1, role }), null);
});

test('anonymizedContactFields removes every personal field', () => {
  assert.deepEqual(anonymizedContactFields({ id: 7 }), {
    name: 'Anonymized contact #7',
    email: null,
    phone: null,
    tags: null,
  });
});
