import { useState, useEffect } from 'react';
import { 
  IconUsers, 
  IconCookie, 
  IconClock, 
  IconMessageDots,
  IconAlertCircle,
  IconSparkles,
  IconRefresh,
  IconLoader,
  IconCalendar
} from '@tabler/icons-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { API_BASE_URL } from '@/config';

interface Lead {
  phone_number: string;
  session_id: string;
  name?: string;
  contact_phone?: string;
  status?: string;
  needs_follow_up?: boolean;
  needs_admin?: boolean;
  last_interaction: string;
}

interface Stats {
  totalLeads?: number;
  totalProducts?: number;
  pendingFollowUps?: number;
  incomingMessages?: { last24h: number; last7d: number; last30d: number };
  newLeads?: { last24h: number; last7d: number; last30d: number };
  recentLeads?: Lead[];
}

interface MessageSummaryData {
  generatedAt: string;
  dateRange: string;
  sessionId: string;
  totalMessages: number;
  totalCustomers: number;
  summary: {
    totalCustomers: number;
    topProducts: string[];
    commonQuestions: string[];
    complaints: string[];
    salesOpportunities: string[];
    insights: string[];
  };
}

interface OverviewProps {
  stats: Stats;
  sessions: { id: string; name: string; status: string }[];
  overviewSessionId: string;
  setOverviewSessionId: (id: string) => void;
  onSelectCustomer: (phone_number: string, name: string, sessionId: string) => void;
}

export default function Overview({ stats, sessions, overviewSessionId, setOverviewSessionId, onSelectCustomer }: OverviewProps) {
  const [summaryData, setSummaryData] = useState<MessageSummaryData | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [selectedRange, setSelectedRange] = useState<'today' | '3d' | '7d' | '30d'>('today');
  const [streamProgress, setStreamProgress] = useState<string[]>([]);

  const loadExistingSummary = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/message-summary`);
      if (res.ok) {
        const data = await res.json();
        setSummaryData(data);
      }
    } catch (err) {
      console.error('Failed to load existing message summary:', err);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadExistingSummary();
  }, []);

  const getDateRangeLabel = (range: string) => {
    switch (range) {
      case 'today': return 'Hari Ini';
      case '3d': return '3 Hari Terakhir';
      case '7d': return '7 Hari Terakhir';
      case '30d': return '30 Hari Terakhir';
      default: return range;
    }
  };

  const handleGenerateSummary = () => {
    setSummaryLoading(true);
    setStreamProgress(['Menghubungi AI Agent...']);
    setSummaryData(null);

    const url = `${API_BASE_URL}/api/trigger-message-summary-stream?session_id=${overviewSessionId}&date_range=${selectedRange}`;
    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type === 'status') {
          setStreamProgress(prev => [...prev, parsed.message]);
        } else if (parsed.type === 'done') {
          setSummaryData(parsed.data);
          setSummaryLoading(false);
          eventSource.close();
        } else if (parsed.type === 'error') {
          setStreamProgress(prev => [...prev, `❌ Error: ${parsed.message}`]);
          setSummaryLoading(false);
          eventSource.close();
        }
      } catch (err) {
        console.error('Error parsing SSE event:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('EventSource failed:', err);
      setStreamProgress(prev => [...prev, '❌ Koneksi terputus. Silakan coba lagi.']);
      setSummaryLoading(false);
      eventSource.close();
    };
  };

  const kpis = [
    {
      title: 'Total Leads',
      value: stats.totalLeads !== undefined ? stats.totalLeads : '-',
      icon: <IconUsers size={20} />,
      iconClass: 'bg-purple-500/10 text-purple-400'
    },
    {
      title: 'Products',
      value: stats.totalProducts !== undefined ? stats.totalProducts : '-',
      icon: <IconCookie size={20} />,
      iconClass: 'bg-blue-500/10 text-blue-400'
    },
    {
      title: 'Pending Follow-ups',
      value: stats.pendingFollowUps !== undefined ? stats.pendingFollowUps : '-',
      icon: <IconClock size={20} />,
      iconClass: 'bg-amber-500/10 text-amber-400'
    },
    {
      title: 'Incoming Messages',
      value: stats.incomingMessages ? stats.incomingMessages.last24h : '-',
      subStats: stats.incomingMessages ? { last7d: stats.incomingMessages.last7d, last30d: stats.incomingMessages.last30d } : null,
      icon: <IconMessageDots size={20} />,
      iconClass: 'bg-emerald-500/10 text-emerald-400'
    },
    {
      title: 'New Leads',
      value: stats.newLeads ? stats.newLeads.last24h : '-',
      subStats: stats.newLeads ? { last7d: stats.newLeads.last7d, last30d: stats.newLeads.last30d } : null,
      icon: <IconUsers size={20} />,
      iconClass: 'bg-indigo-500/10 text-indigo-400'
    }
  ];

  return (
    <div className="flex flex-col gap-8">
      {/* Session Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-card border border-border p-4 rounded-xl shadow-sm">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">WhatsApp Agent Filter</span>
          <span className="text-[11px] text-muted-foreground">Select a specific agent session to filter KPIs and activity log</span>
        </div>
        <select
          value={overviewSessionId}
          onChange={(e) => setOverviewSessionId(e.target.value)}
          className="bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground font-medium outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors cursor-pointer w-full sm:w-[220px]"
        >
          <option value="all">All Agent Sessions</option>
          {sessions.map(s => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.status === 'connected' ? '🟢 Connected' : '🔴 Offline'})
            </option>
          ))}
        </select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
        {kpis.map((kpi, idx) => (
          <Card key={idx} className="bg-card border-border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <span className="text-sm font-medium text-muted-foreground">{kpi.title}</span>
              <div className={`p-2 rounded-lg ${kpi.iconClass}`}>
                {kpi.icon}
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{kpi.value}</div>
              {kpi.subStats && (
                <div className="flex gap-2 mt-1.5 text-[10px] text-muted-foreground font-medium">
                  <span>7d: {kpi.subStats.last7d}</span>
                  <span className="text-border">|</span>
                  <span>30d: {kpi.subStats.last30d}</span>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* AI Summary Section */}
      <Card className="bg-card border-border shadow-sm">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border/60 space-y-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <IconSparkles size={20} className="animate-pulse" />
            </div>
            <div className="flex flex-col gap-0.5">
              <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
                AI Customer Insights
                {summaryData && (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px] py-0 px-2 font-medium">
                    Tersedia
                  </Badge>
                )}
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                Ringkasan otomatis tren percakapan, produk populer, dan keluhan pelanggan.
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <select
              value={selectedRange}
              onChange={(e) => setSelectedRange(e.target.value as 'today' | '3d' | '7d' | '30d')}
              disabled={summaryLoading}
              className="bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground font-medium outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors cursor-pointer"
            >
              <option value="today">Hari Ini</option>
              <option value="3d">3 Hari Terakhir</option>
              <option value="7d">7 Hari Terakhir</option>
              <option value="30d">30 Hari Terakhir</option>
            </select>
            <Button
              onClick={handleGenerateSummary}
              disabled={summaryLoading}
              size="sm"
              className="h-8 text-xs font-semibold px-4 gap-1.5"
            >
              {summaryLoading ? (
                <>
                  <IconLoader size={14} className="animate-spin" />
                  Menganalisis...
                </>
              ) : (
                <>
                  <IconRefresh size={14} />
                  Generate Summary
                </>
              )}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          {summaryLoading && (
            <div className="flex flex-col gap-4 py-8">
              <div className="flex flex-col items-center justify-center gap-3 text-center">
                <IconLoader size={36} className="animate-spin text-primary" />
                <span className="text-sm font-semibold text-foreground">Sedang Menganalisis Percakapan</span>
                <span className="text-xs text-muted-foreground max-w-md">
                  Gemini AI sedang membaca pesan pelanggan, mengelompokkan kategori, dan menyusun insights report...
                </span>
              </div>
              <div className="mt-4 bg-background border border-border/80 rounded-xl p-4 max-h-[150px] overflow-y-auto font-mono text-[11px] text-muted-foreground leading-relaxed">
                {streamProgress.map((msg, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-primary/70">›</span>
                    <span>{msg}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!summaryLoading && !summaryData && (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
              <div className="p-4 rounded-full bg-muted/40 text-muted-foreground/60">
                <IconCalendar size={32} />
              </div>
              <span className="text-sm font-medium text-foreground">Belum Ada Rangkuman Analisis</span>
              <span className="text-xs text-muted-foreground max-w-sm">
                Klik tombol "Generate Summary" untuk merangkum percakapan pelanggan dari AI agent.
              </span>
            </div>
          )}

          {!summaryLoading && summaryData && (
            <div className="flex flex-col gap-6">
              {/* Metadata Badge */}
              <div className="flex flex-wrap gap-3 items-center justify-between text-xs border-b border-border/40 pb-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>Range: <strong className="text-foreground">{getDateRangeLabel(summaryData.dateRange)}</strong></span>
                  <span className="text-border">|</span>
                  <span>Total Pesan: <strong className="text-foreground">{summaryData.totalMessages}</strong></span>
                  <span className="text-border">|</span>
                  <span>Pelanggan Aktif: <strong className="text-foreground">{summaryData.totalCustomers}</strong></span>
                </div>
                <span className="text-[10px] text-muted-foreground font-medium bg-muted/60 border border-border/50 rounded-full px-2.5 py-0.5">
                  Last updated: {new Date(summaryData.generatedAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </div>

              {/* Grid of Categories */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Top Products */}
                <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-5 flex flex-col gap-3">
                  <div className="flex items-center gap-2.5 text-emerald-400 font-semibold text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Produk Paling Diminati
                  </div>
                  {summaryData.summary.topProducts.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">Tidak ada data produk spesifik.</span>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {summaryData.summary.topProducts.map((p, i) => (
                        <li key={i} className="text-xs text-foreground/90 flex gap-2 items-start leading-relaxed">
                          <span className="text-emerald-400 font-bold">•</span>
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Common Questions */}
                <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-5 flex flex-col gap-3">
                  <div className="flex items-center gap-2.5 text-blue-400 font-semibold text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    Pertanyaan Paling Banyak Ditanyakan
                  </div>
                  {summaryData.summary.commonQuestions.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">Tidak ada data pertanyaan.</span>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {summaryData.summary.commonQuestions.map((q, i) => (
                        <li key={i} className="text-xs text-foreground/90 flex gap-2 items-start leading-relaxed">
                          <span className="text-blue-400 font-bold">•</span>
                          <span>{q}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Complaints */}
                <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-5 flex flex-col gap-3">
                  <div className="flex items-center gap-2.5 text-rose-400 font-semibold text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                    Keluhan atau Kendala Pelanggan
                  </div>
                  {summaryData.summary.complaints.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">Tidak ada keluhan terdeteksi. 👍</span>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {summaryData.summary.complaints.map((c, i) => (
                        <li key={i} className="text-xs text-foreground/90 flex gap-2 items-start leading-relaxed">
                          <span className="text-rose-400 font-bold">•</span>
                          <span>{c}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Sales Opportunities */}
                <div className="bg-purple-500/5 border border-purple-500/10 rounded-xl p-5 flex flex-col gap-3">
                  <div className="flex items-center gap-2.5 text-purple-400 font-semibold text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                    Peluang Penjualan (Opportunities)
                  </div>
                  {summaryData.summary.salesOpportunities.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">Tidak ada peluang spesifik terdeteksi.</span>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {summaryData.summary.salesOpportunities.map((o, i) => (
                        <li key={i} className="text-xs text-foreground/90 flex gap-2 items-start leading-relaxed">
                          <span className="text-purple-400 font-bold">•</span>
                          <span>{o}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

              </div>

              {/* Insights Section */}
              <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-xl p-5 flex flex-col gap-3">
                <div className="flex items-center gap-2.5 text-indigo-400 font-semibold text-sm">
                  💡 Rekomendasi & Insights Analitis
                </div>
                {summaryData.summary.insights.length === 0 ? (
                  <span className="text-xs text-muted-foreground italic">Tidak ada insights.</span>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {summaryData.summary.insights.map((ins, i) => (
                      <li key={i} className="text-xs text-foreground/90 flex gap-2 items-start leading-relaxed">
                        <span className="text-indigo-400 font-bold">•</span>
                        <span>{ins}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Activity Table */}
      <Card className="bg-card border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-foreground">Recent Customer Activity</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
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
              {!stats.recentLeads || stats.recentLeads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    Belum ada aktivitas kustomer.
                  </TableCell>
                </TableRow>
              ) : (
                stats.recentLeads.map((lead) => {
                  const timeStr = new Date(lead.last_interaction).toLocaleString('id-ID', { 
                    hour: '2-digit', 
                    minute: '2-digit', 
                    day: 'numeric', 
                    month: 'short' 
                  });
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
                          variant={
                            lead.status === 'customer' 
                              ? 'default' 
                              : lead.status === 'lead' 
                              ? 'secondary' 
                              : 'outline'
                          }
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
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
