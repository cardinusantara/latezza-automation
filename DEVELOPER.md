# DEVELOPER.md — Latezza Cake WhatsApp AI Agent

project: WhatsApp AI Agent + Admin Dashboard
client: Latezza Cake
stack: Fastify (Node.js) + React (Vite + Tailwind CSS v4 + shadcn/ui) + PostgreSQL + Baileys + Gemini API
last_updated: 2026-06-18

---

## DIRECTORY STRUCTURE

```
n8n-automation/
├── .env                          # root env file — DB credentials, fallback API keys
├── DEVELOPER.md                  # this file
├── CHANGELOG.md                  # feature/fix history
├── backend/
│   ├── gateway.js                # MAIN FILE — Fastify server, WA socket, all API routes, cron jobs
│   ├── agent.js                  # Gemini AI handler for incoming DMs — context window, tools, handoff logic
│   ├── db.js                     # PostgreSQL pool, schema init (CREATE TABLE IF NOT EXISTS), settings cache
│   ├── product-sync.js           # legacy utility to sync products from JSON to DB (rarely used)
│   ├── ads-analysis/
│   │   ├── automation.js         # Meta Ads fetcher + Gemini NLP summarizer + report.html generator
│   │   ├── template.html         # HTML template for report generation (has {{PLACEHOLDER}} tokens)
│   │   └── report.html           # generated output — served at GET /report-html
│   ├── whatsapp-session/         # Baileys auth session files (gitignored — do not delete while running)
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx               # root component — tab routing, toast state
│   │   ├── index.css             # oklch-based dark theme CSS variables
│   │   ├── components/
│   │   │   ├── Sidebar.tsx       # navigation sidebar
│   │   │   ├── Overview.tsx      # stats dashboard (total customers, leads, revenue indicators)
│   │   │   ├── ChatInbox.tsx     # real-time chat panel — customer list + WhatsApp-style chat UI
│   │   │   ├── Products.tsx      # product catalog CRUD (create/edit/delete via API)
│   │   │   ├── Settings.tsx      # all configurable settings — API keys, prompts, follow-up, Meta Ads
│   │   │   ├── AdsReport.tsx     # ads report viewer — iframe of report.html + manual trigger buttons
│   │   │   └── ui/               # shadcn/ui base components (Card, Button, Input, Dialog, etc.)
│   │   └── main.tsx
│   ├── vite.config.ts
│   └── package.json
```

---

## HOW TO RUN

### local dev (two terminals)

```bash
# terminal 1 — backend
cd backend
npm install
npm start   # starts on port 3001, serves frontend/dist statically

# terminal 2 — frontend hot reload (optional, only for UI dev)
cd frontend
npm install
npm run dev  # starts on port 5173, proxies API to 3001
```

### production

```bash
cd frontend
npm run build        # compiles to frontend/dist/

cd ../backend
npm start            # serves API + static React app on port 3001
# open http://localhost:3001/dashboard
```

### env file (.env in root)
```
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=yourpassword
DB_NAME=latezzacake
GEMINI_API_KEY=AIza...          # fallback if not set in DB settings
GEMINI_MODEL=gemini-2.5-flash   # optional override
META_ACCESS_TOKEN=...           # fallback if not set in DB settings
META_AD_ACCOUNT_ID=act_...      # fallback if not set in DB settings
PUBLIC_REPORT_URL=https://yourdomain.com
WHATSAPP_GROUP_JID=120363...@g.us
PORT=3001
```

---

## DATABASE SCHEMA

All tables are created automatically on server start in `db.js` using `CREATE TABLE IF NOT EXISTS`. Migrations (add column if not exists) also run on every startup.

### customers
```sql
phone_number    VARCHAR(50) PRIMARY KEY  -- WA JID e.g. 628xxx@s.whatsapp.net or xxx@lid
name            VARCHAR(100)
status          VARCHAR(20) DEFAULT 'lead'   -- values: lead | customer | dormant | opt_out
notes           TEXT
contact_phone   VARCHAR(20)
ai_enabled      BOOLEAN DEFAULT TRUE     -- if FALSE, AI is muted for this customer; admin responds manually
needs_admin     BOOLEAN DEFAULT FALSE    -- set TRUE when AI detects situation needs human (e.g. custom order)
needs_follow_up BOOLEAN DEFAULT FALSE    -- set TRUE by AI when customer shows interest but doesn't confirm
follow_up_reason VARCHAR(255)           -- context for follow-up (e.g. "Tertarik custom cake tapi belum DP")
last_interaction TIMESTAMP DEFAULT NOW()
created_at      TIMESTAMP DEFAULT NOW()
```

### chat_histories
```sql
id           SERIAL PRIMARY KEY
phone_number VARCHAR(50)   -- FK to customers
role         VARCHAR(10)   -- 'user' | 'model'
content      TEXT
timestamp    TIMESTAMP DEFAULT NOW()
```

### products
```sql
id           SERIAL PRIMARY KEY
product_name VARCHAR(255) UNIQUE
price        NUMERIC
description  TEXT
image_url    TEXT
shopee_link  TEXT
created_at   TIMESTAMP DEFAULT NOW()
```

### settings (key-value store)
```sql
key        VARCHAR(100) PRIMARY KEY
value      TEXT
updated_at TIMESTAMP DEFAULT NOW()
```

known keys in settings table:
- gemini_api_key
- gemini_model
- meta_access_token
- meta_ad_account_id
- whatsapp_group_jid          -- target group JID for daily ads report broadcast
- rate_limit_max              -- max messages per window per sender (default 5)
- rate_limit_window           -- window in ms (default 60000)
- followup_hours              -- hours of inactivity before proactive follow-up fires (default 24)
- system_instruction          -- full system prompt for the AI agent
- followup_instruction        -- custom instruction for follow-up message generation (see FOLLOW-UP section)

---

## SETTINGS SYSTEM

settings are loaded from PostgreSQL on boot via `loadAllSettings()` into an in-memory Map (`settingsCache`).

`getSetting(key)`:
- checks cache first
- if not in cache, queries DB and caches result
- if not in DB, returns null (caller falls back to process.env)

`setSetting(key, value)`:
- upserts to DB
- immediately updates the in-memory cache
- NO RESTART NEEDED after saving from dashboard

`POST /api/settings` handler calls `db.setSetting()` for each submitted key, so dashboard changes are live immediately.

sensitive keys (gemini_api_key, meta_access_token) are masked when returned from `GET /api/settings` — the value is replaced with a partial mask like `AIza...xyz`.

---

## WHATSAPP GATEWAY (gateway.js + Baileys)

library: @whiskeysockets/baileys
session: stored in `backend/whatsapp-session/` (multi-file auth). Do not delete this folder while server is running.

startup flow:
1. `connectToWhatsApp()` is called
2. Baileys attempts to load session from `whatsapp-session/`
3. If no session exists → generates QR code in terminal → admin scans with phone
4. On `connection.update` with `isOnline: true` → `isReady = true` → follow-ups and broadcasts can now fire

message handling flow (`messages.upsert`):
1. Skip: group messages, broadcast, status, self-sent, non-text
2. Extract `jid` and `text`
3. Rate limit check (in-memory Map, per JID)
4. `createOrUpdateCustomer(jid, pushName)` — upsert customer record
5. Check `customer.ai_enabled` → if false, skip AI, just log message
6. Check `customer.needs_admin` → if true, send admin alert, skip AI
7. Call `agent.js` → Gemini generates reply
8. Send typing indicator (`composing`) → delay → send reply
9. Save both user message and AI reply to `chat_histories`

---

## AI AGENT (agent.js)

uses: @google/generative-ai SDK
model: configurable via `gemini_model` setting (default: gemini-2.5-flash)

context window:
- fetches last 10 messages from `chat_histories` for the customer JID
- formats as Gemini `history` array (`{role, parts}`)

function tools available to the AI:
- `search_products(query)` — searches products table by name/description (ILIKE)
- `flag_needs_admin(reason)` — sets `needs_admin = TRUE` on customer, sends admin notification via WA to owner number
- `flag_needs_follow_up(reason)` — sets `needs_follow_up = TRUE` and `follow_up_reason` on customer

when `flag_needs_admin` is called by the AI:
- customer.needs_admin is set to TRUE
- AI is automatically muted for that customer (ai_enabled stays true but logic skips)
- admin receives a WA message on OWNER_PHONE with customer name + reason
- admin must manually disable `needs_admin` from the CRM dashboard to re-enable AI

---

## PROACTIVE FOLLOW-UP SYSTEM

cron: `0 14 * * *` (14:00 WIB daily)
manual trigger: `POST /run-followup` (for testing)

flow:
1. `getCustomersForFollowUp(followup_hours)` queries: `needs_follow_up = TRUE AND last_interaction <= NOW() - INTERVAL 'X hours' AND status != 'opt_out'`
2. For each matching customer:
   a. Fetch last 10 messages from `chat_histories`
   b. Build prompt (see below)
   c. Call Gemini to generate one clean follow-up message
   d. Send via `sock.sendMessage(jid, { text: message })`
   e. Save message to `chat_histories`
   f. Set `needs_follow_up = FALSE`, `follow_up_reason = NULL` on customer

### prompt building logic (3 modes)

mode 1 — no custom instruction (followup_instruction is empty/null):
  → uses built-in default template with history, reason, name

mode 2 — natural language instruction (followup_instruction set, but does NOT contain `{history}`):
  → instruction is treated as admin's style guide
  → auto-wrapped in full prompt template with history, reason, name injected automatically

mode 3 — full template (followup_instruction contains `{history}`):
  → used as-is with placeholder replacement
  → strict output enforcement block appended at end regardless

in all 3 modes, a "INSTRUKSI OUTPUT (WAJIB DIIKUTI)" block is always appended:
  - output must be ONE single ready-to-send WhatsApp message
  - no markdown, no options, no tips
  - max 2-3 sentences
  - starts with greeting using customer name

### important behavior
- if customer has no chat history → skipped (nothing to base follow-up on)
- after successful send → `needs_follow_up` reset to FALSE (won't fire again until AI sets it again)
- `followup_hours` setting is read live from DB cache — no restart needed after changing in dashboard

---

## META ADS ANALYSIS (automation.js)

cron: `0 9 * * *` (09:00 WIB daily)
manual trigger: `POST /run-analysis` (runs in background) or `POST /trigger-analysis` (also background)
report viewer: `GET /report-html` (serves report.html), viewable in dashboard under Ads Report tab

flow:
1. read META_ACCESS_TOKEN and META_AD_ACCOUNT_ID from DB settings (fallback to process.env)
2. inject as env vars into child process: `exec('node automation.js', { env: { ...process.env, META_ACCESS_TOKEN: x, ... } })`
3. automation.js fetches data from Meta Graph API for today / last_7d / last_30d
4. if API fails or creds missing → falls back to local CSV in ads-analysis/
5. Gemini generates Indonesian qualitative summary + optimization insights
6. fills template.html tokens → writes report.html
7. broadcasts formatted summary + report link to whatsapp_group_jid

---

## API ROUTES REFERENCE

### settings
- GET  /api/settings                    → returns all settings (sensitive fields masked)
- POST /api/settings                    → saves one or more settings keys (updates cache immediately)
- GET  /api/settings/default-system-prompt → returns the hardcoded default system prompt string

### customers (CRM)
- GET  /api/customers                   → list all customers
- GET  /api/customers/:jid              → single customer detail
- GET  /api/customers/:jid/history      → chat history for customer
- POST /api/customers/:jid/toggle-ai    → toggle ai_enabled for customer
- POST /api/customers/:jid/toggle-admin → toggle needs_admin for customer
- POST /api/customers/:jid/update       → update name, status, notes, contact_phone

### products
- GET    /api/products                  → list all products
- POST   /api/products                  → create product
- PUT    /api/products/:id              → update product
- DELETE /api/products/:id              → delete product

### whatsapp
- GET  /api/whatsapp/status             → WA connection status + QR if needed
- GET  /api/whatsapp/groups             → list all joined WA groups (jid + subject)

### stats
- GET  /api/stats                       → dashboard metrics (customer counts by status, message count)

### ads
- POST /run-analysis                    → trigger automation.js in background (no wait)
- POST /trigger-analysis                → same, but also sends WA broadcast after
- GET  /report-html                     → serves ads-analysis/report.html
- GET  /api/ads/history                 → not implemented yet

### follow-up (internal/testing)
- POST /run-followup                    → manually triggers runProactiveFollowUps() for testing

### dashboard
- GET  /dashboard                       → serves React SPA (frontend/dist/index.html)
- GET  /assets/*                        → serves static frontend assets

---

## KNOWN GOTCHAS / PITFALLS

1. WA session files in whatsapp-session/ must persist across restarts. If deleted, re-scan QR required.

2. settingsCache is in-memory. Changes via `db.setSetting()` (dashboard) update cache immediately. But changes made by direct SQL (psql / scripts) will NOT update cache — either restart backend or wait until the key is evicted (never, currently).

3. followup_hours is read from cache at execution time, not at boot. So changing it in dashboard takes effect on the next cron run or /run-followup call with no restart.

4. Baileys JID format: personal numbers use `628xxx@s.whatsapp.net` or `xxx@lid` (newer format). The system handles both. Group JIDs end in `@g.us`.

5. Meta Ads automation.js runs as a child process. Environment variables must be explicitly passed via exec() env option — child inherits nothing from parent by default.

6. frontend/dist/ must be rebuilt (npm run build) after any frontend code change for production. In dev mode, use Vite dev server on 5173 with proxy.

7. The AI's `flag_needs_admin` tool mutes the AI for that customer. Admin must uncheck "Needs Admin" in CRM to re-enable. This is intentional (safety for real orders).

8. Rate limit state is in-memory only — clears on restart. Not persisted to DB.

---

## ADDING NEW FEATURES — PATTERNS TO FOLLOW

### adding a new settings key
1. add the key to the POST /api/settings handler in gateway.js (one line: `if (settings.newKey !== undefined) await db.setSetting('newKey', settings.newKey)`)
2. add to the GET /api/settings response builder
3. add field to SettingsState interface and form in Settings.tsx
4. read it in code via `await db.getSetting('newKey') || process.env.NEW_KEY`

### adding a new API route
1. add `fastify.get/post('/api/route', handler)` in gateway.js
2. handler must return plain object (Fastify auto-serializes to JSON)
3. for routes that need WA socket, check `if (!isReady || !sock) return reply.status(503).send({ error: 'WA not ready' })`

### adding a new AI tool
1. define tool schema in the `tools` array in agent.js
2. add case in the tool call handler switch/if block
3. call the appropriate db function
4. return a string result to be fed back to Gemini as the tool response

### adding a new frontend tab/panel
1. create new component in frontend/src/components/
2. add route case in App.tsx tab controller
3. add nav item in Sidebar.tsx

---
