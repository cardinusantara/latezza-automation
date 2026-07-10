import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import Overview from '../Overview';
import type { Stats, Session } from '@/types';

const mockStats: Stats = {
  totalLeads: 42,
  totalProducts: 15,
  pendingFollowUps: 7,
  incomingMessages: { last24h: 12, last7d: 84, last30d: 320 },
  newLeads: { last24h: 3, last7d: 15, last30d: 40 },
  recentLeads: [
    {
      phone_number: '62812345678',
      session_id: 'default',
      name: 'John Doe',
      last_interaction: new Date().toISOString(),
    },
  ],
};

const mockSessions: Session[] = [
  { id: 'all', name: 'Semua Agen', status: 'connected' },
  { id: 'default', name: 'Default Agent', status: 'connected' },
];

const mockUsageStats = {
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

const mockMessageSummary = {
  generatedAt: new Date().toISOString(),
  dateRange: 'today',
  sessionId: 'all',
  totalMessages: 5,
  totalCustomers: 2,
  summary: {
    totalCustomers: 2,
    topProducts: ['Marmer Cake'],
    commonQuestions: ['Berapa ongkir ke Bandung?'],
    complaints: [],
    salesOpportunities: ['Minat beli Hampers'],
    insights: ['Fokus pada cookies'],
  },
};

/** Helper: build a mock Response with JSON headers */
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

describe('Overview component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/message-summary')) {
        return Promise.resolve(mockJsonResponse(mockMessageSummary));
      }
      if (url.includes('/api/settings/usage-stats')) {
        return Promise.resolve(mockJsonResponse(mockUsageStats));
      }
      if (url.includes('/api/stats')) {
        return Promise.resolve(mockJsonResponse(mockStats));
      }
      return Promise.reject(new Error('Unknown url: ' + url));
    });
  });

  test('renders stats counters correctly', async () => {
    const setOverviewSessionId = vi.fn();
    const onSelectCustomer = vi.fn();

    render(
      <Overview
        stats={mockStats}
        sessions={mockSessions}
        overviewSessionId="all"
        setOverviewSessionId={setOverviewSessionId}
        onSelectCustomer={onSelectCustomer}
      />,
    );

    // Verify stats from props via KPI cards
    expect(screen.getByText('42')).toBeInTheDocument(); // totalLeads
    expect(screen.getByText('15')).toBeInTheDocument(); // totalProducts
    expect(screen.getByText('7')).toBeInTheDocument(); // pendingFollowUps

    // Verify customer name in recent activity table
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  test('loads and displays message summary from API', async () => {
    const setOverviewSessionId = vi.fn();
    const onSelectCustomer = vi.fn();

    render(
      <Overview
        stats={mockStats}
        sessions={mockSessions}
        overviewSessionId="all"
        setOverviewSessionId={setOverviewSessionId}
        onSelectCustomer={onSelectCustomer}
      />,
    );

    // Wait for the message summary fetch response to render
    await waitFor(() =>
      expect(screen.getByText('Marmer Cake')).toBeInTheDocument(),
    );
    expect(
      screen.getByText('Berapa ongkir ke Bandung?'),
    ).toBeInTheDocument();
    expect(screen.getByText('Minat beli Hampers')).toBeInTheDocument();
  });

  test('renders KPI cards with correct values', async () => {
    render(
      <Overview
        stats={mockStats}
        sessions={mockSessions}
        overviewSessionId="all"
        setOverviewSessionId={vi.fn()}
        onSelectCustomer={vi.fn()}
      />,
    );

    // KPI card titles should be present
    expect(screen.getByText('Total Leads')).toBeInTheDocument();
    expect(screen.getByText('Products')).toBeInTheDocument();
    expect(screen.getByText('Pending Follow-ups')).toBeInTheDocument();
    expect(screen.getByText('Incoming Messages')).toBeInTheDocument();
    expect(screen.getByText('New Leads')).toBeInTheDocument();
    expect(screen.getByText('Gemini Cost MTD')).toBeInTheDocument();

    // Incoming messages 24h value
    expect(screen.getByText('12')).toBeInTheDocument();
    // New leads 24h value
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  test('renders Refresh Billing quick action button', async () => {
    render(
      <Overview
        stats={mockStats}
        sessions={mockSessions}
        overviewSessionId="all"
        setOverviewSessionId={vi.fn()}
        onSelectCustomer={vi.fn()}
      />,
    );

    // "Refresh Billing" appears in both the quick actions bar and the GeminiAnalyticsPanel
    const refreshButtons = screen.getAllByRole('button', {
      name: /Refresh Billing/i,
    });
    expect(refreshButtons.length).toBeGreaterThanOrEqual(1);
  });

  test('renders Trigger Follow-up button when onTriggerFollowUps prop is passed', async () => {
    const onTriggerFollowUps = vi.fn();

    render(
      <Overview
        stats={mockStats}
        sessions={mockSessions}
        overviewSessionId="all"
        setOverviewSessionId={vi.fn()}
        onSelectCustomer={vi.fn()}
        onTriggerFollowUps={onTriggerFollowUps}
      />,
    );

    const triggerBtn = screen.getByRole('button', {
      name: /Trigger Follow-up/i,
    });
    expect(triggerBtn).toBeInTheDocument();
  });

  test('does not render Trigger Follow-up button when onTriggerFollowUps prop is omitted', async () => {
    render(
      <Overview
        stats={mockStats}
        sessions={mockSessions}
        overviewSessionId="all"
        setOverviewSessionId={vi.fn()}
        onSelectCustomer={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole('button', { name: /Trigger Follow-up/i }),
    ).not.toBeInTheDocument();
  });

  test('renders session filter dropdown with sessions', async () => {
    render(
      <Overview
        stats={mockStats}
        sessions={mockSessions}
        overviewSessionId="all"
        setOverviewSessionId={vi.fn()}
        onSelectCustomer={vi.fn()}
      />,
    );

    const select = screen.getByDisplayValue(/All Agent Sessions/i);
    expect(select).toBeInTheDocument();
    // Session options — text is split across child nodes so use role+name regex
    expect(
      screen.getByRole('option', { name: /Semua Agen/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: /Default Agent/i }),
    ).toBeInTheDocument();
  });
});
