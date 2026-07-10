export interface Lead {
  phone_number: string;
  session_id: string;
  name?: string;
  contact_phone?: string;
  status?: string;
  needs_follow_up?: boolean;
  needs_admin?: boolean;
  last_interaction: string;
}

export interface Stats {
  status?: string;
  totalLeads?: number;
  totalProducts?: number;
  pendingFollowUps?: number;
  incomingMessages?: { last24h: number; last7d: number; last30d: number };
  newLeads?: { last24h: number; last7d: number; last30d: number };
  recentLeads?: Lead[];
}

export interface Session {
  id: string;
  name: string;
  status: string;
}

export interface WhatsAppSession {
  id: string;
  name: string;
  phone_number: string | null;
  status: 'disconnected' | 'connecting' | 'connected' | 'qr_received';
  qr_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface Business {
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

export interface Product {
  id: string;
  product_name: string;
  price: number;
  image_url?: string;
  description?: string;
  shopee_link?: string;
}

export interface Customer {
  phone_number: string;
  name?: string;
  contact_phone?: string;
  status?: string;
  notes?: string;
  ai_enabled?: boolean;
  needs_admin?: boolean;
  needs_follow_up?: boolean;
  last_interaction?: string;
  session_id?: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  timestamp?: string;
}

export interface MessageSummaryData {
  generatedAt: string;
  dateRange: string;
  sessionId: string;
  totalMessages: number;
  totalCustomers: number;
  summary: {
    totalCustomers: number;
    topProducts: string[];
    commonQuestions: string[];
    complaints: string[];
    salesOpportunities: string[];
    insights: string[];
  };
}

export interface MtdStats {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costUsd: number;
  costIdr: number;
  totalRequests: number;
}

export interface DailyTrendItem {
  date: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cost_idr: number;
  request_count: number;
}

export interface FeatureBreakdownItem {
  feature: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cost_idr: number;
  request_count: number;
}

export interface UsageStatsData {
  status: string;
  mtd: MtdStats;
  dailyTrend: DailyTrendItem[];
  featureBreakdown: FeatureBreakdownItem[];
}
