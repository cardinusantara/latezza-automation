import { useState, useMemo, useCallback, memo } from 'react';
import {
  IconCoins,
  IconLoader,
  IconRefresh,
  IconChartBar,
} from '@tabler/icons-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { UsageStatsData, DailyTrendItem, FeatureBreakdownItem } from '@/types';

interface GeminiAnalyticsPanelProps {
  usageStats: UsageStatsData | null;
  usageLoading: boolean;
  loadUsageStats: () => Promise<void>;
}

interface TrendDataPoint {
  date: string;
  costIdr: number;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
}

const getFeatureLabel = (name: string) => {
  switch (name) {
    case 'whatsapp_chat':
    case 'chatbot':
      return 'Chatbot WhatsApp';
    case 'followup':
      return 'Proactive Follow-up';
    case 'creative_analysis':
    case 'creative':
      return 'Creative Ad Ideas';
    case 'ads_analysis':
    case 'ads':
      return 'Meta Ads Analysis';
    case 'message_summary':
    case 'summary':
      return 'Conversation Summary';
    case 'audio_transcription':
      return 'Audio Transcription';
    default:
      return name;
  }
};

function GeminiAnalyticsPanelInner({ usageStats, usageLoading, loadUsageStats }: Readonly<GeminiAnalyticsPanelProps>) {
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);

  const trendData = useMemo<TrendDataPoint[]>(() => {
    const dailyMap = new Map<string, DailyTrendItem>();
    if (usageStats?.dailyTrend) {
      usageStats.dailyTrend.forEach((item) => {
        dailyMap.set(item.date, item);
      });
    }

    const result: TrendDataPoint[] = [];
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

  const handleRefresh = useCallback(() => {
    loadUsageStats();
  }, [loadUsageStats]);

  const featureBreakdown = useMemo(() => {
    if (!usageStats?.featureBreakdown || usageStats.featureBreakdown.length === 0) return null;
    const totalCost = usageStats.featureBreakdown.reduce(
      (sum: number, f: FeatureBreakdownItem) => sum + Number.parseFloat(String(f.cost_idr)),
      0,
    ) || 1;
    return usageStats.featureBreakdown.map((f: FeatureBreakdownItem) => {
      const share = (Number.parseFloat(String(f.cost_idr)) / totalCost) * 100;
      return { f, share };
    });
  }, [usageStats]);

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
          onClick={handleRefresh}
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

            {/* X-Axis labels */}
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
              {!featureBreakdown ? (
                <div className="text-xs text-muted-foreground text-center py-8 italic">
                  Belum ada data kontribusi fitur.
                </div>
              ) : (
                featureBreakdown.map(({ f, share }) => (
                  <div key={f.feature} className="flex flex-col gap-1.5 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-foreground">{getFeatureLabel(f.feature)}</span>
                      <div className="flex gap-2 font-semibold">
                        <span className="text-muted-foreground">{share.toFixed(0)}%</span>
                        <span className="text-foreground">Rp {Math.round(Number(f.cost_idr)).toLocaleString('id-ID')}</span>
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
                ))
              )}
            </div>
          </div>

        </div>
      </CardContent>
    </Card>
  );
}

export const GeminiAnalyticsPanel = memo(GeminiAnalyticsPanelInner);
