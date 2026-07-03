import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import WhatsappSessions from '../WhatsappSessions';
import { toast } from 'sonner';

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  }
}));

const mockSessions = [
  {
    id: 'default',
    name: 'Default Agent',
    phone_number: '62812345678',
    status: 'connected',
    qr_code: null,
    created_at: '2026-06-25T00:00:00Z',
    updated_at: '2026-06-25T00:00:00Z'
  },
  {
    id: 'qr-session',
    name: 'QR Session',
    phone_number: null,
    status: 'qr_received',
    qr_code: 'mock_qr_string_data',
    created_at: '2026-06-25T00:00:00Z',
    updated_at: '2026-06-25T00:00:00Z'
  }
];

describe('WhatsappSessions Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock fetch
    window.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/api/whatsapp/sessions')) {
        if (options?.method === 'POST') {
          if (url.includes('/regenerate')) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ status: 'success' })
            } as unknown as Response);
          }
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'success' })
          } as unknown as Response);
        }
        if (options?.method === 'DELETE') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'success' })
          } as unknown as Response);
        }
        // GET sessions list
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockSessions)
        } as unknown as Response);
      }
      return Promise.reject(new Error('Unknown url: ' + url));
    });
  });

  test('loads and displays whatsapp sessions and status badges', async () => {
    render(<WhatsappSessions businessId={1} />);

    // Should show loading state first
    expect(screen.getByText('Memuat sesi WhatsApp...')).toBeInTheDocument();

    // Wait for sessions to load
    await waitFor(() => expect(screen.queryByText('Memuat sesi WhatsApp...')).not.toBeInTheDocument());

    // Verify session card details
    expect(screen.getByText('Default Agent')).toBeInTheDocument();
    expect(screen.getByText('+62812345678')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();

    expect(screen.getByText('QR Session')).toBeInTheDocument();
    expect(screen.getByText('Nomor tidak terhubung')).toBeInTheDocument();
    expect(screen.getByText('Scan QR')).toBeInTheDocument();

    // QR image should be rendered
    const qrImage = screen.getByAltText('WhatsApp QR Code');
    expect(qrImage).toBeInTheDocument();
    expect(qrImage.getAttribute('src')).toContain('mock_qr_string_data');
  });

  test('handles adding a new session', async () => {
    render(<WhatsappSessions businessId={1} />);
    await waitFor(() => expect(screen.queryByText('Memuat sesi WhatsApp...')).not.toBeInTheDocument());

    // Click "Tambah Sesi Baru" to open dialog
    fireEvent.click(screen.getByText('Tambah Sesi Baru'));

    // Check dialog content is shown
    expect(screen.getByText('Buat Sesi WhatsApp Baru')).toBeInTheDocument();

    // Fill the form
    const idInput = screen.getByLabelText('ID Sesi (Slug/Kode unik)') as HTMLInputElement;
    const nameInput = screen.getByLabelText('Nama Sesi / Agen') as HTMLInputElement;

    // Test slugification input handler
    fireEvent.change(idInput, { target: { value: 'CS Hampers @2026!' } });
    // Slugify should turn spaces and special chars into hyphens, lowercase
    expect(idInput.value).toBe('cs-hampers--2026-');

    fireEvent.change(nameInput, { target: { value: 'CS Hampers' } });

    // Submit form
    const submitBtn = screen.getByText('Buat Sesi');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(window.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/whatsapp/sessions'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ id: 'cs-hampers--2026-', name: 'CS Hampers', business_id: 1 })
        })
      );
    });

    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Sesi "CS Hampers" berhasil dibuat'));
  });

  test('handles regenerating a session', async () => {
    render(<WhatsappSessions businessId={1} />);
    await waitFor(() => expect(screen.queryByText('Memuat sesi WhatsApp...')).not.toBeInTheDocument());

    // Click "Disconnect & Reset" on default session
    const resetButtons = screen.getAllByText('Disconnect & Reset');
    fireEvent.click(resetButtons[0]);

    await waitFor(() => {
      expect(window.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/whatsapp/sessions/default/regenerate'),
        expect.objectContaining({
          method: 'POST'
        })
      );
    });

    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Sesi di-reset'));
  });

  test('handles deleting a session', async () => {
    render(<WhatsappSessions businessId={1} />);
    await waitFor(() => expect(screen.queryByText('Memuat sesi WhatsApp...')).not.toBeInTheDocument());

    // Click trash button on default session
    const trashButtons = screen.getAllByTitle('Hapus Sesi');
    fireEvent.click(trashButtons[0]);

    // Check delete confirmation dialog is shown
    expect(screen.getByText('Hapus Sesi WhatsApp?')).toBeInTheDocument();

    // Click confirm "Hapus Sesi" inside dialog
    const confirmDeleteBtn = screen.getByRole('button', { name: 'Hapus Sesi' });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(window.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/whatsapp/sessions/default'),
        expect.objectContaining({
          method: 'DELETE'
        })
      );
    });

    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Sesi "Default Agent" berhasil dihapus'));
  });
});
