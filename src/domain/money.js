'use strict';

/** Largest amount accepted for a deal (one trillion), well inside Number.MAX_SAFE_INTEGER cents. */
const MAX_AMOUNT = 1_000_000_000_000;

/**
 * Converts a decimal amount (e.g. 1234.5) into integer cents without floating point drift.
 * @param {number} amount
 * @returns {number}
 */
function toCents(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    throw new TypeError('amount must be a finite number');
  }
  if (amount < 0 || amount > MAX_AMOUNT) {
    throw new RangeError(`amount must be between 0 and ${MAX_AMOUNT}`);
  }
  const cents = Math.round(Number((amount * 100).toFixed(4)));
  if (Math.abs(cents / 100 - amount) > 1e-9) {
    throw new RangeError('amount must have at most two decimal places');
  }
  return cents;
}

/**
 * @param {number} cents
 * @returns {number} decimal amount
 */
function fromCents(cents) {
  return Number(cents || 0) / 100;
}

module.exports = { toCents, fromCents, MAX_AMOUNT };
