import { describe, expect, test } from 'vitest';
import { cn, toFiniteNumber, formatLocaleNumber, formatRpId } from '../utils';

describe('cn utility', () => {
  test('merges class names correctly', () => {
    expect(cn('class1', 'class2')).toBe('class1 class2');
  });

  test('filters out falsy values', () => {
    expect(cn('class1', null, undefined, false, 'class2')).toBe('class1 class2');
  });

  test('resolves tailwind conflicts correctly (tailwind-merge)', () => {
    expect(cn('px-2 py-1', 'p-4')).toBe('p-4');
    expect(cn('bg-red-500', 'bg-blue-600')).toBe('bg-blue-600');
  });
});

describe('toFiniteNumber', () => {
  test('returns finite numbers as-is', () => {
    expect(toFiniteNumber(42)).toBe(42);
    expect(toFiniteNumber(0)).toBe(0);
    expect(toFiniteNumber(-1.5)).toBe(-1.5);
  });

  test('parses numeric strings', () => {
    expect(toFiniteNumber('1234')).toBe(1234);
    expect(toFiniteNumber('12.5')).toBe(12.5);
  });

  test('falls back for null, undefined, empty, NaN, Infinity', () => {
    expect(toFiniteNumber(null)).toBe(0);
    expect(toFiniteNumber(undefined)).toBe(0);
    expect(toFiniteNumber('')).toBe(0);
    expect(toFiniteNumber(Number.NaN)).toBe(0);
    expect(toFiniteNumber(Number.POSITIVE_INFINITY)).toBe(0);
    expect(toFiniteNumber('not-a-number')).toBe(0);
    expect(toFiniteNumber(undefined, 7)).toBe(7);
  });
});

describe('formatLocaleNumber / formatRpId', () => {
  test('formats numbers with id-ID locale without throwing', () => {
    expect(formatLocaleNumber(2400)).toBe((2400).toLocaleString('id-ID'));
    expect(formatLocaleNumber(undefined)).toBe('0');
    expect(formatLocaleNumber(null)).toBe('0');
  });

  test('formats rupiah amounts safely', () => {
    expect(formatRpId(2400)).toBe(`Rp ${(2400).toLocaleString('id-ID')}`);
    expect(formatRpId(undefined)).toBe('Rp 0');
    expect(formatRpId(null)).toBe('Rp 0');
    expect(formatRpId('1500.9')).toBe(`Rp ${(1501).toLocaleString('id-ID')}`);
  });
});
