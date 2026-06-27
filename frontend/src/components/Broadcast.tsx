import { useState, useEffect, useRef } from 'react';
import { 
  IconSpeakerphone, 
  IconPlayerPlay, 
  IconPlayerPause, 
  IconSquareX, 
  IconPlus, 
  IconEye, 
  IconSparkles, 
  IconUpload, 
  IconCircleCheck, 
  IconCircleX, 
  IconLoader, 
  IconRefresh,
  IconChecks,
  IconMessage
} from '@tabler/icons-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { API_BASE_URL } from '@/config';

interface Campaign {
  id: number;
  name: string;
  session_id: string;
  message_template: string;
  media_type: 'text' | 'image' | 'video';
  media_url?: string;
  status: 'draft' | 'queued' | 'processing' | 'completed' | 'paused' | 'failed';
  total_targets: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  updated_at: string;
}

interface QueueItem {
  id: number;
  phone_number: string;
  session_id: string;
  personalized_message: string;
  status: 'pending' | 'sending' | 'sent' | 'failed';
  error_message?: string;
  sent_at?: string;
}

interface BroadcastProps {
  showToast: (msg: string) => void;
  sessions: { id: string; name: string; status: string }[];
}

interface Customer {
  phone_number: string;
  name?: string;
  status?: string;
}

export default function Broadcast({ showToast, sessions }: Readonly<BroadcastProps>) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Dialog States
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [campaignQueue, setCampaignQueue] = useState<QueueItem[]>([]);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // Composer Form States
  const [formName, setFormName] = useState('');
  const [formSessionId, setFormSessionId] = useState('default');
  const [formTemplate, setFormTemplate] = useState('');
  const [formMediaType, setFormMediaType] = useState<'text' | 'image' | 'video'>('text');
  const [formMediaUrl, setFormMediaUrl] = useState('');
  const [formTargetFilter, setFormTargetFilter] = useState<'all' | 'leads' | 'dormant' | 'needs_follow_up' | 'manual'>('all');
  
  // Manual Target Selection States
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [isCustomersLoading, setIsCustomersLoading] = useState(false);

  // AI Assistant States
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch all campaigns
  const fetchCampaigns = async (silent = false) => {
    if (!silent && !isLoading) setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/broadcasts/campaigns`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setCampaigns(data);
      }
    } catch (err) {
      console.error('Failed to fetch campaigns:', err);
      showToast('Gagal memuat daftar kampanye.');
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  // Fetch single campaign queue details
  const fetchCampaignDetail = async (campaignId: number, silent = false) => {
    if (!silent) setIsDetailLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/broadcasts/campaigns/${campaignId}`);
      const data = await res.json();
      if (data.campaign) {
        setCampaignQueue(data.queue || []);
        // Sync selected campaign status updates
        setSelectedCampaign(data.campaign);
      }
    } catch (err) {
      console.error('Failed to fetch campaign detail:', err);
      showToast('Gagal memuat detail antrean siaran.');
    } finally {
      if (!silent) setIsDetailLoading(false);
    }
  };

  // Load all customers for manual selection
  const fetchAllCustomers = async () => {
    setIsCustomersLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/customers`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setAllCustomers(data);
      }
    } catch (err) {
      console.error('Failed to fetch customers for broadcast selection:', err);
      showToast('Gagal memuat daftar kustomer.');
    } finally {
      setIsCustomersLoading(false);
    }
  };

  // Refs to avoid stale closure in useEffect polling
  const campaignsRef = useRef(campaigns);
  const isDetailOpenRef = useRef(isDetailOpen);
  const selectedCampaignRef = useRef(selectedCampaign);

  // Sync refs with latest state values
  useEffect(() => {
    campaignsRef.current = campaigns;
  }, [campaigns]);

  useEffect(() => {
    isDetailOpenRef.current = isDetailOpen;
  }, [isDetailOpen]);

  useEffect(() => {
    selectedCampaignRef.current = selectedCampaign;
  }, [selectedCampaign]);

  // Poll campaigns if any is in active status
  useEffect(() => {
    setTimeout(() => {
      fetchCampaigns();
    }, 0);
    
    const interval = setInterval(() => {
      const currentCampaigns = campaignsRef.current;
      const currentIsDetailOpen = isDetailOpenRef.current;
      const currentSelectedCampaign = selectedCampaignRef.current;

      const hasActive = currentCampaigns.some(c => c.status === 'processing' || c.status === 'queued');
      if (hasActive || currentIsDetailOpen) {
        fetchCampaigns(true);
        if (currentIsDetailOpen && currentSelectedCampaign) {
          fetchCampaignDetail(currentSelectedCampaign.id, true);
        }
      }
    }, 4000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  // Handle media file upload
  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingMedia(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE_URL}/api/broadcasts/upload`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.status === 'success' && data.url) {
        setFormMediaUrl(data.url);
        showToast('Berkas media berhasil diunggah!');
      } else {
        showToast('Gagal mengunggah media: ' + data.message);
      }
    } catch (err) {
      console.error('Upload error:', err);
      showToast('Koneksi gagal saat mengunggah media.');
    } finally {
      setUploadingMedia(false);
    }
  };

  // Improve current template with Gemini AI
  const handleImproveWithGemini = async () => {
    if (!formTemplate.trim()) {
      showToast('Ketik draf pesan terlebih dahulu pada kotak teks untuk diperbaiki dengan Gemini.');
      return;
    }

    setIsGeneratingAi(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/broadcasts/generate-content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: formTemplate,
          customerContext: 'Latezza Cake, premium, sapa pelanggan dengan ramah'
        })
      });
      const data = await res.json();
      if (data.status === 'success' && Array.isArray(data.variations) && data.variations.length > 0) {
        setFormTemplate(data.variations[0]);
        showToast('Pesan berhasil diperbaiki oleh Gemini!');
      } else {
        showToast('Gagal memperbaiki pesan: ' + data.message);
      }
    } catch (err) {
      console.error('AI improvement error:', err);
      showToast('Koneksi gagal saat menghubungi Gemini.');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // Submit new campaign composer
  const handleCreateCampaign = async () => {
    if (!formName.trim()) {
      showToast('Harap isi nama kampanye.');
      return;
    }
    if (!formTemplate.trim()) {
      showToast('Harap isi templat pesan siaran.');
      return;
    }
    if (formTargetFilter === 'manual' && selectedCustomers.length === 0) {
      showToast('Harap pilih minimal satu kustomer tujuan.');
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/broadcasts/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          sessionId: formSessionId,
          template: formTemplate,
          mediaType: formMediaType,
          mediaUrl: formMediaUrl || null,
          targetFilter: formTargetFilter,
          selectedPhones: formTargetFilter === 'manual' ? selectedCustomers : []
        })
      });
      const data = await res.json();
      if (data.status === 'success') {
        showToast(`Kampanye "${formName}" berhasil dibuat dalam antrean!`);
        setIsComposerOpen(false);
        // Reset Form
        setFormName('');
        setFormTemplate('');
        setFormMediaUrl('');
        setFormTargetFilter('all');
        setSelectedCustomers([]);
        
        fetchCampaigns();
      } else {
        showToast('Gagal membuat kampanye: ' + data.message);
      }
    } catch (err) {
      console.error('Failed to create campaign:', err);
      showToast('Koneksi gagal saat membuat kampanye.');
    }
  };

  // Control Campaign (Start, Pause, Cancel)
  const handleControlCampaign = async (campaignId: number, action: 'start' | 'pause' | 'cancel') => {
    const actionLabel = action === 'start' ? 'memulai' : action === 'pause' ? 'menjeda' : 'membatalkan';
    try {
      const res = await fetch(`${API_BASE_URL}/api/broadcasts/campaigns/${campaignId}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      if (data.status === 'success') {
        showToast(`Berhasil ${actionLabel} kampanye siaran.`);
        fetchCampaigns(true);
        if (isDetailOpen && selectedCampaign?.id === campaignId) {
          fetchCampaignDetail(campaignId, true);
        }
      } else {
        showToast(`Gagal ${actionLabel} kampanye: ` + data.message);
      }
    } catch (err) {
      console.error(`Control error for action ${action}:`, err);
      showToast('Koneksi gagal saat mengirim kendali kampanye.');
    }
  };

  // Helper to format date
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  // Render Status Badge
  const renderStatusBadge = (status: Campaign['status']) => {
    switch (status) {
      case 'draft':
        return <Badge variant="outline" className="bg-card text-muted-foreground">Draft</Badge>;
      case 'queued':
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">Queued</Badge>;
      case 'processing':
        return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 animate-pulse">Processing</Badge>;
      case 'completed':
        return <Badge variant="outline" className="bg-emerald-500 text-white border-none">Completed</Badge>;
      case 'paused':
        return <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20">Paused</Badge>;
      case 'failed':
        return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">Failed / Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Toggle selection for manual customers
  const handleToggleCustomerSelection = (phone: string) => {
    setSelectedCustomers(prev => 
      prev.includes(phone) ? prev.filter(p => p !== phone) : [...prev, phone]
    );
  };

  // Calculate stats overview
  const totalCampaigns = campaigns.length;
  const totalSent = campaigns.reduce((acc, c) => acc + c.sent_count, 0);
  const totalFailed = campaigns.reduce((acc, c) => acc + c.failed_count, 0);
  const totalTargets = campaigns.reduce((acc, c) => acc + c.total_targets, 0);

  return (
    <div className="space-y-6">
      {/* 1. Stats Cards Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border border-border/50 bg-card/40 backdrop-blur-sm shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">Total Kampanye</CardTitle>
            <IconSpeakerphone className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCampaigns}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Kampanye terdaftar dalam database</p>
          </CardContent>
        </Card>

        <Card className="border border-border/50 bg-card/40 backdrop-blur-sm shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">Pesan Terkirim</CardTitle>
            <IconCircleCheck className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">{totalSent}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Total pesan broadcast berhasil diterima</p>
          </CardContent>
        </Card>

        <Card className="border border-border/50 bg-card/40 backdrop-blur-sm shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">Gagal Kirim</CardTitle>
            <IconCircleX className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{totalFailed}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Nomor mati atau dibatalkan admin</p>
          </CardContent>
        </Card>

        <Card className="border border-border/50 bg-card/40 backdrop-blur-sm shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">Total Target Penerima</CardTitle>
            <IconChecks className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">{totalTargets}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Akumulasi seluruh target kontak penerima</p>
          </CardContent>
        </Card>
      </div>

      {/* 2. Main Campaign List Controls & Table */}
      <Card className="border border-border/60 bg-card/25 backdrop-blur-sm shadow-sm">
        <CardHeader className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 border-b border-border/40 pb-5">
          <div>
            <CardTitle className="text-lg font-bold text-foreground">Daftar Kampanye Siaran</CardTitle>
            <CardDescription className="text-xs">Kelola pengiriman pesan massal terpersonalisasi dengan rekayasa Anti-Ban</CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchCampaigns()}
              className="h-9 border-border bg-card/50 text-foreground flex items-center gap-2 text-xs"
              disabled={isLoading}
            >
              {isLoading ? <IconLoader className="h-3.5 w-3.5 animate-spin" /> : <IconRefresh className="h-3.5 w-3.5" />}
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => setIsComposerOpen(true)}
              className="h-9 bg-primary text-primary-foreground flex items-center gap-2 text-xs"
            >
              <IconPlus className="h-4 w-4" />
              Buat Broadcast baru
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground text-sm">
              <IconLoader className="h-8 w-8 animate-spin text-primary" />
              <span>Memuat kampanye broadcast...</span>
            </div>
          ) : campaigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground text-sm">
              <IconSpeakerphone className="h-12 w-12 text-muted-foreground/30" />
              <span className="font-semibold text-foreground/80">Belum ada kampanye broadcast</span>
              <p className="text-xs max-w-sm text-center">Mulai buat siaran baru untuk menjangkau leads atau menyapa dormant customer toko kue Anda.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-accent/20">
                  <TableRow>
                    <TableHead className="text-xs font-semibold uppercase text-muted-foreground py-3">Nama Kampanye</TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-muted-foreground py-3">Sesi WA</TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-muted-foreground py-3">Status</TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-muted-foreground py-3">Progress Pengiriman</TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-muted-foreground py-3">Terkirim / Gagal</TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-muted-foreground py-3">Tanggal Dibuat</TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase text-muted-foreground py-3">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((c) => {
                    const progress = c.total_targets > 0 ? Math.round(((c.sent_count + c.failed_count) / c.total_targets) * 100) : 0;
                    return (
                      <TableRow key={c.id} className="hover:bg-accent/10 border-b border-border/40">
                        <TableCell className="py-4 font-semibold text-sm max-w-[200px] truncate" title={c.name}>
                          {c.name}
                        </TableCell>
                        <TableCell className="py-4 text-xs text-muted-foreground font-mono">
                          {c.session_id}
                        </TableCell>
                        <TableCell className="py-4">
                          {renderStatusBadge(c.status)}
                        </TableCell>
                        <TableCell className="py-4 min-w-[150px]">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex justify-between text-[10px] font-medium text-muted-foreground">
                              <span>Progress</span>
                              <span>{progress}% ({c.sent_count + c.failed_count}/{c.total_targets})</span>
                            </div>
                            <div className="w-full h-1.5 bg-accent/40 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-primary transition-all duration-500 rounded-full" 
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-4 text-xs font-medium">
                          <span className="text-emerald-500">{c.sent_count} sukses</span>
                          <span className="text-muted-foreground mx-1">/</span>
                          <span className="text-destructive">{c.failed_count} gagal</span>
                        </TableCell>
                        <TableCell className="py-4 text-xs text-muted-foreground">
                          {formatDate(c.created_at)}
                        </TableCell>
                        <TableCell className="py-4 text-right">
                          <div className="flex justify-end items-center gap-1.5">
                            {/* Start/Resume Controls */}
                            {(c.status === 'queued' || c.status === 'paused') && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleControlCampaign(c.id, 'start')}
                                className="h-8 w-8 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10"
                                title="Mulai / Lanjutkan Siaran"
                              >
                                <IconPlayerPlay size={15} />
                              </Button>
                            )}

                            {/* Pause Control */}
                            {c.status === 'processing' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleControlCampaign(c.id, 'pause')}
                                className="h-8 w-8 text-amber-500 hover:text-amber-600 hover:bg-amber-500/10"
                                title="Jeda Sementara"
                              >
                                <IconPlayerPause size={15} />
                              </Button>
                            )}

                            {/* Cancel/Stop Control */}
                            {(c.status === 'processing' || c.status === 'queued' || c.status === 'paused') && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleControlCampaign(c.id, 'cancel')}
                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                title="Batalkan Pengiriman Sisa Antrean"
                              >
                                <IconSquareX size={15} />
                              </Button>
                            )}

                            {/* Detail Monitor */}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setSelectedCampaign(c);
                                setCampaignQueue([]);
                                setIsDetailOpen(true);
                                fetchCampaignDetail(c.id);
                              }}
                              className="h-8 w-8 text-foreground hover:bg-accent"
                              title="Lihat Detail Antrean"
                            >
                              <IconEye size={15} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Dialog: Campaign Composer */}
      <Dialog open={isComposerOpen} onOpenChange={setIsComposerOpen}>
        <DialogContent className="h-[92vh] w-[96vw] max-w-[calc(100vw-1rem)] sm:max-w-[96vw] xl:max-w-7xl flex flex-col p-0 overflow-hidden border border-border/80 bg-card shadow-2xl rounded-2xl">
          {/* Header */}
          <DialogHeader className="px-8 py-6 border-b border-border/45 bg-accent/5 flex flex-row items-center justify-between space-y-0 shrink-0">
            <div className="space-y-3">
              <DialogTitle className="text-2xl font-extrabold tracking-tight flex items-center gap-3 text-foreground">
                <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
                  <IconSpeakerphone className="h-5.5 w-5.5" />
                </div>
                Composer Siaran Massal WhatsApp
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground/85 pl-14 max-w-3xl">
                Tulis templat pesan siaran terpersonalisasi, gunakan asisten Gemini AI, dan lampirkan media pendukung dengan proteksi Anti-Ban.
              </DialogDescription>
            </div>
          </DialogHeader>

          {/* Form Area Split Layout */}
          <div className="flex-grow grid grid-cols-1 lg:grid-cols-12 overflow-hidden bg-background">
            
            {/* Left Side: Composer Fields (7 cols) - scrollable */}
            <div className="lg:col-span-7 overflow-y-auto px-8 py-7 space-y-8 border-r border-border/40">
              
              {/* Campaign Name & Session */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label htmlFor="comp-name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground/90">Nama Kampanye</label>
                  <Input 
                    id="comp-name"
                    placeholder="Contoh: Promo Ramadhan Hampers" 
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="h-10 text-sm bg-card border-border/60 focus-visible:ring-1 focus-visible:ring-primary"
                  />
                </div>
                <div className="space-y-3">
                  <label htmlFor="comp-sess" className="text-xs font-bold uppercase tracking-wider text-muted-foreground/90">Akun/Sesi WhatsApp</label>
                  <select
                    id="comp-sess"
                    value={formSessionId}
                    onChange={(e) => setFormSessionId(e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  >
                    {sessions.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.id})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Target Filtering Options */}
              <div className="space-y-5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/90 block">Pilih Filter Penerima</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {[
                    { id: 'all', label: 'Semua Kontak' },
                    { id: 'leads', label: 'Hanya Leads' },
                    { id: 'dormant', label: 'Dormant (Pasif)' },
                    { id: 'needs_follow_up', label: 'Follow-Up' },
                    { id: 'manual', label: 'Pilih Manual' }
                  ].map(filter => (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => {
                        const nextFilter = filter.id as 'all' | 'leads' | 'dormant' | 'needs_follow_up' | 'manual';
                        setFormTargetFilter(nextFilter);
                        if (nextFilter === 'manual' && allCustomers.length === 0) {
                          fetchAllCustomers();
                        }
                      }}
                      className={`px-3 py-2.5 text-center rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                        formTargetFilter === filter.id 
                          ? 'border-primary bg-primary/10 text-primary shadow-sm' 
                          : 'border-border/60 bg-card hover:bg-accent/50 text-muted-foreground'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Manual Selection Customer Checklist */}
              {formTargetFilter === 'manual' && (
                <div className="border border-border/50 rounded-2xl p-5 space-y-4 bg-accent/5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-foreground">Pilih Kontak ({selectedCustomers.length} terpilih)</span>
                    <button 
                      type="button"
                      onClick={() => {
                        if (selectedCustomers.length === allCustomers.length) {
                          setSelectedCustomers([]);
                        } else {
                          setSelectedCustomers(allCustomers.map(c => c.phone_number));
                        }
                      }}
                      className="text-xs text-primary font-semibold hover:underline bg-transparent border-none p-0 cursor-pointer"
                    >
                      {selectedCustomers.length === allCustomers.length ? 'Batal Semua' : 'Pilih Semua'}
                    </button>
                  </div>
                  
                  {isCustomersLoading ? (
                    <div className="flex items-center justify-center py-8 text-xs text-muted-foreground gap-2">
                      <IconLoader className="h-4 w-4 animate-spin text-primary" />
                      Loading kustomer...
                    </div>
                  ) : allCustomers.length === 0 ? (
                    <div className="text-xs text-muted-foreground py-4 text-center">Tidak ada customer terdaftar</div>
                  ) : (
                    <div className="max-h-56 overflow-y-auto space-y-2.5 pr-1">
                      {allCustomers.map(cust => (
                        <label 
                          key={cust.phone_number} 
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-card hover:bg-accent/30 border border-border/30 text-sm cursor-pointer transition-colors"
                        >
                          <input 
                            type="checkbox" 
                            checked={selectedCustomers.includes(cust.phone_number)}
                            onChange={() => handleToggleCustomerSelection(cust.phone_number)}
                            className="rounded border-input text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                          />
                          <div className="flex justify-between w-full min-w-0 items-center">
                            <span className="font-medium text-foreground truncate">{cust.name || 'Kontak Tanpa Nama'}</span>
                            <span className="text-xs text-muted-foreground font-mono shrink-0 bg-accent/30 px-2 py-0.5 rounded-full">{cust.phone_number.split('@')[0]}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Message Template Editor */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label htmlFor="comp-tpl" className="text-xs font-bold uppercase tracking-wider text-muted-foreground/90">Templat Pesan</label>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-muted-foreground font-medium">Variabel: <code className="bg-accent/40 px-1.5 py-0.5 rounded text-primary">{"{{name}}"}</code></span>
                    <button
                      type="button"
                      onClick={handleImproveWithGemini}
                      disabled={isGeneratingAi}
                      className="h-7 px-3 text-xs bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg flex items-center gap-1.5 cursor-pointer font-semibold transition-all disabled:opacity-50"
                    >
                      {isGeneratingAi ? (
                        <IconLoader className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <IconSparkles className="h-3.5 w-3.5 animate-pulse text-primary" />
                      )}
                      {isGeneratingAi ? 'Memperbaiki...' : 'Perbaiki dengan Gemini'}
                    </button>
                  </div>
                </div>
                <Textarea 
                  id="comp-tpl"
                  placeholder="Ketik pesan Anda di sini... Gunakan variabel {{name}} untuk nama kustom, dan Spintax seperti {Halo|Hai} untuk membuat teks bervariasi otomatis." 
                  value={formTemplate}
                  onChange={(e) => setFormTemplate(e.target.value)}
                  rows={10}
                  className="text-sm leading-relaxed p-5 bg-card border-border/60 focus-visible:ring-1 focus-visible:ring-primary min-h-[280px]"
                />
              </div>

              {/* Media Attachments (Image/Video) */}
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/90 block">Lampiran Media (Opsional)</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 items-start">
                  
                  {/* Media Type Dropdown */}
                  <select
                    value={formMediaType}
                    onChange={(e) => {
                      setFormMediaType(e.target.value as 'text' | 'image' | 'video');
                      setFormMediaUrl('');
                    }}
                    className="h-10 rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  >
                    <option value="text">Hanya Teks</option>
                    <option value="image">Gambar (JPG/PNG)</option>
                    <option value="video">Video (MP4)</option>
                  </select>

                  {/* Upload Trigger Area */}
                  {formMediaType !== 'text' && (
                    <div className="sm:col-span-2">
                      <input 
                        type="file" 
                        ref={fileInputRef}
                        onChange={handleMediaUpload}
                        accept={formMediaType === 'image' ? 'image/*' : 'video/*'}
                        className="hidden"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full h-11 border-dashed border-border/80 hover:bg-accent/40 flex items-center justify-center gap-2 text-sm text-muted-foreground bg-card"
                        disabled={uploadingMedia}
                      >
                        {uploadingMedia ? <IconLoader className="h-4 w-4 animate-spin text-primary" /> : <IconUpload className="h-4 w-4" />}
                        {formMediaUrl ? 'Ubah Berkas Media' : 'Unggah Gambar/Video'}
                      </Button>
                    </div>
                  )}
                </div>
                {formMediaUrl && (
                  <div className="text-xs text-emerald-500 font-semibold font-mono truncate px-3 py-2.5 bg-emerald-500/5 border border-emerald-500/20 rounded-lg flex items-center justify-between">
                    <span className="truncate">Terlampir: {formMediaUrl}</span>
                    <button 
                      type="button" 
                      onClick={() => setFormMediaUrl('')}
                      className="text-destructive hover:underline font-sans ml-2 cursor-pointer bg-transparent border-none p-0"
                    >
                      Hapus
                    </button>
                  </div>
                )}
              </div>

            </div>

            {/* Right Side: Preview Sidebar (5 cols) - scrollable */}
            <div className="lg:col-span-5 flex flex-col px-8 py-7 overflow-hidden">
              
              {/* Header Label */}
              <div className="flex items-center gap-2 mb-5 shrink-0">
                <IconMessage className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground/90">Pratinjau Pesan Broadcast</span>
              </div>

              {/* Content Area */}
              <div className="flex-grow overflow-y-auto pr-1">
                <div className="bg-accent/5 border border-border/40 rounded-3xl p-7 flex flex-col h-full min-h-[520px] justify-between">
                  
                  {/* Simulated Smartphone Frame */}
                  <div className="flex-grow flex flex-col bg-[#E5DDD5] dark:bg-[#0b141a] rounded-2xl border border-border/50 overflow-hidden shadow-md">
                    
                    {/* WhatsApp Mock Header */}
                    <div className="bg-[#075E54] dark:bg-[#202c33] text-white px-4 py-3.5 flex items-center gap-3 shrink-0">
                      <div className="w-8 h-8 bg-white/25 rounded-full flex items-center justify-center font-bold text-xs">
                        A
                      </div>
                      <div>
                        <div className="text-xs font-bold">Ahmad (Penerima Dummy)</div>
                        <div className="text-[9px] text-emerald-400 dark:text-[#00a884] font-semibold flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-emerald-400 dark:bg-[#00a884] rounded-full animate-pulse"></span>
                          online
                        </div>
                      </div>
                    </div>

                    {/* Chat Messages Body */}
                    <div className="flex-grow p-6 space-y-4 overflow-y-auto relative min-h-[340px]">
                      
                      {/* Outgoing WhatsApp Bubble */}
                      <div className="bg-[#d9fdd3] dark:bg-[#005c4b] text-slate-800 dark:text-slate-100 rounded-2xl rounded-tr-none px-4 py-3 text-sm shadow-sm max-w-[88%] ml-auto relative">
                        
                        {/* Preview Media Attachment */}
                        {formMediaType !== 'text' && formMediaUrl && (
                          <div className="mb-2.5 rounded-lg overflow-hidden border border-border/10 bg-accent/10 max-h-[160px]">
                            {formMediaType === 'image' ? (
                              <img 
                                src={formMediaUrl.startsWith('/') ? `${API_BASE_URL}${formMediaUrl}` : formMediaUrl} 
                                alt="Pratinjau Broadcast" 
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <video 
                                src={formMediaUrl.startsWith('/') ? `${API_BASE_URL}${formMediaUrl}` : formMediaUrl} 
                                controls 
                                className="w-full h-full object-cover"
                              />
                            )}
                          </div>
                        )}

                        {/* Preview Text */}
                        <p className="whitespace-pre-line leading-relaxed break-words pb-4">
                          {formTemplate 
                            ? formTemplate.replaceAll('{{name}}', 'Ahmad')
                            : 'Mulai ketik templat pesan Anda pada editor untuk melihat simulasi pratinjau chat WhatsApp...'
                          }
                        </p>

                        {/* Timestamp & Tick */}
                        <span className="absolute bottom-1.5 right-2.5 text-[9px] text-muted-foreground/80 flex items-center gap-1 font-mono">
                          12:00
                          <span className="text-blue-500 font-semibold">✓✓</span>
                        </span>

                      </div>

                    </div>
                  </div>

                  {/* Disclaimer */}
                  <div className="mt-6 text-[11px] text-muted-foreground/80 leading-relaxed text-center px-4 bg-accent/20 py-3 rounded-xl border border-border/20.">
                    Sistem mengacak spintax `{'{Pilihan}'}` secara dinamis dan menyuntikkan data kustomer asli (`{"{{name}}"}`) saat penyiaran berjalan untuk keamanan Anti-Ban.
                  </div>
                </div>
              </div>

            </div>

          </div>

          {/* Dialog Footer */}
          <DialogFooter className="px-8 py-6 border-t border-border/40 bg-accent/5 shrink-0 gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsComposerOpen(false)}
              className="h-10 text-sm border-border bg-card text-foreground px-5 font-semibold"
            >
              Batal
            </Button>
            <Button
              type="button"
              onClick={handleCreateCampaign}
              className="h-10 text-sm bg-primary text-primary-foreground px-6 font-bold shadow-sm transition-all hover:opacity-90"
            >
              Buat Antrean Broadcast
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 4. Dialog: Campaign Queue Monitor (Detail View) */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-4xl h-[75vh] flex flex-col p-0 overflow-hidden border border-border/80 bg-card">
          <DialogHeader className="p-5 border-b border-border/40">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
              <div>
                <DialogTitle className="text-base font-bold flex items-center gap-2">
                  <IconSpeakerphone className="h-5 w-5 text-primary" />
                  Live Monitor: {selectedCampaign?.name}
                </DialogTitle>
                <DialogDescription className="text-[11px]">
                  Pantau real-time pengiriman pesan asinkronus Anti-Ban
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                {/* Control Campaign within Details */}
                {selectedCampaign && (
                  <>
                    {(selectedCampaign.status === 'queued' || selectedCampaign.status === 'paused') && (
                      <Button
                        size="sm"
                        onClick={() => handleControlCampaign(selectedCampaign.id, 'start')}
                        className="h-8 bg-emerald-500 hover:bg-emerald-600 text-white flex items-center gap-1 text-xs"
                      >
                        <IconPlayerPlay size={14} />
                        Mulai
                      </Button>
                    )}
                    {selectedCampaign.status === 'processing' && (
                      <Button
                        size="sm"
                        onClick={() => handleControlCampaign(selectedCampaign.id, 'pause')}
                        className="h-8 bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-1 text-xs"
                      >
                        <IconPlayerPause size={14} />
                        Jeda
                      </Button>
                    )}
                    {(selectedCampaign.status === 'processing' || selectedCampaign.status === 'queued' || selectedCampaign.status === 'paused') && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleControlCampaign(selectedCampaign.id, 'cancel')}
                        className="h-8 flex items-center gap-1 text-xs"
                      >
                        <IconSquareX size={14} />
                        Batalkan Sisa
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          </DialogHeader>

          {/* Details & Queue List Area */}
          <div className="flex-grow overflow-y-auto p-5 space-y-5">
            {/* Campaign Summary & Progress Indicators */}
            {selectedCampaign && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border border-border/40 rounded-xl p-4 bg-accent/10">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Status</span>
                  <div className="mt-1">{renderStatusBadge(selectedCampaign.status)}</div>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Terkirim / Target</span>
                  <div className="text-sm font-bold mt-1 text-foreground">
                    {selectedCampaign.sent_count + selectedCampaign.failed_count} / {selectedCampaign.total_targets}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Sukses</span>
                  <div className="text-sm font-bold text-emerald-500 mt-1">{selectedCampaign.sent_count}</div>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Gagal</span>
                  <div className="text-sm font-bold text-destructive mt-1">{selectedCampaign.failed_count}</div>
                </div>
              </div>
            )}

            {/* Queue Table */}
            <div className="border border-border/40 rounded-lg overflow-hidden">
              {isDetailLoading ? (
                <div className="flex items-center justify-center py-12 text-sm text-muted-foreground gap-2">
                  <IconLoader className="h-4 w-4 animate-spin text-primary" />
                  Loading detail antrean...
                </div>
              ) : campaignQueue.length === 0 ? (
                <div className="text-center py-12 text-xs text-muted-foreground">Tidak ada antrean terdaftar untuk kampanye ini</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-accent/20">
                      <TableRow>
                        <TableHead className="text-[10px] font-semibold uppercase text-muted-foreground py-2.5">No Penerima</TableHead>
                        <TableHead className="text-[10px] font-semibold uppercase text-muted-foreground py-2.5">Status</TableHead>
                        <TableHead className="text-[10px] font-semibold uppercase text-muted-foreground py-2.5">Isi Pesan Terpersonalisasi</TableHead>
                        <TableHead className="text-[10px] font-semibold uppercase text-muted-foreground py-2.5">Catatan Error</TableHead>
                        <TableHead className="text-[10px] font-semibold uppercase text-muted-foreground py-2.5">Waktu Kirim</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {campaignQueue.map((item) => (
                        <TableRow key={item.id} className="hover:bg-accent/10 border-b border-border/40">
                          <TableCell className="py-3 font-semibold text-xs font-mono">
                            {item.phone_number.split('@')[0]}
                          </TableCell>
                          <TableCell className="py-3">
                            {item.status === 'pending' && <Badge variant="outline" className="bg-card text-muted-foreground text-[9px] px-1.5 py-0">Pending</Badge>}
                            {item.status === 'sending' && <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-[9px] px-1.5 py-0 animate-pulse">Sending</Badge>}
                            {item.status === 'sent' && <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[9px] px-1.5 py-0">Sent</Badge>}
                            {item.status === 'failed' && <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-[9px] px-1.5 py-0">Failed</Badge>}
                          </TableCell>
                          <TableCell className="py-3 text-xs max-w-[250px] truncate" title={item.personalized_message}>
                            {item.personalized_message}
                          </TableCell>
                          <TableCell className="py-3 text-[10px] text-destructive max-w-[150px] truncate" title={item.error_message || ''}>
                            {item.error_message || <span className="text-muted-foreground/30">-</span>}
                          </TableCell>
                          <TableCell className="py-3 text-[10px] text-muted-foreground">
                            {item.sent_at ? formatDate(item.sent_at) : <span className="text-muted-foreground/30">-</span>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="p-5 border-t border-border/40 bg-accent/10">
            <Button
              type="button"
              onClick={() => setIsDetailOpen(false)}
              className="h-9 text-xs bg-primary text-primary-foreground"
            >
              Tutup Monitor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}




