# DEVELOPER.md — Latezza Cake WhatsApp AI Agent

project: WhatsApp AI Agent + Admin Dashboard
client: Latezza Cake
stack: Fastify (Node.js) + React (Vite + Tailwind CSS v4 + shadcn/ui) + PostgreSQL + Baileys + Gemini API
last_updated: 2026-06-29

---

## DIRECTORY STRUCTURE

```
latezza-automation/
├── DEVELOPER.md                  # this file
├── CHANGELOG.md                  # feature/fix history
├── backend/
│   ├── .env                      # backend env file — DB credentials, API keys, etc.
│   ├── gateway.js                # MAIN BOOTSTRAP — Fastify server, registers routes/services & schedules crons
│   ├── src/
│   │   ├── db.js                 # Data Access Layer — PostgreSQL pool, schema init, settings cache
│   │   ├── agent.js              # AI Agent — model init, system instructions builder, function tools
│   │   ├── routes.js             # Presentation Layer — Fastify API endpoints
│   │   └── services/
│   │       ├── whatsapp.js       # WhatsApp Socket service (Baileys auth, events, rate limiting)
│   │       ├── followup.js       # Proactive customer follow-up scanning and LLM logic
│   │       ├── ads.js            # Meta Ads script execution, group broadcast, and spawning progress stream
│   │       ├── creative.js       # AI creative ad content analysis (copywriting audit & ideation)
│   │       ├── summary.js        # AI message summary service (hierarchical batching & synthesis)
│   │       ├── scheduler.js      # Dynamic background scheduler (node-cron wrapper with database-driven reload)
│   │       └── broadcast.js      # WhatsApp Broadcast queue worker, spintax and personalization engine
│   ├── scripts/                  # Developer tools and test utilities (e.g., debug-followup.js, seed-test-followup.js)
│   ├── ads-analysis/
│   │   ├── automation.js         # Meta Ads fetcher + Gemini NLP summarizer + report.html generator
│   │   ├── template.html         # HTML template for report generation (has {{PLACEHOLDER}} tokens)
│   │   └── report.html           # generated output — served at GET /report-html
│   ├── whatsapp-sessions/        # Baileys auth session subdirectories (gitignored — do not delete while running)
│   └── package.json
├── frontend/
│   ├── .env                      # frontend env file (contains VITE_API_URL)
│   ├── src/
│   │   ├── App.tsx               # root component — tab routing, toast state, actions
│   │   ├── index.css             # oklch-based dark theme CSS variables
│   │   ├── components/
│   │   │   ├── Sidebar.tsx       # navigation sidebar
│   │   │   ├── Overview.tsx      # stats dashboard (total customers, leads, revenue indicators)
│   │   │   ├── ChatInbox.tsx     # real-time chat panel — customer list + WhatsApp-style chat UI
│   │   │   ├── Products.tsx      # product catalog CRUD (create/edit/delete via API)
│   │   │   ├── Settings.tsx      # all configurable settings — API keys, prompts, follow-up, Meta Ads
│   │   │   ├── AdsReport.tsx     # ads report viewer — iframe of report.html + manual trigger buttons
│   │   │   ├── WhatsappSessions.tsx # WhatsApp Session management & QR scanner UI
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
npm start   # starts on port 3001

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
npm start            # serves API on port 3001 (frontend must be built/served separately e.g. on Vercel)
# open http://localhost:3001/dashboard (redirects to FRONTEND_URL)
```

### running with Docker (backend & database)

To run the backend gateway and database in Docker containers:

1. Build and start the services:
   ```bash
   docker compose up -d --build
   ```
2. Verify service logs:
   ```bash
   docker compose logs -f whatsapp-gateway
   ```
3. Stop the containers:
   ```bash
   docker compose down
   ```


### RUNNING UNIT TESTS

Unit tests are implemented for both backend and frontend. They are fully mocked and run in isolation (no real PostgreSQL database or Gemini API keys needed).

#### Backend Tests (Jest)
```bash
cd backend
npm test          # Runs all Jest test suites once
npm run test:watch # Runs Jest in interactive watch mode
```

#### Frontend Tests (Vitest)
```bash
cd frontend
npm run test      # Runs all Vitest test suites once
npm run test:watch # Runs Vitest in interactive watch mode
```

### env files

#### Backend Env (`backend/.env`)
```
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=yourpassword
DB_NAME=latezzacake
GEMINI_API_KEY=AIza...          # fallback if not set in DB settings
GEMINI_MODEL=gemini-3.1-flash-lite  # Gemini model to use for all features (default fallback: gemini-3.1-flash-lite)
META_ACCESS_TOKEN=...           # fallback if not set in DB settings
META_AD_ACCOUNT_ID=act_...      # fallback if not set in DB settings
PUBLIC_REPORT_URL=https://yourdomain.com
WHATSAPP_GROUP_JID=120363...@g.us
PORT=3001
DEBOUNCE_DELAY_MS=3000          # message buffering delay in ms (default 3000)
```

#### Frontend Env (`frontend/.env`)
```
VITE_API_URL=http://localhost:3001
```

---

## DATABASE SCHEMA

All tables are created automatically on server start in `src/db.js` using `CREATE TABLE IF NOT EXISTS`. Migrations (add column if not exists) also run on every startup.

### businesses
```sql
id                SERIAL PRIMARY KEY
name              VARCHAR(100) NOT NULL
slug              VARCHAR(100) UNIQUE NOT NULL  -- e.g., 'latezza-cake'
short_description TEXT
contact_phone     VARCHAR(50)
address           TEXT
website           VARCHAR(255)
social_media      JSONB DEFAULT '[]'::jsonb
ai_settings       JSONB DEFAULT '{"temperature": 0.3, "max_output_tokens": 800, "tone": "friendly and polite", "custom_prompt": ""}'::jsonb
created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

### whatsapp_sessions
```sql
id           VARCHAR(50) PRIMARY KEY
name         VARCHAR(100) NOT NULL
business_id  INT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE
phone_number VARCHAR(50)
status       VARCHAR(20) DEFAULT 'disconnected' -- values: disconnected | connecting | connected | qr_received
qr_code      TEXT
created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

### customers
```sql
phone_number    VARCHAR(50)
session_id      VARCHAR(50) DEFAULT 'default' REFERENCES whatsapp_sessions(id) ON DELETE CASCADE
business_id     INT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE
name            VARCHAR(100)
status          VARCHAR(20) DEFAULT 'lead'   -- values: lead | customer | dormant | opt_out
notes           TEXT
needs_follow_up BOOLEAN DEFAULT FALSE        -- set TRUE by AI when customer shows interest but doesn't confirm
follow_up_reason VARCHAR(255)                -- context for follow-up (e.g. "Tertarik custom cake tapi belum DP")
last_interaction TIMESTAMP DEFAULT CURRENT_TIMESTAMP
created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
contact_phone   VARCHAR(20)
ai_enabled      BOOLEAN DEFAULT TRUE         -- if FALSE, AI is muted for this customer; admin responds manually
needs_admin     BOOLEAN DEFAULT FALSE        -- set TRUE when AI detects situation needs human (e.g. custom order)
PRIMARY KEY (phone_number, session_id)
```

### chat_histories
```sql
id           SERIAL PRIMARY KEY
phone_number VARCHAR(50)
session_id   VARCHAR(50) DEFAULT 'default'
business_id  INT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE
role         VARCHAR(20) NOT NULL         -- 'user' | 'model'
content      TEXT NOT NULL
timestamp    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
FOREIGN KEY (phone_number, session_id) REFERENCES customers(phone_number, session_id) ON DELETE CASCADE
```

### products
```sql
id           SERIAL PRIMARY KEY
business_id  INT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE
product_name VARCHAR(255) NOT NULL
price        NUMERIC DEFAULT 0
description  TEXT DEFAULT ''
image_url    TEXT DEFAULT ''
shopee_link  TEXT DEFAULT ''
embedding    JSONB                        -- Stores the 768-dimensional embedding vector from gemini-embedding-2
created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
UNIQUE (product_name, business_id)
```

### settings (key-value store)
```sql
key        VARCHAR(100) PRIMARY KEY
value      TEXT
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

known keys in settings table:
- gemini_api_key
- gemini_model                  -- (Deprecated) Retired in favor of process.env.GEMINI_MODEL configuration
- meta_access_token
- meta_ad_account_id
- whatsapp_group_jid          -- target group JID for daily ads report broadcast
- rate_limit_max              -- max messages per window per sender (default 5)
- rate_limit_window           -- window in ms (default 60000)
- followup_hours              -- hours of inactivity before proactive follow-up fires (default 24)
- system_instruction          -- (Deprecated/Override) Global override system prompt for the AI agent; normally resolved dynamically per business.
- followup_instruction        -- custom instruction for follow-up message generation (see FOLLOW-UP section)
- ads_analysis_frequency      -- frequency of ads report execution in days (default: 1)
- ads_analysis_time           -- hour and minute to trigger ads report (default: '09:00')
- creative_analysis_frequency -- frequency of creative analysis in days (default: 7)
- creative_analysis_time      -- hour and minute to trigger creative analysis (default: '09:00')
- creative_analysis_report    -- JSON string of the latest generated AI creative ad content ideas report

### api_usage_logs
```sql
id                  SERIAL PRIMARY KEY
timestamp           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
feature             VARCHAR(50) NOT NULL         -- e.g., 'whatsapp_chat', 'followup', 'creative_analysis', 'ads_analysis', 'message_summary', 'audio_transcription'
model_name          VARCHAR(100) NOT NULL        -- e.g., 'gemini-3.1-flash-lite'
input_tokens        INT DEFAULT 0
output_tokens       INT DEFAULT 0
cached_input_tokens INT DEFAULT 0
cost_usd            NUMERIC(12, 6) DEFAULT 0     -- Calculated using standard ($0.25/1M), cached ($0.025/1M), and output ($1.50/1M) pricing
cost_idr            NUMERIC(14, 2) DEFAULT 0     -- Converted using fixed exchange rate (Rp 17.500)
```

### broadcast_campaigns
```sql
id               SERIAL PRIMARY KEY
name             VARCHAR(100) NOT NULL
session_id       VARCHAR(50) DEFAULT 'default' REFERENCES whatsapp_sessions(id) ON DELETE SET NULL
business_id      INT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE
message_template TEXT NOT NULL
media_type       VARCHAR(20) DEFAULT 'text'   -- 'text' | 'image' | 'video'
media_url        TEXT
status           VARCHAR(20) DEFAULT 'draft'  -- 'draft' | 'queued' | 'processing' | 'completed' | 'paused' | 'failed'
total_targets    INT DEFAULT 0
sent_count       INT DEFAULT 0
failed_count     INT DEFAULT 0
scheduled_at     TIMESTAMP
created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

### broadcast_queue
```sql
id                   SERIAL PRIMARY KEY
campaign_id          INT REFERENCES broadcast_campaigns(id) ON DELETE CASCADE
phone_number         VARCHAR(50) NOT NULL
session_id           VARCHAR(50) NOT NULL
personalized_message TEXT NOT NULL
status               VARCHAR(20) DEFAULT 'pending' -- 'pending' | 'sending' | 'sent' | 'failed'
error_message        TEXT
sent_at              TIMESTAMP
created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
FOREIGN KEY (phone_number, session_id) REFERENCES customers(phone_number, session_id) ON DELETE CASCADE
```

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

## WHATSAPP GATEWAY (whatsapp.js + Baileys - Multi-Session Support)

library: `@whiskeysockets/baileys`
implemented in: `backend/src/services/whatsapp.js`
session paths: stored in `backend/whatsapp-sessions/<session_id>/` (multi-file auth). Do not delete these folders while sessions are running.

startup flow:
1. `initWhatsApp()` is called in `whatsapp.js` during server startup
2. Fastify server queries all registered sessions from `whatsapp_sessions` table and initializes connection socket for each of them.
3. Baileys attempts to load each session from `backend/whatsapp-sessions/<session_id>/`.
4. If a session is new/disconnected → generates QR code → saves QR code string to `whatsapp_sessions` DB table. Frontend polls/displays this QR.
5. On `connection.update` with `connection: 'open'` → status is updated to `connected` in DB → messages and webhooks can be processed for that session.

message handling flow (`messages.upsert`):
1. Skip: group messages, broadcast, status, self-sent, and messages that do not contain text, image, or audio
2. Extract `jid` and `text`
3. Rate limit check (in-memory Map, per JID)
4. Fetch/create customer record early.
5. If `customer.ai_enabled !== false`, immediately send typing status (`composing`) and mark message as read (`readMessages`) to return double blue ticks.
6. If audio/voice message (`audioMessage`):
   - Download the audio media payload using Baileys `downloadMediaMessage`
   - Save the binary buffer to `public/uploads/` as `voice_{timestamp}_{random}.ogg`
   - Transcribe the audio using the `transcribeAudio` service helper, which uploads the audio to Gemini API using inlineData and prompts for a literal transcription in Indonesian (falling back to `gemini-3.5-flash` if the user-configured model fails)
   - Assign the returned transcription to `text`
7. If `customer.ai_enabled === false` or `customer.needs_admin === true` -> skip AI response, but save message in history.
8. Call `agent.js` → Gemini generates reply.
9. Send typing status (`composing`) → delay → send reply.
10. Save both user message and AI reply to `chat_histories` (user message is formatted as `[Voice Note: <url>] <transcription>` if it was a voice message)

outgoing message handling flow (manual send from dashboard):
- Dashboard admin can type text or record audio using the browser's MediaRecorder API.
- If audio is recorded, it is converted to a base64 string and POSTed to `/api/customers/:phone/send-message`.
- The backend decodes it, saves the file as `voice_out_{timestamp}_{random}.ogg` in `public/uploads/`, and transcribing it using `transcribeAudio`.
- The backend sends the voice note via Baileys by setting `audio: fileBuffer`, `mimetype: 'audio/mp4'`, and `ptt: true` to display as a native WhatsApp recording.
- The outgoing voice note is recorded in the database `chat_histories` as `[Voice Note: <url>] <transcription>` with the role `model` so it displays as an audio player in the dashboard.


---

## AI AGENT (src/agent.js)

uses: `@google/generative-ai` SDK
model: configurable via `GEMINI_MODEL` environment variable (default: `gemini-3.1-flash-lite`)

context window:
- fetches last N messages from `chat_histories` for the customer JID
- formats as Gemini `history` array (`{role, parts}`)

formatting constraint:
- AI replies are strictly plaintext (no markdown bold `**`, italics `*`, headers `#`, or blockquotes) to mimic clean, natural human conversations.
- Lists are only used for displaying multi-product query matches.

function tools available to the AI:
- `search_products(query)` — searches products table by semantic similarity using `gemini-embedding-2` in-memory cosine similarity matching, falling back to SQL `ILIKE` keyword matching if the Gemini API key is missing or calls fail.
- `update_customer_profile(customer_name, contact_phone, notes)` — updates name/phone/notes in DB
- `request_follow_up(reason)` — flags lead for proactive follow-up
- `request_human_handoff(reason)` — sets `needs_admin = TRUE` and disables AI responding for that customer

---

## PROACTIVE FOLLOW-UP SYSTEM

implemented in: `backend/src/services/followup.js`
cron: `0 * * * *` (hourly check)
manual trigger: `POST /api/trigger-followups` or `POST /run-followup`

flow:
1. `getCustomersForFollowUp(followup_hours, ignoreThreshold)` queries database
2. For each matching customer:
   a. Fetch last 10 messages from `chat_histories`
   b. Build prompt (see below)
   c. Call Gemini to generate one clean follow-up message
   d. Send via `whatsappService.sendMessage(jid, { text: message })`
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
- after successful send → `needs_follow_up` reset to FALSE
- manual trigger ignores the time elapsed since last interaction (`ignoreThreshold = true`), allowing instant testing of marked leads.

---

## BACKGROUND SCHEDULER SYSTEM (scheduler.js)

All background cron jobs (excluding Personal Followups which remains hourly) are managed by `backend/src/services/scheduler.js`, which wraps `node-cron`.

Schedules are loaded dynamically from PostgreSQL settings:
- **Meta Ads Report**: triggered every `ads_analysis_frequency` days at `ads_analysis_time`.
- **AI Creative Ideas**: triggered every `creative_analysis_frequency` days at `creative_analysis_time`.
- **Followups check**: hourly (`0 * * * *`)

### Dynamic Reloading:
Whenever settings are saved via `POST /api/settings`, `scheduler.reloadSchedules()` is triggered. It stops all running cron jobs and reschedules them using the newly saved values immediately, with no server restart needed.

---

## META ADS ANALYSIS (src/services/ads.js)

cron: dynamic scheduler (default: every 1 day at 09:00 WIB)
manual trigger: `POST /run-analysis`, `POST /trigger-analysis`, or `GET /api/run-analysis-stream` (SSE progress stream; accepts optional `date_from` and `date_to` payload/query parameters)
report viewer: `GET /report-html` (serves report.html), viewable in dashboard under Ads Report tab

flow (standard and SSE stream):
1. read META_ACCESS_TOKEN and META_AD_ACCOUNT_ID from DB settings (fallback to process.env)
2. inject as env vars into child process.
   - For standard: spawns process via `exec('node automation.js')` and returns total buffer on completion.
   - For SSE stream: spawns process via `spawn('node automation.js')` and streams stdout chunks, parsing `::STATUS::` triggers for steps checklist and pipe raw stdout to the terminal log stream on the frontend in real-time.
3. automation.js fetches data from Meta Graph API for the custom time range (falls back to last 7 days if date boundaries are not provided)
4. data is filtered and projected based on user-selected date ranges (API time_range is query-filtered; CSV files containing reporting start/end columns are proportionally projected for the overlapping days, and out-of-range rows are excluded)
5. Gemini generates Indonesian qualitative summary + optimization insights based on this single custom timeframe
6. fills template.html tokens → writes report.html (which renders a unified single timeframe dashboard layout without tabs)
7. broadcasts formatted custom range summary + report link to whatsapp_group_jid (if triggered in background)

---

## AI CREATIVE AD CONTENT IDEAS (src/services/creative.js)

cron: dynamic scheduler (default: every 7 days at 09:00 WIB)
manual trigger: `POST /api/trigger-creative-analysis` (background execution) or `GET /api/trigger-creative-analysis-stream` (Server-Sent Events progress stream; accepts optional `prompt` body/query parameter)
report viewer: viewable in dashboard under Creative Ideas tab (calls `GET /api/creative-report`)

flow:
1. determine the current `ads_data_source` setting ('api' or 'csv')
2. check if `backend/ads-analysis/report.json` exists in the filesystem:
   - if it exists, read the parsed ads metrics and IDs directly from `report.json`, skipping Meta Ads API insights fetch to prevent double API queries
   - if it is missing, fall back to parsing the uploaded CSV (if data source is `csv`) or querying the Meta Ads API for active ads and insights (if data source is `api`)
3. fetch copywriting metadata:
   - if the data source is `api`, call the Meta Ads API (`/ads` endpoint) only to fetch copywriting details, mapping it back to the ads by name/ID
   - if the data source is `csv`, generate fallback placeholders containing the ad name and details since CSVs do not contain copywriting text
4. categorize ads into "Winners" (high conversions, low CPR) and "Losers" (high spend, low/zero conversions)
5. invoke Gemini API (e.g. `gemini-3.1-flash-lite`, `gemini-2.5-flash`) using `generateContentStream` to perform a creative audit and generate 3-5 brand-new Indonesian ad copy concepts + visual briefs (incorporating optional user custom prompt instructions if provided)
6. save structured JSON report in settings cache/database table under `creative_analysis_report`
7. broadcast report summary to `whatsapp_group_jid`

---

## AI MESSAGE SUMMARY (src/services/summary.js)

manual trigger: `GET /api/trigger-message-summary-stream` (Server-Sent Events progress stream; accepts `session_id` and `date_range` query parameters)
report viewer: viewable in dashboard under Overview tab (calls `GET /api/message-summary`)

flow:
1. read `gemini_api_key` from DB settings and active `gemini_model` from env `GEMINI_MODEL` (fallback: `gemini-3.1-flash-lite`)
2. query database for incoming messages (role = 'user') from `chat_histories` filtered by:
   - `session_id` (specific or 'all' sessions)
   - `date_range` ('today' (CURRENT_DATE), '3d', '7d', '30d')
3. calculate total active customers (unique phone numbers) in this period
4. use a Two-Pass Hierarchical Summarization strategy for efficiency and token limits:
   - **Single-Pass (< 100 messages)**: Formats all messages chronologically and calls Gemini once with `responseMimeType: 'application/json'` to generate structured JSON report.
   - **Two-Pass (>= 100 messages)**: Split messages into batches of 50. First pass summarizes each batch individually into bullet points (low token cost). Second pass synthesizes the batch summaries into the final structured JSON report.
5. save structured JSON report in settings cache/database table under `message_summary_report`
6. return structured JSON containing: Products, Questions, Complaints, Opportunities, and Insights

---

## RAG SEMANTIC PRODUCT SEARCH

implemented in: `backend/src/db.js` (search similarity & backfill), `backend/src/routes.js` (background hook)
model used: `gemini-embedding-2` (using `embedContent` API)
threshold: `0.35` (minimum similarity to be considered a match, maximum top 5 results returned)

### How it works:
1. **Startup Backfill**: During database initialization (`initDb()`), the `backfillProductEmbeddings()` helper is called. It retrieves all products where `embedding IS NULL` and uses the Gemini API to generate embeddings (`gemini-embedding-2`) based on the product name and description, saving the generated vector back to PostgreSQL.
2. **Dynamic Creation/Updates**: When a product is created (`POST /api/products`) or edited (`PUT /api/products/:id`), the backend triggers a background promise `.then().catch()` block to generate or refresh the product's description vector without blocking the HTTP response.
3. **Similarity Querying**:
   - The user query is embedded via `gemini-embedding-2` using `embedContent`.
   - The system retrieves all product embeddings from PostgreSQL and calculates the cosine similarity in JavaScript memory:
     $$ \text{similarity} = \frac{\vec{A} \cdot \vec{B}}{\|\vec{A}\| \|\vec{B}\|} $$
   - Results are sorted descending and filtered by a similarity threshold of `0.35` (maximum top 5 matches returned).
4. **Fallback Mechanism**: If the Gemini API key is missing, or the call fails (due to quota, network, etc.), the system automatically falls back to keyword matching using `ILIKE %query%` on product names and descriptions, ensuring zero interruption for the chat agent.

---

## WHATSAPP ENTERPRISE BROADCAST SYSTEM

implemented in: `backend/src/services/broadcast.js`, `backend/src/routes.js`
daemon worker: sequential processing loop initialized at server startup in `gateway.js`

### Key Architectural Pillars:
1. **Polymorphic Spintax Parser**: Fully parses Spintax formatting (e.g. `{Halo|Hai}`) while preserving placeholder double curly braces (`{{name}}`) using a specialized non-greedy regex `/{([^{}]+?\|[^{}]+?)}/g`.
2. **Dynamic Personalization**: Replaces customer variables (`{{name}}`, `{{phone}}`, `{{status}}`, `{{notes}}`) per queue item prior to sending.
3. **Enterprise-Grade Anti-Ban Mechanisms**:
   - **Pre-flight verification**: Checks WhatsApp registration via `sock.onWhatsApp` before sending.
   - **Presence simulation**: Simulates typing status (`composing`) for a dynamic duration based on character length.
   - **Cooldown jitter**: Implements a randomized cooldown delay (e.g. 20-35s) between message transmissions to replicate human speed.
   - **Graceful Opt-Out**: Automatic listening for customer responses of "9" or "STOP" to flag their profile as `opt_out` and clear active queues, avoiding spam reports.
4. **AI Gemini Integration**: Leverages Gemini (`gemini-3.1-flash-lite`) to generate 3 copywriting variations with tone modifiers (casual, formal, FOMO) and embedded opt-out guidelines.

---

## API ROUTES REFERENCE

> [!NOTE]
> Untuk detail lengkap setiap endpoint, parameter request, skema body, dan contoh respons JSON sukses/error, silakan merujuk ke berkas dokumentasi lengkap: [API.md](file:///C:/Users/Fardhan%20Rasya/.gemini/antigravity/worktrees/latezza-automation/generate-backend-api-docs/API.md).

implemented in: `backend/src/routes.js`

### general
- GET  `/health`                         → returns WA status and server timestamp
- GET  `/dashboard`                      → redirects to FRONTEND_URL
- GET  `/`                               → redirects to FRONTEND_URL
- GET  `/report-html`                    → serves ads-analysis/report.html

### settings
- GET  `/api/settings`                   → returns all settings (sensitive fields masked)
- POST `/api/settings`                   → saves settings keys (updates cache immediately)
- GET  `/api/settings/default-system-prompt` → returns the default system prompt string

### customers (CRM)
- GET  `/api/customers`                  → list all customers
- GET  `/api/customers/:phone`           → single customer detail
- GET  `/api/customers/:phone/history`   → chat history for customer
- POST `/api/customers/:phone/toggle-ai` → toggle ai_enabled for customer
- POST `/api/customers/:phone/update-details` → update customer status and notes
- POST `/api/customers/:phone/send-message` → send manual message and mute AI

### products
- GET    `/api/products`                 → list all products
- POST   `/api/products`                 → create product
- PUT    `/api/products/:id`             → update product
- DELETE `/api/products/:id`             → delete product

### whatsapp
- GET  `/api/whatsapp/groups`            → list all joined WA groups (jid + subject)
- POST `/send-message`                   → raw message sending endpoint

### stats
- GET  `/api/stats`                      → dashboard metrics (counts, recent leads, connection status)

### ads & creative ideas
- POST `/run-analysis`                          → triggers raw ads automation.js script and returns output
- POST `/trigger-analysis`                      → triggers ads analysis and broadcasts report in background
- GET  `/api/run-analysis-stream`               → manually triggers ads analysis via Server-Sent Events (SSE) progress stream
- GET  `/api/creative-report`                   → returns the latest AI creative ad content ideas report
- POST `/api/trigger-creative-analysis`         → manually triggers creative analysis in the background
- GET  `/api/trigger-creative-analysis-stream`  → manually triggers creative analysis via Server-Sent Events (SSE) progress stream

### follow-up (internal/testing)
- POST `/api/trigger-followups`          → manually trigger follow-ups (bypasses hour threshold check)
- POST `/run-followup`                   → same as above, runs in background

### broadcasts
- GET  `/api/broadcasts/campaigns`       → list all broadcast campaigns
- GET  `/api/broadcasts/campaigns/:id`   → single campaign detail including queue items
- POST `/api/broadcasts/campaigns`       → create campaign and generate personalized queue items
- POST `/api/broadcasts/campaigns/:id/control` → control campaign (start, pause, cancel)
- POST `/api/broadcasts/upload`          → upload broadcast media (image or video)
- POST `/api/broadcasts/generate-content` → generate AI copywriting variations using Gemini

---

## KNOWN GOTCHAS / PITFALLS

1. WA session credentials in backend/whatsapp-sessions/<session_id>/ must persist across restarts. If deleted, re-scanning QR is required.

2. settingsCache is in-memory. Changes via `db.setSetting()` (dashboard) update cache immediately. But changes made by direct SQL (psql / scripts) will NOT update cache — either restart backend or wait until the key is evicted.

3. followup_hours is read from cache at execution time, not at boot. So changing it in dashboard takes effect on the next cron run or /run-followup call with no restart.

4. Baileys JID format: personal numbers use `628xxx@s.whatsapp.net` or `xxx@lid`. Group JIDs end in `@g.us`.

5. Meta Ads automation.js runs as a child process. Environment variables must be explicitly passed via exec() env option.

7. The AI's `request_human_handoff` tool mutes the AI for that customer. Admin must update status or toggle AI back on from the CRM dashboard to re-enable.

8. Rate limit state is in-memory only — clears on restart.

9. Audio Transcoding for WhatsApp: Browsers record audio in WebM format (using the MediaRecorder API), which is not natively playable as a voice note/PTT message on mobile WhatsApp clients (iOS/Android). The backend relies on `@ffmpeg-installer/ffmpeg` and FFmpeg to transcode incoming manual webm recordings to Ogg Opus mono audio (`audio/ogg; codecs=opus`) before transmitting them. The static files are saved at `backend/public/uploads` and mapped to `/uploads` prefix. Ensure any backend file upload directories resolve to `backend/public/uploads` using path helper relative to `backend/src/` (e.g. `../public/uploads`).

---

## ADDING NEW FEATURES — PATTERNS TO FOLLOW

### adding a new settings key
1. add the key to the POST `/api/settings` handler in `src/routes.js`
2. add to the GET `/api/settings` response builder in `src/routes.js`
3. add field to SettingsState interface and form in `Settings.tsx`
4. read it in code via `await db.getSetting('newKey')`

### adding a new API route
1. add route handler in `src/routes.js`
2. handler must return plain object (Fastify auto-serializes to JSON)
3. for routes that need WA socket, check `whatsappService.isReady()`

### adding a new AI tool
1. define tool schema in the `agentTools` array in `src/agent.js`
2. add case in the tool call handler switch block in `src/agent.js`
3. call the appropriate `db.js` function
4. return a string result to be fed back to Gemini as the tool response

### adding a new frontend tab/panel
1. create new component in `frontend/src/components/`
2. add route case in `App.tsx` tab controller
3. add nav item in `Sidebar.tsx`

---

## FRONTEND ARCHITECTURE & CODE QUALITY GUIDELINES

To maintain a perfect **A-rating** in SonarQube with **0 critical** and **0 blocker** issues, follow these strict architectural patterns for frontend development:

### 1. JSX Decomposition Pattern (Solving Cognitive Complexity)
SonarQube aggregates the complexity of all inline conditional rendering paths (e.g., `&&`, `? :`, nested map loops) directly into the parent component's function. When a component's JSX layout grows, do NOT write heavy conditional logic inline. Instead, decompose the layouts into highly focused, presentational subcomponents:
- **Parent Component**: Manages core state, API fetching, and hooks. Returns a clean skeleton composed of high-level subcomponents.
- **Subcomponents**: Pure presentational components that receive data and callbacks as props (e.g., `AdsReportHeader`, `CustomerListItem`, `ChatMessageBubble`, `ConversationListPanel`, `ConversationBoxPanel`). Keep their function bodies simple (Cognitive Complexity ~1).

### 2. Custom Hooks for Logic Abstraction
Keep state management and event-loop side-effects out of the rendering code by extracting them into custom hooks:
- **`useResizable(key, initialWidth, min, max, direction)`**: Encapsulates dragging event listeners (`mousemove`, `mouseup` loops) and persistence in `localStorage` for resizable panels.
- **`useAudioRecorder(onSendAudio, showToast)`**: Abstracts the browser's native `MediaRecorder` API, duration timers, state transitions (idle, recording, cancelled), and microphone permissions.
- **`useAdsAnalysis(dateFrom, dateTo, csvStatus, setReportExists, setIframeKey)`**: Encapsulates Server-Sent Events (SSE) log streaming state machine and lifecycle.

### 3. Strict Props Typing
Always specify precise TypeScript interfaces for component props. Avoid using `any` and mark optional parameters clearly. Ensure all callbacks are typed accurately.

### 4. Quality Inspection (SonarQube) & Test Coverage
To execute a local SonarQube scan and verify quality gate compliance:
1. **Generate Test Coverage**:
   - **Backend**: Run `npm test -- --coverage` in the `backend/` directory to generate `backend/coverage/lcov.info`.
   - **Frontend**: Run `npx vitest run --coverage --coverage.reporter=lcov --coverage.reporter=text` in the `frontend/` directory to generate `frontend/coverage/lcov.info`.
2. **Execute Scan**:
   - Run the scanner from the project root directory:
     ```bash
     sonar -Dsonar.host.url=http://localhost:9000 -Dsonar.token=sqp_1412b25d477cc7c2e5ed85c5ed6cbd26fddb7a9f -Dsonar.projectKey=latezza-ai-agent -Dsonar.exclusions=**/scratch/**,**/node_modules/**,**/coverage/**,**/graphify-out/**,**/dist/** -Dsonar.javascript.lcov.reportPaths=backend/coverage/lcov.info,frontend/coverage/lcov.info
     ```
3. **Auto-Approve Security Hotspots**:
   - Programmatically mark audited hotspots (e.g. local DB credentials, safe CDNs) as safe using the helper script:
     ```bash
     node backend/scratch/approve_hotspots.js
     ```
4. **Fetch Metrics & Report**:
   - Generate a markdown/JSON report locally:
     ```bash
     node backend/scratch/fetch_sonar.js
     ```


---
