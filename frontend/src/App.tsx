import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Overview from '@/components/Overview';
import ChatInbox from '@/components/ChatInbox';
import Products from '@/components/Products';
import Actions from '@/components/Actions';
import Settings from '@/components/Settings';
import AdsReport from '@/components/AdsReport';
import CreativeReport from '@/components/CreativeReport';
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { API_BASE_URL } from '@/config';
import { IconSun, IconMoon, IconMenu2 } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';

interface Lead {
  phone_number: string;
  name?: string;
  contact_phone?: string;
  status?: string;
  needs_follow_up?: boolean;
  needs_admin?: boolean;
  last_interaction: string;
}

interface Stats {
  status: string;
  totalLeads: number;
  totalProducts: number;
  pendingFollowUps: number;
  totalMessages: number;
  recentLeads: Lead[];
}

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return 'dark'; // default
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const [stats, setStats] = useState<Stats>({
    status: 'disconnected',
    totalLeads: 0,
    totalProducts: 0,
    pendingFollowUps: 0,
    totalMessages: 0,
    recentLeads: []
  });
  const [customers, setCustomers] = useState<Lead[]>([]);
  const [products, setProducts] = useState([]);

  const showToast = (message: string) => {
    toast(message);
  };

  const loadStats = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/stats`);
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const loadCustomers = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/customers`);
      const data = await res.json();
      setCustomers(data || []);
    } catch (err) {
      console.error('Failed to load customers:', err);
    }
  };

  const loadProducts = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/products`);
      const data = await res.json();
      setProducts(data || []);
    } catch (err) {
      console.error('Failed to load products:', err);
    }
  };

  // Followup command
  const handleTriggerFollowUps = async () => {
    showToast('Memulai pengecekan follow-up...');
    try {
      const res = await fetch(`${API_BASE_URL}/api/trigger-followups`, { method: 'POST' });
      const data = await res.json();
      if (data.status === 'success') {
        showToast(data.message || 'Follow-up selesai dijalankan!');
        loadStats();
        loadCustomers();
      } else {
        showToast('Gagal memproses follow-up: ' + data.message);
      }
    } catch (err) {
      showToast('Koneksi gagal saat memicu follow-up.');
    }
  };

  // Creative Analysis command
  const handleTriggerCreativeAnalysis = async () => {
    showToast('Memulai analisis kreatif copywriting...');
    try {
      const res = await fetch(`${API_BASE_URL}/api/trigger-creative-analysis`, { method: 'POST' });
      const data = await res.json();
      if (data.status === 'success') {
        showToast('Analisis kreatif selesai dijalankan!');
      } else {
        showToast('Gagal memproses analisis kreatif: ' + data.message);
      }
    } catch (err) {
      showToast('Koneksi gagal saat memicu analisis kreatif.');
    }
  };

  const handleSelectCustomerFromOverview = () => {
    setActiveTab('inbox');
  };

  // Initial load
  useEffect(() => {
    loadStats();
    loadCustomers();
    loadProducts();

    // Poll stats and customer lists every 8 seconds
    const interval = setInterval(() => {
      loadStats();
      loadCustomers();
    }, 8000);

    return () => clearInterval(interval);
  }, []);

  // Sync header metadata based on tab
  const getHeaderInfo = () => {
    switch (activeTab) {
      case 'overview':
        return { title: 'Overview Dashboard', subtitle: 'Real-time statistics & WhatsApp client monitoring' };
      case 'inbox':
        return { title: 'Conversations Inbox', subtitle: 'WhatsApp Live Chat console and lead updates' };
      case 'products':
        return { title: 'Product Catalog', subtitle: 'List of synced items from PostgreSQL products table' };
      case 'actions':
        return { title: 'System Actions', subtitle: 'Manual overrides and database triggers' };
      case 'settings':
        return { title: 'Settings Panel', subtitle: 'Dynamic configuration of AI agent prompts, keys, and schedules' };
      case 'ads-report':
        return { title: 'Meta Ads Analytics', subtitle: 'Interactive advertising report and AI marketing insights' };
      case 'creative-ideas':
        return { title: 'AI Creative Ideas & Briefs', subtitle: 'Copy-paste ad copywriting concepts and videography briefs generated by Gemini' };
      default:
        return { title: 'Latezza Agent Dashboard', subtitle: '' };
    }
  };

  const header = getHeaderInfo();

  return (
    <div className="flex min-h-screen bg-background text-foreground font-sans">
      {/* Mobile Header Bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-card border-b border-sidebar-border z-40 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setIsMobileSidebarOpen(true)}
            className="h-10 w-10 text-foreground"
          >
            <IconMenu2 size={24} />
          </Button>
          <span className="font-sans font-bold text-base tracking-wider text-primary">Latezza Agent</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Light/Dark Toggle */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
            className="h-9 w-9 rounded-full border border-border bg-card/30 text-foreground"
          >
            {theme === 'light' ? <IconMoon size={16} /> : <IconSun size={16} />}
          </Button>
        </div>
      </div>

      {/* Sidebar */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        isMobileOpen={isMobileSidebarOpen}
        onClose={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Content Pane */}
      <div className="flex-grow md:pl-64 flex flex-col w-full min-h-screen pt-16 md:pt-0">
        <div className="p-4 md:p-8 max-w-[1400px] w-full mx-auto flex flex-col flex-grow">
          {/* Header */}
          <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 md:mb-8">
            <div className="flex flex-col gap-1">
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">{header.title}</h1>
              <p className="text-xs md:text-sm text-muted-foreground">{header.subtitle}</p>
            </div>
            <div className="flex items-center gap-3 self-start sm:self-auto">
              {/* Light/Dark Toggle (Desktop only) */}
              <Button
                variant="outline"
                size="icon"
                onClick={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
                className="hidden md:flex h-9 w-9 rounded-full border border-border bg-card/30 text-foreground"
                title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
              >
                {theme === 'light' ? <IconMoon size={16} /> : <IconSun size={16} />}
              </Button>

              {/* Status Indicator */}
              <div className="flex items-center gap-2.5 bg-accent/40 border border-border px-4 py-2 rounded-full text-xs">
                <div className={`w-2 h-2 rounded-full ${stats.status === 'connected' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse' : 'bg-destructive'}`}></div>
                <span className={`font-semibold ${stats.status === 'connected' ? 'text-emerald-500 text-emerald-600/90' : 'text-destructive'}`}>
                  {stats.status === 'connected' ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          </header>

          {/* Tabs Views */}
          <div className="flex-grow">
            {activeTab === 'overview' && (
              <Overview 
                stats={stats} 
                onSelectCustomer={handleSelectCustomerFromOverview} 
              />
            )}
            
            {activeTab === 'inbox' && (
              <ChatInbox 
                customers={customers} 
                products={products}
                onRefreshData={loadCustomers}
                showToast={showToast}
              />
            )}
            
            {activeTab === 'products' && (
              <Products products={products} onRefreshData={loadProducts} />
            )}
            
            {activeTab === 'actions' && (
              <Actions 
                onTriggerFollowUps={handleTriggerFollowUps}
                onTriggerCreativeAnalysis={handleTriggerCreativeAnalysis}
              />
            )}
            
            {activeTab === 'settings' && (
              <Settings showToast={showToast} />
            )}

            {activeTab === 'ads-report' && (
              <AdsReport />
            )}

            {activeTab === 'creative-ideas' && (
              <CreativeReport />
            )}
          </div>
        </div>
      </div>

      {/* sonner Toaster */}
      <Toaster />
    </div>
  );
}
