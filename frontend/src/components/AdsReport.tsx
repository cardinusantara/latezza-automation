import { useState, useEffect } from 'react';
import { 
  IconRefresh, 
  IconSend, 
  IconExternalLink, 
  IconLoader, 
  IconAlertCircle,
  IconChartBar
} from '@tabler/icons-react';
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { API_BASE_URL } from '@/config';

export default function AdsReport() {
  const [loading, setLoading] = useState(false);
  const [checkingReport, setCheckingReport] = useState(true);
  const [reportExists, setReportExists] = useState(false);
  const [iframeKey, setIframeKey] = useState(Date.now());

  // Check if report.html exists on server
  const checkReportStatus = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/report-html`, { method: 'HEAD' });
      if (res.status === 200) {
        setReportExists(true);
      } else {
        setReportExists(false);
      }
    } catch (err) {
      setReportExists(false);
    } finally {
      setCheckingReport(false);
    }
  };

  useEffect(() => {
    checkReportStatus();
  }, []);

  // Run analysis script and update report
  const handleRunAnalysis = async () => {
    setLoading(true);
    toast.info('Sedang menarik data Meta Ads dan mengolah dengan Gemini...');
    try {
      const res = await fetch(`${API_BASE_URL}/run-analysis`, { method: 'POST' });
      const data = await res.json();
      if (data.status === 'success') {
        toast.success('Analisis iklan berhasil diselesaikan dan laporan diperbarui.');
        setReportExists(true);
        setIframeKey(Date.now()); // force iframe refresh
      } else {
        toast.error('Gagal menjalankan analisis: ' + (data.message || 'unknown error'));
      }
    } catch (err) {
      toast.error('Koneksi gagal saat menjalankan analisis.');
    } finally {
      setLoading(false);
    }
  };

  // Broadcast report to WA group JID
  const handleSendReport = async () => {
    toast.info('Sedang mengirim ringkasan laporan ke grup WhatsApp...');
    try {
      const res = await fetch(`${API_BASE_URL}/trigger-analysis`, { method: 'POST' });
      const data = await res.json();
      if (data.status === 'success') {
        toast.success('Pesan ringkasan laporan berhasil dipicu ke grup WhatsApp target.');
      } else {
        toast.error('Gagal memicu pengiriman laporan: ' + data.message);
      }
    } catch (err) {
      toast.error('Koneksi gagal saat mengirim laporan.');
    }
  };

  if (checkingReport) {
    return (
      <div className="flex justify-center items-center py-24 text-muted-foreground gap-3">
        <IconLoader size={36} className="animate-spin" />
        <span className="text-sm font-semibold">Memeriksa status laporan...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 h-[calc(100vh-120px)]">
      {/* Controls Card */}
      <Card className="bg-card border-border shadow-sm flex-shrink-0">
        <CardHeader className="flex flex-row items-center justify-between pb-4 space-y-0 flex-wrap gap-4">
          <div>
            <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
              <IconChartBar className="text-emerald-500" size={20} />
              <span>Meta Ads Report Dashboard</span>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-1">
              Pantau visualisasi performa iklan harian, mingguan, dan bulanan yang dianalisis secara kualitatif oleh Gemini AI.
            </CardDescription>
          </div>
          <div className="flex gap-2.5 items-center">
            <Button
              onClick={handleRunAnalysis}
              disabled={loading}
              className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold gap-1.5 h-9"
            >
              {loading ? <IconLoader size={16} className="animate-spin" /> : <IconRefresh size={16} />}
              <span>{loading ? 'Menganalisis...' : 'Regenerate Report'}</span>
            </Button>
            
            <Button
              onClick={handleSendReport}
              disabled={loading || !reportExists}
              variant="outline"
              className="border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-400 text-xs font-semibold gap-1.5 h-9"
            >
              <IconSend size={16} />
              <span>Kirim ke WhatsApp</span>
            </Button>
            
            {reportExists && (
              <a 
                href={`${API_BASE_URL}/report-html`} 
                target="_blank" 
                rel="noreferrer"
              >
                <Button
                  variant="ghost"
                  className="text-xs font-semibold text-blue-400 hover:text-blue-300 gap-1.5 h-9 border border-border"
                >
                  <IconExternalLink size={16} />
                  <span>Buka Tab Baru</span>
                </Button>
              </a>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Report View Panel */}
      <div className="flex-grow min-h-0 border border-border rounded-2xl overflow-hidden bg-[#0a0d16] relative flex flex-col shadow-inner">
        {reportExists ? (
          <iframe 
            src={`${API_BASE_URL}/report-html?t=${iframeKey}`}
            className="w-full h-full border-none bg-background flex-grow"
            title="Meta Ads Performance Report"
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-12 text-center gap-4 max-w-md mx-auto my-auto">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <IconAlertCircle size={28} />
            </div>
            <div className="flex flex-col gap-1.5">
              <h3 className="text-sm font-semibold text-foreground">Laporan Belum Digenerate</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Sistem tidak mendeteksi berkas hasil analisis Meta Ads. Harap jalankan regenerasi laporan untuk pertama kali.
              </p>
            </div>
            <Button
              onClick={handleRunAnalysis}
              disabled={loading}
              className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-xs gap-1.5 h-9 px-5 mt-2"
            >
              {loading ? <IconLoader size={16} className="animate-spin" /> : <IconRefresh size={16} />}
              <span>Generate Laporan Pertama</span>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
