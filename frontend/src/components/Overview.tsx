import { 
  IconUsers, 
  IconCookie, 
  IconClock, 
  IconMessageDots,
  IconAlertCircle
} from '@tabler/icons-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

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
  totalMessages?: number;
  recentLeads?: Lead[];
}

interface OverviewProps {
  stats: Stats;
  sessions: { id: string; name: string; status: string }[];
  overviewSessionId: string;
  setOverviewSessionId: (id: string) => void;
  onSelectCustomer: (phone_number: string, name: string, sessionId: string) => void;
}

export default function Overview({ stats, sessions, overviewSessionId, setOverviewSessionId, onSelectCustomer }: OverviewProps) {
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
      title: 'Logged Messages',
      value: stats.totalMessages !== undefined ? stats.totalMessages : '-',
      icon: <IconMessageDots size={20} />,
      iconClass: 'bg-emerald-500/10 text-emerald-400'
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
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
            </CardContent>
          </Card>
        ))}
      </div>

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
