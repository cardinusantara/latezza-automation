# CHANGELOG — Latezza Cake WhatsApp AI Agent

format: date descending, grouped by session/sprint
entries: plain text, AI-readable, no markdown fluff

---

## 2026-06-19

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
