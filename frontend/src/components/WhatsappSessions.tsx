import { useState, useEffect } from 'react';
import { 
  IconBrandWhatsapp, 
  IconPlus, 
  IconRefresh, 
  IconTrash, 
  IconLoader, 
  IconDeviceFloppy,
  IconCheck,
  IconAlertCircle
} from '@tabler/icons-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { API_BASE_URL } from '@/config';

interface WhatsAppSession {
  id: string;
  name: string;
  phone_number: string | null;
  status: 'disconnected' | 'connecting' | 'connected' | 'qr_received';
  qr_code: string | null;
  created_at: string;
  updated_at: string;
}

export default function WhatsappSessions() {
  const [sessions, setSessions] = useState<WhatsAppSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<WhatsAppSession | null>(null);

  // Form state
  const [form, setForm] = useState({
    id: '',
    name: ''
  });

  // Fetch sessions
  const fetchSessions = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/whatsapp/sessions`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setSessions(data);
      }
    } catch (err) {
      console.error('Failed to fetch WhatsApp sessions:', err);
      if (!silent) toast.error('Gagal mengambil daftar sesi WhatsApp.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Poll sessions list when page is active (every 3 seconds to fetch QR updates/connection statuses)
  useEffect(() => {
    fetchSessions();
    const interval = setInterval(() => {
      fetchSessions(true);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Handle Add Session
  const handleAddSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.id.trim() || !form.name.trim()) {
      toast.error('ID dan Nama sesi harus diisi.');
      return;
    }

    // Slugify ID
    const formattedId = form.id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    if (!formattedId) {
      toast.error('ID tidak valid.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/whatsapp/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: formattedId, name: form.name.trim() })
      });
      const data = await res.json();
      if (data.status === 'success') {
        toast.success(`Sesi "${form.name}" berhasil dibuat! Memulai koneksi...`);
        setIsAddOpen(false);
        setForm({ id: '', name: '' });
        fetchSessions();
      } else {
        toast.error(data.message || 'Gagal membuat sesi baru.');
      }
    } catch (err) {
      toast.error('Koneksi gagal saat membuat sesi.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Delete Session
  const handleDeleteSession = async () => {
    if (!selectedSession) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/whatsapp/sessions/${selectedSession.id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.status === 'success') {
        toast.success(`Sesi "${selectedSession.name}" berhasil dihapus.`);
        setIsDeleteOpen(false);
        setSelectedSession(null);
        fetchSessions();
      } else {
        toast.error(data.message || 'Gagal menghapus sesi.');
      }
    } catch (err) {
      toast.error('Koneksi gagal saat menghapus sesi.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Regenerate Session
  const handleRegenerateSession = async (sessionId: string) => {
    setActionLoading(sessionId);
    try {
      const res = await fetch(`${API_BASE_URL}/api/whatsapp/sessions/${sessionId}/regenerate`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.status === 'success') {
        toast.success('Sesi di-reset. Menyiapkan QR code baru...');
        fetchSessions(true);
      } else {
        toast.error(data.message || 'Gagal me-regenerate sesi.');
      }
    } catch (err) {
      toast.error('Koneksi gagal saat me-regenerate sesi.');
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status: WhatsAppSession['status']) => {
    switch (status) {
      case 'connected':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.15)]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Connected
          </span>
        );
      case 'connecting':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            Connecting...
          </span>
        );
      case 'qr_received':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-500 border border-blue-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
            Scan QR
          </span>
        );
      case 'disconnected':
      default:
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground"></span>
            Disconnected
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      {/* Top Banner Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card border border-border p-4 rounded-xl">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <IconBrandWhatsapp className="text-primary" size={20} />
            Daftar Sesi WhatsApp Agen AI
          </h2>
          <p className="text-xs text-muted-foreground">
            Sambungkan nomor-nomor baru untuk bertindak sebagai agen Customer Service AI Latezza.
          </p>
        </div>
        <Button onClick={() => setIsAddOpen(true)} className="w-full sm:w-auto gap-2">
          <IconPlus size={16} />
          Tambah Sesi Baru
        </Button>
      </div>

      {loading && sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 bg-card border border-border rounded-2xl">
          <IconLoader className="animate-spin text-primary mb-4" size={40} />
          <span className="text-sm font-semibold text-muted-foreground">Memuat sesi WhatsApp...</span>
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 bg-card border border-border rounded-2xl text-center">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center text-muted-foreground mb-4">
            <IconBrandWhatsapp size={32} />
          </div>
          <h3 className="text-lg font-bold mb-1">Belum Ada Sesi WhatsApp</h3>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            Buat sesi WhatsApp pertamamu untuk menghubungkan nomor agen AI dengan sistem Latezza Cake.
          </p>
          <Button onClick={() => setIsAddOpen(true)} className="gap-2">
            <IconPlus size={16} />
            Buat Sesi Pertama
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {sessions.map((session) => (
            <Card key={session.id} className="border border-border bg-card/60 backdrop-blur-sm relative overflow-hidden flex flex-col justify-between">
              {/* Card Header */}
              <CardHeader className="pb-4">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex flex-col gap-1 min-w-0">
                    <CardTitle className="text-lg font-bold flex items-center gap-2 truncate">
                      {session.name}
                      <span className="text-xs font-normal text-muted-foreground font-mono bg-accent px-1.5 py-0.5 rounded">
                        {session.id}
                      </span>
                    </CardTitle>
                    <CardDescription className="text-xs truncate font-mono">
                      {session.phone_number ? `+${session.phone_number}` : 'Nomor tidak terhubung'}
                    </CardDescription>
                  </div>
                  {getStatusBadge(session.status)}
                </div>
              </CardHeader>

              {/* Card Body */}
              <CardContent className="pb-4 flex-grow flex flex-col justify-center items-center">
                {session.status === 'qr_received' && session.qr_code ? (
                  <div className="flex flex-col items-center gap-4 p-4 bg-muted/30 border border-border rounded-xl w-full max-w-[280px]">
                    <div className="relative p-2 bg-white rounded-lg border border-border shadow-inner">
                      {/* Scan indicator line */}
                      <div className="absolute left-2 right-2 top-2 h-[2px] bg-primary animate-scan-line z-10 shadow-[0_0_8px_rgba(235,94,40,0.8)]" />
                      <img 
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(session.qr_code)}`} 
                        alt="WhatsApp QR Code"
                        className="w-[200px] h-[200px]"
                      />
                    </div>
                    <div className="text-center flex flex-col gap-1">
                      <span className="text-xs font-bold text-foreground">Scan untuk Menyambungkan</span>
                      <p className="text-[10px] text-muted-foreground max-w-[200px]">
                        Buka WhatsApp &gt; Perangkat Tertaut &gt; Tautkan Perangkat, lalu arahkan kamera ke kode QR ini.
                      </p>
                    </div>
                  </div>
                ) : session.status === 'connected' ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center text-emerald-500 w-full">
                    <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center text-emerald-500 mb-3 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
                      <IconCheck size={32} />
                    </div>
                    <span className="text-sm font-bold text-foreground mb-1">Sesi Aktif</span>
                    <p className="text-xs text-muted-foreground max-w-xs">
                      Agen AI sedang memantau dan membalas pesan masuk ke nomor ini secara otomatis.
                    </p>
                  </div>
                ) : session.status === 'connecting' ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center text-amber-500 w-full">
                    <IconLoader className="animate-spin mb-3 text-amber-500" size={32} />
                    <span className="text-sm font-bold text-foreground mb-1">Menghubungkan...</span>
                    <p className="text-xs text-muted-foreground">
                      Menghubungkan ke server WhatsApp. Mohon tunggu.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground w-full">
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center text-muted-foreground mb-3">
                      <IconAlertCircle size={32} />
                    </div>
                    <span className="text-sm font-bold text-foreground mb-1">Terputus</span>
                    <p className="text-xs text-muted-foreground max-w-xs">
                      Sesi terputus. Klik tombol **Hubungkan Kembali** untuk memunculkan QR Code pemindaian.
                    </p>
                  </div>
                )}
              </CardContent>

              {/* Card Footer Actions */}
              <div className="px-6 py-4 border-t border-border flex justify-between gap-3 bg-muted/10">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => handleRegenerateSession(session.id)}
                  disabled={actionLoading === session.id}
                  className="gap-1.5 flex-1"
                >
                  {actionLoading === session.id ? (
                    <IconLoader className="animate-spin" size={14} />
                  ) : (
                    <IconRefresh size={14} />
                  )}
                  {session.status === 'connected' ? 'Disconnect & Reset' : 'Hubungkan Kembali'}
                </Button>
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => {
                    setSelectedSession(session);
                    setIsDeleteOpen(true);
                  }}
                  className="gap-1.5 px-3"
                  title="Hapus Sesi"
                >
                  <IconTrash size={14} />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add Session Modal */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[420px] bg-card border border-border">
          <DialogHeader>
            <DialogTitle>Buat Sesi WhatsApp Baru</DialogTitle>
            <DialogDescription>
              Buat kontainer sesi agen AI baru. Anda harus memindai QR code setelah sesi ini dibuat.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddSession} className="space-y-4 pt-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="id" className="text-xs font-bold text-foreground">ID Sesi (Slug/Kode unik)</label>
              <Input 
                id="id" 
                placeholder="misal: cs-hampers, cs-kue-kering" 
                value={form.id}
                onChange={(e) => setForm(prev => ({ ...prev, id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-') }))}
                required
              />
              <span className="text-[10px] text-muted-foreground font-mono">
                Hanya diperbolehkan huruf kecil, angka, strip (-), atau underscore (_).
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="name" className="text-xs font-bold text-foreground">Nama Sesi / Agen</label>
              <Input 
                id="name" 
                placeholder="misal: Customer Service Hampers" 
                value={form.name}
                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Batal</Button>
              <Button type="submit" disabled={loading} className="gap-2">
                {loading ? <IconLoader className="animate-spin" size={16} /> : <IconDeviceFloppy size={16} />}
                Buat Sesi
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="sm:max-w-[400px] bg-card border border-border">
          <DialogHeader>
            <DialogTitle className="text-destructive">Hapus Sesi WhatsApp?</DialogTitle>
            <DialogDescription>
              Tindakan ini akan menghentikan koneksi nomor WhatsApp pada sesi ini secara permanen dan menghapus semua data autentikasi. Anda harus melakukan scanning ulang jika ingin menghubungkannya kembali.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-destructive/10 border border-destructive/20 text-destructive text-xs p-3 rounded-lg flex items-start gap-2.5 my-2">
            <IconAlertCircle size={16} className="shrink-0 mt-0.5" />
            <div className="flex flex-col gap-0.5">
              <span className="font-bold">Konfirmasi Penghapusan Sesi:</span>
              <p>Sesi **{selectedSession?.name}** ({selectedSession?.id}) akan dihapus secara permanen dari server.</p>
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)} disabled={loading}>Batal</Button>
            <Button variant="destructive" onClick={handleDeleteSession} disabled={loading} className="gap-2">
              {loading ? <IconLoader className="animate-spin" size={16} /> : <IconTrash size={16} />}
              Hapus Sesi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
