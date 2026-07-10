import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { RecentActivityTable } from '@/components/dashboard/RecentActivityTable';
import type { Lead, Session } from '@/types';

const mockSessions: Session[] = [
  { id: 'all', name: 'Semua Agen', status: 'connected' },
  { id: 'default', name: 'Default Agent', status: 'connected' },
  { id: 'agent-2', name: 'Agent Two', status: 'disconnected' },
];

function makeLead(
  index: number,
  overrides: Partial<Lead> = {},
): Lead {
  return {
    phone_number: `6281234${String(index).padStart(4, '0')}`,
    session_id: 'default',
    name: `Customer ${index}`,
    last_interaction: new Date(2026, 0, index + 1).toISOString(),
    status: index % 2 === 0 ? 'lead' : 'customer',
    contact_phone: `+6281234${String(index).padStart(4, '0')}`,
    needs_follow_up: index === 0,
    needs_admin: false,
    ...overrides,
  };
}

function makeLeads(count: number, overrides: Partial<Lead> = {}): Lead[] {
  return Array.from({ length: count }, (_, i) =>
    makeLead(i + 1, overrides),
  );
}

describe('RecentActivityTable component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders leads in the table', () => {
    const leads = [
      makeLead(1, { name: 'Alice Wijaya' }),
      makeLead(2, { name: 'Bob Santoso' }),
    ];
    const onSelectCustomer = vi.fn();

    render(
      <RecentActivityTable
        leads={leads}
        sessions={mockSessions}
        onSelectCustomer={onSelectCustomer}
      />,
    );

    expect(screen.getByText('Alice Wijaya')).toBeInTheDocument();
    expect(screen.getByText('Bob Santoso')).toBeInTheDocument();
    expect(
      screen.getByText('Recent Customer Activity'),
    ).toBeInTheDocument();
  });

  test('renders empty state when no leads are provided', () => {
    const onSelectCustomer = vi.fn();

    render(
      <RecentActivityTable
        leads={[]}
        sessions={mockSessions}
        onSelectCustomer={onSelectCustomer}
      />,
    );

    expect(screen.getByText('Belum Ada Aktivitas Kustomer')).toBeInTheDocument();
    expect(
      screen.queryByText('Alice Wijaya'),
    ).not.toBeInTheDocument();
  });

  test('renders empty state when leads is undefined', () => {
    const onSelectCustomer = vi.fn();

    render(
      <RecentActivityTable
        leads={undefined}
        sessions={mockSessions}
        onSelectCustomer={onSelectCustomer}
      />,
    );

    expect(screen.getByText('Belum Ada Aktivitas Kustomer')).toBeInTheDocument();
  });

  test('search input filters leads by name', () => {
    const leads = [
      makeLead(1, { name: 'Alice Wijaya' }),
      makeLead(2, { name: 'Bob Santoso' }),
      makeLead(3, { name: 'Charlie Pratama' }),
    ];
    const onSelectCustomer = vi.fn();

    render(
      <RecentActivityTable
        leads={leads}
        sessions={mockSessions}
        onSelectCustomer={onSelectCustomer}
      />,
    );

    // All three visible initially
    expect(screen.getByText('Alice Wijaya')).toBeInTheDocument();
    expect(screen.getByText('Bob Santoso')).toBeInTheDocument();
    expect(screen.getByText('Charlie Pratama')).toBeInTheDocument();

    // Type search query
    const searchInput = screen.getByPlaceholderText('Cari nama atau nomor...');
    fireEvent.change(searchInput, { target: { value: 'Alice' } });

    // Only Alice should be visible
    expect(screen.getByText('Alice Wijaya')).toBeInTheDocument();
    expect(screen.queryByText('Bob Santoso')).not.toBeInTheDocument();
    expect(screen.queryByText('Charlie Pratama')).not.toBeInTheDocument();
  });

  test('search input filters leads by phone number', () => {
    const leads = [
      makeLead(1, { name: 'Alice', phone_number: '62811111111' }),
      makeLead(2, { name: 'Bob', phone_number: '62822222222' }),
    ];
    const onSelectCustomer = vi.fn();

    render(
      <RecentActivityTable
        leads={leads}
        sessions={mockSessions}
        onSelectCustomer={onSelectCustomer}
      />,
    );

    const searchInput = screen.getByPlaceholderText('Cari nama atau nomor...');
    fireEvent.change(searchInput, { target: { value: '628111' } });

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
  });

  test('status filter works correctly', () => {
    const leads = [
      makeLead(1, { name: 'Alice', status: 'lead' }),
      makeLead(2, { name: 'Bob', status: 'customer' }),
      makeLead(3, { name: 'Charlie', status: 'lead' }),
    ];
    const onSelectCustomer = vi.fn();

    render(
      <RecentActivityTable
        leads={leads}
        sessions={mockSessions}
        onSelectCustomer={onSelectCustomer}
      />,
    );

    // All visible initially
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();

    // Filter by 'customer' status — the status filter select has "All Status" as default
    const statusSelect = screen.getByDisplayValue('All Status');
    fireEvent.change(statusSelect, { target: { value: 'customer' } });

    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    expect(screen.queryByText('Charlie')).not.toBeInTheDocument();
  });

  test('shows no results message when filter yields nothing', () => {
    const leads = [makeLead(1, { name: 'Alice' })];
    const onSelectCustomer = vi.fn();

    render(
      <RecentActivityTable
        leads={leads}
        sessions={mockSessions}
        onSelectCustomer={onSelectCustomer}
      />,
    );

    const searchInput = screen.getByPlaceholderText('Cari nama atau nomor...');
    fireEvent.change(searchInput, { target: { value: 'NonExistentName' } });

    expect(screen.getByText('Tidak Ada Hasil')).toBeInTheDocument();
  });

  test('pagination controls appear when there are more than 8 leads', () => {
    const leads = makeLeads(10);
    const onSelectCustomer = vi.fn();

    render(
      <RecentActivityTable
        leads={leads}
        sessions={mockSessions}
        onSelectCustomer={onSelectCustomer}
      />,
    );

    // Pagination should be visible
    expect(screen.getByText('Sebelumnya')).toBeInTheDocument();
    expect(screen.getByText('Berikutnya')).toBeInTheDocument();
    // Page indicator "1 / 2" (10 leads / 8 per page = 2 pages)
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  test('pagination controls do not appear when there are 8 or fewer leads', () => {
    const leads = makeLeads(5);
    const onSelectCustomer = vi.fn();

    render(
      <RecentActivityTable
        leads={leads}
        sessions={mockSessions}
        onSelectCustomer={onSelectCustomer}
      />,
    );

    expect(screen.queryByText('Sebelumnya')).not.toBeInTheDocument();
    expect(screen.queryByText('Berikutnya')).not.toBeInTheDocument();
  });

  test('clicking next page shows the next set of leads', () => {
    const leads = makeLeads(10);
    const onSelectCustomer = vi.fn();

    render(
      <RecentActivityTable
        leads={leads}
        sessions={mockSessions}
        onSelectCustomer={onSelectCustomer}
      />,
    );

    // First page: Customer 1 through Customer 8
    expect(screen.getByText('Customer 1')).toBeInTheDocument();
    expect(screen.queryByText('Customer 9')).not.toBeInTheDocument();

    // Click next
    fireEvent.click(screen.getByText('Berikutnya'));

    // Second page: Customer 9 and Customer 10
    expect(screen.getByText('Customer 9')).toBeInTheDocument();
    expect(screen.queryByText('Customer 1')).not.toBeInTheDocument();
  });

  test('previous page button is disabled on first page', () => {
    const leads = makeLeads(10);
    const onSelectCustomer = vi.fn();

    render(
      <RecentActivityTable
        leads={leads}
        sessions={mockSessions}
        onSelectCustomer={onSelectCustomer}
      />,
    );

    const prevButton = screen.getByText('Sebelumnya').closest('button');
    expect(prevButton).toBeDisabled();
  });

  test('clicking a row calls onSelectCustomer with correct arguments', () => {
    const leads = [
      makeLead(1, { name: 'Alice Wijaya', phone_number: '62811111111' }),
    ];
    const onSelectCustomer = vi.fn();

    render(
      <RecentActivityTable
        leads={leads}
        sessions={mockSessions}
        onSelectCustomer={onSelectCustomer}
      />,
    );

    // Find the table row containing 'Alice Wijaya' and click it
    const row = screen.getByText('Alice Wijaya').closest('tr');
    expect(row).not.toBeNull();
    fireEvent.click(row!);

    expect(onSelectCustomer).toHaveBeenCalledTimes(1);
    expect(onSelectCustomer).toHaveBeenCalledWith(
      '62811111111',
      'Alice Wijaya',
      'default',
    );
  });

  test('clicking a row calls onSelectCustomer with "Customer" when name is undefined', () => {
    const leads = [
      makeLead(1, { name: undefined, phone_number: '62899999999' }),
    ];
    const onSelectCustomer = vi.fn();

    render(
      <RecentActivityTable
        leads={leads}
        sessions={mockSessions}
        onSelectCustomer={onSelectCustomer}
      />,
    );

    // "Customer" appears in <option>, <th>, and <td> — target the td cell specifically
    const customerCells = screen.getAllByRole('cell').filter(
      (cell) => cell.textContent === 'Customer',
    );
    expect(customerCells.length).toBe(1);
    const row = customerCells[0].closest('tr');
    expect(row).not.toBeNull();
    fireEvent.click(row!);

    expect(onSelectCustomer).toHaveBeenCalledWith(
      '62899999999',
      'Customer',
      'default',
    );
  });

  test('renders needs follow-up badge correctly', () => {
    const leads = [
      makeLead(1, { name: 'Alice', needs_follow_up: true }),
      makeLead(2, { name: 'Bob', needs_follow_up: false }),
    ];
    const onSelectCustomer = vi.fn();

    render(
      <RecentActivityTable
        leads={leads}
        sessions={mockSessions}
        onSelectCustomer={onSelectCustomer}
      />,
    );

    // Alice row should have "Yes" badge
    expect(screen.getByText('Yes')).toBeInTheDocument();
    // Bob row should have "No" badge
    expect(screen.getByText('No')).toBeInTheDocument();
  });

  test('renders WhatsApp agent name badge for each lead', () => {
    const leads = [
      makeLead(1, { name: 'Alice', session_id: 'default' }),
      makeLead(2, { name: 'Bob', session_id: 'agent-2' }),
    ];
    const onSelectCustomer = vi.fn();

    render(
      <RecentActivityTable
        leads={leads}
        sessions={mockSessions}
        onSelectCustomer={onSelectCustomer}
      />,
    );

    // Session name badges should appear
    expect(screen.getByText('Default Agent')).toBeInTheDocument();
    expect(screen.getByText('Agent Two')).toBeInTheDocument();
  });
});
