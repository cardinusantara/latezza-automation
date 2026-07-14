import { useState, useEffect, useCallback } from 'react';
import type { ChangeEvent } from 'react';
import { 
  IconDeviceFloppy, 
  IconRefresh, 
  IconKey, 
  IconBrandWhatsapp, 
  IconShieldLock, 
  IconLoader, 
  IconClockHour4, 
  IconSparkles, 
  IconInfoCircle,
  IconFlame,
  IconCopy
} from '@tabler/icons-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { API_BASE_URL } from '@/config';
import { api } from '@/lib/api';

// Tailwind CSS classes matching shadcn ui components exactly
const inputClasses = "h-9 w-full min-w-0 rounded-4xl border border-input bg-input/30 px-3 py-1 text-xs transition-colors outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm bg-card/30 border-border text-foreground";
const textareaClasses = "flex field-sizing-content min-h-16 w-full resize-none rounded-xl border border-input bg-input/30 px-3 py-3 text-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm bg-card/30 border-border text-foreground leading-relaxed";

interface SettingsState {
  gemini_api_key: string;
  gemini_model: string;
  whatsapp_group_jid: string;
  rate_limit_max: string;
  rate_limit_window: string;
  followup_hours: string;
  system_instruction: string;
  followup_instruction: string;
  meta_access_token: string;
  meta_ad_account_id: string;
  ads_analysis_enabled: string;
  ads_analysis_frequency: string;
  ads_analysis_time: string;
  creative_analysis_enabled: string;
  creative_analysis_frequency: string;
  creative_analysis_time: string;
  shopee_shop_id: string;
}

interface Business {
  id: number;
  name: string;
  short_description?: string;
  contact_phone?: string;
  address?: string;
  website?: string;
  ai_settings?: {
    tone?: string;
    custom_prompt?: string;
    handoff_rules?: string;
    followup_rules?: string;
  };
}

interface SettingsProps {
  showToast: (message: string) => void;
  businessId: number;
  activeBusiness: Business | null;
  onRefreshBusinesses: () => void;
}

export default function Settings({ showToast, businessId, activeBusiness, onRefreshBusinesses }: Readonly<SettingsProps>) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeCategory, setActiveCategory] = useState<'api' | 'security' | 'schedules' | 'followup' | 'persona' | 'business' | 'cache'>('business');
  const [groups, setGroups] = useState<{ jid: string; subject: string }[]>([]);
  const [isManualGroup, setIsManualGroup] = useState(false);

  // Caching states
  const [cacheStats, setCacheStats] = useState<{
    totalCachedTokens: number;
    cacheHits: number;
    totalRequests: number;
    hitRate: number;
    savingsUsd: number;
    savingsIdr: number;
    lastCacheUpdate: string | null;
    promptCacheTokenCount: number;
  }>({
    totalCachedTokens: 0,
    cacheHits: 0,
    totalRequests: 0,
    hitRate: 0,
    savingsUsd: 0,
    savingsIdr: 0,
    lastCacheUpdate: null,
    promptCacheTokenCount: 0
  });

  const [promptPreview, setPromptPreview] = useState<{
    prompt: string;
    isCached: boolean;
    hash: string;
    promptLength: number;
    cachedAt: string | null;
    updatedAt: string | null;
  }>({
    prompt: '',
    isCached: false,
    hash: '',
    promptLength: 0,
    cachedAt: null,
    updatedAt: null
  });

  const [cacheLoading, setCacheLoading] = useState(false);
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);

  const fetchCacheData = useCallback(async (silent = false) => {
    if (!silent) setCacheLoading(true);
    try {
      const statsRes = await api.get<{ status: string; data: typeof cacheStats }>(`/api/system-prompt/stats?businessId=${businessId}`);
      if (statsRes.status === 'success' && statsRes.data) {
        setCacheStats(statsRes.data);
      }
      
      const previewRes = await api.get<{ status: string; data: typeof promptPreview }>(`/api/system-prompt/preview?businessId=${businessId}`);
      if (previewRes.status === 'success' && previewRes.data) {
        setPromptPreview(previewRes.data);
      }
    } catch (err) {
      console.error('Failed to fetch cache data:', err);
    } finally {
      if (!silent) setCacheLoading(false);
    }
  }, [businessId]);

  const handleRefreshCache = async () => {
    setCacheLoading(true);
    try {
      const res = await api.post<{ status: string; message: string; data: any }>(`/api/system-prompt/refresh`, { businessId });
      if (res.status === 'success') {
        showToast('System prompt cache berhasil di-refresh!');
        await fetchCacheData(true);
      }
    } catch (err) {
      console.error('Failed to refresh cache:', err);
      showToast('Gagal me-refresh prompt cache.');
    } finally {
      setCacheLoading(false);
    }
  };

  useEffect(() => {
    if (activeCategory === 'cache') {
      fetchCacheData();
    }
  }, [activeCategory, fetchCacheData]);
  
  const [businessForm, setBusinessForm] = useState({
    name: '',
    shortDescription: '',
    contactPhone: '',
    address: '',
    website: '',
    tone: 'friendly and polite',
    customPrompt: '',
    handoffRules: '',
    followupRules: ''
  });

  const [estimatedTokens, setEstimatedTokens] = useState<number | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!businessForm.name) {
        setEstimatedTokens(0);
        return;
      }
      setIsEstimating(true);
      try {
        const res = await api.post<{ status: string; data: { estimatedTokens: number } }>(
          '/api/system-prompt/estimate',
          businessForm
        );
        if (res.status === 'success' && res.data) {
          setEstimatedTokens(res.data.estimatedTokens);
        }
      } catch (err) {
        console.error('Failed to estimate tokens:', err);
      } finally {
        setIsEstimating(false);
      }
    }, 800); // 800ms debounce
    return () => clearTimeout(timer);
  }, [businessForm]);

  useEffect(() => {
    if (activeBusiness) {
      Promise.resolve().then(() => {
        setBusinessForm({
          name: activeBusiness.name || '',
          shortDescription: activeBusiness.short_description || '',
          contactPhone: activeBusiness.contact_phone || '',
          address: activeBusiness.address || '',
          website: activeBusiness.website || '',
          tone: activeBusiness.ai_settings?.tone || 'friendly and polite',
          customPrompt: activeBusiness.ai_settings?.custom_prompt || '',
          handoffRules: activeBusiness.ai_settings?.handoff_rules || '',
          followupRules: activeBusiness.ai_settings?.followup_rules || ''
        });
      });
    }
  }, [activeBusiness]);

  const handleSaveBusinessProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/businesses/${businessId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: businessForm.name,
          shortDescription: businessForm.shortDescription,
          contactPhone: businessForm.contactPhone,
          address: businessForm.address,
          website: businessForm.website,
          aiSettings: {
            tone: businessForm.tone,
            custom_prompt: businessForm.customPrompt,
            handoff_rules: businessForm.handoffRules,
            followup_rules: businessForm.followupRules
          }
        })
      });
      const data = await res.json();
      if (data.status === 'success') {
        showToast('Profil dan AI settings bisnis berhasil diperbarui!');
        onRefreshBusinesses();
      } else {
        showToast('Gagal memperbarui bisnis: ' + data.message);
      }
    } catch (err) {
      console.error(err);
      showToast('Koneksi gagal saat memperbarui profil bisnis.');
    } finally {
      setSaving(false);
    }
  };

  const [settings, setSettings] = useState<SettingsState>({
    gemini_api_key: '',
    gemini_model: 'gemini-2.5-flash',
    whatsapp_group_jid: '',
    rate_limit_max: '5',
    rate_limit_window: '60000',
    followup_hours: '24',
    system_instruction: '',
    followup_instruction: '',
    meta_access_token: '',
    meta_ad_account_id: '',
    ads_analysis_enabled: 'true',
    ads_analysis_frequency: '1',
    ads_analysis_time: '09:00',
    creative_analysis_enabled: 'true',
    creative_analysis_frequency: '7',
    creative_analysis_time: '09:00',
    shopee_shop_id: '479628817'
  });

  // Fetch connected groups list
  const fetchGroups = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/whatsapp/groups`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setGroups(data);
      }
    } catch (err) {
      // Safe to ignore, fallback manual JID input is always available
      console.error('Failed to fetch WhatsApp groups:', err);
    }
  };

  // Fetch current settings from backend
  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/settings`);
      const data = await res.json();
      if (data && !data.status) {
        setSettings(data);
      } else {
        showToast('Gagal memuat pengaturan.');
      }
    } catch (err) {
      // Logged and handled by displaying failure toast to user
      console.error(err);
      showToast('Koneksi gagal saat memuat pengaturan.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSettings();
      fetchGroups();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Auto detect if current saved JID should be manual
  useEffect(() => {
    if (settings.whatsapp_group_jid && groups.length > 0) {
      const found = groups.some(g => g.jid === settings.whatsapp_group_jid);
      if (!found) {
        const timer = setTimeout(() => {
          setIsManualGroup(true);
        }, 0);
        return () => clearTimeout(timer);
      }
    }
  }, [settings.whatsapp_group_jid, groups]);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Save settings
  const handleSave = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      if (data.status === 'success') {
        showToast('Pengaturan berhasil disimpan!');
        // Re-fetch to get masked key again if updated
        fetchSettings();
      } else {
        showToast('Gagal menyimpan: ' + data.message);
      }
    } catch (err) {
      // Logged and handled by displaying failure toast to user
      console.error(err);
      showToast('Koneksi gagal saat menyimpan.');
    } finally {
      setSaving(false);
    }
  };


  // Reset follow-up instruction to default (empty = use system default)
  const handleResetFollowupInstruction = () => {
    setSettings(prev => ({ ...prev, followup_instruction: '' }));
    showToast('Instruksi follow-up dikosongkan. Sistem akan pakai template default. Klik "Simpan" untuk menerapkan.');
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24 text-muted-foreground gap-3">
        <IconLoader size={36} className="animate-spin" />
        <span className="text-sm">Loading settings...</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-6 w-full mx-auto pb-10">
      {/* Mobile Tab Selector */}
      <div className="flex md:hidden overflow-x-auto gap-2 pb-2 -mx-4 px-4 scrollbar-none snap-x shrink-0">
        {[
          { id: 'business', label: 'Profil Bisnis' },
          { id: 'api', label: 'API Keys' },
          { id: 'security', label: 'Security' },
          { id: 'schedules', label: 'Schedules' },
          { id: 'followup', label: 'Follow-ups' },
          { id: 'cache', label: 'Prompt Cache' }
        ].map(cat => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setActiveCategory(cat.id as 'api' | 'security' | 'schedules' | 'followup' | 'persona' | 'business' | 'cache')}
            className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap border shrink-0 transition-colors snap-center ${
              activeCategory === cat.id
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card border-border text-muted-foreground'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Row: Profil Bisnis */}
      <div className={`${activeCategory === 'business' ? 'block' : 'hidden md:block'} w-full`}>
        <Card className="bg-card border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-primary flex items-center gap-2">
              <IconInfoCircle size={18} />
              <span>Profil Bisnis & AI Workspace ({businessForm.name || 'Workspace'})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Nama Bisnis</label>
                <input
                  type="text"
                  value={businessForm.name}
                  onChange={(e) => setBusinessForm(prev => ({ ...prev, name: e.target.value }))}
                  className={inputClasses}
                  placeholder="Nama Bisnis / Toko"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Nomor WhatsApp Kontak</label>
                <input
                  type="text"
                  value={businessForm.contactPhone}
                  onChange={(e) => setBusinessForm(prev => ({ ...prev, contactPhone: e.target.value }))}
                  className={inputClasses}
                  placeholder="Contoh: +62811..."
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Website</label>
                <input
                  type="text"
                  value={businessForm.website}
                  onChange={(e) => setBusinessForm(prev => ({ ...prev, website: e.target.value }))}
                  className={inputClasses}
                  placeholder="https://..."
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Gaya Komunikasi AI (Tone)</label>
                <select
                  value={businessForm.tone}
                  onChange={(e) => setBusinessForm(prev => ({ ...prev, tone: e.target.value }))}
                  className="h-9 w-full rounded-4xl border border-input bg-input/30 px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring bg-card/30 border-border"
                >
                  <option value="friendly and polite">Friendly & Polite (Ramah & Sopan)</option>
                  <option value="casual and energetic">Casual & Energetic (Santai & Ceria)</option>
                  <option value="professional and formal">Professional & Formal (Resmi & Baku)</option>
                  <option value="helpful and humorous">Helpful & Humorous (Membantu & Jenaka)</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Alamat Toko / Kantor</label>
              <textarea
                value={businessForm.address}
                onChange={(e) => setBusinessForm(prev => ({ ...prev, address: e.target.value }))}
                className={textareaClasses}
                placeholder="Alamat fisik toko kue atau kantor..."
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Deskripsi Singkat Bisnis (Untuk AI context)</label>
              <textarea
                value={businessForm.shortDescription}
                onChange={(e) => setBusinessForm(prev => ({ ...prev, shortDescription: e.target.value }))}
                className={textareaClasses}
                placeholder="Tulis ringkasan tentang bisnis, spesialisasi, jam buka, dan info penting..."
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Instruksi Tambahan AI Khusus (Custom Prompt)</label>
              <textarea
                value={businessForm.customPrompt}
                onChange={(e) => setBusinessForm(prev => ({ ...prev, customPrompt: e.target.value }))}
                className={`${textareaClasses} font-mono`}
                placeholder="Tulis aturan tambahan khusus bisnis ini (contoh: 'Jangan terima order custom cake di hari Minggu', 'Ingatkan customer tentang batas waktu transfer 2 jam')..."
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Kondisi AI Harus Melakukan Handoff ke Admin (Handoff Rules)</label>
              <textarea
                value={businessForm.handoffRules}
                onChange={(e) => setBusinessForm(prev => ({ ...prev, handoffRules: e.target.value }))}
                className={textareaClasses}
                placeholder="Contoh: kustomer ingin memesan custom cake (desain khusus), komplain, minta diskon khusus, atau minta bicara dengan manusia..."
              />
              <span className="text-[10px] text-muted-foreground">
                Mendefinisikan kondisi spesifik kapan AI harus memanggil tool handoff dan menyerahkan chat ke admin manusia.
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Kondisi AI Harus Meminta Follow Up Otomatis (Follow-up Rules)</label>
              <textarea
                value={businessForm.followupRules}
                onChange={(e) => setBusinessForm(prev => ({ ...prev, followupRules: e.target.value }))}
                className={textareaClasses}
                placeholder="Contoh: kustomer menunjukkan minat tinggi (tanya ongkir, stock, shopee) tapi percakapan terhenti..."
              />
              <span className="text-[10px] text-muted-foreground">
                Mendefinisikan kondisi kapan AI harus memicu request follow-up otomatis pada kustomer tersebut keesokan harinya.
              </span>
            </div>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-2 border-t border-border pt-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 border border-border px-3 py-1.5 rounded-xl">
                <IconSparkles size={14} className="text-primary animate-pulse" />
                <span>Estimasi Prompt: </span>
                {isEstimating ? (
                  <span className="font-mono text-foreground/70 animate-pulse">Menghitung...</span>
                ) : (
                  <span className="font-bold text-foreground font-mono">
                    {estimatedTokens !== null ? `${estimatedTokens.toLocaleString()} tokens` : '0 tokens'}
                  </span>
                )}
              </div>

              <Button
                type="button"
                onClick={handleSaveBusinessProfile}
                disabled={saving}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-9 px-4 text-xs gap-1.5"
              >
                {saving ? <IconLoader size={14} className="animate-spin" /> : <IconDeviceFloppy size={14} />}
                <span>Simpan Profil Bisnis</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 1: API Keys & Security + Rate Limits */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card: API Keys */}
        <div className={`${activeCategory === 'api' ? 'block' : 'hidden md:block'} w-full`}>
          <Card className="bg-card border-border shadow-sm h-full">
            <CardHeader>
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-primary flex items-center gap-2">
                <IconKey size={18} /> 
                <span>API & Integration Keys</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="gemini_api_key" className="text-xs font-semibold text-foreground/80">Gemini API Key</label>
                <input 
                  id="gemini_api_key"
                  type="password" 
                  name="gemini_api_key"
                  placeholder="Masukkan Gemini API Key..."
                  value={settings.gemini_api_key}
                  onChange={handleChange}
                  className={inputClasses}
                />
                <span className="text-[10px] text-muted-foreground">
                  Digunakan untuk memproses AI Agent chat & otomatisasi follow-up.
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="gemini_model" className="text-xs font-semibold text-foreground/80">Gemini Model</label>
                <input 
                  id="gemini_model"
                  type="text" 
                  name="gemini_model"
                  value={settings.gemini_model || 'gemini-3.1-flash-lite'}
                  disabled
                  className={`${inputClasses} opacity-70 cursor-not-allowed`}
                />
                <span className="text-[10px] text-muted-foreground">
                  Ditetapkan secara permanen di server melalui variabel lingkungan (.env).
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="meta_access_token" className="text-xs font-semibold text-foreground/80">Meta Graph API Access Token</label>
                <input 
                  id="meta_access_token"
                  type="password" 
                  name="meta_access_token"
                  placeholder="Masukkan Meta Access Token..."
                  value={settings.meta_access_token || ''}
                  onChange={handleChange}
                  className={inputClasses}
                />
                <span className="text-[10px] text-muted-foreground">
                  Akses token Graph API untuk menarik wawasan performa Meta Ads.
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="meta_ad_account_id" className="text-xs font-semibold text-foreground/80">Meta Ad Account ID</label>
                <input 
                  id="meta_ad_account_id"
                  type="text" 
                  name="meta_ad_account_id"
                  placeholder="act_1234567890"
                  value={settings.meta_ad_account_id || ''}
                  onChange={handleChange}
                  className={inputClasses}
                />
                <span className="text-[10px] text-muted-foreground">
                  ID Akun Iklan Meta Ads (bisa diawali dengan 'act_').
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="whatsapp_group_jid" className="text-xs font-semibold text-foreground/80">WhatsApp Target Group for Reports</label>
                {!isManualGroup && groups.length > 0 ? (
                  <div className="flex gap-2">
                    <select 
                      id="whatsapp_group_jid"
                      className="flex h-9 flex-grow rounded-md border border-border bg-background px-3 py-1.5 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"
                      value={settings.whatsapp_group_jid}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'manual') {
                          setIsManualGroup(true);
                        } else {
                          setSettings(prev => ({ ...prev, whatsapp_group_jid: val }));
                        }
                      }}
                    >
                      <option value="" className="bg-[#111827]">-- Pilih WhatsApp Group --</option>
                      {groups.map(g => (
                        <option key={g.jid} value={g.jid} className="bg-[#111827]">
                          {g.subject} ({g.jid.split('@')[0]})
                        </option>
                      ))}
                      <option value="manual" className="bg-[#111827]">✍️ Ketik JID Manual...</option>
                    </select>
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsManualGroup(true)}
                      className="h-9 text-xs"
                    >
                      Ketik JID
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input 
                      id="whatsapp_group_jid"
                      type="text" 
                      name="whatsapp_group_jid"
                      placeholder="120363427625298309@g.us"
                      value={settings.whatsapp_group_jid}
                      onChange={handleChange}
                      className={`${inputClasses} flex-grow`}
                    />
                    {groups.length > 0 && (
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => setIsManualGroup(false)}
                        className="h-9 text-xs"
                      >
                        Pilih Group
                      </Button>
                    )}
                  </div>
                )}
                <span className="text-[10px] text-muted-foreground">
                  Target grup tujuan pengiriman laporan analitik Ads harian otomatis.
                </span>
              </div>

              <div className="flex flex-col gap-1.5 mt-2">
                <label htmlFor="shopee_shop_id" className="text-xs font-semibold text-foreground/80">Shopee Shop ID</label>
                <input 
                  id="shopee_shop_id"
                  type="text" 
                  name="shopee_shop_id"
                  placeholder="Masukkan Shopee Shop ID (e.g. 479628817)..."
                  value={settings.shopee_shop_id || ''}
                  onChange={handleChange}
                  className={inputClasses}
                />
                <span className="text-[10px] text-muted-foreground">
                  ID Toko Shopee Anda. Digunakan untuk membuat link Shopee pada katalog secara otomatis.
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Card: Security & Rate Limits */}
        <div className={`${activeCategory === 'security' ? 'block' : 'hidden md:block'} w-full`}>
          <Card className="bg-card border-border shadow-sm h-full">
            <CardHeader>
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-primary flex items-center gap-2">
                <IconShieldLock size={18} /> 
                <span>Security & Abuse Prevention</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="rate_limit_max" className="text-xs font-semibold text-foreground/80">Rate Limit: Max Messages</label>
                <input 
                  id="rate_limit_max"
                  type="number" 
                  name="rate_limit_max"
                  value={settings.rate_limit_max}
                  onChange={handleChange}
                  min="1"
                  className={inputClasses}
                />
                <span className="text-[10px] text-muted-foreground">
                  Jumlah pesan maksimum yang diijinkan dari satu pengirim sebelum diabaikan.
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="rate_limit_window" className="text-xs font-semibold text-foreground/80">Rate Limit: Window Size (ms)</label>
                <input 
                  id="rate_limit_window"
                  type="number" 
                  name="rate_limit_window"
                  value={settings.rate_limit_window}
                  onChange={handleChange}
                  min="1000"
                  step="1000"
                  className={inputClasses}
                />
                <span className="text-[10px] text-muted-foreground">
                  Jangka waktu pembatasan pesan (contoh: 60000ms = 1 menit).
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Automation Scheduling Card */}
      <div className={`${activeCategory === 'schedules' ? 'block' : 'hidden md:block'} w-full`}>
        <Card className="bg-card border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-primary flex items-center gap-2">
              <IconClockHour4 size={18} />
              <span>Automation Schedules</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Ads Report Scheduling */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label htmlFor="ads_analysis_enabled" className="text-xs font-semibold text-foreground/80">Ads Analysis Schedule</label>
                <div className="flex items-center gap-2">
                  <label htmlFor="ads_analysis_enabled" className="text-[10px] text-muted-foreground">
                    {settings.ads_analysis_enabled === 'true' ? 'Aktif' : 'Nonaktif'}
                  </label>
                  <input
                    type="checkbox"
                    id="ads_analysis_enabled"
                    className="sr-only"
                    checked={settings.ads_analysis_enabled === 'true'}
                    onChange={(e) => {
                      setSettings(prev => ({ ...prev, ads_analysis_enabled: e.target.checked ? 'true' : 'false' }));
                    }}
                  />
                  <Switch
                    checked={settings.ads_analysis_enabled === 'true'}
                    onCheckedChange={(checked) => {
                      setSettings(prev => ({ ...prev, ads_analysis_enabled: checked ? 'true' : 'false' }));
                    }}
                    size="sm"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex flex-col gap-1 flex-grow">
                  <label htmlFor="ads_analysis_frequency" className="text-[10px] text-muted-foreground">Frekuensi</label>
                  <select
                    id="ads_analysis_frequency"
                    name="ads_analysis_frequency"
                    value={settings.ads_analysis_frequency}
                    onChange={handleChange}
                    disabled={settings.ads_analysis_enabled !== 'true'}
                    className="flex h-9 rounded-md border border-border bg-background px-3 py-1.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground disabled:opacity-50"
                  >
                    <option value="1" className="bg-[#111827]">Setiap Hari</option>
                    <option value="2" className="bg-[#111827]">Setiap 2 Hari</option>
                    <option value="3" className="bg-[#111827]">Setiap 3 Hari</option>
                    <option value="7" className="bg-[#111827]">Setiap Minggu (7 Hari)</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1 w-28">
                  <label htmlFor="ads_analysis_time" className="text-[10px] text-muted-foreground">Waktu (WIB)</label>
                  <input
                    id="ads_analysis_time"
                    type="time"
                    name="ads_analysis_time"
                    value={settings.ads_analysis_time}
                    onChange={handleChange}
                    disabled={settings.ads_analysis_enabled !== 'true'}
                    className={`${inputClasses} h-9 disabled:opacity-50`}
                  />
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground">
                Jadwal penarikan data performa Meta Ads & broadcast ringkasan ke grup WA.
              </span>
            </div>

            {/* Creative Ideas Scheduling */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label htmlFor="creative_analysis_enabled" className="text-xs font-semibold text-foreground/80">AI Creative Ideas Schedule</label>
                <div className="flex items-center gap-2">
                  <label htmlFor="creative_analysis_enabled" className="text-[10px] text-muted-foreground">
                    {settings.creative_analysis_enabled === 'true' ? 'Aktif' : 'Nonaktif'}
                  </label>
                  <input
                    type="checkbox"
                    id="creative_analysis_enabled"
                    className="sr-only"
                    checked={settings.creative_analysis_enabled === 'true'}
                    onChange={(e) => {
                      setSettings(prev => ({ ...prev, creative_analysis_enabled: e.target.checked ? 'true' : 'false' }));
                    }}
                  />
                  <Switch
                    checked={settings.creative_analysis_enabled === 'true'}
                    onCheckedChange={(checked) => {
                      setSettings(prev => ({ ...prev, creative_analysis_enabled: checked ? 'true' : 'false' }));
                    }}
                    size="sm"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex flex-col gap-1 flex-grow">
                  <label htmlFor="creative_analysis_frequency" className="text-[10px] text-muted-foreground">Frekuensi</label>
                  <select
                    id="creative_analysis_frequency"
                    name="creative_analysis_frequency"
                    value={settings.creative_analysis_frequency}
                    onChange={handleChange}
                    disabled={settings.creative_analysis_enabled !== 'true'}
                    className="flex h-9 rounded-md border border-border bg-background px-3 py-1.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground disabled:opacity-50"
                  >
                    <option value="1" className="bg-[#111827]">Setiap Hari</option>
                    <option value="3" className="bg-[#111827]">Setiap 3 Hari</option>
                    <option value="7" className="bg-[#111827]">Setiap Minggu (7 Hari)</option>
                    <option value="14" className="bg-[#111827]">Setiap 2 Minggu (14 Hari)</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1 w-28">
                  <label htmlFor="creative_analysis_time" className="text-[10px] text-muted-foreground">Waktu (WIB)</label>
                  <input
                    id="creative_analysis_time"
                    type="time"
                    name="creative_analysis_time"
                    value={settings.creative_analysis_time}
                    onChange={handleChange}
                    disabled={settings.creative_analysis_enabled !== 'true'}
                    className={`${inputClasses} h-9 disabled:opacity-50`}
                  />
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground">
                Jadwal audit copywriting & pembuatan ide iklan baru oleh Gemini AI.
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Follow-up configs */}
      <div className={`${activeCategory === 'followup' ? 'block' : 'hidden md:block'} w-full`}>
        <Card className="bg-card border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-primary flex items-center gap-2">
              <IconBrandWhatsapp size={18} /> 
              <span>Automated Follow-up Settings</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {/* Follow-up Interval */}
            <div className="flex flex-col gap-2">
              <label htmlFor="followup_hours" className="text-xs font-semibold text-foreground/80 flex items-center gap-1.5">
                <IconClockHour4 size={14} className="text-emerald-400" />
                Interval Follow-up (jam setelah tidak ada respons)
              </label>
              <div className="flex items-center gap-2">
                <input 
                  id="followup_hours"
                  type="number" 
                  name="followup_hours"
                  value={settings.followup_hours}
                  onChange={handleChange}
                  min="1"
                  max="168"
                  className={`${inputClasses} w-24`}
                />
                <span className="text-xs text-muted-foreground">jam</span>
                <div className="flex gap-1.5 ml-2">
                  {[1, 4, 6, 12, 24, 48].map(h => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setSettings(prev => ({ ...prev, followup_hours: String(h) }))}
                      className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                        settings.followup_hours === String(h)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card/30 border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                      }`}
                    >
                      {h}j
                    </button>
                  ))}
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground">
                Follow-up otomatis dikirim ke kustomer yang tidak merespon selama lebih dari interval ini. Sistem melakukan pengecekan otomatis setiap jam.
              </span>
            </div>

            {/* Follow-up Instruction */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label htmlFor="followup_instruction" className="text-xs font-semibold text-foreground/80 flex items-center gap-1.5">
                  <IconSparkles size={14} className="text-emerald-400" />
                  Instruksi Gaya Follow-up (opsional)
                </label>
                <button
                  type="button"
                  onClick={handleResetFollowupInstruction}
                  className="text-[10px] text-muted-foreground hover:text-emerald-400 flex items-center gap-1 transition-colors"
                >
                  <IconRefresh size={11} />
                  Reset ke Default
                </button>
              </div>

              {/* Mode info banner */}
              <div className="flex items-start gap-2 bg-emerald-500/5 border border-emerald-500/20 rounded-md px-3 py-2">
                <IconInfoCircle size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                <p className="text-[10px] text-emerald-300/80 leading-relaxed">
                  <strong>Mode Natural Language:</strong> Cukup tulis instruksi dalam bahasa sehari-hari — sistem otomatis membungkusnya dengan format yang benar untuk AI. Contoh: <em>"Follow up dengan mengingatkan promo akhir bulan dan tanyakan kapan tanggal acaranya"</em>.
                  Kosongkan field ini untuk menggunakan template bawaan sistem.
                </p>
              </div>

              <textarea 
                id="followup_instruction"
                name="followup_instruction"
                placeholder={`Contoh:\n"Ingatkan kustomer soal custom cake yang mereka tanyakan. Sebutkan bahwa slot produksi kami terbatas jadi lebih baik pesan sekarang. Tanyakan apakah mereka sudah siap untuk konfirmasi DP."\n\nAtau jika ingin full template dengan variabel:\n"Anda adalah CS Latezza. Kustomer {name} sebelumnya bertanya tentang {reason}. Riwayat: {history}. Buat pesan follow-up singkat."`}
                value={settings.followup_instruction}
                onChange={handleChange}
                rows={6}
                className={`${textareaClasses} font-mono resize-y`}
              />
              <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                <span>Variabel opsional yang bisa dipakai:</span>
                <code className="bg-muted px-1.5 py-0.5 rounded text-foreground font-semibold">{'{name}'}</code>
                <code className="bg-muted px-1.5 py-0.5 rounded text-foreground font-semibold">{'{reason}'}</code>
                <code className="bg-muted px-1.5 py-0.5 rounded text-foreground font-semibold">{'{history}'}</code>
                <span className="text-emerald-400/70">(pakai {'{history}'} hanya jika nulis full template)</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row: Prompt Cache */}
      <div className={`${activeCategory === 'cache' ? 'block' : 'hidden md:block'} w-full`}>
        <Card className="bg-card border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-primary flex items-center gap-2">
              <IconFlame size={18} className="text-orange-400" />
              <span>System Prompt Caching & Token Optimization</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="bg-muted/30 rounded-xl p-3 border border-border">
                <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">Cached Tokens</div>
                <div className="text-xl font-bold text-primary">{cacheStats.totalCachedTokens.toLocaleString()}</div>
              </div>

              <div className="bg-muted/30 rounded-xl p-3 border border-border">
                <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">Cache Hit Rate</div>
                <div className="text-xl font-bold text-primary">{cacheStats.hitRate.toFixed(1)}%</div>
              </div>

              <div className="bg-muted/30 rounded-xl p-3 border border-border">
                <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">Savings (USD)</div>
                <div className="text-xl font-bold text-emerald-400">${cacheStats.savingsUsd.toFixed(3)}</div>
              </div>

              <div className="bg-muted/30 rounded-xl p-3 border border-border">
                <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">Savings (IDR)</div>
                <div className="text-xl font-bold text-emerald-400">Rp {cacheStats.savingsIdr.toLocaleString('id-ID')}</div>
              </div>
            </div>

            {/* Info Box */}
            <div className="bg-muted/30 border border-border rounded-xl p-4 flex gap-3 items-start">
              <IconInfoCircle size={18} className="text-primary shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-foreground">Bagaimana cara kerja Caching?</span>
                <span className="text-[11px] text-muted-foreground leading-relaxed">
                  System prompt Anda berisi profil bisnis dan daftar produk ter-embedding. Saat kustomer mengirim pesan baru, Gemini akan memproses prompt tersebut. Jika prompt identik dengan sebelumnya, server akan membaca dari cache (90% lebih murah dibanding biaya input token standar).
                </span>
              </div>
            </div>

            {/* Preview Box */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Preview System Prompt</span>
                <span className="text-[10px] text-muted-foreground">
                  Status: {promptPreview.isCached ? <span className="text-emerald-500 font-semibold">🟢 Cached</span> : <span className="text-orange-400 font-semibold">🟡 Not Cached</span>}
                </span>
              </div>
              <div className="bg-muted/40 border border-border rounded-xl p-3 relative max-h-[160px] overflow-hidden">
                <pre className="text-[11px] font-mono text-muted-foreground leading-relaxed whitespace-pre-wrap select-none">
                  {promptPreview.prompt ? promptPreview.prompt.substring(0, 400) + '...' : 'Loading prompt preview...'}
                </pre>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-card to-transparent h-10 flex items-end justify-center pb-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsPromptModalOpen(true)}
                    className="text-xs text-primary font-semibold hover:bg-transparent"
                  >
                    View Full Prompt
                  </Button>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 items-center justify-between border-t border-border pt-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Last Rebuild</span>
                <span className="text-xs text-foreground font-mono">
                  {promptPreview.updatedAt 
                    ? new Date(promptPreview.updatedAt).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                    : 'N/A'}
                </span>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(promptPreview.prompt);
                    showToast('Prompt disalin ke clipboard!');
                  }}
                  className="h-8 text-xs font-semibold gap-1.5"
                  disabled={!promptPreview.prompt}
                >
                  <IconCopy size={14} />
                  <span>Copy Prompt</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRefreshCache}
                  className="h-8 text-xs font-semibold gap-1.5"
                  disabled={cacheLoading}
                >
                  {cacheLoading ? <IconLoader size={14} className="animate-spin" /> : <IconRefresh size={14} />}
                  <span>Refresh Cache</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Full Prompt Modal */}
      {isPromptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in-20">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-3xl flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/20">
              <div className="flex flex-col gap-0.5">
                <h3 className="font-semibold text-foreground text-sm">Full System Prompt Preview</h3>
                <p className="text-[10px] text-muted-foreground font-mono">Hash: {promptPreview.hash}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsPromptModalOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm font-semibold p-1"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-grow bg-background/50">
              <pre className="text-xs font-mono text-foreground whitespace-pre-wrap bg-muted/40 p-3 rounded-lg border border-border leading-relaxed select-all">
                {promptPreview.prompt}
              </pre>
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-2 bg-muted/20">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(promptPreview.prompt);
                  showToast('Prompt berhasil disalin ke clipboard!');
                }}
                className="text-xs font-semibold gap-1.5"
              >
                <IconCopy size={14} />
                <span>Copy Prompt</span>
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => setIsPromptModalOpen(false)}
                className="text-xs font-semibold"
              >
                Tutup
              </Button>
            </div>
          </div>
        </div>
      )}



      {/* Action Buttons */}
      <div className="flex justify-end gap-4 pt-4 border-t border-border">
        <Button 
          type="button" 
          variant="ghost"
          onClick={fetchSettings}
          disabled={saving}
        >
          Reset Changes
        </Button>
        <Button 
          type="submit" 
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-2"
          disabled={saving}
        >
          {saving ? (
            <>
              <IconLoader size={16} className="animate-spin" /> 
              <span>Menyimpan...</span>
            </>
          ) : (
            <>
              <IconDeviceFloppy size={16} /> 
              <span>Save Settings</span>
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
