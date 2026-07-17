import { useState, useEffect, useCallback, useRef, memo } from 'react';
import {
  IconSparkles,
  IconRefresh,
  IconLoader,
  IconCalendar,
} from '@tabler/icons-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api, buildAuthenticatedSseUrl } from '@/lib/api';
import type { MessageSummaryData } from '@/types';

interface AiInsightsCardProps {
  overviewSessionId: string;
}

const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 5000, 10000];

const getDateRangeLabel = (range: string) => {
  switch (range) {
    case 'today': return 'Hari Ini';
    case '3d': return '3 Hari Terakhir';
    case '7d': return '7 Hari Terakhir';
    case '30d': return '30 Hari Terakhir';
    default: return range;
  }
};

function AiInsightsCardInner({ overviewSessionId }: Readonly<AiInsightsCardProps>) {
  const [summaryData, setSummaryData] = useState<MessageSummaryData | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [selectedRange, setSelectedRange] = useState<'today' | '3d' | '7d' | '30d'>('today');
  const [streamProgress, setStreamProgress] = useState<string[]>([]);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const loadExistingSummary = useCallback(async () => {
    try {
      const data = await api.get<MessageSummaryData>('/api/message-summary');
      setSummaryData(data);
    } catch (err) {
      console.error('Failed to load existing message summary:', err);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadExistingSummary();
  }, [loadExistingSummary]);

  const cleanupEventSource = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const connectSSE = () => {
    cleanupEventSource();

    const url = buildAuthenticatedSseUrl('/api/trigger-message-summary-stream', {
      session_id: overviewSessionId,
      date_range: selectedRange,
    });
    if (!url) {
      setStreamProgress(prev => [...prev, '❌ Sesi login habis. Silakan login ulang.']);
      setSummaryLoading(false);
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      return;
    }
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type === 'status') {
          setStreamProgress(prev => [...prev, parsed.message]);
        } else if (parsed.type === 'done') {
          setSummaryData(parsed.data);
          setSummaryLoading(false);
          retryCountRef.current = 0;
          eventSource.close();
          eventSourceRef.current = null;
        } else if (parsed.type === 'error') {
          setStreamProgress(prev => [...prev, `❌ Error: ${parsed.message}`]);
          setSummaryLoading(false);
          eventSource.close();
          eventSourceRef.current = null;
        }
      } catch (err) {
        console.error('Error parsing SSE event:', err);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      eventSourceRef.current = null;

      if (retryCountRef.current < MAX_RETRIES) {
        const delay = RETRY_DELAYS[retryCountRef.current];
        retryCountRef.current++;
        setStreamProgress(prev => [...prev, `⏳ Koneksi terputus. Mencoba ulang (${retryCountRef.current}/${MAX_RETRIES})...`]);
        retryTimerRef.current = setTimeout(() => connectSSE(), delay);
      } else {
        setStreamProgress(prev => [...prev, '❌ Koneksi terputus setelah beberapa percobaan. Silakan coba lagi.']);
        setSummaryLoading(false);
        retryCountRef.current = 0;
      }
    };
  };

  const handleGenerateSummary = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    setSummaryLoading(true);
    setStreamProgress(['Menghubungi AI Agent...']);
    setSummaryData(null);
    retryCountRef.current = 0;
    connectSSE();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overviewSessionId, selectedRange]);

  useEffect(() => {
    return () => cleanupEventSource();
  }, [cleanupEventSource]);

  return (
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
  );
}

export const AiInsightsCard = memo(AiInsightsCardInner);
