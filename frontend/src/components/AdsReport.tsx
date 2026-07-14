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
import { api, getAuthHeaders } from '@/lib/api';

interface CsvMetadata {
  filename: string;
  rows: number;
  uploadedAt: string;
  size: number;
}

interface CsvStatus {
  exists: boolean;
  dataSource: string;
  metadata: CsvMetadata | null;
}

// Static configurations and pure helper functions defined outside the component
const getLocalDateString = (date: Date) => {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split('T')[0];
};

const STEPS = [
  { key: 'config', label: 'Membaca konfigurasi & rentang tanggal', keywords: ['Mempersiapkan', 'Mengatur rentang tanggal'] },
  { key: 'fetch', label: 'Mengambil data iklan (API / CSV)', keywords: ['Mengambil data real-time', 'Berhasil mengambil data', 'Membaca data dari file CSV', 'Berhasil memuat'] },
  { key: 'brand', label: 'Mengelompokkan kategori brand & produk', keywords: ['Mengelompokkan kategori brand'] },
  { key: 'gemini', label: 'Analisis performa & copywriting dengan Gemini AI', keywords: ['Mengirim ringkasan performa', 'Menjalankan analisis Gemini', 'Analisis performa & copywriting dari Gemini'] },
  { key: 'compile', label: 'Menyusun dashboard laporan interaktif HTML', keywords: ['Menyusun dashboard laporan', 'Laporan HTML berhasil diperbarui'] }
];

const getStepState = (stepIndex: number, loading: boolean, streamMessages: string[]) => {
  if (!loading) return 'pending';
  
  // Find the latest message that matches any step's keywords to find current active step
  let activeStepIdx = -1;
  for (let i = streamMessages.length - 1; i >= 0; i--) {
    const msg = streamMessages[i];
    const foundIdx = STEPS.findIndex(s => s.keywords.some(k => msg.includes(k)));
    if (foundIdx !== -1) {
      activeStepIdx = foundIdx;
      break;
    }
  }

  if (activeStepIdx === -1) {
    return stepIndex === 0 ? 'active' : 'pending';
  }

  if (stepIndex < activeStepIdx) return 'completed';
  if (stepIndex === activeStepIdx) {
    const latestMsg = streamMessages.at(-1) || '';
    const completionKeywords = [
      'Mengatur rentang tanggal', 
      'Berhasil mengambil data', 
      'Berhasil memuat',
      'kategori brand dan produk', 
      'Gemini AI berhasil diterima', 
      'Laporan HTML berhasil diperbarui'
    ];
    const isCompleted = completionKeywords.some(ck => latestMsg.includes(ck));
    return isCompleted ? 'completed' : 'active';
  }
  return 'pending';
};

const calculatePresetDates = (presetName: string, days?: number) => {
  const today = new Date();
  let from = '';
  const to = getLocalDateString(today);
  if (presetName === 'this_month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    from = getLocalDateString(start);
  } else if (days) {
    const start = new Date();
    start.setDate(today.getDate() - days);
    from = getLocalDateString(start);
  }
  return { from, to };
};

async function switchDataSource(
  source: 'api' | 'csv', 
  csvExists: boolean, 
  checkCsvStatus: () => Promise<void>
) {
  if (source === 'csv' && !csvExists) {
    toast.error('Upload file CSV terlebih dahulu sebelum beralih ke data CSV.');
    return;
  }

  try {
    const data = await api.post('/api/ads-data-source', { source });
    if (data.status === 'success') {
      toast.success(`Sumber data diubah ke: ${source === 'api' ? 'Meta API' : 'CSV Upload'}`);
      await checkCsvStatus();
    } else {
      toast.error('Gagal mengubah sumber data: ' + (data.message || 'unknown error'));
    }
  } catch {
    toast.error('Koneksi gagal saat mengubah sumber data.');
  }
}

async function sendReportToWhatsApp(dateFrom: string, dateTo: string) {
  toast.info(`Sedang mengirim ringkasan laporan (${dateFrom} s/d ${dateTo}) ke grup WhatsApp...`);
  try {
    const data = await api.post('/trigger-analysis', { date_from: dateFrom, date_to: dateTo });
    if (data.status === 'success') {
      toast.success('Pesan ringkasan laporan berhasil dipicu ke grup WhatsApp target.');
    } else {
      toast.error('Gagal memicu pengiriman laporan: ' + data.message);
    }
  } catch {
    toast.error('Koneksi gagal saat mengirim laporan.');
  }
}

function handleSseMessagePayload(
  payload: { type: string; message?: string; text?: string },
  eventSource: EventSource,
  setStreamMessages: React.Dispatch<React.SetStateAction<string[]>>,
  setStreamLogs: React.Dispatch<React.SetStateAction<string>>,
  setReportExists: (exists: boolean) => void,
  setIframeKey: (key: number | ((prev: number) => number)) => void,
  setLoading: (loading: boolean) => void
) {
  if (payload.type === 'status') {
    setStreamMessages(prev => {
      if (prev.length > 0 && prev.at(-1) === payload.message) {
        return prev;
      }
      return [...prev, payload.message || ''];
    });
  } else if (payload.type === 'chunk') {
    setStreamLogs(prev => prev + payload.text);
  } else if (payload.type === 'done') {
    toast.success('Analisis iklan berhasil diselesaikan dan laporan diperbarui.');
    setReportExists(true);
    setIframeKey(Date.now());
    eventSource.close();
    setLoading(false);
  } else if (payload.type === 'error') {
    toast.error('Gagal menjalankan analisis: ' + payload.message);
    eventSource.close();
    setLoading(false);
  }
}

function useAdsAnalysis(
  dateFrom: string,
  dateTo: string,
  csvStatus: CsvStatus | null,
  setReportExists: (exists: boolean) => void,
  setIframeKey: (key: number | ((prev: number) => number)) => void
) {
  const [loading, setLoading] = useState(false);
  const [streamMessages, setStreamMessages] = useState<string[]>([]);
  const [streamLogs, setStreamLogs] = useState<string>('');

  const handleRunAnalysis = () => {
    setLoading(true);
    setStreamMessages([]);
    setStreamLogs('');
    
    const sourceLabel = csvStatus?.dataSource === 'csv' ? 'CSV' : 'Meta Ads API';
    toast.info(`Sedang menganalisis data dari ${sourceLabel} (${dateFrom} s/d ${dateTo})...`);
    
    const eventSource = new EventSource(
      `${API_BASE_URL}/api/run-analysis-stream?date_from=${dateFrom}&date_to=${dateTo}`
    );

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        handleSseMessagePayload(
          payload,
          eventSource,
          setStreamMessages,
          setStreamLogs,
          setReportExists,
          setIframeKey,
          setLoading
        );
      } catch (err) {
        console.error('Failed to parse SSE payload:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('EventSource connection error:', err);
      toast.error('Koneksi terputus saat memproses analisis iklan.');
      eventSource.close();
      setLoading(false);
    };
  };

  return {
    loading,
    streamMessages,
    streamLogs,
    handleRunAnalysis
  };
}

interface StepItemProps {
  step: { key: string; label: string };
  idx: number;
  loading: boolean;
  streamMessages: string[];
}

function StepItem({ step, idx, loading, streamMessages }: Readonly<StepItemProps>) {
  const state = getStepState(idx, loading, streamMessages);
  
  let iconElement;
  if (state === 'completed') {
    iconElement = (
      <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0 text-emerald-400 animate-scaleIn">
        <IconCheck size={12} className="stroke-[3]" />
      </div>
    );
  } else if (state === 'active') {
    iconElement = (
      <div className="w-5 h-5 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center shrink-0 text-blue-400">
        <IconLoader size={12} className="animate-spin" />
      </div>
    );
  } else {
    iconElement = (
      <div className="w-5 h-5 rounded-full border border-border flex items-center justify-center shrink-0 text-muted-foreground/45 bg-muted/5">
        <span className="text-[9px] font-bold">{idx + 1}</span>
      </div>
    );
  }

  let textClass = 'text-muted-foreground/60 font-medium';
  if (state === 'completed') {
    textClass = 'text-emerald-400 font-bold';
  } else if (state === 'active') {
    textClass = 'text-blue-400 font-bold animate-pulse';
  }

  return (
    <div className="flex items-center gap-3.5 transition-all duration-300">
      {iconElement}
      <span className={`text-xs font-semibold leading-none ${textClass}`}>
        {step.label}
      </span>
    </div>
  );
}

interface AdsReportHeaderProps {
  loading: boolean;
  reportExists: boolean;
  onRunAnalysis: () => void;
  onSendReport: () => void;
}

function AdsReportHeader({
  loading,
  reportExists,
  onRunAnalysis,
  onSendReport
}: Readonly<AdsReportHeaderProps>) {
  return (
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
          onClick={onRunAnalysis}
          disabled={loading}
          className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold gap-1.5 h-9"
        >
          {loading ? <IconLoader size={16} className="animate-spin" /> : <IconRefresh size={16} />}
          <span>{loading ? 'Menganalisis...' : 'Regenerate Report'}</span>
        </Button>
        
        <Button
          onClick={onSendReport}
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
  );
}

interface AdsReportControlsProps {
  dateFrom: string;
  dateTo: string;
  activePreset: string;
  csvStatus: CsvStatus | null;
  loading: boolean;
  uploading: boolean;
  selectedFile: File | null;
  setSelectedFile: (file: File | null) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onDateChange: (from: string, to: string) => void;
  onApplyPreset: (presetName: string, days?: number) => void;
  onSwitchDataSource: (source: 'api' | 'csv') => void;
  onUploadCsv: () => void;
}

function AdsReportControls({
  dateFrom,
  dateTo,
  activePreset,
  csvStatus,
  loading,
  uploading,
  selectedFile,
  setSelectedFile,
  fileInputRef,
  onDateChange,
  onApplyPreset,
  onSwitchDataSource,
  onUploadCsv
}: Readonly<AdsReportControlsProps>) {
  return (
    <>
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
                onChange={(e) => onDateChange(e.target.value, dateTo)} 
                className="bg-transparent text-xs text-foreground outline-none border-none cursor-pointer [color-scheme:dark]"
              />
            </div>
            <div className="h-4 w-px bg-border mx-1" />
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-muted-foreground uppercase font-bold">Sampai:</span>
              <input 
                type="date" 
                value={dateTo} 
                onChange={(e) => onDateChange(dateFrom, e.target.value)} 
                className="bg-transparent text-xs text-foreground outline-none border-none cursor-pointer [color-scheme:dark]"
              />
            </div>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="flex items-center gap-1 border border-border bg-muted/20 rounded-lg p-0.5">
          <button 
            onClick={() => onApplyPreset('7', 7)}
            className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all ${
              activePreset === '7'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold'
                : 'text-muted-foreground hover:text-foreground border border-transparent'
            }`}
          >
            7 Hari
          </button>
          <button 
            onClick={() => onApplyPreset('14', 14)}
            className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all ${
              activePreset === '14'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold'
                : 'text-muted-foreground hover:text-foreground border border-transparent'
            }`}
          >
            14 Hari
          </button>
          <button 
            onClick={() => onApplyPreset('30', 30)}
            className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all ${
              activePreset === '30'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold'
                : 'text-muted-foreground hover:text-foreground border border-transparent'
            }`}
          >
            30 Hari
          </button>
          <button 
            onClick={() => onApplyPreset('this_month')}
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
            onClick={() => onSwitchDataSource('api')}
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
            onClick={() => onSwitchDataSource('csv')}
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
            onClick={onUploadCsv}
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
    </>
  );
}

interface AdsReportViewPanelProps {
  loading: boolean;
  reportExists: boolean;
  iframeKey: number;
  streamMessages: string[];
  streamLogs: string;
  onRunAnalysis: () => void;
}

function AdsReportViewPanel({
  loading,
  reportExists,
  iframeKey,
  streamMessages,
  streamLogs,
  onRunAnalysis
}: Readonly<AdsReportViewPanelProps>) {
  if (loading) {
    return (
      <div className="flex flex-col lg:flex-row h-full w-full bg-[#070913] divide-y lg:divide-y-0 lg:divide-x divide-border/40 animate-fadeIn">
        {/* Left Column: Progress Checklists & Pulsing Spinner */}
        <div className="flex-1 flex flex-col justify-center items-center p-8 lg:p-12 text-center gap-8 bg-gradient-to-b from-[#0b0f19] to-[#070913]">
          {/* Elegant Glowing Spinner */}
          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-emerald-500/20 blur-xl animate-pulse w-20 h-20"></div>
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
              <IconLoader size={32} className="animate-spin text-emerald-400" style={{ animationDuration: '3s' }} />
            </div>
          </div>
          
          {/* Title & Description */}
          <div className="flex flex-col gap-2">
            <h3 className="text-md font-bold text-foreground tracking-wide">Menjalankan Analisis Performa Iklan</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
              AI Gemini sedang memproses data kampanye dan merumuskan wawasan copywriting optimasi...
            </p>
          </div>

          {/* Step-by-step checklist */}
          <div className="w-full max-w-sm flex flex-col gap-3 bg-card/30 border border-border/40 backdrop-blur-md rounded-2xl p-5 shadow-sm text-left">
            {STEPS.map((step, idx) => (
              <StepItem
                key={step.key}
                step={step}
                idx={idx}
                loading={loading}
                streamMessages={streamMessages}
              />
            ))}
          </div>
        </div>

        {/* Right Column: Live Terminal Logger */}
        <div className="flex-1 flex flex-col h-full bg-[#030508] p-5 font-mono">
          <div className="flex justify-between items-center pb-3 border-b border-border/40 text-[10px] tracking-wider text-muted-foreground uppercase font-bold">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" /> Proses Eksekusi Log Langsung
            </span>
            <span className="text-[9px] text-zinc-600">Terminal v1.0</span>
          </div>
          
          <div className="flex-grow overflow-hidden mt-4 relative">
            <pre 
              id="ads-streaming-pre"
              className="w-full h-full text-[11px] leading-relaxed text-zinc-300 whitespace-pre-wrap overflow-y-auto font-medium select-text scroll-smooth"
              style={{ maxHeight: '100%', fontFamily: 'Consolas, Monaco, monospace' }}
            >
              {streamLogs || "Mempersiapkan koneksi ke proses latar belakang..."}
            </pre>
          </div>
        </div>
      </div>
    );
  }

  if (reportExists) {
    return (
      <iframe 
        src={`${API_BASE_URL}/report-html?t=${iframeKey}`}
        className="w-full h-full border-none bg-background flex-grow"
        title="Meta Ads Performance Report"
      />
    );
  }

  return (
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
        onClick={onRunAnalysis}
        disabled={loading}
        className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-xs gap-1.5 h-9 px-5 mt-2"
      >
        {loading ? <IconLoader size={16} className="animate-spin" /> : <IconRefresh size={16} />}
        <span>Generate Laporan Pertama</span>
      </Button>
    </div>
  );
}

export default function AdsReport() {
  const todayStr = getLocalDateString(new Date());
  const last7Days = new Date();
  last7Days.setDate(last7Days.getDate() - 7);
  const last7DaysStr = getLocalDateString(last7Days);

  const [dateFrom, setDateFrom] = useState(last7DaysStr);
  const [dateTo, setDateTo] = useState(todayStr);
  const [activePreset, setActivePreset] = useState('7');

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

  // Call custom hook for SSE analysis
  const {
    loading,
    streamMessages,
    streamLogs,
    handleRunAnalysis
  } = useAdsAnalysis(dateFrom, dateTo, csvStatus, setReportExists, setIframeKey);

  // Auto scroll pre tag to bottom when new logs arrive
  useEffect(() => {
    const pre = document.getElementById('ads-streaming-pre');
    if (pre) {
      pre.scrollTop = pre.scrollHeight;
    }
  }, [streamLogs]);

  const handleDateChange = (from: string, to: string) => {
    setDateFrom(from);
    setDateTo(to);
    setActivePreset('custom');
  };

  const handleApplyPreset = (presetName: string, days?: number) => {
    setActivePreset(presetName);
    const { from, to } = calculatePresetDates(presetName, days);
    if (from) setDateFrom(from);
    if (to) setDateTo(to);
  };

  // Check if report.html exists on server
  const checkReportStatus = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/report-html`, { method: 'HEAD', headers: { ...getAuthHeaders() } });
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
      const data = await api.get('/api/ads-csv-status');
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
        headers: { ...getAuthHeaders() },
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
    await switchDataSource(source, !!csvStatus?.exists, checkCsvStatus);
  };

  // Broadcast report to WA group JID
  const handleSendReport = async () => {
    await sendReportToWhatsApp(dateFrom, dateTo);
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
        <AdsReportHeader
          loading={loading}
          reportExists={reportExists}
          onRunAnalysis={handleRunAnalysis}
          onSendReport={handleSendReport}
        />
        <AdsReportControls
          dateFrom={dateFrom}
          dateTo={dateTo}
          activePreset={activePreset}
          csvStatus={csvStatus}
          loading={loading}
          uploading={uploading}
          selectedFile={selectedFile}
          setSelectedFile={setSelectedFile}
          fileInputRef={fileInputRef}
          onDateChange={handleDateChange}
          onApplyPreset={handleApplyPreset}
          onSwitchDataSource={handleSwitchDataSource}
          onUploadCsv={handleUploadCsv}
        />
      </Card>

      {/* Report View Panel */}
      <div className="flex-grow min-h-0 border border-border rounded-2xl overflow-hidden bg-[#0a0d16] relative flex flex-col shadow-inner">
        <AdsReportViewPanel
          loading={loading}
          reportExists={reportExists}
          iframeKey={iframeKey}
          streamMessages={streamMessages}
          streamLogs={streamLogs}
          onRunAnalysis={handleRunAnalysis}
        />
      </div>
    </div>
  );
}