import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  IconRefresh,
  IconBolt,
  IconLoader,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { KpiCards } from '@/components/dashboard/KpiCards';
import { AiInsightsCard } from '@/components/dashboard/AiInsightsCard';
import { GeminiAnalyticsPanel } from '@/components/dashboard/GeminiAnalyticsPanel';
import { RecentActivityTable } from '@/components/dashboard/RecentActivityTable';
import type { Stats, UsageStatsData, Session } from '@/types';

interface OverviewProps {
  stats: Stats;
  sessions: Session[];
  overviewSessionId: string;
  setOverviewSessionId: (id: string) => void;
  onSelectCustomer: (phone_number: string, name: string, sessionId: string) => void;
  onTriggerFollowUps?: () => void;
  statsLoading?: boolean;
}

export default function Overview({
  stats,
  sessions,
  overviewSessionId,
  setOverviewSessionId,
  onSelectCustomer,
  onTriggerFollowUps,
  statsLoading,
}: Readonly<OverviewProps>) {
  const [usageStats, setUsageStats] = useState<UsageStatsData | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);

  const loadUsageStats = useCallback(async () => {
    setUsageLoading(true);
    try {
      const data = await api.get<UsageStatsData>('/api/settings/usage-stats');
      if (data.status === 'success') {
        setUsageStats(data);
      }
    } catch (err) {
      console.error('Failed to load Gemini usage stats:', err);
    } finally {
      setUsageLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadUsageStats();
  }, [loadUsageStats]);

  const sessionFilter = useMemo(
    () => (
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-card border border-border p-4 rounded-xl shadow-sm">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            WhatsApp Agent Filter
          </span>
          <span className="text-[11px] text-muted-foreground">
            Select a specific agent session to filter KPIs and activity log
          </span>
        </div>
        <select
          value={overviewSessionId}
          onChange={(e) => setOverviewSessionId(e.target.value)}
          className="bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground font-medium outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors cursor-pointer w-full sm:w-[220px]"
        >
          <option value="all">All Agent Sessions</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.status === 'connected' ? '🟢 Connected' : '🔴 Offline'})
            </option>
          ))}
        </select>
      </div>
    ),
    [overviewSessionId, setOverviewSessionId, sessions],
  );

  const quickActions = useMemo(
    () => (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={loadUsageStats}
          disabled={usageLoading}
          className="h-8 text-xs font-semibold gap-1.5 border-border"
        >
          {usageLoading ? <IconLoader size={14} className="animate-spin" /> : <IconRefresh size={14} />}
          Refresh Billing
        </Button>
        {onTriggerFollowUps && (
          <Button
            variant="outline"
            size="sm"
            onClick={onTriggerFollowUps}
            className="h-8 text-xs font-semibold gap-1.5 border-border"
          >
            <IconBolt size={14} />
            Trigger Follow-up
          </Button>
        )}
      </div>
    ),
    [loadUsageStats, usageLoading, onTriggerFollowUps],
  );

  return (
    <div className="flex flex-col gap-8">
      {/* Session Filter + Quick Actions */}
      <div className="flex flex-col gap-4">
        {sessionFilter}
        {quickActions}
      </div>

      {/* KPI Cards */}
      <KpiCards
        stats={stats}
        usageStats={usageStats}
        loading={!!statsLoading}
        notConnected={stats.status === 'disconnected' && stats.totalLeads === 0 && !statsLoading}
      />

      {/* AI Summary Section */}
      <AiInsightsCard overviewSessionId={overviewSessionId} />

      {/* Gemini API Usage & Cost Analytics */}
      <GeminiAnalyticsPanel
        usageStats={usageStats}
        usageLoading={usageLoading}
        loadUsageStats={loadUsageStats}
      />

      {/* Recent Activity Table */}
      <RecentActivityTable
        leads={stats.recentLeads}
        sessions={sessions}
        onSelectCustomer={onSelectCustomer}
      />
    </div>
  );
}
