import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { KpiCards } from '@/components/dashboard/KpiCards';
import type { Stats, UsageStatsData } from '@/types';

const mockStats: Stats = {
  totalLeads: 42,
  totalProducts: 15,
  pendingFollowUps: 7,
  incomingMessages: { last24h: 12, last7d: 84, last30d: 320 },
  newLeads: { last24h: 3, last7d: 15, last30d: 40 },
  recentLeads: [],
};

const mockUsageStats: UsageStatsData = {
  status: 'success',
  mtd: {
    inputTokens: 50000,
    outputTokens: 12000,
    cachedTokens: 8000,
    costUsd: 0.15,
    costIdr: 2400,
    totalRequests: 150,
  },
  dailyTrend: [],
  featureBreakdown: [],
};

describe('KpiCards component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders 6 KPI cards with correct values when data is provided', () => {
    render(
      <KpiCards
        stats={mockStats}
        usageStats={mockUsageStats}
        loading={false}
        error={null}
        onRetry={vi.fn()}
      />,
    );

    // 6 KPI card titles
    expect(screen.getByText('Total Leads')).toBeInTheDocument();
    expect(screen.getByText('Products')).toBeInTheDocument();
    expect(screen.getByText('Pending Follow-ups')).toBeInTheDocument();
    expect(screen.getByText('Incoming Messages')).toBeInTheDocument();
    expect(screen.getByText('New Leads')).toBeInTheDocument();
    expect(screen.getByText('Gemini Cost MTD')).toBeInTheDocument();

    // Values
    expect(screen.getByText('42')).toBeInTheDocument(); // totalLeads
    expect(screen.getByText('15')).toBeInTheDocument(); // totalProducts
    expect(screen.getByText('7')).toBeInTheDocument(); // pendingFollowUps
    expect(screen.getByText('12')).toBeInTheDocument(); // incomingMessages last24h
    expect(screen.getByText('3')).toBeInTheDocument(); // newLeads last24h

    // Gemini Cost MTD formatted as Rp 2.400
    expect(screen.getByText('Rp 2.400')).toBeInTheDocument();
  });

  test('renders sub-stats for cards that have them', () => {
    render(
      <KpiCards
        stats={mockStats}
        usageStats={mockUsageStats}
        loading={false}
        error={null}
        onRetry={vi.fn()}
      />,
    );

    // Incoming messages sub-stats: 7d and 30d
    expect(screen.getByText('7d: 84')).toBeInTheDocument();
    expect(screen.getByText('30d: 320')).toBeInTheDocument();

    // New leads sub-stats
    expect(screen.getByText('7d: 15')).toBeInTheDocument();
    expect(screen.getByText('30d: 40')).toBeInTheDocument();

    // Gemini Cost sub-stats: Calls 150 and Cache percentage (8000/50000 = 16%)
    expect(screen.getByText('Calls: 150')).toBeInTheDocument();
    expect(screen.getByText('Cache: 16%')).toBeInTheDocument();
  });

  test('renders skeleton loaders when loading is true', () => {
    const { container } = render(
      <KpiCards
        stats={mockStats}
        usageStats={null}
        loading={true}
        error={null}
        onRetry={vi.fn()}
      />,
    );

    // Skeletons use the shadcn Skeleton component which renders a div with animate-pulse
    const skeletons = container.querySelectorAll('[class*="animate"]');
    expect(skeletons.length).toBeGreaterThan(0);

    // KPI card titles should NOT be visible during loading
    expect(screen.queryByText('Total Leads')).not.toBeInTheDocument();
    expect(screen.queryByText('Products')).not.toBeInTheDocument();
  });

  test('renders error state with retry button when error is not null', () => {
    const onRetry = vi.fn();
    render(
      <KpiCards
        stats={mockStats}
        usageStats={null}
        loading={false}
        error="Failed to load stats"
        onRetry={onRetry}
      />,
    );

    // Error message
    expect(screen.getByText('Gagal Memuat Statistik')).toBeInTheDocument();
    expect(screen.getByText('Failed to load stats')).toBeInTheDocument();

    // Retry button
    const retryButton = screen.getByRole('button', { name: /Coba Lagi/i });
    expect(retryButton).toBeInTheDocument();
  });

  test('clicking retry button calls onRetry callback', () => {
    const onRetry = vi.fn();
    render(
      <KpiCards
        stats={mockStats}
        usageStats={null}
        loading={false}
        error="Something went wrong"
        onRetry={onRetry}
      />,
    );

    const retryButton = screen.getByRole('button', { name: /Coba Lagi/i });
    fireEvent.click(retryButton);

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test('renders dash for missing values', () => {
    const emptyStats: Stats = {};
    render(
      <KpiCards
        stats={emptyStats}
        usageStats={null}
        loading={false}
        error={null}
        onRetry={vi.fn()}
      />,
    );

    // When stats fields are undefined, the cards show '-'
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThanOrEqual(4); // totalLeads, totalProducts, pendingFollowUps, incomingMessages, newLeads all '-'
  });

  test('renders Gemini Cost MTD as Rp 0 when usageStats is null', () => {
    render(
      <KpiCards
        stats={mockStats}
        usageStats={null}
        loading={false}
        error={null}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText('Rp 0')).toBeInTheDocument();
  });
});
