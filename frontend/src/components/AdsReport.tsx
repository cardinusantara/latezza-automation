import { useState, useEffect, useRef } from 'react';
import { 
  IconRefresh, 
  IconSend, 
  IconExternalLink, 
  IconLoader, 
  IconAlertCircle,
  IconChartBar,
  IconUpload,
  IconFileTypeCsv,
  IconApi,
  IconCheck
} from '@tabler/icons-react';
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { API_BASE_URL } from '@/config';

interface CsvMetadata {
  filename: string;
  rows: number;
  uploadedAt: string;
  size: number;
}

export default function AdsReport() {
  // Date selection state
  const getLocalDateString = (date: Date) => {
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
  };

  const todayStr = getLocalDateString(new Date());
  const last7Days = new Date();
  last7Days.setDate(last7Days.getDate() - 7);
  const last7DaysStr = getLocalDateString(last7Days);

  const [dateFrom, setDateFrom] = useState(last7DaysStr);
  const [dateTo, setDateTo] = useState(todayStr);
  const [activePreset, setActivePreset] = useState('7');

  const [loading, setLoading] = useState(false);
  const [checkingReport, setCheckingReport] = useState(true);
  const [reportExists, setReportExists] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  // CSV upload state
  const [csvStatus, setCsvStatus] = useState<{
    exists: boolean;
    dataSource: string;
    metadata: CsvMetadata | null;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDateChange = (from: string, to: string) => {
    setDateFrom(from);
    setDateTo(to);
    setActivePreset('custom');
  };

  const handleApplyPreset = (presetName: string, days?: number) => {
    setActivePreset(presetName);
    const today = new Date();
    if (presetName === 'this_month') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      setDateFrom(getLocalDateString(start));
      setDateTo(getLocalDateString(today));
    } else if (days) {
      const start = new Date();
      start.setDate(today.getDate() - days);
      setDateFrom(getLocalDateString(start));
      setDateTo(getLocalDateString(today));
    }
  };

  // Check if report.html exists on server
  const checkReportStatus = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/report-html`, { method: 'HEAD' });
      if (res.status === 200) {
        setReportExists(true);
      } else {
        setReportExists(false);
      }
    } catch {
      setReportExists(false);
    } finally {
      setCheckingReport(false);
    }
  };

  // Check CSV upload status
  const checkCsvStatus = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/ads-csv-status`);
      const data = await res.json();
      if (data.status === 'success') {
        setCsvStatus(data);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const init = async () => {
      await checkReportStatus();
      await checkCsvStatus();
    };
    init();
  }, []);

  // Upload CSV file
  const handleUploadCsv = async () => {
    if (!selectedFile) {
      toast.error('Pilih file CSV terlebih dahulu.');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await fetch(`${API_BASE_URL}/api/upload-ads-csv`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.status === 'success') {
        toast.success(data.message);
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        await checkCsvStatus();
      } else {
        toast.error('Gagal upload: ' + (data.message || 'unknown error'));
      }
    } catch {
      toast.error('Koneksi gagal saat upload CSV.');
    } finally {
      setUploading(false);
    }
  };

  // Switch data source (api/csv)
  const handleSwitchDataSource = async (source: 'api' | 'csv') => {
    if (source === 'csv' && (!csvStatus || !csvStatus.exists)) {
      toast.error('Upload file CSV terlebih dahulu sebelum beralih ke data CSV.');
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/ads-data-source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source })
      });
      const data = await res.json();
      if (data.status === 'success') {
        toast.success(`Sumber data diubah ke: ${source === 'api' ? 'Meta API' : 'CSV Upload'}`);
        await checkCsvStatus();
      } else {
        toast.error('Gagal mengubah sumber data: ' + (data.message || 'unknown error'));
      }
    } catch {
      toast.error('Koneksi gagal saat mengubah sumber data.');
    }
  };

  // Run analysis script and update report
  const handleRunAnalysis = async () => {
    setLoading(true);
    const sourceLabel = csvStatus?.dataSource === 'csv' ? 'CSV' : 'Meta Ads API';
    toast.info(`Sedang menganalisis data dari ${sourceLabel} (${dateFrom} s/d ${dateTo})...`);
    try {
      const res = await fetch(`${API_BASE_URL}/run-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date_from: dateFrom, date_to: dateTo })
      });
      const data = await res.json();
      if (data.status === 'success') {
        toast.success('Analisis iklan berhasil diselesaikan dan laporan diperbarui.');
        setReportExists(true);
        setIframeKey(Date.now());
      } else {
        toast.error('Gagal menjalankan analisis: ' + (data.message || 'unknown error'));
      }
    } catch {
      toast.error('Koneksi gagal saat menjalankan analisis.');
    } finally {
      setLoading(false);
    }
  };

  // Broadcast report to WA group JID
  const handleSendReport = async () => {
    toast.info(`Sedang mengirim ringkasan laporan (${dateFrom} s/d ${dateTo}) ke grup WhatsApp...`);
    try {
      const res = await fetch(`${API_BASE_URL}/trigger-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date_from: dateFrom, date_to: dateTo })
      });
      const data = await res.json();
      if (data.status === 'success') {
        toast.success('Pesan ringkasan laporan berhasil dipicu ke grup WhatsApp target.');
      } else {
        toast.error('Gagal memicu pengiriman laporan: ' + data.message);
      }
    } catch {
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
              Pantau performa iklan digital secara dinamis dengan rentang tanggal khusus yang dianalisis oleh Gemini AI.
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

        {/* Date Selector Row */}
        <div className="px-6 pb-3 pt-1 flex flex-wrap items-center gap-4 border-t border-border/40">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground font-semibold uppercase">Periode Analisis:</span>
            <div className="flex items-center gap-2 bg-muted/40 border border-border rounded-lg p-1.5 px-3">
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-muted-foreground uppercase font-bold">Dari:</span>
                <input 
                  type="date" 
                  value={dateFrom} 
                  onChange={(e) => handleDateChange(e.target.value, dateTo)} 
                  className="bg-transparent text-xs text-foreground outline-none border-none cursor-pointer [color-scheme:dark]"
                />
              </div>
              <div className="h-4 w-px bg-border mx-1" />
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-muted-foreground uppercase font-bold">Sampai:</span>
                <input 
                  type="date" 
                  value={dateTo} 
                  onChange={(e) => handleDateChange(dateFrom, e.target.value)} 
                  className="bg-transparent text-xs text-foreground outline-none border-none cursor-pointer [color-scheme:dark]"
                />
              </div>
            </div>
          </div>

          {/* Quick Presets */}
          <div className="flex items-center gap-1 border border-border bg-muted/20 rounded-lg p-0.5">
            <button 
              onClick={() => handleApplyPreset('7', 7)}
              className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all ${
                activePreset === '7'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold'
                  : 'text-muted-foreground hover:text-foreground border border-transparent'
              }`}
            >
              7 Hari
            </button>
            <button 
              onClick={() => handleApplyPreset('14', 14)}
              className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all ${
                activePreset === '14'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold'
                  : 'text-muted-foreground hover:text-foreground border border-transparent'
              }`}
            >
              14 Hari
            </button>
            <button 
              onClick={() => handleApplyPreset('30', 30)}
              className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all ${
                activePreset === '30'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold'
                  : 'text-muted-foreground hover:text-foreground border border-transparent'
              }`}
            >
              30 Hari
            </button>
            <button 
              onClick={() => handleApplyPreset('this_month')}
              className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all ${
                activePreset === 'this_month'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold'
                  : 'text-muted-foreground hover:text-foreground border border-transparent'
              }`}
            >
              Bulan Ini
            </button>
          </div>
        </div>

        {/* CSV Upload & Data Source Bar */}
        <div className="px-6 pb-4 flex flex-wrap items-center gap-3 border-t border-border pt-3">
          {/* Data Source Badge */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground font-semibold uppercase">Sumber Data:</span>
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold ${
              csvStatus?.dataSource === 'csv'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
            }`}>
              {csvStatus?.dataSource === 'csv' ? (
                <><IconFileTypeCsv size={12} /> CSV Uploaded</>
              ) : (
                <><IconApi size={12} /> Meta API</>
              )}
            </div>
          </div>

          {/* Switch Source Buttons */}
          <div className="flex gap-1">
            <button
              onClick={() => handleSwitchDataSource('api')}
              className={`px-2.5 py-1 rounded text-[10px] font-medium border transition-colors ${
                csvStatus?.dataSource === 'api'
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                  : 'bg-card/30 border-border text-muted-foreground hover:border-blue-500/30'
              }`}
              disabled={loading}
            >
              <IconApi size={11} className="inline mr-1" />
              API
            </button>
            <button
              onClick={() => handleSwitchDataSource('csv')}
              className={`px-2.5 py-1 rounded text-[10px] font-medium border transition-colors ${
                csvStatus?.dataSource === 'csv'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : 'bg-card/30 border-border text-muted-foreground hover:border-emerald-500/30'
              }`}
              disabled={loading}
            >
              <IconFileTypeCsv size={11} className="inline mr-1" />
              CSV
            </button>
          </div>

          <div className="w-px h-5 bg-border mx-1" />

          {/* CSV File Input & Upload */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              className="block w-full text-[10px] text-muted-foreground file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border file:border-border file:text-[10px] file:font-semibold file:bg-card/30 file:text-foreground hover:file:bg-card/50 file:cursor-pointer max-w-[240px]"
            />
            <Button
              onClick={handleUploadCsv}
              disabled={!selectedFile || uploading}
              variant="outline"
              size="sm"
              className="text-[10px] h-7 gap-1"
            >
              {uploading ? (
                <IconLoader size={12} className="animate-spin" />
              ) : (
                <IconUpload size={12} />
              )}
              <span>Upload</span>
            </Button>
          </div>

          {/* Uploaded File Status */}
          {csvStatus?.exists && csvStatus.metadata && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-emerald-500/5 border border-emerald-500/10 rounded-md px-2.5 py-1">
              <IconCheck size={11} className="text-emerald-400" />
              <span className="font-medium text-emerald-400/90">{csvStatus.metadata.filename}</span>
              <span className="text-muted-foreground/60">·</span>
              <span>{csvStatus.metadata.rows} baris</span>
              <span className="text-muted-foreground/60">·</span>
              <span>{new Date(csvStatus.metadata.uploadedAt).toLocaleDateString('id-ID')}</span>
              {csvStatus.dataSource !== 'csv' && (
                <span className="text-amber-400/70 ml-1">(tidak aktif)</span>
              )}
            </div>
          )}
        </div>
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