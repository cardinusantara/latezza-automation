import { describe, expect, test } from 'vitest';
import { cn } from '../utils';

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
