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

### Production
`docker-compose up` builds backend + PostgreSQL, serves frontend from `frontend/dist/`

## Agent habits — always do these
- After making changes, check `.agents/workflows/`.
- Before making changes check for existing rule files: `.agents/rules/`.
- Run `npm run lint && npm run typecheck && npm run build` in `frontend/` to verify frontend changes

## API overview
Full API docs at `API.md` (Indonesian).

