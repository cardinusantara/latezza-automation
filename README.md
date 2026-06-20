# WhatsApp AI Agent & Ads Report Automation

A unified, high-performance automated WhatsApp AI Customer Relationship Management (CRM) Agent and Meta Ads marketing analysis dashboard built for **Latezza Cake**.

The system dynamically handles customer messages on WhatsApp using Google Gemini AI, performs RAG semantic product catalog search, tracks user status/leads, schedules and sends automated marketing performance insights, and streams creative ad generation logs in real-time.

---

## ✨ Key Features

1. **WhatsApp AI CRM Agent**:
   - Automated replies via Google Gemini using context-aware chat histories.
   - Built-in tool calling for updating customer profiles, requesting manual admin handoff, and tagging customers for follow-ups.
   - Strict human-mimicking plain-text output guardrails.
   - Live WhatsApp-style Chat Inbox in the dashboard to review histories and send manual messages.

2. **Proactive Follow-up System**:
   - Automated hourly scanning for customers marked with `needs_follow_up`.
   - Generates and triggers personalized follow-up messages after a configurable inactivity threshold (e.g. 24 hours).
   - Supports 3 prompt wrapping modes (Default, Natural Language style-guide, or Custom placeholder-based templates).

3. **RAG Semantic Product Search**:
   - Searches the product catalog database using high-dimensional vector embeddings generated via `gemini-embedding-2`.
   - Automatic database backfilling of product embeddings on startup.
   - COSINE similarity matching with a threshold of `0.35`, falling back to standard SQL `ILIKE` keyword matching when needed.

4. **Meta Ads Reporting**:
   - Automated reporting summarizing campaign performance (Spend, CPR, Impressions, Clicks, Conversions).
   - Gemini-powered qualitative analysis translated into Indonesian.
   - Renders beautiful dark-themed reports (`report.html`) and broadcasts them to a WhatsApp group.

5. **AI Creative Ad Content Ideas**:
   - Fetches active Meta Ads assets and performance insights.
   - Categorizes ads into "Winners" (high conversions, low cost) and "Losers" (high spend, low conversions).
   - Triggers Gemini content generation to audit copy and propose 3-5 new copy options and visual brief variations.
   - Server-Sent Events (SSE) progress and log streaming to show live generation status in the dashboard.

6. **Dynamic Background Scheduler**:
   - Flexible schedules configured entirely from the dashboard UI (frequency in days and trigger time).
   - Dynamic reloading of node-cron schedules on settings update, requiring **no server restarts**.

---

## 📂 Project Structure

```
latezza-automation/
├── DEVELOPER.md                  # Detailed developer guidelines
├── CHANGELOG.md                  # Release version history
├── README.md                     # Overview & getting started guide (this file)
├── ROADMAP.md                    # Core project goals checklist
├── docker-compose.yml            # Docker deployment configuration
├── backend/                      # Fastify (Node.js) + Baileys + PostgreSQL server
│   ├── src/
│   │   ├── db.js                 # Data Access Layer & Settings Cache
│   │   ├── agent.js              # Gemini AI agent schema, tools, & system prompts
│   │   ├── routes.js             # API route endpoints
│   │   └── services/
│   │       ├── whatsapp.js       # WhatsApp socket & messaging controller
│   │       ├── followup.js       # Customer follow-up scheduler & templates
│   │       ├── ads.js            # Meta Ads automated summary scripts
│   │       ├── creative.js       # Creative audit, categorization & SSE streaming
│   │       └── scheduler.js      # Dynamic cron job manager
│   ├── .env                      # Backend environment variables
│   └── package.json
└── frontend/                     # React (Vite + TS + Tailwind v4 + shadcn/ui) SPA
    ├── src/
    │   ├── components/
    │   │   ├── Overview.tsx      # Metrics and dashboard summary cards
    │   │   ├── ChatInbox.tsx     # CRM Chat Inbox with manual send capabilities
    │   │   ├── Products.tsx      # Product catalog manager CRUD table
    │   │   ├── Settings.tsx      # Configuration forms (API keys, Schedules, Prompts)
    │   │   ├── AdsReport.tsx     # Embedded campaign metrics report dashboard
    │   │   └── CreativeReport.tsx# AI Creative Ad audit ideas & live streaming logger
    │   └── App.tsx               # Sidebar navigation router & toast controller
    ├── .env                      # Frontend environment variables
    └── package.json
```

---

## 🚀 Setup & Installation

### Prerequisites
- Node.js (v18+)
- PostgreSQL Database
- Meta Graph API Account (Access Token & Ad Account ID)
- Google Gemini API Key

### 1. Database Setup
Create a PostgreSQL database named `latezza_cake` (or any custom name) and ensure PostgreSQL is running. The database schema and embeddings migrations will be auto-applied by the backend upon startup.

### 2. Configure Environment Variables
Create a `.env` file inside the `backend/` directory:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_postgres_password
DB_NAME=latezzacake
PORT=3001

# Fallback credentials (can also be saved directly in the Settings tab)
GEMINI_API_KEY=AIzaSy...
META_ACCESS_TOKEN=EAAB...
META_AD_ACCOUNT_ID=act_...
WHATSAPP_GROUP_JID=120363...@g.us
```

Create a `.env` file inside the `frontend/` directory:
```env
VITE_API_URL=http://localhost:3001
```

### 3. Install & Start Development Servers

Run backend and frontend servers in separate terminal sessions:

```bash
# Terminal 1: Backend API Server
cd backend
npm install
npm start          # Runs on http://localhost:3001

# Terminal 2: Frontend Vite Development Server
cd frontend
npm install
npm run dev        # Runs on http://localhost:5173 (proxied to port 3001)
```

1. **Authentication**: During the first startup, a QR code will print in the backend console. Scan this using the WhatsApp app on your phone (Linked Devices).
2. **Dashboard**: Navigate to `http://localhost:5173` to access the admin portal.

---

## 🛠️ Settings Configuration

The **Settings** panel on the dashboard allows you to configure settings live with immediate cache updates:

* **WhatsApp Connection**: Select active groups to receive automated ad summaries.
* **AI System Prompt**: Control how the Gemini customer service assistant responds to incoming messages.
* **Follow-up Rules**: Customize threshold hours, follow-up behavior, and style-guides.
* **Automation Schedules**: Set execution frequencies (in days) and target times (e.g., `09:00`) for campaign reports and creative analysis.

---

## 📚 Technical Docs
For in-depth details regarding database schemas, prompt structures, and RAG vector search parameters, please refer to [DEVELOPER.md](file:///C:/Users/Fardhan%20Rasya/.gemini/antigravity/worktrees/latezza-automation/generate-backend-api-docs/DEVELOPER.md).
For a comprehensive guide on all available backend HTTP/REST endpoints, request bodies, and response formats, please refer to [API.md](file:///C:/Users/Fardhan%20Rasya/.gemini/antigravity/worktrees/latezza-automation/generate-backend-api-docs/API.md).

