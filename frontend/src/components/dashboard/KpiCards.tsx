import { memo, useMemo } from 'react';
import {
  IconUsers,
  IconCookie,
  IconClock,
  IconMessageDots,
  IconCreditCard,
  IconAlertCircle,
  IconRefresh,
  IconWifiOff,
} from '@tabler/icons-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import type { Stats, UsageStatsData } from '@/types';

interface KpiCardsProps {
  stats: Stats;
  usageStats: UsageStatsData | null;
  loading: boolean;
  error?: string | null;
  notConnected?: boolean;
  onRetry?: () => void;
}

interface KpiItem {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  iconClass: string;
  subStats?: { label1: string; val1: string | number; label2: string; val2: string | number } | null;
}

function buildKpis(stats: Stats, usageStats: UsageStatsData | null): KpiItem[] {
  return [
    {
      title: 'Total Leads',
      value: stats.totalLeads ?? '-',
      icon: <IconUsers size={20} />,
      iconClass: 'bg-purple-500/10 text-purple-400',
    },
    {
      title: 'Products',
      value: stats.totalProducts ?? '-',
      icon: <IconCookie size={20} />,
      iconClass: 'bg-blue-500/10 text-blue-400',
    },
    {
      title: 'Pending Follow-ups',
      value: stats.pendingFollowUps ?? '-',
      icon: <IconClock size={20} />,
      iconClass: 'bg-amber-500/10 text-amber-400',
    },
    {
      title: 'Incoming Messages',
      value: stats.incomingMessages ? stats.incomingMessages.last24h : '-',
      subStats: stats.incomingMessages
        ? { label1: '7d', val1: stats.incomingMessages.last7d, label2: '30d', val2: stats.incomingMessages.last30d }
        : null,
      icon: <IconMessageDots size={20} />,
      iconClass: 'bg-emerald-500/10 text-emerald-400',
    },
    {
      title: 'New Leads',
      value: stats.newLeads ? stats.newLeads.last24h : '-',
      subStats: stats.newLeads
        ? { label1: '7d', val1: stats.newLeads.last7d, label2: '30d', val2: stats.newLeads.last30d }
        : null,
      icon: <IconUsers size={20} />,
      iconClass: 'bg-indigo-500/10 text-indigo-400',
    },
    {
      title: 'Gemini Cost MTD',
      value:
        typeof usageStats?.mtd?.costIdr === 'number'
          ? `Rp ${Math.round(usageStats.mtd.costIdr).toLocaleString('id-ID')}`
          : 'Rp 0',
      subStats: usageStats?.mtd
        ? {
            label1: 'Calls',
            val1: usageStats.mtd.totalRequests,
            label2: 'Cache',
            val2: `${((usageStats.mtd.cachedTokens / Math.max(1, usageStats.mtd.inputTokens)) * 100).toFixed(0)}%`,
          }
        : null,
      icon: <IconCreditCard size={20} />,
      iconClass: 'bg-cyan-500/10 text-cyan-400',
    },
  ];
}

function KpiCardSkeleton() {
  return (
    <Card className="bg-card border-border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-9 rounded-lg" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-7 w-20" />
        <div className="flex gap-2 mt-2">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-12" />
        </div>
      </CardContent>
    </Card>
  );
}

function KpiCardsInner({ stats, usageStats, loading, error, notConnected, onRetry }: Readonly<KpiCardsProps>) {
  const kpis = useMemo(() => buildKpis(stats, usageStats), [stats, usageStats]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <KpiCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (notConnected) {
    return (
      <Card className="bg-card border-border/60 shadow-sm">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-3">
          <div className="p-4 rounded-full bg-muted/40 text-muted-foreground/60">
            <IconWifiOff size={32} />
          </div>
          <span className="text-sm font-medium text-foreground">WhatsApp Agent Belum Terhubung</span>
          <span className="text-xs text-muted-foreground max-w-sm">
            Belum ada data karena sesi WhatsApp agent belum terkoneksi. 
            Scan QR code di menu WhatsApp Sessions untuk menghubungkan nomor WhatsApp.
          </span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-card border-destructive/20 shadow-sm">
        <CardContent className="flex flex-col items-center justify-center py-10 gap-3">
          <div className="p-3 rounded-full bg-destructive/10 text-destructive">
            <IconAlertCircle size={24} />
          </div>
          <span className="text-sm font-medium text-foreground">Gagal Memuat Statistik</span>
          <span className="text-xs text-muted-foreground max-w-sm text-center">{error}</span>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry} className="h-8 text-xs gap-1.5">
              <IconRefresh size={14} />
              Coba Lagi
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
      {kpis.map((kpi) => (
        <Card key={kpi.title} className="bg-card border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <span className="text-sm font-medium text-muted-foreground">{kpi.title}</span>
            <div className={`p-2 rounded-lg ${kpi.iconClass}`}>{kpi.icon}</div>
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
  );
}

export const KpiCards = memo(KpiCardsInner);
