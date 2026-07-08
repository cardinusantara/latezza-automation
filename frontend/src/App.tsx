import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Overview from '@/components/Overview';
import ChatInbox from '@/components/ChatInbox';
import Products from '@/components/Products';
import Actions from '@/components/Actions';
import Settings from '@/components/Settings';
import AdsReport from '@/components/AdsReport';
import CreativeReport from '@/components/CreativeReport';
import WhatsappSessions from '@/components/WhatsappSessions';
import Broadcast from '@/components/Broadcast';
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { API_BASE_URL } from '@/config';
import { IconSun, IconMoon, IconMenu2, IconPlus, IconDeviceFloppy } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
  status: string;
  totalLeads: number;
  totalProducts: number;
  pendingFollowUps: number;
  incomingMessages: { last24h: number; last7d: number; last30d: number };
  newLeads: { last24h: number; last7d: number; last30d: number };
  recentLeads: Lead[];
}

interface Business {
  id: number;
  name: string;
  slug: string;
  short_description?: string;
  contact_phone?: string;
  address?: string;
  website?: string;
  social_media?: unknown;
  ai_settings?: {
    tone?: string;
    custom_prompt?: string;
    handoff_rules?: string;
    followup_rules?: string;
  };
}

export default function App() {
  const VALID_TABS = ['overview', 'whatsapp-sessions', 'inbox', 'broadcast', 'products', 'actions', 'settings', 'ads-report', 'creative-ideas'];
  const [activeTab, setActiveTab] = useState(() => {
    const saved = localStorage.getItem('activeTab');
    return saved && VALID_TABS.includes(saved) ? saved : 'overview';
  });

  // Multi-tenant businesses state
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [currentBusinessId, setCurrentBusinessId] = useState<number>(() => {
    const saved = localStorage.getItem('currentBusinessId');
    return saved ? Number.parseInt(saved, 10) : 1;
  });
  const [isNewBusinessModalOpen, setIsNewBusinessModalOpen] = useState(false);
  const [newBusinessData, setNewBusinessData] = useState({ name: '', slug: '', shortDescription: '' });

  const activeBusiness = businesses.find(b => b.id === currentBusinessId) || null;

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    localStorage.setItem('activeTab', tab);
  };
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return 'dark'; // default
  });

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('sidebarWidth');
    return saved ? Number.parseInt(saved, 10) : 256;
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('isSidebarCollapsed') === 'true';
  });
  const [lastExpandedWidth, setLastExpandedWidth] = useState(() => {
    const saved = localStorage.getItem('lastExpandedWidth');
    return saved ? Number.parseInt(saved, 10) : 256;
  });
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleToggleCollapse = () => {
    if (isSidebarCollapsed) {
      const newWidth = lastExpandedWidth < 180 ? 256 : lastExpandedWidth;
      setSidebarWidth(newWidth);
      setIsSidebarCollapsed(false);
      localStorage.setItem('isSidebarCollapsed', 'false');
      localStorage.setItem('sidebarWidth', String(newWidth));
    } else {
      setLastExpandedWidth(sidebarWidth);
      setSidebarWidth(72);
      setIsSidebarCollapsed(true);
      localStorage.setItem('isSidebarCollapsed', 'true');
      localStorage.setItem('lastExpandedWidth', String(sidebarWidth));
      localStorage.setItem('sidebarWidth', '72');
    }
  };

  const startResizing = (mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    const startWidth = sidebarWidth;
    const startX = mouseDownEvent.clientX;
    
    const doDrag = (mouseMoveEvent: MouseEvent) => {
      const newWidth = startWidth + (mouseMoveEvent.clientX - startX);
      if (newWidth > 180 && newWidth < 450) {
        setSidebarWidth(newWidth);
        setIsSidebarCollapsed(false);
        localStorage.setItem('isSidebarCollapsed', 'false');
        localStorage.setItem('sidebarWidth', String(newWidth));
      } else if (newWidth <= 120) {
        setSidebarWidth(72);
        setIsSidebarCollapsed(true);
        localStorage.setItem('isSidebarCollapsed', 'true');
        localStorage.setItem('sidebarWidth', '72');
      }
    };
    
    const stopDrag = () => {
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', stopDrag);
    };
    
    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
  };

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const [selectedSessionId, setSelectedSessionId] = useState('default');
  const [overviewSessionId, setOverviewSessionId] = useState('all');
  const [sessions, setSessions] = useState<{ id: string; name: string; status: string }[]>([]);

  const [stats, setStats] = useState<Stats>({
    status: 'disconnected',
    totalLeads: 0,
    totalProducts: 0,
    pendingFollowUps: 0,
    incomingMessages: { last24h: 0, last7d: 0, last30d: 0 },
    newLeads: { last24h: 0, last7d: 0, last30d: 0 },
    recentLeads: []
  });
  const [customers, setCustomers] = useState<Lead[]>([]);
  const [products, setProducts] = useState([]);
  const [selectedJid, setSelectedJid] = useState('');
  const [selectedCustName, setSelectedCustName] = useState('');

  const showToast = (message: string) => {
    toast(message);
  };

  const loadBusinesses = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/businesses`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setBusinesses(data);
      }
    } catch (err) {
      console.error('Failed to load businesses:', err);
    }
  };

  const loadSessions = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/whatsapp/sessions?business_id=${currentBusinessId}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setSessions(data);
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  };

  const loadStats = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/stats?session_id=${overviewSessionId}&business_id=${currentBusinessId}`);
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const loadCustomers = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/customers?session_id=${selectedSessionId}&business_id=${currentBusinessId}`);
      const data = await res.json();
      setCustomers(data || []);
    } catch (err) {
      console.error('Failed to load customers:', err);
    }
  };

  const loadProducts = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/products?business_id=${currentBusinessId}`);
      const data = await res.json();
      setProducts(data || []);
    } catch (err) {
      console.error('Failed to load products:', err);
    }
  };

  const handleCreateBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBusinessData.name || !newBusinessData.slug) {
      showToast('Nama dan Slug wajib diisi!');
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/businesses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newBusinessData.name.trim(),
          slug: newBusinessData.slug.trim(),
          shortDescription: newBusinessData.shortDescription.trim()
        })
      });
      const data = await res.json();
      if (data.status === 'success' && data.business) {
        showToast(`Workspace "${data.business.name}" berhasil dibuat!`);
        setIsNewBusinessModalOpen(false);
        setNewBusinessData({ name: '', slug: '', shortDescription: '' });
        await loadBusinesses();
        setCurrentBusinessId(data.business.id);
        localStorage.setItem('currentBusinessId', String(data.business.id));
      } else {
        showToast('Gagal membuat bisnis: ' + (data.message || 'Error tidak diketahui'));
      }
    } catch (err) {
      console.error(err);
      showToast('Koneksi gagal saat membuat bisnis.');
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
    } catch {
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
    } catch {
      showToast('Koneksi gagal saat memicu analisis kreatif.');
    }
  };

  const handleSelectCustomerFromOverview = (phone_number: string, name: string, sessionId?: string) => {
    if (sessionId) {
      setSelectedSessionId(sessionId);
    }
    setSelectedJid(phone_number);
    setSelectedCustName(name);
    handleTabChange('inbox');
  };

  // Initial load: fetch businesses list first
  useEffect(() => {
    Promise.resolve().then(() => {
      loadBusinesses();
    });
  }, []);

  // Sync state and load initial data when currentBusinessId changes
  useEffect(() => {
    Promise.resolve().then(() => {
      setOverviewSessionId('all');
      setSelectedSessionId('default');
      
      loadSessions();
      loadStats();
      loadCustomers();
      loadProducts();
    });
  }, [currentBusinessId]);

  // Reload stats when overview session changes
  useEffect(() => {
    const timer = setTimeout(() => {
      loadStats();
    }, 0);
    return () => clearTimeout(timer);
  }, [overviewSessionId, currentBusinessId]);

  // Reload customers when selected session changes
  useEffect(() => {
    const timer = setTimeout(() => {
      loadCustomers();
    }, 0);
    return () => clearTimeout(timer);
  }, [selectedSessionId, currentBusinessId]);

  // Poll stats and customer lists every 8 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadStats();
      loadCustomers();
      loadSessions();
    }, 8000);

    return () => clearInterval(interval);
  }, [selectedSessionId, overviewSessionId, currentBusinessId]);

  // Sync header metadata based on tab
  const getHeaderInfo = () => {
    switch (activeTab) {
      case 'overview':
        return { title: 'Overview Dashboard', subtitle: 'Real-time statistics & WhatsApp client monitoring' };
      case 'whatsapp-sessions':
        return { title: 'WhatsApp Sessions', subtitle: 'Manage multiple WhatsApp numbers, agents, and QR codes' };
      case 'inbox':
        return { title: 'Conversations Inbox', subtitle: 'WhatsApp Live Chat console and lead updates' };
      case 'broadcast':
        return { title: 'WhatsApp Broadcasts', subtitle: 'Manage mass broadcast campaigns with polymorphic Spintax & AI' };
      case 'products':
        return { title: 'Product Catalog', subtitle: 'List of items from PostgreSQL products table' };
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
          <select
            value={currentBusinessId}
            onChange={(e) => {
              const id = Number.parseInt(e.target.value, 10);
              if (id === -1) {
                setIsNewBusinessModalOpen(true);
              } else {
                setCurrentBusinessId(id);
                localStorage.setItem('currentBusinessId', String(id));
              }
            }}
            className="h-8 max-w-[140px] rounded-xl border border-border bg-card px-2 text-[10px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
            <option value="-1">+ Tambah...</option>
          </select>
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
        setActiveTab={handleTabChange} 
        isMobileOpen={isMobileSidebarOpen}
        onClose={() => setIsMobileSidebarOpen(false)}
        sidebarWidth={sidebarWidth}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={handleToggleCollapse}
        startResizing={startResizing}
      />

      {/* Main Content Pane */}
      <div 
        className="flex-grow flex flex-col w-full min-h-screen pt-16 md:pt-0"
        style={{ paddingLeft: isDesktop ? `${sidebarWidth}px` : undefined }}
      >
        <div className="p-4 md:p-8 max-w-[1400px] w-full mx-auto flex flex-col flex-grow">
          {/* Header */}
          <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 md:mb-8">
            <div className="flex flex-col gap-1">
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">{header.title}</h1>
              <p className="text-xs md:text-sm text-muted-foreground">{header.subtitle}</p>
            </div>
            <div className="flex items-center gap-3 self-start sm:self-auto">
              {/* Workspace Selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium hidden lg:inline">Workspace:</span>
                <select
                  value={currentBusinessId}
                  onChange={(e) => {
                    const id = Number.parseInt(e.target.value, 10);
                    if (id === -1) {
                      setIsNewBusinessModalOpen(true);
                    } else {
                      setCurrentBusinessId(id);
                      localStorage.setItem('currentBusinessId', String(id));
                    }
                  }}
                  className="h-9 rounded-xl border border-border bg-card px-3 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {businesses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                  <option value="-1">+ Tambah Bisnis Baru...</option>
                </select>
              </div>

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
                sessions={sessions}
                overviewSessionId={overviewSessionId}
                setOverviewSessionId={setOverviewSessionId}
                onSelectCustomer={handleSelectCustomerFromOverview} 
              />
            )}

            {activeTab === 'whatsapp-sessions' && (
              <WhatsappSessions businessId={currentBusinessId} />
            )}
            
            {activeTab === 'inbox' && (
              <ChatInbox 
                customers={customers} 
                products={products}
                onRefreshData={loadCustomers}
                showToast={showToast}
                selectedJid={selectedJid}
                setSelectedJid={setSelectedJid}
                selectedCustName={selectedCustName}
                setSelectedCustName={setSelectedCustName}
                selectedSessionId={selectedSessionId}
                setSelectedSessionId={setSelectedSessionId}
                sessions={sessions}
              />
            )}

            {activeTab === 'broadcast' && (
              <Broadcast showToast={showToast} sessions={sessions} businessId={currentBusinessId} />
            )}
            
            {activeTab === 'products' && (
              <Products products={products} onRefreshData={loadProducts} businessId={currentBusinessId} />
            )}
            
            {activeTab === 'actions' && (
              <Actions 
                onTriggerFollowUps={handleTriggerFollowUps}
                onTriggerCreativeAnalysis={handleTriggerCreativeAnalysis}
              />
            )}
            
            {activeTab === 'settings' && (
              <Settings 
                showToast={showToast} 
                businessId={currentBusinessId}
                activeBusiness={activeBusiness}
                onRefreshBusinesses={loadBusinesses}
              />
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

      {/* Dialog: Tambah Bisnis Baru */}
      <Dialog open={isNewBusinessModalOpen} onOpenChange={setIsNewBusinessModalOpen}>
        <DialogContent className="sm:max-w-[425px] bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <IconPlus className="text-primary" size={20} />
              <span>Daftarkan Bisnis Baru</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Buat workspace multi-tenant baru. Ini akan memiliki sesi WhatsApp, database produk, dan stats tersendiri.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateBusiness} className="space-y-4 py-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="biz-name" className="text-xs font-semibold text-muted-foreground">Nama Bisnis</label>
              <Input
                id="biz-name"
                value={newBusinessData.name}
                onChange={(e) => setNewBusinessData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Contoh: Kopi Kenangan"
                required
                className="bg-card border-border text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="biz-slug" className="text-xs font-semibold text-muted-foreground">URL Slug (Unik)</label>
              <Input
                id="biz-slug"
                value={newBusinessData.slug}
                onChange={(e) => setNewBusinessData(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-') }))}
                placeholder="Contoh: kopi-kenangan"
                required
                className="bg-card border-border text-sm"
              />
              <span className="text-[10px] text-muted-foreground">Hanya huruf kecil, angka, strip, dan underscore.</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="biz-desc" className="text-xs font-semibold text-muted-foreground">Deskripsi Singkat (Opsional)</label>
              <Textarea
                id="biz-desc"
                value={newBusinessData.shortDescription}
                onChange={(e) => setNewBusinessData(prev => ({ ...prev, shortDescription: e.target.value }))}
                placeholder="Toko kopi susu kekinian..."
                className="bg-card border-border text-sm min-h-[60px]"
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsNewBusinessModalOpen(false)}>
                Batal
              </Button>
              <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-1.5">
                <IconDeviceFloppy size={16} />
                <span>Simpan</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* sonner Toaster */}
      <Toaster />
    </div>
  );
}
