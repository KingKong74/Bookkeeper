/**
 * unit.currency.test.js
 * Tests for utils/currency.js — formatting and parsing.
 * These functions are used throughout every report and UI component.
 */
import { describe, it, expect } from 'vitest';
import { fmt, fmtSigned, fmtAcct, parseCurrency, round2 } from '../utils/currency';

describe('fmt — basic currency formatting', () => {
  it('formats positive amount', () => expect(fmt(1234.56)).toBe('$1,234.56'));
  it('formats zero', () => expect(fmt(0)).toBe('$0.00'));
  it('formats large number with commas', () => expect(fmt(1000000)).toBe('$1,000,000.00'));
  it('formats negative as positive (absolute value)', () => expect(fmt(-45.50)).toBe('$45.50'));
  it('handles null gracefully', () => expect(fmt(null)).toBe('$0.00'));
  it('handles NaN gracefully', () => expect(fmt(NaN)).toBe('$0.00'));
});

describe('fmtSigned — signed currency formatting', () => {
  it('positive shows + prefix', () => expect(fmtSigned(500)).toBe('+$500.00'));
  it('negative shows − prefix', () => expect(fmtSigned(-200)).toBe('−$200.00'));
  it('zero shows +', () => expect(fmtSigned(0)).toBe('+$0.00'));
});

describe('fmtAcct — accounting brackets', () => {
  it('positive shown normally', () => expect(fmtAcct(100)).toBe('$100.00'));
  it('negative shown in brackets', () => expect(fmtAcct(-100)).toBe('($100.00)'));
  it('zero shown normally', () => expect(fmtAcct(0)).toBe('$0.00'));
});

describe('parseCurrency — string to float', () => {
  it('parses plain number string', () => expect(parseCurrency('1234.56')).toBe(1234.56));
  it('strips dollar sign', () => expect(parseCurrency('$1,234.56')).toBe(1234.56));
  it('strips commas', () => expect(parseCurrency('1,000,000')).toBe(1000000));
  it('parses bracketed negative', () => expect(parseCurrency('(500.00)')).toBe(-500));
  it('returns 0 for empty string', () => expect(parseCurrency('')).toBe(0));
  it('passes through a number', () => expect(parseCurrency(42)).toBe(42));
});

describe('round2 — floating point safety', () => {
  it('rounds to 2dp', () => expect(round2(1.005)).toBe(1.01));
  it('avoids floating point drift', () => expect(round2(0.1 + 0.2)).toBe(0.3));
  it('handles whole numbers', () => expect(round2(100)).toBe(100));
});
