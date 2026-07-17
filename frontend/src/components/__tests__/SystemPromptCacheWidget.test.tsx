import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { SystemPromptCacheWidget } from '../dashboard/SystemPromptCacheWidget';
import { normalizeCacheStats } from '@/lib/utils';

function mockJsonResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'content-type' ? 'application/json' : null,
    },
  } as unknown as Response;
}

describe('normalizeCacheStats', () => {
  test('defaults missing fields to 0', () => {
    expect(normalizeCacheStats({})).toEqual({
      totalCachedTokens: 0,
      cacheHits: 0,
      totalRequests: 0,
      hitRate: 0,
      savingsUsd: 0,
      savingsIdr: 0,
      lastCacheUpdate: null,
      promptCacheTokenCount: 0,
    });
  });

  test('accepts snake_case keys', () => {
    const n = normalizeCacheStats({
      total_cached_tokens: 1200,
      cache_hits: 4,
      total_requests: 10,
      hit_rate: 40,
      savings_usd: 0.01,
      savings_idr: 175,
      last_cache_update: '2026-07-17T10:00:00Z',
    });
    expect(n.totalCachedTokens).toBe(1200);
    expect(n.hitRate).toBe(40);
    expect(n.lastCacheUpdate).toBe('2026-07-17T10:00:00Z');
  });

  test('coerces null numeric fields', () => {
    const n = normalizeCacheStats({
      totalCachedTokens: null,
      hitRate: null,
      savingsUsd: null,
    });
    expect(n.totalCachedTokens).toBe(0);
    expect(n.hitRate).toBe(0);
    expect(n.savingsUsd).toBe(0);
  });
});

describe('SystemPromptCacheWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('does not crash when API returns empty data object', async () => {
    window.fetch = vi.fn().mockResolvedValue(
      mockJsonResponse({ status: 'success', data: {} }),
    );

    render(
      <SystemPromptCacheWidget businessId={1} onNavigateToSettings={vi.fn()} />,
    );

    // Initial render shows zeros
    expect(screen.getByText('0')).toBeInTheDocument();

    await waitFor(() => {
      expect(window.fetch).toHaveBeenCalled();
    });

    // Still safe after partial payload applied — no crash from toLocaleString
    expect(screen.getByText(/System Prompt Cache/i)).toBeInTheDocument();
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('$0.00')).toBeInTheDocument();
  });

  test('renders normalized stats from full payload', async () => {
    window.fetch = vi.fn().mockResolvedValue(
      mockJsonResponse({
        status: 'success',
        data: {
          totalCachedTokens: 5000,
          cacheHits: 8,
          totalRequests: 20,
          hitRate: 40,
          savingsUsd: 1.25,
          savingsIdr: 21875,
          lastCacheUpdate: null,
          promptCacheTokenCount: 900,
        },
      }),
    );

    render(<SystemPromptCacheWidget businessId={1} />);

    await waitFor(() => {
      expect(screen.getByText((5000).toLocaleString('id-ID'))).toBeInTheDocument();
    });
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('$1.25')).toBeInTheDocument();
  });
});
