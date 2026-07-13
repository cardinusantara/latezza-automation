import { useState, useEffect, lazy, Suspense, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import LoginPage from '@/components/LoginPage';
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { api } from '@/lib/api';
import { usePolling } from '@/hooks/use-polling';
import { AuthProvider } from '@/contexts/AuthContext';
import { useAuth } from '@/hooks/use-auth';
import { IconSun, IconMoon, IconMenu2, IconPlus, IconDeviceFloppy, IconLoader2 } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Lead, Stats, Business, Session, Product } from '@/types';

const Overview = lazy(() => import('@/components/Overview'));
const ChatInbox = lazy(() => import('@/components/ChatInbox'));
const Products = lazy(() => import('@/components/Products'));
const Actions = lazy(() => import('@/components/Actions'));
const Settings = lazy(() => import('@/components/Settings'));
const AdsReport = lazy(() => import('@/components/AdsReport'));
const CreativeReport = lazy(() => import('@/components/CreativeReport'));
const WhatsappSessions = lazy(() => import('@/components/WhatsappSessions'));
const Broadcast = lazy(() => import('@/components/Broadcast'));

const INITIAL_STATS: Stats = {
  status: 'disconnected',
  totalLeads: 0,
  totalProducts: 0,
  pendingFollowUps: 0,
  incomingMessages: { last24h: 0, last7d: 0, last30d: 0 },
  newLeads: { last24h: 0, last7d: 0, last30d: 0 },
  recentLeads: [],
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <IconLoader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return <Dashboard />;
}

function Dashboard() {
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

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    localStorage.setItem('activeTab', tab);
  }, []);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return 'dark';
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

  const handleToggleCollapse = useCallback(() => {
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
  }, [isSidebarCollapsed, lastExpandedWidth, sidebarWidth]);

  const startResizing = useCallback((mouseDownEvent: React.MouseEvent) => {
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
  }, [sidebarWidth]);

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
  const [sessions, setSessions] = useState<Session[]>([]);

  const [stats, setStats] = useState<Stats>(INITIAL_STATS);
  const [statsLoading, setStatsLoading] = useState(false);
  const [customers, setCustomers] = useState<Lead[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedJid, setSelectedJid] = useState('');
  const [selectedCustName, setSelectedCustName] = useState('');

  const showToast = useCallback((message: string) => {
    toast(message);
  }, []);

  const loadBusinesses = useCallback(async () => {
    try {
      const data = await api.get<Business[]>('/api/businesses');
      if (Array.isArray(data)) {
        setBusinesses(data);
      }
    } catch (err) {
      console.error('Failed to load businesses:', err);
    }
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      const data = await api.get<Session[]>(`/api/wa/sessions?business_id=${currentBusinessId}`);
      if (Array.isArray(data)) {
        setSessions(data);
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  }, [currentBusinessId]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const data = await api.get<Stats>(`/api/stats?session_id=${overviewSessionId}&business_id=${currentBusinessId}`);
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setStatsLoading(false);
    }
  }, [overviewSessionId, currentBusinessId]);

  const loadCustomers = useCallback(async () => {
    try {
      const data = await api.get<Lead[]>(`/api/customers?session_id=${selectedSessionId}&business_id=${currentBusinessId}`);
      setCustomers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load customers:', err);
    }
  }, [selectedSessionId, currentBusinessId]);

  const loadProducts = useCallback(async () => {
    try {
      const data = await api.get<Product[]>(`/api/products?business_id=${currentBusinessId}`);
      setProducts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load products:', err);
    }
  }, [currentBusinessId]);

  const handleCreateBusiness = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBusinessData.name || !newBusinessData.slug) {
      showToast('Nama dan Slug wajib diisi!');
      return;
    }
    try {
      const data = await api.post<{ status: string; message?: string; business?: Business }>(
        '/api/businesses',
        {
          name: newBusinessData.name.trim(),
          slug: newBusinessData.slug.trim(),
          shortDescription: newBusinessData.shortDescription.trim()
        }
      );
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
      showToast(err instanceof Error ? err.message : 'Koneksi gagal saat membuat bisnis.');
    }
  }, [newBusinessData, showToast, loadBusinesses]);

  const handleTriggerFollowUps = useCallback(async () => {
    showToast('Memulai pengecekan follow-up...');
    try {
      const data = await api.post<{ status: string; message?: string }>('/api/trigger-followups');
      if (data.status === 'success') {
        showToast(data.message || 'Follow-up selesai dijalankan!');
        loadStats();
        loadCustomers();
      } else {
        showToast('Gagal memproses follow-up: ' + data.message);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Koneksi gagal saat memicu follow-up.');
    }
  }, [showToast, loadStats, loadCustomers]);

  const handleTriggerCreativeAnalysis = useCallback(async () => {
    showToast('Memulai analisis kreatif copywriting...');
    try {
      const data = await api.post<{ status: string; message?: string }>('/api/trigger-creative-analysis');
      if (data.status === 'success') {
        showToast('Analisis kreatif selesai dijalankan!');
      } else {
        showToast('Gagal memproses analisis kreatif: ' + data.message);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Koneksi gagal saat memicu analisis kreatif.');
    }
  }, [showToast]);

  const handleSelectCustomerFromOverview = useCallback((phone_number: string, name: string, sessionId?: string) => {
    if (sessionId) {
      setSelectedSessionId(sessionId);
    }
    setSelectedJid(phone_number);
    setSelectedCustName(name);
    handleTabChange('inbox');
  }, [handleTabChange]);

  useEffect(() => {
    Promise.resolve().then(() => {
      loadBusinesses();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => {
      setOverviewSessionId('all');
      setSelectedSessionId('default');

      loadSessions();
      loadStats();
      loadCustomers();
      loadProducts();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBusinessId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadStats();
    }, 0);
    return () => clearTimeout(timer);
  }, [overviewSessionId, currentBusinessId, loadStats]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadCustomers();
    }, 0);
    return () => clearTimeout(timer);
  }, [selectedSessionId, currentBusinessId, loadCustomers]);

  usePolling(() => {
    loadStats();
    loadCustomers();
    loadSessions();
  }, 8000, [selectedSessionId, overviewSessionId, currentBusinessId, loadStats, loadCustomers, loadSessions]);

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

          {/* Tabs Views with Suspense */}
          <div className="flex-grow">
            <Suspense fallback={<div className="flex items-center justify-center py-20"><IconLoader2 size={32} className="animate-spin text-primary" /></div>}>
              {activeTab === 'overview' && (
                <Overview
                  stats={stats}
                  sessions={sessions}
                  overviewSessionId={overviewSessionId}
                  setOverviewSessionId={setOverviewSessionId}
                  onSelectCustomer={handleSelectCustomerFromOverview}
                  onTriggerFollowUps={handleTriggerFollowUps}
                  statsLoading={statsLoading}
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
            </Suspense>
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
