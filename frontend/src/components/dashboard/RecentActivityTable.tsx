import { useState, useMemo, memo, useCallback } from 'react';
import {
  IconSearch,
  IconAlertCircle,
  IconUsers,
} from '@tabler/icons-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { Lead, Session } from '@/types';

interface RecentActivityTableProps {
  leads: Lead[] | undefined;
  sessions: Session[];
  onSelectCustomer: (phone_number: string, name: string, sessionId: string) => void;
}

const PAGE_SIZE = 8;

const getBadgeVariant = (status?: string) => {
  if (status === 'customer') return 'default';
  if (status === 'lead') return 'secondary';
  return 'outline';
};

function RecentActivityTableInner({ leads, sessions, onSelectCustomer }: Readonly<RecentActivityTableProps>) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(0);

  const filteredLeads = useMemo(() => {
    if (!leads) return [];
    return leads.filter((lead) => {
      const matchesSearch =
        !searchQuery ||
        lead.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lead.phone_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lead.contact_phone?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [leads, searchQuery, statusFilter]);

  const totalPages = Math.ceil(filteredLeads.length / PAGE_SIZE);
  const safeCurrentPage = Math.min(currentPage, Math.max(0, totalPages - 1));
  const paginatedLeads = useMemo(() => {
    const start = safeCurrentPage * PAGE_SIZE;
    return filteredLeads.slice(start, start + PAGE_SIZE);
  }, [filteredLeads, safeCurrentPage]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(0);
  }, []);

  const handleStatusChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(e.target.value);
    setCurrentPage(0);
  }, []);

  const handlePrevPage = useCallback(() => {
    setCurrentPage(prev => Math.max(0, prev - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setCurrentPage(prev => Math.min(totalPages - 1, prev + 1));
  }, [totalPages]);

  const hasLeads = leads && leads.length > 0;
  const hasFilteredResults = filteredLeads.length > 0;

  return (
    <Card className="bg-card border-border shadow-sm">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 space-y-0">
        <CardTitle className="text-lg font-semibold text-foreground">Recent Customer Activity</CardTitle>
        {hasLeads && (
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            {/* Search */}
            <div className="relative">
              <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder="Cari nama atau nomor..."
                className="h-8 pl-9 text-xs w-full sm:w-[200px] bg-background border-border"
              />
            </div>
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={handleStatusChange}
              className="h-8 rounded-lg border border-border bg-background px-3 text-xs text-foreground font-medium outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="lead">Lead</option>
              <option value="customer">Customer</option>
            </select>
          </div>
        )}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {/* Empty State */}
        {!hasLeads && (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <div className="p-4 rounded-full bg-muted/40 text-muted-foreground/60">
              <IconUsers size={32} />
            </div>
            <span className="text-sm font-medium text-foreground">Belum Ada Aktivitas Kustomer</span>
            <span className="text-xs text-muted-foreground max-w-sm">
              Aktivitas pelanggan akan muncul di sini setelah WhatsApp AI Agent mulai menerima pesan.
            </span>
          </div>
        )}

        {/* No Results After Filter */}
        {hasLeads && !hasFilteredResults && (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
            <IconSearch size={24} className="text-muted-foreground/60" />
            <span className="text-sm font-medium text-foreground">Tidak Ada Hasil</span>
            <span className="text-xs text-muted-foreground">Coba ubah kata kunci atau filter status.</span>
          </div>
        )}

        {/* Table */}
        {hasFilteredResults && (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[220px]">Customer</TableHead>
                  <TableHead>WhatsApp Agent</TableHead>
                  <TableHead>Actual Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Needs Follow-up</TableHead>
                  <TableHead className="text-right">Last Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedLeads.map((lead) => {
                  const timeStr = lead.last_interaction
                    ? new Date(lead.last_interaction).toLocaleString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit',
                        day: 'numeric',
                        month: 'short',
                      })
                    : '-';
                  return (
                    <TableRow
                      key={`${lead.phone_number}-${lead.session_id}`}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => onSelectCustomer(lead.phone_number, lead.name || 'Customer', lead.session_id)}
                    >
                      <TableCell className="font-semibold text-foreground flex items-center gap-2">
                        {lead.name || 'Customer'}
                        {lead.needs_admin && (
                          <Badge variant="destructive" className="flex items-center gap-1 text-[10px] py-0.5 px-2 animate-pulse">
                            <IconAlertCircle size={10} /> Butuh Admin
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-[11px] font-semibold">
                          {sessions.find(s => s.id === lead.session_id)?.name || lead.session_id || 'Default'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs text-blue-400">
                          {lead.contact_phone || '-'}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={getBadgeVariant(lead.status)}
                          className="capitalize"
                        >
                          {lead.status || 'lead'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={lead.needs_follow_up ? 'destructive' : 'outline'}
                        >
                          {lead.needs_follow_up ? 'Yes' : 'No'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{timeStr}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <span className="text-xs text-muted-foreground">
                  Menampilkan {safeCurrentPage * PAGE_SIZE + 1}-{Math.min((safeCurrentPage + 1) * PAGE_SIZE, filteredLeads.length)} dari {filteredLeads.length}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrevPage}
                    disabled={safeCurrentPage === 0}
                    className="h-8 text-xs"
                  >
                    Sebelumnya
                  </Button>
                  <span className="text-xs text-muted-foreground self-center px-2">
                    {safeCurrentPage + 1} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextPage}
                    disabled={safeCurrentPage >= totalPages - 1}
                    className="h-8 text-xs"
                  >
                    Berikutnya
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export const RecentActivityTable = memo(RecentActivityTableInner);
