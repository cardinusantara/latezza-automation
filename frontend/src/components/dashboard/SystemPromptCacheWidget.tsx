import { useState, useEffect, useCallback } from 'react';
import { IconFlame, IconLoader, IconRefresh } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

interface CacheStats {
  totalCachedTokens: number;
  cacheHits: number;
  totalRequests: number;
  hitRate: number;
  savingsUsd: number;
  savingsIdr: number;
  lastCacheUpdate: string | null;
  promptCacheTokenCount: number;
}

interface SystemPromptCacheWidgetProps {
  businessId: number;
  onNavigateToSettings?: () => void;
}

export function SystemPromptCacheWidget({ businessId, onNavigateToSettings }: Readonly<SystemPromptCacheWidgetProps>) {
  const [cacheStats, setCacheStats] = useState<CacheStats>({
    totalCachedTokens: 0,
    cacheHits: 0,
    totalRequests: 0,
    hitRate: 0,
    savingsUsd: 0,
    savingsIdr: 0,
    lastCacheUpdate: null,
    promptCacheTokenCount: 0
  });
  const [loading, setLoading] = useState(false);

  const fetchCacheStats = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ status: string; data: CacheStats }>(`/api/system-prompt/stats?businessId=${businessId}`);
      if (data.status === 'success' && data.data) {
        setCacheStats(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch cache stats:', err);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCacheStats();
    }, 500);
    return () => clearTimeout(timer);
  }, [fetchCacheStats, businessId]);

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-4">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-2">
          <IconFlame size={18} className="text-orange-400" />
          <div>
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">System Prompt Cache</h3>
            <p className="text-[10px] text-muted-foreground">Real-time caching statistics</p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={fetchCacheStats}
          disabled={loading}
          className="h-7 w-7 p-0"
        >
          {loading ? <IconLoader size={14} className="animate-spin" /> : <IconRefresh size={14} />}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
        <div className="bg-muted/30 rounded-lg p-2.5 border border-border">
          <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">Cached Tokens</div>
          <div className="text-lg font-bold text-primary">{cacheStats.totalCachedTokens.toLocaleString()}</div>
        </div>

        <div className="bg-muted/30 rounded-lg p-2.5 border border-border">
          <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">Hit Rate</div>
          <div className="text-lg font-bold text-primary">{cacheStats.hitRate.toFixed(0)}%</div>
        </div>

        <div className="bg-muted/30 rounded-lg p-2.5 border border-border">
          <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">Savings</div>
          <div className="text-lg font-bold text-emerald-400">${cacheStats.savingsUsd.toFixed(2)}</div>
        </div>

        <div className="bg-muted/30 rounded-lg p-2.5 border border-border">
          <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">Updated</div>
          <div className="text-xs font-mono text-foreground">
            {cacheStats.lastCacheUpdate 
              ? new Date(cacheStats.lastCacheUpdate).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
              : 'N/A'}
          </div>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        {onNavigateToSettings && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onNavigateToSettings}
            className="flex-1 text-xs h-7"
          >
            View Details
          </Button>
        )}
        <div className="text-[9px] text-muted-foreground italic flex items-center justify-center flex-1">
          90% cheaper with caching
        </div>
      </div>
    </div>
  );
}
