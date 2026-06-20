# Graph Report - .  (2026-06-20)

## Corpus Check
- 88 files · ~55,156 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 40 nodes · 43 edges · 11 communities (6 shown, 5 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

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

## God Nodes (most connected - your core abstractions)
1. `AI Creative Ad Content Ideas` - 6 edges
2. `Proactive Follow-up System` - 6 edges
3. `Google Gemini AI Integration` - 5 edges
4. `RAG Semantic Product Search` - 5 edges
5. `Meta Ads Reporting System` - 5 edges
6. `Baileys WhatsApp Gateway` - 5 edges
7. `Dynamic Background Scheduler` - 4 edges
8. `Customers Database Table` - 3 edges
9. `AI Agent Tool Calling` - 3 edges
10. `Fastify Backend Server` - 3 edges

## Surprising Connections (you probably didn't know these)
- `AI Creative Ad Content Ideas` --implements--> `Server-Sent Events Streaming`  [EXTRACTED]
  DEVELOPER.md → API.md
- `Google Gemini AI Integration` --conceptually_related_to--> `RAG Semantic Product Search`  [EXTRACTED]
  README.md → DEVELOPER.md
- `Meta Ads Reporting System` --references--> `Google Gemini AI Integration`  [EXTRACTED]
  DEVELOPER.md → README.md
- `Plaintext Output Guardrails` --rationale_for--> `Google Gemini AI Integration`  [EXTRACTED]
  CHANGELOG.md → README.md
- `Proactive Follow-up System` --references--> `Google Gemini AI Integration`  [EXTRACTED]
  DEVELOPER.md → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **WhatsApp Message Processing Pipeline** — latezza_automation_baileys_whatsapp, latezza_automation_gemini_ai_integration, latezza_automation_ai_tool_calling, latezza_automation_chat_histories_table, latezza_automation_customers_table [EXTRACTED 0.95]
- **Meta Ads Automation Pipeline** — latezza_automation_meta_ads_reporting, latezza_automation_creative_ad_analysis, latezza_automation_meta_graph_api, latezza_automation_dynamic_scheduler [EXTRACTED 0.95]
- **RAG Product Search Pipeline** — latezza_automation_rag_semantic_search, latezza_automation_gemini_embedding_2, latezza_automation_cosine_similarity, latezza_automation_products_table [EXTRACTED 0.95]

## Communities (11 total, 5 thin omitted)

### Community 0 - "WhatsApp CRM & Follow-up"
Cohesion: 0.27
Nodes (10): AI Agent Tool Calling, Baileys WhatsApp Gateway, Chat Histories Database Table, CRM Customer Management API, Customers Database Table, Follow-Up Automation API, Follow-up Prompt 3-Mode System, Human Handoff Mechanism (+2 more)

### Community 1 - "Infrastructure & Frontend"
Cohesion: 0.40
Nodes (6): Docker Compose Deployment, Fastify Backend Server, Light/Dark Mode Theme, PostgreSQL Database, React Vite Frontend SPA, shadcn/ui Component Library

### Community 2 - "RAG Product Search"
Cohesion: 0.50
Nodes (5): Cosine Similarity Matching, Gemini Embedding-2 Model, Product Catalog CRUD API, Products Database Table, RAG Semantic Product Search

### Community 3 - "Meta Ads Analysis"
Cohesion: 0.50
Nodes (5): AI Creative Ad Content Ideas, Exponential Backoff Retry Logic, Meta Ads Reporting System, Meta Graph API, Winner/Loser Ad Classification

### Community 4 - "Scheduler & Settings"
Cohesion: 0.50
Nodes (4): Dynamic Background Scheduler, Node-Cron Scheduling, Settings Cache System, Settings Key-Value Table

### Community 5 - "AI Agent Core"
Cohesion: 0.50
Nodes (4): Google Gemini AI Integration, Latezza Cake, Plaintext Output Guardrails, WhatsApp AI Agent & Ads Report Automation

## Knowledge Gaps
- **12 isolated node(s):** `Actions`, `ThemeProvider`, `useIsMobile`, `cn`, `Latezza Cake` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Meta Ads Reporting System` connect `Meta Ads Analysis` to `WhatsApp CRM & Follow-up`, `Scheduler & Settings`, `AI Agent Core`?**
  _High betweenness centrality (0.278) - this node is a cross-community bridge._
- **Why does `Google Gemini AI Integration` connect `AI Agent Core` to `WhatsApp CRM & Follow-up`, `RAG Product Search`, `Meta Ads Analysis`?**
  _High betweenness centrality (0.264) - this node is a cross-community bridge._
- **Why does `RAG Semantic Product Search` connect `RAG Product Search` to `WhatsApp CRM & Follow-up`, `AI Agent Core`?**
  _High betweenness centrality (0.149) - this node is a cross-community bridge._
- **What connects `Actions`, `ThemeProvider`, `useIsMobile` to the rest of the system?**
  _16 weakly-connected nodes found - possible documentation gaps or missing edges._