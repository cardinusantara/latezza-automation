import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import AdsReport from '../AdsReport';
import { toast } from 'sonner';

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }
}));

// Mock EventSource
class MockEventSource {
  url: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((err: Event) => void) | null = null;
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  static instances: MockEventSource[] = [];
  static clear() {
    MockEventSource.instances = [];
  }
}

describe('AdsReport Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockEventSource.clear();
    const win = window as unknown as Record<string, unknown>;
    win.EventSource = MockEventSource;

    // Mock fetch
    window.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/report-html')) {
        if (options?.method === 'HEAD') {
          return Promise.resolve({
            status: 200,
            ok: true
          } as unknown as Response);
        }
      }
      if (url.includes('/api/ads-csv-status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            status: 'success',
            exists: true,
            dataSource: 'api',
            metadata: {
              filename: 'ads_test.csv',
              rows: 150,
              uploadedAt: '2026-06-25T00:00:00Z',
              size: 2048
            }
          })
        } as unknown as Response);
      }
      if (url.includes('/api/ads-data-source')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'success' })
        } as unknown as Response);
      }
      if (url.includes('/trigger-analysis')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'success' })
        } as unknown as Response);
      }
      if (url.includes('/api/upload-ads-csv')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'success', message: 'Upload sukses!' })
        } as unknown as Response);
      }
      return Promise.reject(new Error('Unknown url: ' + url));
    });
  });

  afterEach(() => {
    const win = window as unknown as Record<string, unknown>;
    delete win.EventSource;
  });

  test('checks report status and renders iframe if report exists', async () => {
    render(<AdsReport />);

    expect(screen.getByText('Memeriksa status laporan...')).toBeInTheDocument();

    await waitFor(() => expect(screen.queryByText('Memeriksa status laporan...')).not.toBeInTheDocument());

    const iframe = screen.getByTitle('Meta Ads Performance Report');
    expect(iframe).toBeInTheDocument();
    expect(iframe.getAttribute('src')).toContain('/report-html?t=');

    expect(screen.getByText('Meta Ads Report Dashboard')).toBeInTheDocument();
    expect(screen.getByText('ads_test.csv')).toBeInTheDocument();
  });

  test('renders "Laporan Belum Digenerate" if report does not exist', async () => {
    window.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/report-html') && options?.method === 'HEAD') {
        return Promise.resolve({
          status: 404,
          ok: false
        } as unknown as Response);
      }
      if (url.includes('/api/ads-csv-status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'success', exists: false, dataSource: 'api' })
        } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({})
      } as unknown as Response);
    });

    render(<AdsReport />);
    await waitFor(() => expect(screen.queryByText('Memeriksa status laporan...')).not.toBeInTheDocument());

    expect(screen.getByText('Laporan Belum Digenerate')).toBeInTheDocument();
    expect(screen.getByText('Generate Laporan Pertama')).toBeInTheDocument();
  });

  test('handles preset date changes', async () => {
    render(<AdsReport />);
    await waitFor(() => expect(screen.queryByText('Memeriksa status laporan...')).not.toBeInTheDocument());

    const btn30 = screen.getByText('30 Hari');
    fireEvent.click(btn30);
    expect(btn30).toHaveClass('text-emerald-400');
  });

  test('handles switching data source (api / csv)', async () => {
    render(<AdsReport />);
    await waitFor(() => expect(screen.queryByText('Memeriksa status laporan...')).not.toBeInTheDocument());

    const csvBtn = screen.getByText('CSV');
    fireEvent.click(csvBtn);

    await waitFor(() => {
      expect(window.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/ads-data-source'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ source: 'csv' })
        })
      );
    });
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Sumber data diubah ke: CSV'));
  });

  test('handles sending report to WhatsApp', async () => {
    render(<AdsReport />);
    await waitFor(() => expect(screen.queryByText('Memeriksa status laporan...')).not.toBeInTheDocument());

    const waBtn = screen.getByText('Kirim ke WhatsApp');
    fireEvent.click(waBtn);

    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining('Sedang mengirim ringkasan laporan'));
    await waitFor(() => {
      expect(window.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/trigger-analysis'),
        expect.objectContaining({
          method: 'POST'
        })
      );
    });
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Pesan ringkasan laporan berhasil dipicu'));
  });

  test('handles uploading CSV files', async () => {
    const { container } = render(<AdsReport />);
    await waitFor(() => expect(screen.queryByText('Memeriksa status laporan...')).not.toBeInTheDocument());

    const file = new File(['ads,spend,clicks\ncampaign1,100,50'], 'test.csv', { type: 'text/csv' });
    
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();
    
    fireEvent.change(fileInput, { target: { files: [file] } });

    const uploadBtn = screen.getByText('Upload');
    fireEvent.click(uploadBtn);

    await waitFor(() => {
      expect(window.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/upload-ads-csv'),
        expect.objectContaining({
          method: 'POST'
        })
      );
    });
    expect(toast.success).toHaveBeenCalledWith('Upload sukses!');
  });

  test('handles running analysis and receiving real-time logs via EventSource', async () => {
    const { container } = render(<AdsReport />);
    await waitFor(() => expect(screen.queryByText('Memeriksa status laporan...')).not.toBeInTheDocument());

    const runBtn = screen.getByText('Regenerate Report');
    fireEvent.click(runBtn);

    expect(MockEventSource.instances).toHaveLength(1);
    const es = MockEventSource.instances[0];
    expect(es.url).toContain('/api/run-analysis-stream');

    es.onmessage!({
      data: JSON.stringify({ type: 'status', message: 'Mempersiapkan analisis...' })
    } as MessageEvent);
    expect(screen.getByText('Membaca konfigurasi & rentang tanggal')).toBeInTheDocument();

    es.onmessage!({
      data: JSON.stringify({ type: 'chunk', text: 'Processing row 1...\n' })
    } as MessageEvent);
    
    await waitFor(() => {
      const preElement = container.querySelector('#ads-streaming-pre');
      expect(preElement?.textContent).toContain('Processing row 1...');
    });

    es.onmessage!({
      data: JSON.stringify({ type: 'done' })
    } as MessageEvent);

    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Analisis iklan berhasil diselesaikan'));
  });
});
