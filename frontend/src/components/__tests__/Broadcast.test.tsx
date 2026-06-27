import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import Broadcast from '../Broadcast';

const mockCampaigns = [
  {
    id: 1,
    name: 'Promo Kue Cokelat Ramadhan',
    session_id: 'default',
    message_template: 'Halo {{name}}!',
    media_type: 'text',
    status: 'completed',
    total_targets: 10,
    sent_count: 9,
    failed_count: 1,
    created_at: '2026-06-25T10:00:00.000Z',
    updated_at: '2026-06-25T10:05:00.000Z'
  }
];

const mockSessions = [
  { id: 'default', name: 'Default Agent', status: 'connected' }
];

describe('Broadcast component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window fetch for campaigns API call
    window.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve(mockCampaigns)
    } as Response);
  });

  test('renders campaign list header and composer trigger button', async () => {
    const handleToast = vi.fn();
    render(<Broadcast showToast={handleToast} sessions={mockSessions} />);

    expect(screen.getByText('Daftar Kampanye Siaran')).toBeInTheDocument();
    expect(screen.getByText('Buat Broadcast baru')).toBeInTheDocument();

    const campaignName = await screen.findByText('Promo Kue Cokelat Ramadhan');
    expect(campaignName).toBeInTheDocument();

    expect(screen.getByText('9 sukses')).toBeInTheDocument();
    expect(screen.getByText('1 gagal')).toBeInTheDocument();
  });

  test('opens the composer dialog with a roomier layout', async () => {
    const user = userEvent.setup();
    const handleToast = vi.fn();
    render(<Broadcast showToast={handleToast} sessions={mockSessions} />);

    await user.click(screen.getByRole('button', { name: 'Buat Broadcast baru' }));

    expect(await screen.findByText('Composer Siaran Massal WhatsApp')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveClass('sm:max-w-[96vw]', 'xl:max-w-7xl');
    expect(screen.getByLabelText('Nama Kampanye')).toBeInTheDocument();
    expect(screen.getByText('Perbaiki dengan Gemini')).toBeInTheDocument();
    expect(screen.getByText('Pratinjau Pesan Broadcast')).toBeInTheDocument();
  });
});
