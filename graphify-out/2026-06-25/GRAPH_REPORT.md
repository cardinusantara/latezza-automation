# Graph Report - latezza-automation  (2026-06-25)

## Corpus Check
- 120 files · ~88,104 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1072 nodes · 1405 edges · 98 communities (80 shown, 18 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b1196dcf`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_WhatsApp CRM & Follow-up|WhatsApp CRM & Follow-up]]
- [[_COMMUNITY_Infrastructure & Frontend|Infrastructure & Frontend]]
- [[_COMMUNITY_RAG Product Search|RAG Product Search]]
- [[_COMMUNITY_Meta Ads Analysis|Meta Ads Analysis]]
- [[_COMMUNITY_Scheduler & Settings|Scheduler & Settings]]
- [[_COMMUNITY_AI Agent Core|AI Agent Core]]
- [[_COMMUNITY_SSE Streaming API|SSE Streaming API]]
- [[_COMMUNITY_UI Actions Component|UI Actions Component]]
- [[_COMMUNITY_Theme Provider|Theme Provider]]
- [[_COMMUNITY_Mobile Hook|Mobile Hook]]
- [[_COMMUNITY_Utility Functions|Utility Functions]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 87|Community 87]]
- [[_COMMUNITY_Community 88|Community 88]]
- [[_COMMUNITY_Community 89|Community 89]]
- [[_COMMUNITY_Community 90|Community 90]]
- [[_COMMUNITY_Community 91|Community 91]]
- [[_COMMUNITY_Community 92|Community 92]]
- [[_COMMUNITY_Community 93|Community 93]]
- [[_COMMUNITY_Community 94|Community 94]]
- [[_COMMUNITY_Community 96|Community 96]]

## God Nodes (most connected - your core abstractions)
1. `cn()` - 78 edges
2. `compilerOptions` - 19 edges
3. `DEVELOPER.md — Latezza Cake WhatsApp AI Agent` - 17 edges
4. `compilerOptions` - 16 edges
5. `Button()` - 15 edges
6. `runCreativeAnalysis()` - 13 edges
7. `Component Composition` - 13 edges
8. `CHANGELOG — Latezza Cake WhatsApp AI Agent` - 13 edges
9. `shadcn/ui` - 12 edges
10. `Styling & Customization` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Overview()` --calls--> `getDateRangeLabel()`  [INFERRED]
  frontend/src/components/Overview.tsx → backend/src/services/summary.js
- `Plaintext Output Guardrails` --rationale_for--> `Google Gemini AI Integration`  [EXTRACTED]
  CHANGELOG.md → README.md
- `AI Creative Ad Content Ideas` --implements--> `Exponential Backoff Retry Logic`  [EXTRACTED]
  DEVELOPER.md → CHANGELOG.md
- `AI Creative Ad Content Ideas` --implements--> `Server-Sent Events Streaming`  [EXTRACTED]
  DEVELOPER.md → API.md
- `AI Creative Ad Content Ideas` --implements--> `Winner/Loser Ad Classification`  [EXTRACTED]
  DEVELOPER.md → CHANGELOG.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **WhatsApp Message Processing Pipeline** — latezza_automation_baileys_whatsapp, latezza_automation_gemini_ai_integration, latezza_automation_ai_tool_calling, latezza_automation_chat_histories_table, latezza_automation_customers_table [EXTRACTED 0.95]
- **Meta Ads Automation Pipeline** — latezza_automation_meta_ads_reporting, latezza_automation_creative_ad_analysis, latezza_automation_meta_graph_api, latezza_automation_dynamic_scheduler [EXTRACTED 0.95]
- **RAG Product Search Pipeline** — latezza_automation_rag_semantic_search, latezza_automation_gemini_embedding_2, latezza_automation_cosine_similarity, latezza_automation_products_table [EXTRACTED 0.95]

## Communities (98 total, 18 thin omitted)

### Community 0 - "WhatsApp CRM & Follow-up"
Cohesion: 0.06
Nodes (39): Ads & Creative Analysis API, AI Agent Tool Calling, Baileys WhatsApp Gateway, Chat Histories Database Table, Cosine Similarity Matching, AI Creative Ad Content Ideas, CRM Customer Management API, Customers Database Table (+31 more)

### Community 1 - "Infrastructure & Frontend"
Cohesion: 0.40
Nodes (6): Docker Compose Deployment, Fastify Backend Server, Light/Dark Mode Theme, PostgreSQL Database, React Vite Frontend SPA, shadcn/ui Component Library

### Community 2 - "RAG Product Search"
Cohesion: 0.10
Nodes (21): devDependencies, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, jsdom, prettier (+13 more)

### Community 3 - "Meta Ads Analysis"
Cohesion: 0.04
Nodes (47): 1. Kategori: Umum, 2. Kategori: Statistik Dashboard, 3. Kategori: CRM (Manajemen Pelanggan), 4. Kategori: Catalog (Manajemen Produk), 5. Kategori: Integrasi WhatsApp, 6. Kategori: Pengaturan & Prompt, 7. Kategori: Automasi Ads & Creative, 8. Kategori: Automasi Follow-Up (+39 more)

### Community 4 - "Scheduler & Settings"
Cohesion: 0.14
Nodes (13): AI AGENT (src/agent.js), AI CREATIVE AD CONTENT IDEAS (src/services/creative.js), AI MESSAGE SUMMARY (src/services/summary.js), BACKGROUND SCHEDULER SYSTEM (scheduler.js), DEVELOPER.md — Latezza Cake WhatsApp AI Agent, DIRECTORY STRUCTURE, Dynamic Reloading:, How it works: (+5 more)

### Community 5 - "AI Agent Core"
Cohesion: 0.17
Nodes (12): 2026-06-18, AI response formatting — natural plaintext guardrails, backend layered refactoring — architecture overhaul, environment separation — independent backend & frontend, follow-up instruction — smart prompt wrapping (3 modes), follow-up system — confirmed working end-to-end, follow-up system — prompt quality fix, follow-up time safeguard — manual trigger bypass & hourly cron (+4 more)

### Community 6 - "SSE Streaming API"
Cohesion: 0.12
Nodes (17): `add` — Add components, `apply` — Apply a preset to an existing project, `build` — Build a custom registry, Commands, Contents, `diff` — Check for updates, `docs` — Get component documentation URLs, Dry-Run Mode (+9 more)

### Community 7 - "UI Actions Component"
Cohesion: 0.11
Nodes (16): buildKpis(), DailyTrendItem, FeatureBreakdownItem, GeminiAnalyticsPanelProps, getDateRangeLabel(), Lead, MessageSummaryData, MtdStats (+8 more)

### Community 8 - "Theme Provider"
Cohesion: 0.17
Nodes (7): ResolvedTheme, Theme, THEME_VALUES, ThemeProvider(), ThemeProviderContext, ThemeProviderProps, ThemeProviderState

### Community 9 - "Mobile Hook"
Cohesion: 0.07
Nodes (48): useIsMobile(), cn(), Input(), Separator(), Sheet(), SheetContent(), SheetDescription(), SheetFooter() (+40 more)

### Community 10 - "Utility Functions"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 11 - "Community 11"
Cohesion: 0.09
Nodes (21): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection, moduleResolution (+13 more)

### Community 12 - "Community 12"
Cohesion: 0.08
Nodes (24): dependencies, dotenv, fastify, @fastify/cors, @fastify/multipart, @fastify/static, @ffmpeg-installer/ffmpeg, @google/generative-ai (+16 more)

### Community 13 - "Community 13"
Cohesion: 0.11
Nodes (6): createOrUpdateCustomer(), dbConfig, getCustomer(), { GoogleGenerativeAI }, { Pool }, settingsCache

### Community 14 - "Community 14"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+9 more)

### Community 15 - "Community 15"
Cohesion: 0.11
Nodes (18): CLI, Component Docs, Examples, and Usage, Component Selection, Component Structure → [composition.md](./rules/composition.md), Critical Rules, Current Project Context, Detailed References, Forms & Inputs → [forms.md](./rules/forms.md) (+10 more)

### Community 16 - "Community 16"
Cohesion: 0.10
Nodes (26): addMessageToDebounceBuffer(), agent, connectSession(), connectToWhatsApp(), db, DEBOUNCE_DELAY_MS, debounceCache, {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage
} (+18 more)

### Community 17 - "Community 17"
Cohesion: 0.07
Nodes (29): agent, db, fs, path, agentTools, buildSystemInstructions(), db, defaultMaxHistory (+21 more)

### Community 18 - "Community 18"
Cohesion: 0.14
Nodes (13): Critical Rules (Always Apply), Current Models (Use These), Current SDKs (Use These), Documentation Lookup, Gemini API Development Skill, Gemini Live API, Go, Java (+5 more)

### Community 19 - "Community 19"
Cohesion: 0.14
Nodes (14): 1. Built-in variants, 2. Tailwind classes via `className`, 3. Add a new variant, 4. Wrapper components, Adding Custom Colors, Border Radius, Changing the Theme, Checking for Updates (+6 more)

### Community 20 - "Community 20"
Cohesion: 0.15
Nodes (13): Avatar always needs AvatarFallback, Button has no isPending or isLoading prop, Callouts use Alert, Card structure, Choosing between overlay components, Component Composition, Contents, Dialog, Sheet, and Drawer always need a Title (+5 more)

### Community 21 - "Community 21"
Cohesion: 0.17
Nodes (10): adsService, cron, db, Fastify, followupService, fs, path, registerRoutes (+2 more)

### Community 22 - "Community 22"
Cohesion: 0.22
Nodes (9): ads & creative ideas, API ROUTES REFERENCE, customers (CRM), follow-up (internal/testing), general, products, settings, stats (+1 more)

### Community 23 - "Community 23"
Cohesion: 0.17
Nodes (11): Configuring Registries, Setup, `shadcn:get_add_command_for_items`, `shadcn:get_audit_checklist`, `shadcn:get_item_examples_from_registries`, `shadcn:get_project_registries`, `shadcn:list_items_in_registries`, shadcn MCP Server (+3 more)

### Community 24 - "Community 24"
Cohesion: 0.15
Nodes (22): buildBrandPieWidget(), buildBubbleChartWidget(), buildDashboardLayout(), buildEfficiencyBarListWidget(), buildEfficiencyChartWidget(), buildImpReachChartWidget(), buildKPIs(), buildStackedChartWidget() (+14 more)

### Community 25 - "Community 25"
Cohesion: 0.20
Nodes (9): dependencies, dotenv, @google/generative-ai, description, main, name, scripts, start (+1 more)

### Community 26 - "Community 26"
Cohesion: 0.22
Nodes (9): Accordion, Base vs Radix, Button / trigger as non-button element (base only), Composition: asChild (radix) vs render (base), Contents, Select, Select — multiple selection and object values (base only), Slider (+1 more)

### Community 27 - "Community 27"
Cohesion: 0.31
Nodes (8): adsService, buildDailyCronExpression(), cron, db, followupService, reloadSchedules(), setupScheduledJobs(), stopAllJobs()

### Community 28 - "Community 28"
Cohesion: 0.17
Nodes (11): adsService, agent, convertWebmToOgg(), crypto, db, { execFile }, followupService, fs (+3 more)

### Community 29 - "Community 29"
Cohesion: 0.25
Nodes (8): Buttons inside inputs use InputGroup + InputGroupAddon, Contents, Field validation and disabled states, FieldSet + FieldLegend for grouping related fields, Forms & Inputs, Forms use FieldGroup + Field, InputGroup requires InputGroupInput/InputGroupTextarea, Option sets (2–7 choices) use ToggleGroup

### Community 30 - "Community 30"
Cohesion: 0.22
Nodes (9): db, { exec }, execPromise, path, runAnalysisAndSendReport(), runAnalysisRaw(), scriptPath, util (+1 more)

### Community 31 - "Community 31"
Cohesion: 0.11
Nodes (28): broadcastCreativeReportToWhatsApp(), buildCreativePrompt(), classifyWinnerLoserAds(), db, fetchAndMapApiAds(), fetchCopywritingFromMeta(), fetchMetaAdsCreatives(), fetchMetaAdsInsights() (+20 more)

### Community 32 - "Community 32"
Cohesion: 0.11
Nodes (18): dependencies, class-variance-authority, clsx, @fontsource-variable/figtree, @fontsource-variable/geist, @hugeicons/core-free-icons, @hugeicons/react, next-themes (+10 more)

### Community 33 - "Community 33"
Cohesion: 0.29
Nodes (6): 1. Perbarui `CHANGELOG.md`, 2. Perbarui `DEVELOPER.md` (Jika Perlu), 3. Perbarui `API.md` (Jika Perlu), 📌 Aturan Penting, 📋 Langkah-langkah Pembaruan, Workflow: Update Dokumentasi & Changelog

### Community 34 - "Community 34"
Cohesion: 0.33
Nodes (5): compilerOptions, paths, files, @/*, references

### Community 36 - "Community 36"
Cohesion: 0.40
Nodes (4): Icons, Icons in Button use data-icon attribute, No sizing classes on icons inside components, Pass icons as component objects, not string keys

### Community 37 - "Community 37"
Cohesion: 0.17
Nodes (11): db, { GoogleGenerativeAI }, processSingleFollowUp(), runProactiveFollowUps(), whatsappService, db, followup, { GoogleGenerativeAI } (+3 more)

### Community 38 - "Community 38"
Cohesion: 0.50
Nodes (3): Adding components, React + TypeScript + Vite + shadcn/ui, Using components

### Community 55 - "Community 55"
Cohesion: 0.18
Nodes (17): buildEmptySummaryReport(), buildSummaryQuery(), db, generateMessageSummary(), generateStreamWithRetry(), getDateRangeLabel(), { GoogleGenerativeAI }, parseGeminiJson() (+9 more)

### Community 56 - "Community 56"
Cohesion: 0.22
Nodes (9): 2026-06-21, AI Insights, Timeframe KPIs, and Custom Prompts for Creative Analysis, Audio Playback, Transcoding, and Database Metadata Fixes, Comprehensive Test Cases & Automated Testing Pipeline, Dashboard Outgoing Voice Message Recording & Transcribing, Meta Ads Analysis Refactor: Custom Date Range & Projection Removal, Meta Ads Analysis UI/UX & Real-time Progress Streaming, Meta Ads CSV Date Range Filtering & Proportional Projections Bugfix (+1 more)

### Community 59 - "Community 59"
Cohesion: 0.20
Nodes (9): Agent habits — always do these, AGENTS.md — Latezza WhatsApp AI Agent, API overview, Backend (in `backend/`), Development commands, Frontend (in `frontend/`), graphify, Project structure (+1 more)

### Community 62 - "Community 62"
Cohesion: 0.18
Nodes (10): 2026-06-20, 2026-06-22, 2026-06-25, Achieved 100% SonarQube Quality Gate Compliance, CHANGELOG — Latezza Cake WhatsApp AI Agent, DATA NOTES, Optimized Creative Analysis Sourcing & CSV Context, Voice Message Comprehension & Audio Player (+2 more)

### Community 63 - "Community 63"
Cohesion: 0.29
Nodes (7): 2026-06-17 (morning — initial build), AI handoff system, Chat Inbox — WhatsApp-style UI, initial all-in-one dashboard, Meta Ads daily report — initial implementation, proactive follow-up — initial implementation, React SPA migration

### Community 64 - "Community 64"
Cohesion: 0.29
Nodes (6): 1. Tentukan Cakupan Pengujian, 2. Buat/Perbarui Berkas Test, 3. Jalankan Pengujian Secara Lokal, 📌 Aturan Penting, 📋 Langkah-langkah Pembuatan Test, Workflow: Menulis & Menjalankan Unit Test

### Community 65 - "Community 65"
Cohesion: 0.33
Nodes (6): 2026-06-19, AI Creative Ad Ideas & Copywriting Audit, Best-Practice Error Propagation, Dynamic Background Scheduler & Reloading, Latezza Agent branding, Warm UI theme, Light/Dark Mode & Mobile responsiveness, SSE Progress Streaming & Dashboard UI

### Community 66 - "Community 66"
Cohesion: 0.40
Nodes (5): 2026-06-17 (evening), Ads Report — dashboard tab, DEVELOPER.md — initial version, Meta Ads config — dashboard settings, WhatsApp groups — dynamic dropdown

### Community 67 - "Community 67"
Cohesion: 0.40
Nodes (4): db, Fastify, registerRoutes, whatsappService

### Community 68 - "Community 68"
Cohesion: 0.50
Nodes (4): 2026-06-17 (afternoon), Products CRUD — full database-backed, project restructure — monorepo split, shadcn/ui migration

### Community 74 - "Community 74"
Cohesion: 0.22
Nodes (9): Address Schemes, Build and Verify, GitHub Registries, Include, Item Definitions, Mental Model, Registry Authoring and Addresses, Registry Dependencies (+1 more)

### Community 77 - "Community 77"
Cohesion: 0.29
Nodes (7): backfillProductEmbeddings(), generateEmbedding(), getSetting(), initDb(), loadAllSettings(), searchProducts(), searchProductsFallback()

### Community 78 - "Community 78"
Cohesion: 0.22
Nodes (9): scripts, build, dev, format, lint, preview, test, test:watch (+1 more)

### Community 79 - "Community 79"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 80 - "Community 80"
Cohesion: 0.40
Nodes (5): 2026-06-23, Dynamic Cost Calculator, Gemini API Usage & Costs Tracking, Gemini Cost Calculator Tool, Gemini Model Configuration Refactor

### Community 81 - "Community 81"
Cohesion: 0.17
Nodes (11): 📄 `backend/src/db.js` (1 issues), By Severity, By Type, 📄 `frontend/src/components/Products.tsx` (2 issues), 📄 `frontend/src/components/Settings.tsx` (1 issues), 📄 `frontend/src/components/WhatsappSessions.tsx` (1 issues), 📄 `frontend/vite.config.ts` (1 issues), ⚠️ Issues Overview (+3 more)

### Community 82 - "Community 82"
Cohesion: 0.40
Nodes (4): fs, generateReport(), getRatingLabel(), path

### Community 83 - "Community 83"
Cohesion: 0.07
Nodes (25): AudioUploadParams, ChatInbox(), ChatInboxProps, ChatMessage, ChatMessageBubbleProps, ConversationBoxPanel(), ConversationBoxPanelProps, ConversationListPanelProps (+17 more)

### Community 84 - "Community 84"
Cohesion: 0.10
Nodes (20): Product, ProductsProps, WhatsAppSession, mockProducts, mockSessions, Dialog(), DialogContent(), DialogDescription() (+12 more)

### Community 85 - "Community 85"
Cohesion: 0.10
Nodes (14): AdsReport(), AdsReportControlsProps, AdsReportHeaderProps, AdsReportViewPanelProps, calculatePresetDates(), CsvMetadata, CsvStatus, getLocalDateString() (+6 more)

### Community 86 - "Community 86"
Cohesion: 0.18
Nodes (8): Actions(), SidebarProps, useTheme(), Lead, Stats, Button(), buttonVariants, Toaster()

### Community 87 - "Community 87"
Cohesion: 0.16
Nodes (14): ActionsProps, CreativeIdea, CreativeReportData, SettingsProps, SettingsState, API_BASE_URL, Card(), CardAction() (+6 more)

### Community 88 - "Community 88"
Cohesion: 0.22
Nodes (9): Backend Env (`backend/.env`), Backend Tests (Jest), env files, Frontend Env (`frontend/.env`), Frontend Tests (Vitest), HOW TO RUN, local dev (two terminals), production (+1 more)

### Community 89 - "Community 89"
Cohesion: 0.29
Nodes (7): api_usage_logs, chat_histories, customers, DATABASE SCHEMA, products, settings (key-value store), whatsapp_sessions

### Community 90 - "Community 90"
Cohesion: 0.17
Nodes (12): Built-in variants first, className for layout only, Contents, No manual dark: color overrides, No manual z-index on overlay components, No raw color values for status/state indicators, No space-x-* / space-y-*, Prefer size-* over w-* h-* when equal (+4 more)

### Community 91 - "Community 91"
Cohesion: 0.40
Nodes (5): 1. JSX Decomposition Pattern (Solving Cognitive Complexity), 2. Custom Hooks for Logic Abstraction, 3. Strict Props Typing, 4. Quality Inspection (SonarQube) & Test Coverage, FRONTEND ARCHITECTURE & CODE QUALITY GUIDELINES

### Community 92 - "Community 92"
Cohesion: 0.40
Nodes (5): adding a new AI tool, adding a new API route, adding a new frontend tab/panel, adding a new settings key, ADDING NEW FEATURES — PATTERNS TO FOLLOW

### Community 93 - "Community 93"
Cohesion: 0.50
Nodes (4): 2026-06-24, Backend Refactoring & SonarQube Code Quality Improvements, Frontend Refactoring & SonarQube Code Quality Improvements, SonarQube Quality Gate Compliance & Security Hardening

### Community 94 - "Community 94"
Cohesion: 0.67
Nodes (3): important behavior, PROACTIVE FOLLOW-UP SYSTEM, prompt building logic (3 modes)

### Community 96 - "Community 96"
Cohesion: 0.29
Nodes (6): adsService, creativeService, cron, db, followupService, scheduler

## Knowledge Gaps
- **598 isolated node(s):** `$schema`, `plugin`, `@opencode-ai/plugin`, `fs`, `path` (+593 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Overview()` connect `UI Actions Component` to `Community 55`?**
  _High betweenness centrality (0.113) - this node is a cross-community bridge._
- **Why does `getDateRangeLabel()` connect `Community 55` to `UI Actions Component`?**
  _High betweenness centrality (0.113) - this node is a cross-community bridge._
- **Why does `cn()` connect `Mobile Hook` to `Community 83`, `Community 84`, `Community 86`, `Community 87`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **What connects `$schema`, `plugin`, `@opencode-ai/plugin` to the rest of the system?**
  _602 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `WhatsApp CRM & Follow-up` be split into smaller, more focused modules?**
  _Cohesion score 0.06025641025641026 - nodes in this community are weakly interconnected._
- **Should `RAG Product Search` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._
- **Should `Meta Ads Analysis` be split into smaller, more focused modules?**
  _Cohesion score 0.041666666666666664 - nodes in this community are weakly interconnected._