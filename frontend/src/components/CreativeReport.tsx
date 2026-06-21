import { useState, useEffect } from 'react';
import { 
  IconSparkles, 
  IconRefresh, 
  IconLoader, 
  IconCopy, 
  IconCheck, 
  IconTrophy, 
  IconAlertTriangle, 
  IconPhoto, 
  IconClock
} from '@tabler/icons-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { API_BASE_URL } from '@/config';

interface CreativeIdea {
  title: string;
  angle: string;
  copywriting: string;
  visualGuide: string;
}

interface CreativeReportData {
  generatedAt: string;
  dateRange: string;
  isMock: boolean;
  audit: {
    winningElements: string[];
    losingElements: string[];
  };
  ideas: CreativeIdea[];
}

export default function CreativeReport() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CreativeReportData | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [checking, setChecking] = useState(true);
  const [streamMessages, setStreamMessages] = useState<string[]>([]);
  const [streamChunks, setStreamChunks] = useState<string>('');
  const [userPrompt, setUserPrompt] = useState('');

  // Auto scroll pre tag to bottom when new chunks arrive
  useEffect(() => {
    const pre = document.getElementById('streaming-pre');
    if (pre) {
      pre.scrollTop = pre.scrollHeight;
    }
  }, [streamChunks]);

  // Fetch report data
  const fetchReport = async (silent = false) => {
    if (!silent) setChecking(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/creative-report`);
      if (res.status === 200) {
        const json = await res.json();
        setData(json);
      } else {
        setData(null);
      }
    } catch (err) {
      console.error('Failed to load creative report:', err);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  // Run regeneration via SSE Streaming
  const handleRegenerate = () => {
    setLoading(true);
    setStreamMessages([]);
    setStreamChunks('');
    const promptParam = userPrompt.trim() ? `?prompt=${encodeURIComponent(userPrompt.trim())}` : '';
    const eventSource = new EventSource(`${API_BASE_URL}/api/trigger-creative-analysis-stream${promptParam}`);

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'status') {
          setStreamMessages(prev => {
            if (prev.length > 0 && prev[prev.length - 1] === payload.message) {
              return prev;
            }
            return [...prev, payload.message];
          });
        } else if (payload.type === 'chunk') {
          setStreamChunks(prev => prev + payload.text);
        } else if (payload.type === 'done') {
          toast.success('Analisis kreatif berhasil diselesaikan!');
          setData(payload.data);
          eventSource.close();
          setLoading(false);
        } else if (payload.type === 'error') {
          toast.error('Gagal regenerasi: ' + payload.message);
          eventSource.close();
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to parse SSE payload:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('EventSource connection error:', err);
      toast.error('Koneksi terputus saat memproses analisis kreatif.');
      eventSource.close();
      setLoading(false);
    };
  };

  // Copy to clipboard helper
  const handleCopyText = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    toast.success('Copywriting berhasil disalin ke clipboard!');
    setTimeout(() => {
      setCopiedIndex(null);
    }, 2000);
  };

  if (checking) {
    return (
      <div className="flex justify-center items-center py-24 text-muted-foreground gap-3">
        <IconLoader size={36} className="animate-spin text-emerald-500" />
        <span className="text-sm font-semibold">Memuat analisis kreatif...</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-8 max-w-xl mx-auto py-12 text-center items-center">
        {/* Animated icon */}
        <div className="w-16 h-16 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.15)] animate-pulse">
          <IconSparkles size={32} className="animate-spin" style={{ animationDuration: '4s' }} />
        </div>
        
        {/* Title */}
        <div className="flex flex-col gap-1.5">
          <h3 className="text-md font-bold text-foreground">AI Creative Engine Generating</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Gemini sedang menganalisis performa ads Anda, mengaudit hooks copywriting, dan menyusun draf konten baru secara langsung...
          </p>
        </div>

        {/* Step-by-step logs */}
        <div className="w-full flex flex-col gap-2.5 text-left border border-border/60 bg-card/45 backdrop-blur-md rounded-2xl p-5 shadow-sm">
          <span className="text-[10px] font-bold tracking-widest text-emerald-500 uppercase pb-1.5 border-b border-border/40">Progress Logs</span>
          <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-1">
            {streamMessages.map((msg, i) => (
              <div key={i} className="text-xs text-foreground/90 flex items-start gap-2.5 animate-fadeIn">
                <span className="text-emerald-500 shrink-0">✓</span>
                <span className="font-semibold">{msg}</span>
              </div>
            ))}
            {streamMessages.length > 0 && !streamMessages[streamMessages.length - 1].includes('selesai') && (
              <div className="text-xs text-muted-foreground flex items-center gap-2.5 animate-pulse pl-1 mt-1">
                <IconLoader size={12} className="animate-spin text-purple-400" />
                <span>Memproses langkah berikutnya...</span>
              </div>
            )}
          </div>
        </div>

        {/* Streaming text preview */}
        <div className="w-full flex flex-col gap-2 bg-[#05070c] border border-border/80 rounded-2xl p-5 shadow-inner relative overflow-hidden">
          <div className="flex justify-between items-center pb-2 border-b border-border/30 text-[10px] font-mono tracking-wider text-muted-foreground uppercase">
            <span>Live AI Stream Output</span>
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-ping"></span>
          </div>
          <pre 
            id="streaming-pre"
            className="font-mono text-[11px] leading-relaxed text-purple-300 whitespace-pre-wrap max-h-48 overflow-y-auto mt-3 text-left font-medium select-none scroll-smooth"
          >
            {streamChunks || "Menghubungkan ke AI Creative Stream..."}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 pb-12">
      {/* Header Controls */}
      <Card className="bg-card/45 backdrop-blur-md border-border shadow-sm flex-shrink-0">
        <CardHeader className="flex flex-col gap-4 pb-4">
          <div className="flex flex-row items-center justify-between space-y-0 flex-wrap gap-4">
            <div className="flex flex-col gap-1">
              <CardTitle className="text-lg font-bold text-foreground flex items-center gap-2">
                <IconSparkles className="text-emerald-500 animate-pulse" size={20} />
                <span>AI Creative Ad Content Ideas</span>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Analisis kualitatif otomatis terhadap hook, sudut pandang, dan copywriting iklan Anda untuk merancang rekomendasi kreatif.
              </CardDescription>
            </div>
            <div className="flex gap-2.5 items-center">
              {data && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-accent/40 border border-border px-3.5 py-1.5 rounded-full mr-2">
                  <IconClock size={13} className="text-emerald-400" />
                  <span>Diperbarui: {new Date(data.generatedAt).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}</span>
                </div>
              )}
              
              <Button
                onClick={handleRegenerate}
                disabled={loading}
                className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold gap-1.5 h-9 px-4 transition-all duration-200"
              >
                {loading ? <IconLoader size={16} className="animate-spin" /> : <IconRefresh size={16} />}
                <span>{loading ? 'Menganalisis...' : 'Regenerate Ideas'}</span>
              </Button>
            </div>
          </div>

          <div className="w-full mt-1">
            <textarea
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              placeholder="Contoh: Fokus ke konten Reels edukasi tentang cake custom, buat konten story testimoni pelanggan, ide konten TikTok trending..."
              className="w-full bg-background border border-border rounded-xl px-4 py-3 text-xs text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors resize-none min-h-[70px] font-medium"
              rows={2}
              disabled={loading}
            />
          </div>
        </CardHeader>
      </Card>

      {!data ? (
        /* Empty State */
        <div className="flex-grow border border-dashed border-border/80 rounded-2xl bg-[#0a0d16]/30 flex flex-col items-center justify-center py-20 px-6 text-center max-w-lg mx-auto w-full shadow-inner gap-4">
          <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
            <IconSparkles size={28} className="animate-bounce" />
          </div>
          <div className="flex flex-col gap-1.5">
            <h3 className="text-sm font-bold text-foreground">Rekomendasi Ide Konten Belum Ada</h3>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
              Sistem belum menjalankan audit copywriting iklan Latezza. Klik tombol di bawah untuk meminta AI Gemini menganalisis ad copy saat ini dan memberikan ide kampanye baru.
            </p>
          </div>
          <Button
            onClick={handleRegenerate}
            disabled={loading}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs gap-1.5 h-9 px-5 mt-2 transition-all duration-200"
          >
            {loading ? <IconLoader size={16} className="animate-spin" /> : <IconRefresh size={16} />}
            <span>Jalankan Analisis Kreatif Pertama</span>
          </Button>
        </div>
      ) : (
        /* Main Report Layout */
        <div className="flex flex-col gap-8">
          
          {/* Metadata banner */}
          {data.isMock && (
            <div className="flex items-center gap-2 bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3 text-xs text-amber-300">
              <IconAlertTriangle size={18} className="shrink-0 text-amber-400" />
              <span>
                <strong>Mode Simulasi:</strong> Kunci API Meta Ads belum disematkan. AI merumuskan ide di bawah berdasarkan simulasi data kampanye Latezza terdahulu.
              </span>
            </div>
          )}

          {/* Audit Section (Good vs Bad) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Winners Card */}
            <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-[#0c1f1a] dark:to-[#0c131a] border border-emerald-200 dark:border-emerald-500/10 hover:border-emerald-300 dark:hover:border-emerald-500/20 transition-all duration-300 shadow-sm dark:shadow-lg group">
              <CardHeader className="pb-3 border-b border-emerald-200 dark:border-emerald-500/10">
                <CardTitle className="text-sm font-bold tracking-wide text-emerald-800 dark:text-emerald-400 flex items-center gap-2">
                  <div className="p-1 rounded-lg bg-emerald-100 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 shrink-0">
                    <IconTrophy size={16} />
                  </div>
                  <span>ELEMEN IKLAN PEMENANG (WINNERS)</span>
                </CardTitle>
                <CardDescription className="text-[10px] text-emerald-700/80 dark:text-emerald-400/60">
                  Formula kalimat dan elemen penawaran yang terbukti memberikan CPR termurah & klik terbanyak.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-5">
                <ul className="flex flex-col gap-3.5 list-none pl-0">
                  {data.audit.winningElements.map((el, i) => (
                    <li key={i} className="text-xs text-foreground/90 flex items-start gap-2.5 leading-relaxed">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0"></div>
                      <span>{el}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Losers Card */}
            <Card className="bg-gradient-to-br from-rose-50 to-rose-100/50 dark:from-[#241315] dark:to-[#120a0b] border border-rose-200 dark:border-destructive/10 hover:border-rose-300 dark:hover:border-destructive/20 transition-all duration-300 shadow-sm dark:shadow-lg group">
              <CardHeader className="pb-3 border-b border-rose-200 dark:border-destructive/10">
                <CardTitle className="text-sm font-bold tracking-wide text-rose-800 dark:text-rose-400 flex items-center gap-2">
                  <div className="p-1 rounded-lg bg-rose-100 dark:bg-destructive/10 text-rose-800 dark:text-rose-400 shrink-0">
                    <IconAlertTriangle size={16} />
                  </div>
                  <span>CELAH & PENYEBAB BONCOS (LOSERS)</span>
                </CardTitle>
                <CardDescription className="text-[10px] text-rose-700/80 dark:text-rose-400/60">
                  Kesalahan copywriting atau struktur penawaran yang membuat konversi nol meskipun impresi tinggi.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-5">
                <ul className="flex flex-col gap-3.5 list-none pl-0">
                  {data.audit.losingElements.map((el, i) => (
                    <li key={i} className="text-xs text-foreground/90 flex items-start gap-2.5 leading-relaxed">
                      <div className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0"></div>
                      <span>{el}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* New Ad Concepts Section */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 pl-1">
              <IconSparkles size={18} className="text-purple-400" />
              <h2 className="text-base font-bold text-foreground">AI-Generated Ad Concepts & Copywriting</h2>
            </div>
            
            <div className="grid grid-cols-1 gap-6">
              {data.ideas.map((idea, idx) => (
                <Card 
                  key={idx} 
                  className="bg-card/40 border-border hover:border-emerald-500/20 transition-all duration-300 shadow-sm relative overflow-hidden group flex flex-col"
                >
                  {/* Decorative corner glow */}
                  <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-all duration-300"></div>

                  <CardHeader className="pb-4 border-b border-border/60">
                    <div className="flex justify-between items-start flex-wrap gap-3">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] uppercase font-bold tracking-widest text-purple-400">Konsep #{idx + 1}</span>
                        <CardTitle className="text-md font-bold text-foreground">{idea.title}</CardTitle>
                      </div>
                      
                      <div className="bg-purple-100 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 text-purple-700 dark:text-purple-300 px-3 py-1 rounded-full text-[10px] font-semibold">
                        Angle: {idea.angle}
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="pt-5 flex flex-col gap-5 flex-grow">
                    {/* Copywriting section */}
                    <div className="flex flex-col gap-2 relative">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                          Draft Copywriting Caption
                        </span>
                        
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCopyText(idea.copywriting, idx)}
                          className="h-8 w-8 hover:bg-accent hover:text-emerald-400 text-muted-foreground rounded-lg"
                        >
                          {copiedIndex === idx ? <IconCheck size={16} className="text-emerald-500" /> : <IconCopy size={16} />}
                        </Button>
                      </div>
                      
                      <div className="font-mono text-xs text-foreground bg-accent/40 border border-border/80 rounded-xl p-4 leading-relaxed whitespace-pre-wrap select-all font-medium select-text">
                        {idea.copywriting}
                      </div>
                    </div>

                    {/* Visual Guideline */}
                    <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-4 flex gap-3 items-start mt-1">
                      <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-500/10 text-blue-800 dark:text-blue-400 shrink-0">
                        <IconPhoto size={16} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-blue-700 dark:text-blue-400">Visual & Videografi Brief</span>
                        <p className="text-xs text-foreground/90 leading-relaxed font-normal">
                          {idea.visualGuide}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
