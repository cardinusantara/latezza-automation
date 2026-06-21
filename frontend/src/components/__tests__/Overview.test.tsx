import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import Overview from '../Overview';

const mockStats = {
  totalLeads: 42,
  totalProducts: 15,
  pendingFollowUps: 7,
  incomingMessages: { last24h: 12, last7d: 84, last30d: 320 },
  newLeads: { last24h: 3, last7d: 15, last30d: 40 },
  recentLeads: [
    { phone_number: '62812345678', session_id: 'default', name: 'John Doe', last_interaction: new Date().toISOString() }
  ]
};

const mockSessions = [
  { id: 'all', name: 'Semua Agen', status: 'connected' },
  { id: 'default', name: 'Default Agent', status: 'connected' }
];

describe('Overview component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/message-summary')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
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
              insights: ['Fokus pada cookies']
            }
          })
        } as unknown as Response);
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
      />
    );

    // Verify stats from props
    expect(screen.getByText('42')).toBeInTheDocument(); // totalLeads
    expect(screen.getByText('15')).toBeInTheDocument(); // totalProducts
    expect(screen.getByText('7')).toBeInTheDocument();  // pendingFollowUps
    
    // Verify customer name in recent list
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
      />
    );

    // Wait for the message summary fetch response to render
    await waitFor(() => expect(screen.getByText('Marmer Cake')).toBeInTheDocument());
    expect(screen.getByText('Berapa ongkir ke Bandung?')).toBeInTheDocument();
    expect(screen.getByText('Minat beli Hampers')).toBeInTheDocument();
  });
});
