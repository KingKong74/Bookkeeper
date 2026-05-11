/**
 * unit.dates.test.js
 * Tests for utils/dates.js — FY helpers and date parsing.
 */
import { describe, it, expect } from 'vitest';
import { fyLabel, fyDateRange, parseCSVDate, isInDateRange, getPriorPeriod } from '../utils/dates';

describe('fyLabel', () => {
  it('formats FY correctly', () => expect(fyLabel(2024)).toBe('FY24/25'));
  it('formats FY for turn of century', () => expect(fyLabel(1999)).toBe('FY99/00'));
});

describe('fyDateRange', () => {
  it('returns correct start and end', () => {
    const { from, to } = fyDateRange(2024);
    expect(from).toBe('2024-07-01');
    expect(to).toBe('2025-06-30');
  });
});

describe('parseCSVDate', () => {
  it('passes through ISO date', () => expect(parseCSVDate('2024-07-15')).toBe('2024-07-15'));
  it('parses DD/MM/YYYY', () => expect(parseCSVDate('15/07/2024')).toBe('2024-07-15'));
  it('parses DD-MM-YYYY', () => expect(parseCSVDate('15-07-2024')).toBe('2024-07-15'));
  it('returns null for empty', () => expect(parseCSVDate('')).toBeNull());
  it('returns null for null', () => expect(parseCSVDate(null)).toBeNull());
});

describe('isInDateRange', () => {
  it('returns true for date within range', () => expect(isInDateRange('2024-08-15', '2024-07-01', '2025-06-30')).toBe(true));
  it('returns true for exact boundary', () => expect(isInDateRange('2024-07-01', '2024-07-01', '2025-06-30')).toBe(true));
  it('returns false for date outside range', () => expect(isInDateRange('2026-01-01', '2024-07-01', '2025-06-30')).toBe(false));
  it('returns false for null date', () => expect(isInDateRange(null, '2024-07-01', '2025-06-30')).toBe(false));
});

describe('getPriorPeriod', () => {
  it('returns equal-length period immediately before', () => {
    const { from, to } = getPriorPeriod('2024-01-01', '2024-01-31');
    expect(to).toBe('2023-12-31');
    expect(from).toBe('2023-12-01');
  });
});
