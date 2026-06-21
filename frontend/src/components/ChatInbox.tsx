import { useState, useEffect, useRef } from 'react';
import { 
  IconSearch, 
  IconSend, 
  IconMessageOff, 
  IconAlertCircle, 
  IconRobot,
  IconRobotOff,
  IconDeviceFloppy,
  IconNotebook,
  IconCopy,
  IconArrowLeft,
  IconX,
  IconMicrophone
} from '@tabler/icons-react';
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { API_BASE_URL } from '@/config';

interface Customer {
  phone_number: string;
  name?: string;
  contact_phone?: string;
  status?: string;
  notes?: string;
  ai_enabled?: boolean;
  needs_admin?: boolean;
  last_interaction?: string;
}

interface Product {
  id: string;
  product_name: string;
  price: number;
  description?: string;
  shopee_link?: string;
}

interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  timestamp?: string;
}

interface ChatInboxProps {
  customers: Customer[];
  products: Product[];
  onRefreshData: () => void;
  showToast: (message: string) => void;
  selectedJid: string;
  setSelectedJid: (jid: string) => void;
  selectedCustName: string;
  setSelectedCustName: (name: string) => void;
  selectedSessionId: string;
  setSelectedSessionId: (id: string) => void;
  sessions: { id: string; name: string; status: string }[];
}

export default function ChatInbox({ 
  customers, 
  products, 
  onRefreshData, 
  showToast,
  selectedJid,
  setSelectedJid,
  selectedCustName,
  setSelectedCustName,
  selectedSessionId,
  setSelectedSessionId,
  sessions
}: ChatInboxProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [needsAdmin, setNeedsAdmin] = useState(false);
  const [messageText, setMessageText] = useState('');
  
  // CRM sidebar state
  const [custStatus, setCustStatus] = useState('lead');
  const [custNotes, setCustNotes] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);
  
  // Recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // Product Search inside CRM Sidebar
  const [prodQuery, setProdQuery] = useState('');

  // Mobile responsive views pane sub-state ('list', 'chat', 'crm')
  const [mobileView, setMobileView] = useState<'list' | 'chat' | 'crm'>('list');

  // Resizable Panes States & Handlers
  const [listWidth, setListWidth] = useState(() => {
    const saved = localStorage.getItem('chatListWidth');
    return saved ? parseInt(saved, 10) : 320;
  });
  const [crmWidth, setCrmWidth] = useState(() => {
    const saved = localStorage.getItem('chatCrmWidth');
    return saved ? parseInt(saved, 10) : 320;
  });
  const [showCrmPanel, setShowCrmPanel] = useState(() => {
    return localStorage.getItem('showChatCrmPanel') !== 'false';
  });

  useEffect(() => {
    localStorage.setItem('showChatCrmPanel', String(showCrmPanel));
  }, [showCrmPanel]);

  const startResizingList = (mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    const startWidth = listWidth;
    const startX = mouseDownEvent.clientX;
    
    const doDrag = (mouseMoveEvent: MouseEvent) => {
      const newWidth = startWidth + (mouseMoveEvent.clientX - startX);
      if (newWidth > 200 && newWidth < 500) {
        setListWidth(newWidth);
        localStorage.setItem('chatListWidth', String(newWidth));
      }
    };
    
    const stopDrag = () => {
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', stopDrag);
    };
    
    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
  };

  const startResizingCrm = (mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    const startWidth = crmWidth;
    const startX = mouseDownEvent.clientX;
    
    const doDrag = (mouseMoveEvent: MouseEvent) => {
      const newWidth = startWidth - (mouseMoveEvent.clientX - startX);
      if (newWidth > 220 && newWidth < 500) {
        setCrmWidth(newWidth);
        localStorage.setItem('chatCrmWidth', String(newWidth));
      }
    };
    
    const stopDrag = () => {
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', stopDrag);
    };
    
    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
  };

  const chatEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastJidRef = useRef<string>('');
  const lastHistoryLengthRef = useRef<number>(0);
  const shouldScrollRef = useRef<boolean>(false);

  // Filter customers based on search query
  const filteredCustomers = customers.filter(c => 
    c.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.phone_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.contact_phone?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Fetch active customer details and history
  const fetchCustomerDetails = async (jid: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/customers/${encodeURIComponent(jid)}?session_id=${selectedSessionId}`);
      const data = await res.json();
      if (data) {
        setAiEnabled(data.ai_enabled !== false);
        setNeedsAdmin(!!data.needs_admin);
        setCustStatus(data.status || 'lead');
        setCustNotes(data.notes || '');
        setCustPhone(data.contact_phone || '');
      }
    } catch (err) {
      console.error('Error fetching customer details:', err);
    }
  };

  const fetchChatHistory = async (jid: string) => {
    setLoadingChat(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/customers/${encodeURIComponent(jid)}/history?session_id=${selectedSessionId}`);
      const data = await res.json();
      setChatHistory(data || []);
    } catch (err) {
      console.error('Error fetching chat history:', err);
    } finally {
      setLoadingChat(false);
    }
  };

  useEffect(() => {
    if (selectedJid) {
      fetchCustomerDetails(selectedJid);
      fetchChatHistory(selectedJid);
      setMobileView('chat');
    }
  }, [selectedJid, selectedSessionId]);

  // Scroll to bottom when history changes under correct UX conditions
  useEffect(() => {
    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    
    const isJidChanged = selectedJid !== lastJidRef.current;
    const isLengthChanged = chatHistory.length !== lastHistoryLengthRef.current;
    
    // Check if the user is already near the bottom (threshold of 250px)
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 250;
    
    const shouldScroll = 
      isJidChanged || 
      shouldScrollRef.current || 
      (isLengthChanged && (lastHistoryLengthRef.current === 0 || isNearBottom));

    if (shouldScroll && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: isJidChanged ? 'auto' : 'smooth' });
    }
    
    // Reset flags and update refs
    shouldScrollRef.current = false;
    lastJidRef.current = selectedJid;
    lastHistoryLengthRef.current = chatHistory.length;
  }, [chatHistory, selectedJid]);

  // Polling for selected chat history refresh (every 4 seconds)
  useEffect(() => {
    if (!selectedJid) return;
    const interval = setInterval(() => {
      fetchChatHistory(selectedJid);
      fetchCustomerDetails(selectedJid);
    }, 4000);
    return () => clearInterval(interval);
  }, [selectedJid, selectedSessionId]);

  // Cleanup recording resources on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startRecording = async () => {
    audioChunksRef.current = [];
    setRecordingDuration(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await sendAudioBlob(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Error starting audio recording:', err);
      showToast('Gagal mengakses mikrofon. Pastikan izin mikrofon telah diberikan.');
    }
  };

  const cancelRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    setIsRecording(false);
    setRecordingDuration(0);
  };

  const stopAndSendRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    setIsRecording(false);
    setRecordingDuration(0);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const sendAudioBlob = async (blob: Blob) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = async () => {
      const base64data = reader.result as string;
      const base64Content = base64data.split(',')[1];
      
      try {
        showToast('Mengirim & mentranskripsi pesan suara...');
        const res = await fetch(`${API_BASE_URL}/api/customers/${encodeURIComponent(selectedJid)}/send-message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            audioBase64: base64Content, 
            mimetype: blob.type || 'audio/webm',
            session_id: selectedSessionId 
          })
        });
        const data = await res.json();
        if (data.status === 'success') {
          showToast('Pesan suara berhasil terkirim!');
          
          shouldScrollRef.current = true;
          setChatHistory(prev => [...prev, {
            role: 'model',
            content: `[Voice Note: ${data.voiceUrl}] ${data.transcription}`,
            timestamp: new Date().toISOString()
          }]);
          setAiEnabled(false);
          setNeedsAdmin(false);
          onRefreshData();
        } else {
          showToast('Gagal mengirim pesan suara: ' + data.message);
        }
      } catch (err) {
        showToast('Koneksi gagal saat mengirim pesan suara');
      }
    };
  };

  const handleSelectCustomer = (jid: string, name: string) => {
    if (isRecording) {
      cancelRecording();
    }
    setSelectedJid(jid);
    setSelectedCustName(name);
    setMobileView('chat');
  };

  // Toggle AI agent
  const handleToggleAi = async (checked: boolean) => {
    if (!selectedJid) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/customers/${encodeURIComponent(selectedJid)}/toggle-ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ai_enabled: checked, session_id: selectedSessionId })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setAiEnabled(checked);
        showToast(checked ? 'AI Respon DIAKTIFKAN untuk customer ini' : 'AI Respon DINONAKTIFKAN untuk customer ini');
        onRefreshData();
      } else {
        showToast('Gagal merubah status AI');
      }
    } catch (err) {
      showToast('Koneksi gagal saat merubah status AI');
    }
  };

  // Send message manual
  const handleSendMessage = async () => {
    if (!selectedJid || !messageText.trim()) return;
    const textToSend = messageText.trim();
    setMessageText(''); // Clear input

    try {
      const res = await fetch(`${API_BASE_URL}/api/customers/${encodeURIComponent(selectedJid)}/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToSend, session_id: selectedSessionId })
      });
      const data = await res.json();
      if (data.status === 'success') {
        showToast('Pesan terkirim!');
        
        // Optimistic update
        shouldScrollRef.current = true;
        setChatHistory(prev => [...prev, {
          role: 'model',
          content: textToSend,
          timestamp: new Date().toISOString()
        }]);
        setAiEnabled(false);
        setNeedsAdmin(false);
        onRefreshData();
      } else {
        showToast('Gagal mengirim pesan: ' + data.message);
        setMessageText(textToSend); // Restore
      }
    } catch (err) {
      showToast('Koneksi gagal saat mengirim pesan');
      setMessageText(textToSend);
    }
  };

  // Update customer details (status and notes)
  const handleUpdateCustDetails = async () => {
    if (!selectedJid) return;
    setSavingDetails(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/customers/${encodeURIComponent(selectedJid)}/update-details`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: custStatus, notes: custNotes, session_id: selectedSessionId })
      });
      const data = await res.json();
      if (data.status === 'success') {
        showToast('Detail kustomer berhasil disimpan.');
        onRefreshData();
      } else {
        showToast('Gagal menyimpan detail: ' + data.message);
      }
    } catch (err) {
      showToast('Koneksi gagal saat menyimpan detail.');
    } finally {
      setSavingDetails(false);
    }
  };

  // Helper to copy / insert Shopee link
  const handleInsertProductLink = (link?: string) => {
    if (!link) return;
    setMessageText(prev => prev ? `${prev} ${link}` : link);
    showToast('Link Shopee dimasukkan ke input.');
  };

  // Filter products for catalog search inside CRM Sidebar
  const filteredProducts = products.filter(p => 
    p.product_name?.toLowerCase().includes(prodQuery.toLowerCase()) ||
    p.description?.toLowerCase().includes(prodQuery.toLowerCase())
  );

  // Generate color avatar from initials
  const getInitials = (name: string) => {
    if (!name) return 'CU';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const getAvatarColor = (name: string) => {
    const colors = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  return (
    <div className="flex h-[calc(100vh-120px)] border border-border rounded-2xl overflow-hidden bg-card">
      {/* Pane 1: Conversations List */}
      <div 
        className={`${mobileView === 'list' ? 'flex' : 'hidden md:flex'} w-full shrink-0 border-r border-border flex flex-col bg-card/50 relative`}
        style={{ width: window.innerWidth >= 768 ? `${listWidth}px` : undefined }}
      >
        <div className="p-4 border-b border-border flex flex-col gap-3">
          {/* Sesi Dropdown Selector */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Sesi WhatsApp</label>
            <select
              value={selectedSessionId}
              onChange={(e) => {
                setSelectedSessionId(e.target.value);
                setSelectedJid('');
                setSelectedCustName('');
              }}
              className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground font-medium outline-none focus:border-primary transition-colors cursor-pointer"
            >
              {sessions.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.status === 'connected' ? '🟢 Connected' : '🔴 Offline'})
                </option>
              ))}
            </select>
          </div>

          <div className="relative">
            <IconSearch size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
            <Input 
              type="text" 
              placeholder="Cari kustomer..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-card/30 border-border text-xs"
            />
          </div>
        </div>

        <div className="flex-grow overflow-y-auto">
          {filteredCustomers.length === 0 ? (
            <div className="text-center text-muted-foreground py-6 text-xs">
              Tidak ada kustomer.
            </div>
          ) : (
            filteredCustomers.map(c => {
              const active = selectedJid === c.phone_number;
              const initials = getInitials(c.name || 'Customer');
              const avatarBg = getAvatarColor(c.name || 'Customer');
              const lastInteraction = c.last_interaction 
                ? new Date(c.last_interaction).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) 
                : '';

              return (
                <div 
                  key={c.phone_number} 
                  className={`flex p-4 border-b border-border/20 gap-3 cursor-pointer items-center transition-colors duration-200 ${
                    active ? 'bg-accent/80' : 'hover:bg-accent/30'
                  }`}
                  onClick={() => handleSelectCustomer(c.phone_number, c.name || 'Customer')}
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-xs flex-shrink-0" style={{ backgroundColor: avatarBg }}>
                    {initials}
                  </div>
                  <div className="flex-grow min-w-0">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-semibold text-foreground truncate mr-2">{c.name || 'Customer'}</span>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">{lastInteraction}</span>
                    </div>
                    <div className="truncate mb-1">
                      <code className="text-[10px] text-blue-400">
                        {c.contact_phone || 'no-phone'}
                      </code>
                    </div>
                    <div className="flex gap-1.5 items-center">
                      {c.needs_admin && (
                        <Badge variant="destructive" className="text-[9px] py-0.5 px-2 animate-pulse gap-1">
                          <IconAlertCircle size={10} /> Admin
                        </Badge>
                      )}
                      {c.ai_enabled !== false ? (
                        <Badge variant="default" className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/10 border border-emerald-500/20 text-[9px] py-0.5 px-2 gap-1">
                          <IconRobot size={10} /> AI
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground border-border text-[9px] py-0.5 px-2 gap-1">
                          <IconRobotOff size={10} /> Muted
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Resize Handle */}
        <div 
          onMouseDown={startResizingList}
          className="hidden md:block absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-primary/40 active:bg-primary transition-all z-20 group"
          title="Drag to resize customer list"
        >
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[2px] h-8 bg-border/40 rounded-full group-hover:bg-primary/70 transition-colors" />
        </div>
      </div>

      {/* Pane 2: Conversation Box */}
      <div className={`${mobileView === 'chat' ? 'flex' : 'hidden md:flex'} flex-1 min-w-0 flex flex-col bg-[#0f172a]/20 dark:bg-slate-950/40 relative`}>
        {!selectedJid ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <IconMessageOff size={48} className="text-muted-foreground/50" />
            <div className="text-sm">Pilih kustomer di sebelah kiri untuk mulai membaca percakapan.</div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="p-4 border-b border-border bg-card flex justify-between items-center z-10">
              <div className="flex items-center gap-2 min-w-0">
                {/* Mobile Back Button */}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setMobileView('list')}
                  className="md:hidden flex items-center gap-1 text-muted-foreground mr-1 px-1 h-8 text-xs border border-border"
                >
                  <IconArrowLeft size={16} />
                </Button>

                <div 
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold text-xs shrink-0" 
                  style={{ backgroundColor: getAvatarColor(selectedCustName) }}
                >
                  {getInitials(selectedCustName)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-foreground leading-none truncate">{selectedCustName}</h3>
                    {needsAdmin && (
                      <Badge variant="destructive" className="text-[9px] py-0.5 px-1.5 animate-pulse gap-0.5 whitespace-nowrap">
                        <IconAlertCircle size={9} /> Admin
                      </Badge>
                    )}
                  </div>
                  <p className="font-mono text-[9px] text-muted-foreground mt-1 truncate">
                    {selectedJid}
                  </p>
                </div>
              </div>

              {/* Header Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {/* CRM details toggle */}
                <Button
                  variant={showCrmPanel ? "default" : "outline"}
                  size="icon"
                  onClick={() => {
                    if (window.innerWidth >= 1024) {
                      setShowCrmPanel(prev => !prev);
                    } else {
                      setMobileView('crm');
                    }
                  }}
                  className="flex h-9 w-9 rounded-lg border border-border text-foreground"
                  title="Toggle Customer CRM Panel"
                >
                  <IconNotebook size={16} />
                </Button>

                {/* AI response toggle */}
                <div className="flex items-center gap-2 bg-accent/40 border border-border px-2.5 py-1.5 rounded-lg h-9">
                  <span className="text-[10px] sm:text-xs font-semibold text-muted-foreground">AI</span>
                  <Switch 
                    checked={aiEnabled} 
                    onCheckedChange={handleToggleAi} 
                    className="scale-90"
                  />
                </div>
              </div>
            </div>

             {/* Feed Message Body */}
            <div ref={scrollContainerRef} className="flex-grow overflow-y-auto p-6 flex flex-col gap-4 bg-[#fcf8f2] dark:bg-[#0b0c10] border-y border-border/40">
              {needsAdmin && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 flex items-center gap-2.5 text-destructive text-xs">
                  <IconAlertCircle size={18} className="flex-shrink-0" />
                  <div>
                    <strong>Admin Handoff:</strong> Kustomer ini membutuhkan bantuan manual dari Admin.
                  </div>
                </div>
              )}

              {loadingChat && chatHistory.length === 0 ? (
                <div className="flex justify-center items-center py-10 text-muted-foreground text-xs">
                  Loading chat history...
                </div>
              ) : chatHistory.length === 0 ? (
                <div className="text-center text-muted-foreground py-10 text-xs">
                  Belum ada riwayat pesan.
                </div>
              ) : (
                chatHistory.map((msg, idx) => {
                  const isUser = msg.role === 'user';
                  const timeStr = msg.timestamp 
                    ? new Date(msg.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) 
                    : '';
                  
                  // Parse image message
                  let isImage = false;
                  let imageUrl = '';
                  let isVoice = false;
                  let voiceUrl = '';
                  let textContent = msg.content;
                  
                  const imgMatch = msg.content.match(/^\[Foto:\s*([^\]]+)\]\s*(.*)/s);
                  if (imgMatch) {
                    isImage = true;
                    imageUrl = imgMatch[1];
                    textContent = imgMatch[2] || '';
                  } else {
                    const voiceMatch = msg.content.match(/^\[Voice Note:\s*([^\]]+)\]\s*(.*)/s);
                    if (voiceMatch) {
                      isVoice = true;
                      voiceUrl = voiceMatch[1];
                      textContent = voiceMatch[2] || '';
                    }
                  }

                  return (
                    <div 
                      key={idx} 
                      className={`flex flex-col w-full ${isUser ? 'items-start' : 'items-end'}`}
                    >
                       <div className={`max-w-[85%] md:max-w-[65%] p-3.5 rounded-xl text-sm leading-relaxed ${
                        isUser 
                          ? 'bg-card text-foreground border border-border/80 dark:border-0 dark:bg-[#202C33] rounded-tl-none shadow-sm' 
                          : 'bg-primary text-primary-foreground dark:bg-[#056162] dark:text-foreground rounded-tr-none shadow-sm'
                      }`}>
                        <div className="flex flex-col gap-2">
                          {isImage && (
                            <img 
                              src={`${API_BASE_URL}${imageUrl}`} 
                              alt="Uploaded file" 
                              className="max-w-xs max-h-60 rounded-lg object-cover border border-border/40 cursor-pointer hover:opacity-90 transition-opacity"
                              onClick={() => window.open(`${API_BASE_URL}${imageUrl}`, '_blank')}
                            />
                          )}
                          {isVoice && (
                            <div className="flex flex-col gap-2 min-w-[240px] max-w-full">
                              <audio 
                                src={`${API_BASE_URL}${voiceUrl}`} 
                                controls 
                                className="w-full h-10 filter dark:brightness-90"
                              />
                            </div>
                          )}
                          {textContent && (
                            <div className={isVoice ? "text-xs italic opacity-90 pl-2 border-l-2 border-slate-400 dark:border-slate-500" : ""}>
                              {isVoice ? `🎙️ "${textContent}"` : textContent}
                            </div>
                          )}
                        </div>
                         <div className={`text-[9px] mt-1.5 text-right font-medium ${
                          isUser 
                            ? 'text-muted-foreground/60 dark:text-white/40' 
                            : 'text-primary-foreground/75 dark:text-white/40'
                        }`}>{timeStr}</div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input Footer */}
            <div className="p-4 border-t border-border bg-card flex gap-3 items-center">
              {isRecording ? (
                <div className="flex-grow flex items-center justify-between bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-2 text-xs">
                  <div className="flex items-center gap-2.5 text-destructive font-semibold">
                    <span className="w-2.5 h-2.5 bg-destructive rounded-full animate-pulse" />
                    <span>Merekam pesan suara... ({formatDuration(recordingDuration)})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={cancelRecording} 
                      className="text-destructive hover:bg-destructive/10 h-8 px-3 rounded-lg font-medium text-[11px]"
                    >
                      Batal
                    </Button>
                    <Button 
                      onClick={stopAndSendRecording} 
                      className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-3 rounded-lg font-semibold text-[11px] flex items-center gap-1"
                    >
                      Kirim Pesan
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <Input 
                    type="text" 
                    placeholder="Tulis pesan ke kustomer..." 
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    className="flex-grow bg-card/30 border-border"
                  />
                  <Button 
                    variant="outline" 
                    onClick={startRecording}
                    className="border-border text-muted-foreground hover:text-foreground w-10 h-10 p-0 rounded-xl flex items-center justify-center flex-shrink-0"
                    title="Rekam Pesan Suara"
                  >
                    <IconMicrophone size={18} />
                  </Button>
                  <Button 
                    onClick={handleSendMessage} 
                    className="bg-primary hover:bg-primary/90 text-primary-foreground w-10 h-10 p-0 rounded-xl flex items-center justify-center flex-shrink-0"
                  >
                    <IconSend size={18} />
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Pane 3: CRM Details Sidebar */}
      {selectedJid && (showCrmPanel || mobileView === 'crm') && (
        <div 
          className={`${mobileView === 'crm' ? 'flex' : 'hidden lg:flex'} w-full shrink-0 border-l border-sidebar-border bg-card/50 flex flex-col p-4 sm:p-6 gap-6 overflow-y-auto box-border relative`}
          style={{ width: window.innerWidth >= 1024 ? `${crmWidth}px` : undefined }}
        >
          <div className="border-b border-border pb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <IconNotebook size={16} className="text-primary" /> 
              <h4 className="text-sm font-semibold text-foreground">Customer CRM</h4>
            </div>
            {/* Close button on Desktop / Back on Mobile */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (window.innerWidth >= 1024) {
                  setShowCrmPanel(false);
                } else {
                  setMobileView('chat');
                }
              }}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground px-2 h-8 text-xs border border-border"
            >
              {window.innerWidth >= 1024 ? <IconX size={14} /> : <IconArrowLeft size={14} />}
              <span>{window.innerWidth >= 1024 ? 'Tutup' : 'Kembali'}</span>
            </Button>
          </div>

          {/* Actual Phone */}
          <div className="flex flex-col gap-1.5 w-full">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">WhatsApp Contact Phone</span>
            <Input 
              type="text" 
              value={custPhone || 'Belum diisi'} 
              disabled 
              className="bg-card/20 border-border text-xs opacity-70 w-full"
            />
          </div>

          {/* Customer Status */}
          <div className="flex flex-col gap-1.5 w-full">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Customer Status</span>
            <select 
              className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={custStatus} 
              onChange={(e) => setCustStatus(e.target.value)}
            >
              <option value="lead" className="bg-[#111827]">lead</option>
              <option value="customer" className="bg-[#111827]">customer</option>
              <option value="dormant" className="bg-[#111827]">dormant</option>
              <option value="opt_out" className="bg-[#111827]">opt_out</option>
            </select>
          </div>

          {/* Admin Notes */}
          <div className="flex flex-col gap-1.5 w-full">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Admin Notes</span>
            <Textarea 
              placeholder="Catatan alamat kustomer, preferensi pemesanan, custom cake notes..."
              value={custNotes}
              onChange={(e) => setCustNotes(e.target.value)}
              className="bg-card/20 border-border text-xs min-h-[120px] w-full resize-y leading-relaxed"
            />
          </div>

          <Button 
            onClick={handleUpdateCustDetails}
            disabled={savingDetails}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs gap-1.5 h-9"
          >
            <IconDeviceFloppy size={14} /> 
            <span>{savingDetails ? 'Menyimpan...' : 'Simpan Detail'}</span>
          </Button>

          {/* Catalog Lookup Section */}
          <div className="border-t border-border pt-5 mt-2 flex flex-col gap-3 w-full">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Catalog Lookup Helper</span>
            <div className="relative w-full">
              <IconSearch size={14} className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
              <Input 
                type="text" 
                placeholder="Cari produk & link..." 
                value={prodQuery}
                onChange={(e) => setProdQuery(e.target.value)}
                className="pl-8 bg-card/20 border-border text-[11px] h-8 w-full"
              />
            </div>
            
            <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto pr-1">
              {filteredProducts.slice(0, 5).map(p => (
                <div key={p.id} className="p-2 border.5 border-border rounded-lg bg-card/30 flex flex-col gap-1.5">
                  <div className="text-xs font-semibold text-foreground truncate">{p.product_name}</div>
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-[11px] font-bold text-emerald-400 truncate">
                      Rp {Math.round(p.price).toLocaleString('id-ID')}
                    </span>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleInsertProductLink(p.shopee_link)}
                      disabled={!p.shopee_link}
                      className="h-6 px-2 text-[10px] bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-400 gap-1 border border-emerald-500/20 shrink-0"
                      title="Masukkan link Shopee ke dalam input percakapan"
                    >
                      <IconCopy size={10} /> Link
                    </Button>
                  </div>
                </div>
              ))}
              {filteredProducts.length === 0 && (
                <div className="text-[10px] text-muted-foreground text-center py-2">
                  Produk tidak ditemukan.
                </div>
              )}
            </div>
          </div>

          {/* Resize Handle (Left edge) */}
          <div 
            onMouseDown={startResizingCrm}
            className="hidden lg:block absolute top-0 left-0 w-1.5 h-full cursor-col-resize hover:bg-primary/40 active:bg-primary transition-all z-20 group"
            title="Drag to resize CRM panel"
          >
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-8 bg-border/40 rounded-full group-hover:bg-primary/70 transition-colors" />
          </div>
        </div>
      )}
    </div>
  );
}
