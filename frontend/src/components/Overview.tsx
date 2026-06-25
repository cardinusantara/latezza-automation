import { useState, useEffect, useMemo } from 'react';
import { 
  IconUsers, 
  IconCookie, 
  IconClock, 
  IconMessageDots,
  IconAlertCircle,
  IconSparkles,
  IconRefresh,
  IconLoader,
  IconCalendar,
  IconCreditCard,
  IconCoins,
  IconChartBar
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

interface MtdStats {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costUsd: number;
  costIdr: number;
  totalRequests: number;
}

interface DailyTrendItem {
  date: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cost_idr: number;
  request_count: number;
}

interface FeatureBreakdownItem {
  feature: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cost_idr: number;
  request_count: number;
}

interface UsageStatsData {
  status: string;
  mtd: MtdStats;
  dailyTrend: DailyTrendItem[];
  featureBreakdown: FeatureBreakdownItem[];
}

interface OverviewProps {
  stats: Stats;
  sessions: { id: string; name: string; status: string }[];
  overviewSessionId: string;
  setOverviewSessionId: (id: string) => void;
  onSelectCustomer: (phone_number: string, name: string, sessionId: string) => void;
}

export default function Overview({ stats, sessions, overviewSessionId, setOverviewSessionId, onSelectCustomer }: Readonly<OverviewProps>) {
  const [summaryData, setSummaryData] = useState<MessageSummaryData | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [selectedRange, setSelectedRange] = useState<'today' | '3d' | '7d' | '30d'>('today');
  const [streamProgress, setStreamProgress] = useState<string[]>([]);

  // Usage & cost billing states
  const [usageStats, setUsageStats] = useState<UsageStatsData | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);

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

  const loadUsageStats = async () => {
    setUsageLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/settings/usage-stats`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success') {
          setUsageStats(data);
        }
      }
    } catch (err) {
      console.error('Failed to load Gemini usage stats:', err);
    } finally {
      setUsageLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadExistingSummary();
    loadUsageStats();
  }, []);



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

  const kpis = buildKpis(stats, usageStats ?? {});

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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
        {kpis.map((kpi) => (
          <Card key={kpi.title} className="bg-card border-border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <span className="text-sm font-medium text-muted-foreground">{kpi.title}</span>
              <div className={`p-2 rounded-lg ${kpi.iconClass}`}>
                {kpi.icon}
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground truncate">{kpi.value}</div>
              {kpi.subStats && (
                <div className="flex gap-2 mt-1.5 text-[10px] text-muted-foreground font-medium">
                  <span>{kpi.subStats.label1}: {kpi.subStats.val1}</span>
                  <span className="text-border">|</span>
                  <span>{kpi.subStats.label2}: {kpi.subStats.val2}</span>
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
                  <div key={`progress-${msg}-${i}`} className="flex gap-2">
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
                    <span>Produk Paling Diminati</span>
                  </div>
                  {summaryData.summary.topProducts.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">Tidak ada data produk spesifik.</span>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {summaryData.summary.topProducts.map((p) => (
                        <li key={p} className="text-xs text-foreground/90 flex gap-2 items-start leading-relaxed">
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
                    <span>Pertanyaan Paling Banyak Ditanyakan</span>
                  </div>
                  {summaryData.summary.commonQuestions.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">Tidak ada data pertanyaan.</span>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {summaryData.summary.commonQuestions.map((q) => (
                        <li key={q} className="text-xs text-foreground/90 flex gap-2 items-start leading-relaxed">
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
                    <span>Keluhan atau Kendala Pelanggan</span>
                  </div>
                  {summaryData.summary.complaints.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">Tidak ada keluhan terdeteksi. 👍</span>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {summaryData.summary.complaints.map((c) => (
                        <li key={c} className="text-xs text-foreground/90 flex gap-2 items-start leading-relaxed">
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
                    <span>Peluang Penjualan (Opportunities)</span>
                  </div>
                  {summaryData.summary.salesOpportunities.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">Tidak ada peluang spesifik terdeteksi.</span>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {summaryData.summary.salesOpportunities.map((o) => (
                        <li key={o} className="text-xs text-foreground/90 flex gap-2 items-start leading-relaxed">
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
                    {summaryData.summary.insights.map((ins) => (
                      <li key={ins} className="text-xs text-foreground/90 flex gap-2 items-start leading-relaxed">
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

      {/* Gemini API Usage & Cost Analytics */}
      <GeminiAnalyticsPanel 
        usageStats={usageStats} 
        usageLoading={usageLoading} 
        loadUsageStats={loadUsageStats} 
      />

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
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// Pure helper functions defined outside the components
const getDateRangeLabel = (range: string) => {
  switch (range) {
    case 'today': return 'Hari Ini';
    case '3d': return '3 Hari Terakhir';
    case '7d': return '7 Hari Terakhir';
    case '30d': return '30 Hari Terakhir';
    default: return range;
  }
};

const getBadgeVariant = (status?: string) => {
  if (status === 'customer') return 'default';
  if (status === 'lead') return 'secondary';
  return 'outline';
};

interface OverviewStats {
  totalLeads?: number;
  totalProducts?: number;
  pendingFollowUps?: number;
  incomingMessages?: { last24h: number; last7d: number; last30d: number };
  newLeads?: { last24h: number; last7d: number; last30d: number };
}

interface OverviewUsageStats {
  mtd?: {
    costIdr: number;
    totalRequests: number;
    cachedTokens: number;
    inputTokens: number;
  };
}

function buildKpis(stats: OverviewStats, usageStats: OverviewUsageStats) {
  return [
    {
      title: 'Total Leads',
      value: stats.totalLeads ?? '-',
      icon: <IconUsers size={20} />,
      iconClass: 'bg-purple-500/10 text-purple-400'
    },
    {
      title: 'Products',
      value: stats.totalProducts ?? '-',
      icon: <IconCookie size={20} />,
      iconClass: 'bg-blue-500/10 text-blue-400'
    },
    {
      title: 'Pending Follow-ups',
      value: stats.pendingFollowUps ?? '-',
      icon: <IconClock size={20} />,
      iconClass: 'bg-amber-500/10 text-amber-400'
    },
    {
      title: 'Incoming Messages',
      value: stats.incomingMessages ? stats.incomingMessages.last24h : '-',
      subStats: stats.incomingMessages ? { label1: '7d', val1: stats.incomingMessages.last7d, label2: '30d', val2: stats.incomingMessages.last30d } : null,
      icon: <IconMessageDots size={20} />,
      iconClass: 'bg-emerald-500/10 text-emerald-400'
    },
    {
      title: 'New Leads',
      value: stats.newLeads ? stats.newLeads.last24h : '-',
      subStats: stats.newLeads ? { label1: '7d', val1: stats.newLeads.last7d, label2: '30d', val2: stats.newLeads.last30d } : null,
      icon: <IconUsers size={20} />,
      iconClass: 'bg-indigo-500/10 text-indigo-400'
    },
    {
      title: 'Gemini Cost MTD',
      value: typeof usageStats?.mtd?.costIdr === 'number' ? `Rp ${Math.round(usageStats.mtd.costIdr).toLocaleString('id-ID')}` : 'Rp 0',
      subStats: usageStats?.mtd ? { label1: 'Calls', val1: usageStats.mtd.totalRequests, label2: 'Cache', val2: `${((usageStats.mtd.cachedTokens / Math.max(1, usageStats.mtd.inputTokens)) * 100).toFixed(0)}%` } : null,
      icon: <IconCreditCard size={20} />,
      iconClass: 'bg-cyan-500/10 text-cyan-400'
    }
  ];
}

interface GeminiAnalyticsPanelProps {
  usageStats: UsageStatsData | null;
  usageLoading: boolean;
  loadUsageStats: () => Promise<void>;
}

function GeminiAnalyticsPanel({ usageStats, usageLoading, loadUsageStats }: Readonly<GeminiAnalyticsPanelProps>) {
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);

  // Generate 30 days continuous daily trend
  const trendData = useMemo(() => {
    const dailyMap = new Map<string, DailyTrendItem>();
    if (usageStats?.dailyTrend) {
      usageStats.dailyTrend.forEach((item: DailyTrendItem) => {
        dailyMap.set(item.date, item);
      });
    }

    const result = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const match = dailyMap.get(dateStr);
      result.push({
        date: dateStr,
        costIdr: match ? Number.parseFloat(String(match.cost_idr)) : 0,
        requestCount: match ? Number.parseInt(String(match.request_count), 10) : 0,
        inputTokens: match ? Number.parseInt(String(match.input_tokens), 10) : 0,
        outputTokens: match ? Number.parseInt(String(match.output_tokens), 10) : 0,
        cachedTokens: match ? Number.parseInt(String(match.cached_tokens), 10) : 0,
      });
    }
    return result;
  }, [usageStats]);

  const maxCost = useMemo(() => {
    return Math.max(...trendData.map((d) => d.costIdr), 10);
  }, [trendData]);

  // Map backend feature name to pretty Indonesian label
  const getFeatureLabel = (name: string) => {
    switch (name) {
      case 'chatbot': return 'Chatbot WhatsApp';
      case 'followup': return 'Proactive Follow-up';
      case 'creative': return 'Creative Ad Ideas';
      case 'ads': return 'Meta Ads Analysis';
      case 'summary': return 'Conversation Summary';
      default: return name;
    }
  };

  return (
    <Card className="bg-card border-border shadow-sm">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border/60 space-y-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
            <IconCoins size={20} />
          </div>
          <div className="flex flex-col gap-0.5">
            <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
              Gemini API Usage & Cost Analytics
              {usageStats?.mtd && (
                <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/20 text-[10px] py-0 px-2 font-medium">
                  Month-to-Date
                </Badge>
              )}
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              Pemantauan real-time penggunaan token, efisiensi cache, dan biaya penagihan API Gemini (Flash-Lite).
            </span>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadUsageStats}
          disabled={usageLoading}
          className="h-8 text-xs font-semibold px-4 gap-1.5 border-border"
        >
          {usageLoading ? (
            <IconLoader size={14} className="animate-spin" />
          ) : (
            <IconRefresh size={14} />
          )}
          <span>Refresh Billing</span>
        </Button>
      </CardHeader>

      <CardContent className="pt-6 flex flex-col gap-8">
        {/* Summary Indicators Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="flex flex-col gap-1 bg-[#1e293b]/10 border border-border/40 rounded-xl p-4">
            <span className="text-xs text-muted-foreground font-medium">Estimasi Biaya MTD</span>
            <span className="text-2xl font-extrabold text-cyan-400 leading-tight">
              Rp {usageStats?.mtd ? Math.round(usageStats.mtd.costIdr).toLocaleString('id-ID') : '0'}
            </span>
            <span className="text-[10px] text-muted-foreground">
              ${usageStats?.mtd ? usageStats.mtd.costUsd.toFixed(4) : '0.0000'} USD
            </span>
          </div>
          
          <div className="flex flex-col gap-1 bg-[#1e293b]/10 border border-border/40 rounded-xl p-4">
            <span className="text-xs text-muted-foreground font-medium">Total Token Dikonsumsi</span>
            <span className="text-2xl font-extrabold text-indigo-400 leading-tight">
              {usageStats?.mtd ? (usageStats.mtd.inputTokens + usageStats.mtd.outputTokens).toLocaleString('id-ID') : '0'}
            </span>
            <span className="text-[10px] text-muted-foreground">
              In: {usageStats?.mtd ? usageStats.mtd.inputTokens.toLocaleString('id-ID') : '0'} | Out: {usageStats?.mtd ? usageStats.mtd.outputTokens.toLocaleString('id-ID') : '0'}
            </span>
          </div>

          <div className="flex flex-col gap-1 bg-[#1e293b]/10 border border-border/40 rounded-xl p-4">
            <span className="text-xs text-muted-foreground font-medium">Efisiensi Caching</span>
            <span className="text-2xl font-extrabold text-emerald-400 leading-tight">
              {usageStats?.mtd && usageStats.mtd.inputTokens > 0 
                ? ((usageStats.mtd.cachedTokens / usageStats.mtd.inputTokens) * 100).toFixed(1) 
                : '0.0'}%
            </span>
            <span className="text-[10px] text-muted-foreground">
              {usageStats?.mtd ? usageStats.mtd.cachedTokens.toLocaleString('id-ID') : '0'} token tersimpan
            </span>
          </div>

          <div className="flex flex-col gap-1 bg-[#1e293b]/10 border border-border/40 rounded-xl p-4">
            <span className="text-xs text-muted-foreground font-medium">Jumlah API Calls</span>
            <span className="text-2xl font-extrabold text-amber-400 leading-tight">
              {usageStats?.mtd ? usageStats.mtd.totalRequests : '0'}
            </span>
            <span className="text-[10px] text-muted-foreground">
              Base Model: Gemini 3.1 Flash-Lite
            </span>
          </div>
        </div>

        {/* Trend Chart & Feature Breakdown Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* 30-Day Cost Trend Chart */}
          <div className="lg:col-span-2 flex flex-col gap-4 bg-muted/20 border border-border/50 rounded-xl p-5 relative">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <IconChartBar size={16} className="text-cyan-400" />
                Tren Biaya Harian (30 Hari Terakhir)
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">
                Scale: max Rp {Math.round(maxCost).toLocaleString('id-ID')} / day
              </span>
            </div>

            {/* Chart Container */}
            <div className="h-48 flex items-end gap-1 md:gap-1.5 pt-4 border-b border-border/60 pb-1 relative">
              {trendData.map((day, idx) => {
                const pct = (day.costIdr / maxCost) * 100;
                const isHovered = hoveredBarIndex === idx;
                return (
                  <button
                    key={day.date}
                    type="button"
                    aria-label={`Biaya ${day.date}: Rp ${Math.round(day.costIdr).toLocaleString('id-ID')}`}
                    className="flex-grow flex flex-col justify-end h-full group outline-none border-none p-0 bg-transparent text-left cursor-pointer appearance-none"
                    onMouseEnter={() => setHoveredBarIndex(idx)}
                    onMouseLeave={() => setHoveredBarIndex(null)}
                    onClick={() => setHoveredBarIndex(isHovered ? null : idx)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        setHoveredBarIndex(isHovered ? null : idx);
                      }
                    }}
                  >
                    <div 
                      className={`w-full bg-gradient-to-t rounded-t-sm transition-all duration-150 cursor-pointer ${
                        isHovered 
                          ? 'from-cyan-400 to-indigo-400 shadow-[0_0_12px_rgba(34,211,238,0.4)]' 
                          : 'from-cyan-600/80 to-indigo-500/80'
                      }`}
                      style={{ height: day.costIdr > 0 ? `${Math.max(4, pct)}%` : '2px' }}
                    />
                  </button>
                );
              })}

              {/* Tooltip Overlay */}
              {hoveredBarIndex !== null && trendData[hoveredBarIndex] && (
                <div 
                  className="absolute top-2 left-1/2 -translate-x-1/2 bg-popover border border-border text-popover-foreground px-4 py-3 rounded-lg shadow-xl text-xs flex flex-col gap-1.5 z-30 min-w-[220px]"
                  style={{ pointerEvents: 'none' }}
                >
                  <div className="font-bold border-b border-border/50 pb-1 flex justify-between">
                    <span>{new Date(trendData[hoveredBarIndex].date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    <span className="text-cyan-400 font-mono">{trendData[hoveredBarIndex].requestCount} calls</span>
                  </div>
                  <div className="flex justify-between font-semibold text-foreground">
                    <span>Biaya:</span>
                    <span className="text-emerald-400">Rp {Math.round(trendData[hoveredBarIndex].costIdr).toLocaleString('id-ID')}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground flex flex-col gap-0.5 mt-0.5">
                    <div className="flex justify-between">
                      <span>Input Tokens:</span>
                      <span>{trendData[hoveredBarIndex].inputTokens.toLocaleString('id-ID')}</span>
                    </div>
                    <div className="flex justify-between text-emerald-400/80">
                      <span>Cached Input:</span>
                      <span>{trendData[hoveredBarIndex].cachedTokens.toLocaleString('id-ID')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Output Tokens:</span>
                      <span>{trendData[hoveredBarIndex].outputTokens.toLocaleString('id-ID')}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* X-Axis labels (ticks for start, mid, end) */}
            <div className="flex justify-between text-[9px] text-muted-foreground font-semibold font-mono px-1">
              <span>{trendData[0] ? new Date(trendData[0].date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : ''}</span>
              <span>{trendData[15] ? new Date(trendData[15].date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : ''}</span>
              <span>{trendData[29] ? new Date(trendData[29].date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : ''}</span>
            </div>
          </div>

          {/* Feature Breakdown Table */}
          <div className="flex flex-col gap-4 bg-muted/20 border border-border/50 rounded-xl p-5">
            <span className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <IconCoins size={16} className="text-indigo-400" />
              Breakdown Penggunaan per Fitur
            </span>
            
            <div className="flex flex-col gap-4 max-h-[220px] overflow-y-auto pr-1">
              {!usageStats?.featureBreakdown || usageStats.featureBreakdown.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-8 italic">
                  Belum ada data kontribusi fitur.
                </div>
              ) : (
                (() => {
                  const totalCost = usageStats.featureBreakdown.reduce((sum: number, f: FeatureBreakdownItem) => sum + Number.parseFloat(String(f.cost_idr)), 0) || 1;
                  return usageStats.featureBreakdown.map((f: FeatureBreakdownItem) => {
                    const share = (Number.parseFloat(String(f.cost_idr)) / totalCost) * 100;

                    return (
                      <div key={f.feature} className="flex flex-col gap-1.5 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-foreground">{getFeatureLabel(f.feature)}</span>
                          <div className="flex gap-2 font-semibold">
                            <span className="text-muted-foreground">{share.toFixed(0)}%</span>
                            <span className="text-foreground">Rp {Math.round(f.cost_idr).toLocaleString('id-ID')}</span>
                          </div>
                        </div>
                        <div className="h-2 w-full bg-[#1e293b]/40 rounded-full overflow-hidden border border-border/20">
                          <div 
                            className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-full transition-all duration-300"
                            style={{ width: `${share}%` }}
                          />
                        </div>
                        <div className="text-[9px] text-muted-foreground flex justify-between">
                          <span>{f.request_count} calls</span>
                          <span>Tokens: In {(f.input_tokens).toLocaleString('id-ID')} (Cached {(f.cached_tokens).toLocaleString('id-ID')}) | Out {(f.output_tokens).toLocaleString('id-ID')}</span>
                        </div>
                      </div>
                    );
                  });
                })()
              )}
            </div>
          </div>

        </div>
      </CardContent>
    </Card>
  );
}
