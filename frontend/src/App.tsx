import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Overview from '@/components/Overview';
import ChatInbox from '@/components/ChatInbox';
import Products from '@/components/Products';
import Actions from '@/components/Actions';
import Settings from '@/components/Settings';
import AdsReport from '@/components/AdsReport';
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { API_BASE_URL } from '@/config';

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
      default:
        return { title: 'Dashboard', subtitle: '' };
    }
  };

  const header = getHeaderInfo();

  return (
    <div className="flex min-h-screen bg-background text-foreground font-sans">
      {/* Sidebar */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content Pane */}
      <div className="flex-grow pl-64 flex flex-col w-full min-h-screen">
        <div className="p-8 max-w-[1400px] w-full mx-auto flex flex-col flex-grow">
          {/* Header */}
          <header className="flex justify-between items-center mb-8">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{header.title}</h1>
              <p className="text-sm text-muted-foreground">{header.subtitle}</p>
            </div>
            <div className="flex items-center gap-2.5 bg-accent/40 border border-border px-4 py-2 rounded-full text-xs">
              <div className={`w-2 h-2 rounded-full ${stats.status === 'connected' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse' : 'bg-destructive'}`}></div>
              <span className={`font-semibold ${stats.status === 'connected' ? 'text-emerald-400' : 'text-destructive'}`}>
                {stats.status === 'connected' ? 'Connected' : 'Disconnected'}
              </span>
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
              />
            )}
            
            {activeTab === 'settings' && (
              <Settings showToast={showToast} />
            )}

            {activeTab === 'ads-report' && (
              <AdsReport />
            )}
          </div>
        </div>
      </div>

      {/* sonner Toaster */}
      <Toaster />
    </div>
  );
}
