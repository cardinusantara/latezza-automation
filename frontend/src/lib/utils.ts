import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Coerce unknown API values to a finite number.
 * Handles null/undefined, numeric strings from Postgres, and NaN.
 */
export function toFiniteNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** Locale-format a number safely (never throws on null/undefined). */
export function formatLocaleNumber(value: unknown, locale = 'id-ID'): string {
  return toFiniteNumber(value).toLocaleString(locale)
}

/** Format IDR amount as "Rp 1.234" (rounded). */
export function formatRpId(value: unknown): string {
  return `Rp ${Math.round(toFiniteNumber(value)).toLocaleString('id-ID')}`
}
