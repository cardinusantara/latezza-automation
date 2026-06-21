# CHANGELOG — Latezza Cake WhatsApp AI Agent

format: date descending, grouped by session/sprint
entries: plain text, AI-readable, no markdown fluff

---

## 2026-06-21

### Overview Session Filter, Navigation, and Immediate WhatsApp AI Status Updates
- implemented a session filter dropdown on the Overview Dashboard to let users filter KPIs and activity logs by specific agent sessions, defaulting to "All Agent Sessions" (aggregated view)
- added a "WhatsApp Agent" badge to the Recent Customer Activity table showing which session handles each customer
- updated customer row click behavior in Overview to set `selectedSessionId` and open the conversation directly inside the Inbox tab
- added `selectedSessionId` to the dependency arrays of `useEffect` fetching and polling hooks in `ChatInbox.tsx` to handle cross-session customer navigation cleanly
- optimized the message receiver socket listener in `backend/src/services/whatsapp.js` to retrieve the customer record early and check the AI status
- implemented immediate composing status indicator (`composing`) and WhatsApp read receipts (`readMessages`) for incoming messages when processed by AI, running concurrently with audio download and Gemini transcription

### Meta Ads Analysis UI/UX & Real-time Progress Streaming
- implemented Server-Sent Events (SSE) streaming for Meta Ads Analysis via a new GET endpoint `/api/run-analysis-stream` in `backend/src/routes.js`
- updated `backend/src/services/ads.js` to expose `runAnalysisSpawn` which returns a spawned node process to stream stdout and stderr logs in real-time
- added `::STATUS::` log statements at key execution phases in `backend/ads-analysis/automation.js` (e.g. database configuration loading, Meta Ads API / CSV reading, brand grouping, Gemini AI analysis, and HTML compilation)
- redesigned the frontend `frontend/src/components/AdsReport.tsx` component to support real-time streaming updates using the EventSource API
- implemented a premium dual-column loading user interface when running analysis, featuring:
  - a pulsing gradient glow and spinning loader indicator
  - an interactive step-by-step progress checklist that dynamically transitions based on status logs from the backend
  - a developer-style terminal box displaying live scrolling logs output directly from the running automation process
- verified complete React bundlings and TypeScript type-checks compile successfully with zero errors

### Meta Ads CSV Date Range Filtering & Proportional Projections Bugfix
- fixed a bug where the Meta Ads dashboard displayed the entire CSV total metrics (e.g. 14.4 million spend) instead of filtering or projecting for the selected date range
- updated `parseCSV` in `backend/ads-analysis/automation.js` to parse CSV columns for reporting start and end dates (`Awal pelaporan` and `Akhir pelaporan`)
- implemented proportional calculations to scale metrics (spend, impressions, reach, conversions) for overlapping days with the selected date range, and filter out any rows with no overlap
- updated the CSV loader process to pass the selected `dateFrom` and `dateTo` variables to the CSV parser

### Meta Ads Analysis Refactor: Custom Date Range & Projection Removal
- removed all daily/weekly/monthly projections and extrapolation calculations from `backend/ads-analysis/automation.js` to prevent misleading data reports
- replaced the 3-timeframe fixed tabs (daily/weekly/monthly) with a single unified dashboard layout using custom date ranges
- updated Meta Ads API mode to query insights using the `time_range` property dynamically based on user selection
- refactored `backend/src/services/ads.js` functions `runAnalysisAndSendReport` and `runAnalysisRaw` to accept custom `dateFrom` and `dateTo` parameters (retaining backward-compatible logger object fallbacks)
- updated Fastify routes in `backend/src/routes.js` (`POST /run-analysis` and `POST /trigger-analysis`) to retrieve and pass `date_from` and `date_to` parameters from the request payload
- simplified the HTML reporting engine template `backend/ads-analysis/template.html` by removing the tab-switching UI and logic to support direct rendering of a single custom-range dashboard
- enhanced the frontend `frontend/src/components/AdsReport.tsx` component to include a dual date-picker control bar ("Dari" and "Sampai") along with quick preset buttons ("7 Hari", "14 Hari", "30 Hari", "Bulan Ini")

### Audio Playback, Transcoding, and Database Metadata Fixes
- corrected relative directory resolution paths in `routes.js` to ensure recorded voice messages are saved directly to `backend/public/uploads` (resolving 404 audio player loading issues in the dashboard)
- integrated WebM-to-Ogg transcoding via FFmpeg in `routes.js` using the `convertWebmToOgg` utility helper
- updated manual voice message sending to transcode recorded webm files, read the mono Ogg Opus output, and transmit it via Baileys with `mimetype: 'audio/ogg; codecs=opus'` (enabling native playbacks on iOS and Android WhatsApp applications)
- fixed incoming customer voice note database logging to preserve the `[Voice Note: <url>] <transcription>` metadata structure when the AI responds in `agent.js`

### Dashboard Outgoing Voice Message Recording & Transcribing
- exported `transcribeAudio` utility from `whatsapp.js` to expose audio transcription service
- updated `/api/customers/:phone/send-message` API route in `routes.js` to accept `audioBase64` and `mimetype` properties
- implemented backend decoding, local storage, and transcribing of outgoing audio via Gemini API
- implemented Baileys WhatsApp delivery of outgoing voice notes with `mimetype: 'audio/mp4'` and `ptt: true` (rendering as native Push-to-Talk messages)
- implemented frontend audio recording using browser `MediaRecorder` API in `ChatInbox.tsx`
- added microphone button to Chat Inbox message input footer and integrated custom recording panel with pulsing indicator, timer, Cancel (Batal), and Send (Kirim) buttons
- implemented base64 conversion and optimistic UI chat bubble updates for outgoing voice notes

## 2026-06-20

### Voice Message Comprehension & Audio Player
- integrated `GoogleGenerativeAI` into `whatsapp.js` to enable native audio message transcription
- enhanced `messages.upsert` socket listener to capture `audioMessage` events from `@whiskeysockets/baileys`
- downloaded and stored WhatsApp voice notes locally as `.ogg` files in `backend/public/uploads/`
- implemented `transcribeAudio` helper in `whatsapp.js` using the configured Gemini model (with `gemini-3.5-flash` fallback) to convert audio to literal Indonesian text
- saved incoming voice notes to the chat history database with the format `[Voice Note: <url>] <transcription>`
- updated frontend `ChatInbox.tsx` message bubble parsing to detect the `[Voice Note: ...]` pattern
- rendered browser-native HTML5 `<audio>` players in the message bubbles next to italicized transcriptions

### WhatsApp Multi-Session & QR Scanner Dashboard
- created `whatsapp_sessions` table in database to track session credentials, names, connection statuses, and active QR codes
- migrated `customers` and `chat_histories` tables to use composite primary keys `(phone_number, session_id)` for chat data isolation
- refactored `backend/src/services/whatsapp.js` to support connection pooling using `Map` of socket connections and isolated multi-file auth paths
- added new Fastify endpoints: `GET /api/whatsapp/sessions` (list sessions), `POST /api/whatsapp/sessions` (create session), `DELETE /api/whatsapp/sessions/:id` (delete session), and `POST /api/whatsapp/sessions/:id/regenerate` (reset session credentials & get new QR)
- updated CRM, stats, toggle-ai, and update-details endpoints to support the `session_id` query/body parameter
- updated `agent.js` and `followup.js` to process and store chat records mapped to the correct `session_id`
- created `WhatsappSessions.tsx` component in frontend to show a grid of WhatsApp agents, status badges (glowing/pulsing), and live scanning animation QR codes
- integrated the "WA Sessions" tab in frontend `Sidebar.tsx` and `App.tsx`
- added session selector dropdown at the top of `ChatInbox.tsx` customer list sidebar to filter leads and isolate active chat conversations

## 2026-06-19

### Latezza Agent branding, Warm UI theme, Light/Dark Mode & Mobile responsiveness
- renamed application title, headers, and HTML file references to **Latezza Agent Dashboard**
- integrated warm-chocolate and beige RGB styles from `newui.css` into `frontend/src/index.css`
- loaded and integrated Google serif font `Playfair Display` dynamically
- implemented light/dark mode state controller using `localStorage` and dynamic `.dark` class injection in `App.tsx`
- added theme switch button toggles on both desktop headers and mobile topbars
- added fixed topbar on mobile with sliding responsive hamburger menu navigation drawers in `Sidebar.tsx`
- optimized Chat Inbox layout for mobile, hiding the multi-pane grid in favor of a sequential view switcher (`list` -> `chat` -> `crm`)
- optimized Settings layout for mobile, adding a horizontal scrollable tab pills selector to display one setting card at a time to eliminate long scroll feeds
- optimized Light Mode color contrast (warm beige Chat background, high-contrast white customer bubbles, primary-gold AI agent bubbles, and dynamic light green/rose Winner & Loser card gradients)
- verified typescript compile and production bundlings compile successfully with zero warnings/errors

### AI Creative Ad Ideas & Copywriting Audit
- created `backend/src/services/creative.js` to inspect active ads (captions, headlines, media URLs) and performance insights (conversions, spend, cost per messaging conversation)
- implemented metric-based classification dividing ads into "Winners" (high conversions, low cost) and "Losers" (high budget spent with minimal conversions)
- integrated Gemini API `generateContentStream` to analyze ad copywriting/media and generate 3-5 new Indonesian ad copy variations and matching visual briefs
- implemented 3-attempt exponential backoff retry logic (starting at 2s delay) to bypass transient `503 Service Unavailable` API demand spikes
- saved generated creative analysis reports directly to the `creative_analysis_report` settings table/cache

### Dynamic Background Scheduler & Reloading
- created `backend/src/services/scheduler.js` to manage all automated cron tasks (excluding hourly follow-up scans) using `node-cron`
- supported database-configured settings: `ads_analysis_frequency`/`time` and `creative_analysis_frequency`/`time`
- implemented `scheduler.reloadSchedules()` to dynamically stop and restart background crons with new settings immediately on configuration update without restarting the server

### SSE Progress Streaming & Dashboard UI
- created `GET /api/trigger-creative-analysis-stream` endpoint in `backend/src/routes.js` to broadcast live server-sent event (SSE) chunks during AI creative analysis runs
- created frontend `CreativeReport.tsx` component to view, trigger, and read real-time typewriter logs and streaming AI text chunks
- added "Automation Schedules" configuration card in frontend `Settings.tsx` to control frequencies and trigger times for all automated tasks
- added visual indicator and disabled state tracking on manual trigger buttons in dashboard components

### Best-Practice Error Propagation
- disabled simulated/mock data fallbacks when Meta Graph or Gemini API keys are missing or calls fail
- propagated explicit error messages to the frontend UI for clear system state visibility

---

## 2026-06-18

### RAG semantic product search — AI-powered catalog matching
- added `embedding` JSONB column to the `products` table for storing generated vectors
- implemented automatic startup database migration and `backfillProductEmbeddings()` backfilling utility using the `gemini-embedding-2` model
- updated product creation (`POST /api/products`) and edit (`PUT /api/products/:id`) handlers to compute/update embeddings in the background
- implemented `searchProducts` semantic similarity matching in `backend/src/db.js` using in-memory cosine similarity calculation
- added a fallback mechanism to traditional SQL `ILIKE` keyword search if the Gemini API key is missing or calls fail
- added command-line verification script `backend/scripts/test-semantic-search.js` to test search query relevance

### backend layered refactoring — architecture overhaul
- reorganized backend code into separate concerns:
  - `src/db.js` — Data Access Layer (PostgreSQL pool & settings cache)
  - `src/agent.js` — AI Agent & tool definitions
  - `src/routes.js` — Presentation layer containing all Fastify endpoint definitions
  - `src/services/whatsapp.js` — Baileys WA connection, messages.upsert, rate limiting
  - `src/services/followup.js` — Proactive customer follow-up scanning and LLM logic
  - `src/services/ads.js` — Meta Ads script execution and WA broadcast reporting
- moved duplicate root files to their respective src/ paths
- moved all local developer utility scripts to `scripts/` folder
- updated utility scripts to import from `../src/db` and resolve database connections from environment configuration dynamically
- verified server starts, DB initializes, and WA gateway connects perfectly

### environment separation — independent backend & frontend
- created `backend/.env` for backend port, DB connection, and API credentials
- created `frontend/.env` with `VITE_API_URL=http://localhost:3001`
- deleted root `.env` to avoid configuration overlap
- registered `@fastify/cors@8` on backend to support standalone cross-origin REST calls from frontend

### follow-up time safeguard — manual trigger bypass & hourly cron
- added optional `ignoreThreshold` flag to `db.getCustomersForFollowUp()`
- manual API triggers (`POST /api/trigger-followups` and `/run-followup`) now pass `ignoreThreshold = true`, allowing immediate follow-ups of flagged leads regardless of the time elapsed since their last interaction
- converted static daily 14:00 cron check into an hourly schedule (`0 * * * *`) to dynamically process customers exactly when their setting-configured delay (`followup_hours`) expires

### AI response formatting — natural plaintext guardrails
- updated system instructions builder in `agent.js` to forbid markdown formatting (`**`, `*`, `#`, and blockquotes) in AI agent replies
- ensures responses look like a natural human-typed message
- allowed lists (strip or numbers) strictly for displaying multiple products in search results

### obsolete product sync — removal
- deleted "Sync Catalog Now" button, props, and callbacks from frontend `Actions.tsx` and `App.tsx`
- removed obsolete `product-sync.js` script

### follow-up system — prompt quality fix
- problem: Gemini was outputting multiple options + tips instead of one clean WA message
- root cause 1: old `followup_instruction` stored in settings DB was a bad generic string ("Follow up user {name} regarding their interest...")
- root cause 2: default prompt in code was too vague ("Buatlah pesan follow-up...")
- fix: deleted stale `followup_instruction` from DB settings table
- fix: rewrote default prompt in gateway.js to use role-based persona + strict one-output enforcement
- added: `POST /run-followup` endpoint for manual testing without waiting for 14:00 cron
- added: seed/debug/verify test scripts in backend/ (seed-test-followup.js, debug-followup.js, verify-followup.js, clear-followup-prompt.js)

### follow-up instruction — smart prompt wrapping (3 modes)
- problem: users couldn't write natural language in followup_instruction — any custom text broke format
- fix: backend now detects instruction mode before building Gemini prompt:
  - mode 1 (empty): use built-in default template — history, reason, name injected automatically
  - mode 2 (no {history}): treat as natural language style guide — auto-wrap with full template + inject vars
  - mode 3 (contains {history}): use as full custom template — inject vars + append strict output rule
- all 3 modes always append "INSTRUKSI OUTPUT" block forcing single clean plaintext WA message output
- fix: replaced `.replace('{name}', ...)` with `.replace(/\{name\}/g, ...)` regex for global replacement

### Settings UI — follow-up section improvement
- added: preset quick-select buttons for followup_hours (1j / 4j / 6j / 12j / 24j / 48j)
- added: "Reset ke Default" button that clears followup_instruction field (triggers mode 1)
- added: info banner explaining natural language mode and that leaving field empty uses system default
- improved: placeholder text shows two concrete examples (natural mode + full template mode)
- improved: variable hint row now shows {name} {reason} {history} as code badges with note about {history}
- added icons: IconClockHour4, IconSparkles, IconInfoCircle from @tabler/icons-react

### settings cache — clarification
- confirmed: `db.setSetting()` updates both PostgreSQL AND settingsCache atomically
- confirmed: `POST /api/settings` calls `db.setSetting()` for all keys including followup_instruction and followup_hours
- confirmed: NO RESTART NEEDED after saving settings from dashboard
- caveat: direct SQL inserts (psql / scripts) bypass cache — would need restart to reflect. Dashboard path is safe.

### follow-up system — confirmed working end-to-end
- tested: seed customer with needs_follow_up=TRUE + chat history → trigger /run-followup → Gemini generates message → sock.sendMessage → DB updated needs_follow_up=FALSE
- tested: natural language instruction mode produces single clean WA message referencing admin's instructions
- tested: followup_hours=1 threshold works correctly; default 24h threshold intentional for production

---

## 2026-06-17 (evening)

### Ads Report — dashboard tab
- added: AdsReport.tsx component with iframe embed of /report-html
- added: "Regenerate Report" button → POST /run-analysis
- added: "Kirim ke WhatsApp" button → POST /trigger-analysis
- added: "Buka Tab Baru" link for full-screen report view
- added: HEAD /report-html check before rendering iframe to show empty state if report doesn't exist yet

### Meta Ads config — dashboard settings
- added: meta_access_token and meta_ad_account_id fields to Settings.tsx
- added: these keys to POST /api/settings handler and GET response
- fix: automation.js now receives META_ACCESS_TOKEN and META_AD_ACCOUNT_ID from DB settings via exec() env injection (not just process.env)

### WhatsApp groups — dynamic dropdown
- added: GET /api/whatsapp/groups endpoint using sock.groupFetchAllParticipating()
- added: dropdown in Settings.tsx to select target WA group from live list
- added: fallback to manual JID input if WA not connected or group not in list
- added: toggle button between dropdown mode and manual input mode

### DEVELOPER.md — initial version
- created comprehensive developer documentation covering architecture, DB schema, API routes, cron schedules, deployment steps

---

## 2026-06-17 (afternoon)

### Products CRUD — full database-backed
- replaced JSON-file product sync with full PostgreSQL CRUD
- added: GET/POST/PUT/DELETE /api/products routes in gateway.js
- added: Products.tsx with shadcn/ui DataTable, create/edit Dialog, delete confirmation
- added: price formatting (IDR), image preview, Shopee link fields

### shadcn/ui migration
- migrated all frontend components from raw HTML/CSS to shadcn/ui component library
- components used: Card, CardHeader, CardContent, Button, Input, Textarea, Dialog, Table, Switch, Badge, Tooltip, Select
- setup: ran `npx shadcn@latest init -y -t vite` in frontend/
- theme: dark mode with emerald-500 accent color, oklch CSS variables

### project restructure — monorepo split
- split project into /backend and /frontend directories
- backend: Fastify + Baileys + Gemini + PostgreSQL
- frontend: React + Vite + Tailwind CSS v4 + shadcn/ui
- ads-analysis moved into backend/ads-analysis/
- all configuration fields (API keys, prompts, Meta Ads settings) now configurable via dashboard

---

## 2026-06-17 (morning — initial build)

### initial all-in-one dashboard
- built single-file HTML admin dashboard (later replaced by React app)

### React SPA migration
- migrated to React + Vite
- implemented tab-based routing: Overview, Chat Inbox, Products, Settings, Ads Report

### Chat Inbox — WhatsApp-style UI
- customer list panel (left) + chat panel (right)
- WhatsApp-style message bubbles (user right, AI left)
- real-time polling every 4 seconds
- AI toggle switch per customer (enable/disable AI response)
- "Needs Admin" flag with visual indicator
- admin can send manual messages from dashboard chat UI

### AI handoff system
- Gemini tool: flag_needs_admin(reason) — mutes AI, notifies owner via WA, marks customer in CRM
- Gemini tool: flag_needs_follow_up(reason) — marks customer for proactive follow-up queue
- admin can toggle needs_admin from dashboard to re-enable AI after handling customer manually

### proactive follow-up — initial implementation
- cron: 0 14 * * * Asia/Jakarta
- fetches customers with needs_follow_up=TRUE and last_interaction older than followup_hours
- generates personalized WA follow-up message via Gemini using chat history context
- sends via sock.sendMessage and resets the flag after successful send

### Meta Ads daily report — initial implementation
- cron: 0 9 * * * Asia/Jakarta
- automation.js fetches Meta Graph API data and generates HTML report
- Gemini summarizes metrics in Indonesian
- report broadcast to WA group

---

## DATA NOTES

test data files created during development (not for production):
- backend/seed-test-followup.js     — seeds fake customer with needs_follow_up=TRUE for testing
- backend/debug-followup.js         — prints all customer rows with timing info + query simulation
- backend/verify-followup.js        — shows customer status + last 5 messages after follow-up run
- backend/clear-followup-prompt.js  — checks and deletes followup_instruction from settings table
- backend/test-natural-instruction.js — sets natural-language instruction in DB for testing
- backend/set-followup-hours.js     — sets followup_hours to 1 for testing (remember to reset to 24 in prod)

these files are safe to delete in production. they don't affect runtime.
