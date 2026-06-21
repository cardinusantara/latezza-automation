# AGENTS.md — Latezza WhatsApp AI Agent

## Project structure
- `backend/` — Fastify (Node.js) + Baileys + PostgreSQL + Google Gemini AI
  - Entrypoint: `backend/gateway.js`
  - No lint/typecheck/test scripts exist for backend
- `frontend/` — React + Vite + TypeScript + Tailwind v4 + shadcn/ui

## Development commands

### Frontend (in `frontend/`)
- `npm run dev` — Vite dev server on :5173, proxies `/api` to :3001
- `npm run build` — `tsc -b && vite build`
- `npm run lint` — ESLint
- `npm run typecheck` — `tsc --noEmit`
- `npm run format` — Prettier (`prettier-plugin-tailwindcss` active)
- `shadcn add <component>` — add shadcn/ui components (Radix Maia style)

### Backend (in `backend/`)
- `npm start` — `node gateway.js` (no hot reload)
- DB schema auto-creates on startup via `CREATE TABLE IF NOT EXISTS` in `src/db.js`

### Running locally
Two terminals required:
1. `cd backend && npm start` (port 3001)
2. `cd frontend && npm run dev` (port 5173)

## Agent habits — always do these
- Before making changes check for existing rule files: `.agents/rules/`.
- Run `npm run lint && npm run typecheck && npm run build` in `frontend/` to verify frontend changes

## API overview
Full API docs at `API.md` (Indonesian).

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
