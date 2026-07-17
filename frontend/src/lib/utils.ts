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

export interface CacheStatsNormalized {
  totalCachedTokens: number
  cacheHits: number
  totalRequests: number
  hitRate: number
  savingsUsd: number
  savingsIdr: number
  lastCacheUpdate: string | null
  promptCacheTokenCount: number
}

/** Normalize system-prompt cache stats from API (camelCase or snake_case). */
export function normalizeCacheStats(raw: unknown): CacheStatsNormalized {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const last = row.lastCacheUpdate ?? row.last_cache_update ?? row.updated_at ?? null
  return {
    totalCachedTokens: toFiniteNumber(row.totalCachedTokens ?? row.total_cached_tokens),
    cacheHits: toFiniteNumber(row.cacheHits ?? row.cache_hits),
    totalRequests: toFiniteNumber(row.totalRequests ?? row.total_requests),
    hitRate: toFiniteNumber(row.hitRate ?? row.hit_rate),
    savingsUsd: toFiniteNumber(row.savingsUsd ?? row.savings_usd),
    savingsIdr: toFiniteNumber(row.savingsIdr ?? row.savings_idr),
    lastCacheUpdate:
      typeof last === 'string' || last instanceof Date ? String(last) : null,
    promptCacheTokenCount: toFiniteNumber(
      row.promptCacheTokenCount ?? row.prompt_cache_token_count ?? row.cache_token_count,
    ),
  }
}
