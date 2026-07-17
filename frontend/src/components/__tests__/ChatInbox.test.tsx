import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import ChatInbox from '../ChatInbox';

const mockCustomers = [
  {
    phone_number: '62812345678@s.whatsapp.net',
    name: 'Alice Cooper',
    contact_phone: '62812345678',
    status: 'lead',
    notes: 'Tertarik kue cokelat',
    ai_enabled: true,
    needs_admin: false,
    last_interaction: '2026-06-25T00:00:00Z'
  },
  {
    phone_number: '62899999999@s.whatsapp.net',
    name: 'Bob Marley',
    contact_phone: '62899999999',
    status: 'customer',
    notes: 'Suka brownies',
    ai_enabled: false,
    needs_admin: true,
    last_interaction: '2026-06-25T00:00:00Z'
  }
];

const mockProducts = [
  {
    id: 'prod-1',
    product_name: 'Marmer Cake Premium',
    price: 150000,
    description: 'Kue marmer super lembut',
    shopee_link: 'https://shopee.co.id/marmer-cake'
  }
];

const mockSessions = [
  { id: 'default', name: 'Default Agent', status: 'connected' }
];

describe('ChatInbox Component', () => {
  const onRefreshDataMock = vi.fn();
  const showToastMock = vi.fn();
  const setSelectedJidMock = vi.fn();
  const setSelectedCustNameMock = vi.fn();
  const setSelectedSessionIdMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();

    // Mock fetch
    window.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/history')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { role: 'user', content: 'Halo, ready brownies?', timestamp: '2026-06-25T00:01:00Z' },
            { role: 'model', content: 'Ready Kak! Silakan diorder.', timestamp: '2026-06-25T00:01:05Z' }
          ])
        } as unknown as Response);
      }
      if (url.includes('/update-details')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'success' })
        } as unknown as Response);
      }
      if (url.includes('/send-message')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'success' })
        } as unknown as Response);
      }
      if (url.includes('/toggle-ai')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'success' })
        } as unknown as Response);
      }
      if (url.includes('/api/customers/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            phone_number: '62812345678@s.whatsapp.net',
            name: 'Alice Cooper',
            ai_enabled: true,
            needs_admin: false,
            status: 'lead',
            notes: 'Tertarik kue cokelat',
            contact_phone: '62812345678'
          })
        } as unknown as Response);
      }
      return Promise.reject(new Error('Unknown url: ' + url));
    });
  });

  test('renders customer list and empty chat state when no customer is selected', () => {
    render(
      <ChatInbox
        customers={mockCustomers}
        products={mockProducts}
        onRefreshData={onRefreshDataMock}
        showToast={showToastMock}
        selectedJid=""
        setSelectedJid={setSelectedJidMock}
        selectedCustName=""
        setSelectedCustName={setSelectedCustNameMock}
        selectedSessionId="default"
        setSelectedSessionId={setSelectedSessionIdMock}
        sessions={mockSessions}
      />
    );

    expect(screen.getByText('Alice Cooper')).toBeInTheDocument();
    expect(screen.getByText('Bob Marley')).toBeInTheDocument();
    expect(screen.getByText('Pilih kustomer di sebelah kiri untuk mulai membaca percakapan.')).toBeInTheDocument();
  });

  test('filters customer list based on search query', () => {
    render(
      <ChatInbox
        customers={mockCustomers}
        products={mockProducts}
        onRefreshData={onRefreshDataMock}
        showToast={showToastMock}
        selectedJid=""
        setSelectedJid={setSelectedJidMock}
        selectedCustName=""
        setSelectedCustName={setSelectedCustNameMock}
        selectedSessionId="default"
        setSelectedSessionId={setSelectedSessionIdMock}
        sessions={mockSessions}
      />
    );

    const searchInput = screen.getByPlaceholderText('Cari kustomer...');
    fireEvent.change(searchInput, { target: { value: 'Alice' } });

    expect(screen.getByText('Alice Cooper')).toBeInTheDocument();
    expect(screen.queryByText('Bob Marley')).not.toBeInTheDocument();
  });

  test('loads active customer details and chat history on selection', async () => {
    const { rerender } = render(
      <ChatInbox
        customers={mockCustomers}
        products={mockProducts}
        onRefreshData={onRefreshDataMock}
        showToast={showToastMock}
        selectedJid=""
        setSelectedJid={setSelectedJidMock}
        selectedCustName=""
        setSelectedCustName={setSelectedCustNameMock}
        selectedSessionId="default"
        setSelectedSessionId={setSelectedSessionIdMock}
        sessions={mockSessions}
      />
    );

    fireEvent.click(screen.getByText('Alice Cooper'));
    expect(setSelectedJidMock).toHaveBeenCalledWith('62812345678@s.whatsapp.net');
    expect(setSelectedCustNameMock).toHaveBeenCalledWith('Alice Cooper');

    rerender(
      <ChatInbox
        customers={mockCustomers}
        products={mockProducts}
        onRefreshData={onRefreshDataMock}
        showToast={showToastMock}
        selectedJid="62812345678@s.whatsapp.net"
        setSelectedJid={setSelectedJidMock}
        selectedCustName="Alice Cooper"
        setSelectedCustName={setSelectedCustNameMock}
        selectedSessionId="default"
        setSelectedSessionId={setSelectedSessionIdMock}
        sessions={mockSessions}
      />
    );

    await waitFor(() => {
      expect(window.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/customers/62812345678%40s.whatsapp.net'));
      expect(window.fetch).toHaveBeenCalledWith(expect.stringContaining('/history'));
    });

    expect(screen.getByText('Halo, ready brownies?')).toBeInTheDocument();
    expect(screen.getByText('Ready Kak! Silakan diorder.')).toBeInTheDocument();
    expect(screen.getByText('Customer CRM')).toBeInTheDocument();
    expect(screen.getByText('Marmer Cake Premium')).toBeInTheDocument();
  });

  test('handles sending manual text message', async () => {
    const { container } = render(
      <ChatInbox
        customers={mockCustomers}
        products={mockProducts}
        onRefreshData={onRefreshDataMock}
        showToast={showToastMock}
        selectedJid="62812345678@s.whatsapp.net"
        setSelectedJid={setSelectedJidMock}
        selectedCustName="Alice Cooper"
        setSelectedCustName={setSelectedCustNameMock}
        selectedSessionId="default"
        setSelectedSessionId={setSelectedSessionIdMock}
        sessions={mockSessions}
      />
    );

    await waitFor(() => expect(screen.getByText('Halo, ready brownies?')).toBeInTheDocument());

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Saya mau pesan 1 box' } });

    const sendBtn = screen.getAllByRole('button').find(
      btn => btn.querySelector('svg.tabler-icon-send') !== null
    );
    expect(sendBtn).toBeDefined();
    fireEvent.click(sendBtn!);

    await waitFor(() => {
      expect(window.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/send-message'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ text: 'Saya mau pesan 1 box', session_id: 'default' })
        })
      );
    });
  });

  test('handles updating customer CRM details and inserting product links', async () => {
    const { container } = render(
      <ChatInbox
        customers={mockCustomers}
        products={mockProducts}
        onRefreshData={onRefreshDataMock}
        showToast={showToastMock}
        selectedJid="62812345678@s.whatsapp.net"
        setSelectedJid={setSelectedJidMock}
        selectedCustName="Alice Cooper"
        setSelectedCustName={setSelectedCustNameMock}
        selectedSessionId="default"
        setSelectedSessionId={setSelectedSessionIdMock}
        sessions={mockSessions}
      />
    );

    await waitFor(() => expect(screen.getByText('Customer CRM')).toBeInTheDocument());

    const notesTextarea = screen.getByPlaceholderText(/Catatan alamat kustomer/) as HTMLTextAreaElement;
    fireEvent.change(notesTextarea, { target: { value: 'Pelanggan setia' } });

    const saveBtn = screen.getByText('Simpan Detail');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(window.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/update-details'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ status: 'lead', notes: 'Pelanggan setia', session_id: 'default' })
        })
      );
    });

    expect(showToastMock).toHaveBeenCalledWith('Detail kustomer berhasil disimpan.');

    const insertLinkBtn = screen.getByTitle('Masukkan link Shopee ke dalam input percakapan');
    fireEvent.click(insertLinkBtn);

    const mainTextarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(mainTextarea.value).toContain('https://shopee.co.id/marmer-cake');
    expect(showToastMock).toHaveBeenCalledWith('Link Shopee dimasukkan ke input.');
  });

  test('polling does not show loading spinner during background refresh', async () => {
    vi.useFakeTimers();

    render(
      <ChatInbox
        customers={mockCustomers}
        products={mockProducts}
        onRefreshData={onRefreshDataMock}
        showToast={showToastMock}
        selectedJid="62812345678@s.whatsapp.net"
        setSelectedJid={setSelectedJidMock}
        selectedCustName="Alice Cooper"
        setSelectedCustName={setSelectedCustNameMock}
        selectedSessionId="default"
        setSelectedSessionId={setSelectedSessionIdMock}
        sessions={mockSessions}
      />
    );

    // Run pending timers to trigger mount effects and resolve fetch promises
    await vi.runOnlyPendingTimersAsync();

    // Verify initial fetch was called
    expect(window.fetch).toHaveBeenCalledWith(expect.stringContaining('/history'));

    // Clear mock calls to focus on polling
    vi.mocked(window.fetch).mockClear();

    // Advance time by 10s (new reduced polling interval) to trigger polling
    await vi.advanceTimersByTimeAsync(10000);

    // Verify polling fetch was called
    expect(window.fetch).toHaveBeenCalledWith(expect.stringContaining('/history'));

    // The loading spinner/text should NOT be visible
    expect(screen.queryByText('Memuat percakapan...')).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  test('handles transitioning to CRM view on mobile UI when CRM button is clicked', async () => {
    const originalInnerWidth = window.innerWidth;
    // Mock mobile viewport width
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 500 });

    render(
      <ChatInbox
        customers={mockCustomers}
        products={mockProducts}
        onRefreshData={onRefreshDataMock}
        showToast={showToastMock}
        selectedJid="62812345678@s.whatsapp.net"
        setSelectedJid={setSelectedJidMock}
        selectedCustName="Alice Cooper"
        setSelectedCustName={setSelectedCustNameMock}
        selectedSessionId="default"
        setSelectedSessionId={setSelectedSessionIdMock}
        sessions={mockSessions}
      />
    );

    await waitFor(() => expect(screen.getByText('Halo, ready brownies?')).toBeInTheDocument());

    const crmButton = screen.getByTitle('Toggle CRM Sidebar');
    fireEvent.click(crmButton);

    // Wait for CRM panel title to be rendered
    await waitFor(() => expect(screen.getByText('Customer CRM')).toBeInTheDocument());

    // Verify it is on mobile view where "Kembali" button should be displayed
    const backBtn = screen.getByText('Kembali');
    expect(backBtn).toBeInTheDocument();

    // Click back button to transition back to chat view
    fireEvent.click(backBtn);

    // Clean up window.innerWidth mock
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: originalInnerWidth });
  });
});
