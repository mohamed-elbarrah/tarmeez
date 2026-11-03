# Tarmeez — Project README
**Version:** 1.0
**Last updated:** November 2026

> Central reference for everyone working on Tarmeez. Read this before touching any code.

---

## What is Tarmeez?

Tarmeez is a centralized commerce and marketing intelligence platform for merchants who operate existing online stores on **Salla** and **Zid**.

A merchant connects their store and advertising accounts to Tarmeez. Tarmeez unifies three data domains — commerce data, advertising data, and first-party storefront behaviour — into a single coherent view of business performance, customer journeys, and marketing contribution.

---

## Repository Structure

This is a **Monorepo** managed with **Turborepo**.

```
tarmeez/
├── apps/
│   ├── web/              # Next.js — Merchant Dashboard
│   └── api/              # NestJS — Backend API
├── packages/
│   ├── types/            # Shared TypeScript types (web + api)
│   └── utils/            # Shared utilities
├── docker-compose.dev.yml
├── turbo.json
└── package.json
```

---

## Tech Stack

### Frontend (`apps/web`)
| | |
|--|--|
| Framework | Next.js 16 — App Router |
| UI Components | shadcn/ui + Tailwind CSS |
| State Management | Redux Toolkit (UI state) + RTK Query (server state) |
| Language | TypeScript (strict) |

### Backend (`apps/api`)
| | |
|--|--|
| Framework | NestJS 12 |
| ORM | Prisma 7 (`^7` — v8 is RC, not yet stable) |
| Database | PostgreSQL 16 |
| Queue / Jobs | BullMQ |
| Cache / Sessions | Redis 7 |
| Auth | JWT + Refresh Tokens |
| Language | TypeScript (strict) |

### Runtime
| | |
|--|--|
| Node.js | 26 LTS (Active LTS since October 2026, supported until April 2029) |

### Infrastructure
| | |
|--|--|
| Containerization | Docker + Docker Compose |
| Database image | `postgres:16-alpine` |
| Redis image | `redis:7-alpine` |
| Deployment | VPS — Docker Compose |
| CI/CD | GitHub Actions |

---

## Getting Started

### Prerequisites
- Node.js 26 LTS
- Docker + Docker Compose
- pnpm

### 1. Clone the repository
```bash
git clone https://github.com/your-org/tarmeez.git
cd tarmeez
```

### 2. Install dependencies
```bash
pnpm install
```

### 3. Configure and start infrastructure services
```bash
# Compose reads this root-level file for local service credentials and ports
cp .env.example .env

# Starts PostgreSQL + Redis only — app code runs locally
docker compose -f docker-compose.dev.yml up -d

# Check service health
docker compose -f docker-compose.dev.yml ps

# Stop services (keeps database/cache volumes)
docker compose -f docker-compose.dev.yml down
```

The root `.env` supplies Compose with the PostgreSQL credentials and host ports; it is ignored by Git. These credentials and the unauthenticated Redis instance are for local development only. Both services bind to localhost and persist data in named Docker volumes. If you change the host ports in `.env`, update `DATABASE_URL` and `REDIS_PORT` in `apps/api/.env` to match. To **delete** the persisted data as well as stop the services, run `docker compose -f docker-compose.dev.yml down --volumes`.

### 4. Set up environment variables
```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
# Fill in the required values — see Environment Variables section below
```

### 5. Run database migrations
```bash
cd apps/api
pnpm prisma migrate dev
```

### 6. Start development servers
```bash
# From root — starts all apps in parallel
pnpm dev
```

| Service | URL |
|---------|-----|
| Merchant Dashboard | http://localhost:3000 |
| API | http://localhost:4000 |
| API Health | http://localhost:4000/health |

---

## Environment Variables

### Backend (`apps/api/.env`)
```env
# App
NODE_ENV=development
PORT=4000
FRONTEND_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://tarmeez:secret@localhost:5432/tarmeez

# JWT (replace with independent random secrets, at least 32 characters each)
JWT_ACCESS_SECRET=replace-with-a-random-access-secret
JWT_REFRESH_SECRET=replace-with-a-random-refresh-secret
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Salla
SALLA_CLIENT_ID=
SALLA_CLIENT_SECRET=
SALLA_WEBHOOK_SECRET=

# Zid
ZID_CLIENT_ID=
ZID_CLIENT_SECRET=

# Meta Ads
META_APP_ID=
META_APP_SECRET=
```

### Frontend (`apps/web/.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

---

## Project Documents

Read the documents in this order. If they conflict, `AGENTS.md` defines the authority order and the product documents take precedence over implementation summaries.

All product and technical documents live in `/docs` (the project README is at the repository root). Read them in this order:

| Document | What it covers |
|----------|---------------|
| [`PRODUCT_VISION.md`](./docs/PRODUCT_VISION.md) | Why Tarmeez exists, who it serves, product principles |
| [`PRODUCT_SCOPE.md`](./docs/PRODUCT_SCOPE.md) | Capability boundaries, phased direction, open decisions |
| [`PRODUCT_ROADMAP.md`](./docs/PRODUCT_ROADMAP.md) | Delivery phases, workstreams, risks, next steps |
| [`EXECUTION_PLAN.md`](./docs/EXECUTION_PLAN.md) | Current implementation sequence and checkpoints |
| [`API_AUTH.md`](./docs/API_AUTH.md) | Authentication API flows, endpoints, cookies, and errors |
| [`FRONTEND_CONTRACT.md`](./docs/FRONTEND_CONTRACT.md) | **Mandatory** frontend structure, patterns, and rules |
| [`BACKEND_CONTRACT.md`](./docs/BACKEND_CONTRACT.md) | **Mandatory** backend structure, patterns, and rules |

---

## Architecture Overview

```
┌─────────────────────────────────────┐
│         Merchant Dashboard          │
│     Next.js 16 (App Router)         │
│   RTK Query ←→ Redux Toolkit        │
└────────────────┬────────────────────┘
                 │ HTTPS / REST
┌────────────────▼────────────────────┐
│            NestJS API               │
│   Auth · Connections · Analytics    │
│   Feature-based · Repository layer  │
└──────┬──────────────┬───────────────┘
       │              │
┌──────▼──────┐  ┌────▼──────┐
│ PostgreSQL  │  │   Redis   │
│  16-alpine  │  │ 7-alpine  │
│  (Prisma)   │  │ (BullMQ)  │
└─────────────┘  └───────────┘
                      │
              ┌───────▼────────┐
              │  BullMQ Jobs   │
              │  Salla Sync    │
              │  Zid Sync      │
              │  Ads Sync      │
              └────────────────┘
```

---

## Development Rules

> The contracts below are **mandatory**. PRs that violate them will not be merged.

### Frontend — Non-negotiable rules
- `'use client'` in leaf components only — never in pages or layouts
- All API calls through **RTK Query** — no fetch/axios directly
- All UI-only state through **Redux slices** — no server state in Redux
- **Named exports** always — no `export default` for components
- Every data component handles **loading + error + empty** states
- No `any` in TypeScript
- Full rules → [`FRONTEND_CONTRACT.md`](./docs/FRONTEND_CONTRACT.md)

### Backend — Non-negotiable rules
- All Prisma calls inside **Repository** classes only
- All config accessed through **ConfigService** — no `process.env` in code
- All errors thrown as **`AppException`** with a translation key — no hardcoded text
- All incoming data validated through **DTOs** with `class-validator`
- All list endpoints return the shared **`PaginatedResult`** shape
- Long-running tasks dispatched to **BullMQ** — not inline async calls
- Sensitive actions written to **`audit_logs`**
- No `console.log` — use NestJS **Logger** with class context
- No `any` in TypeScript
- Full rules → [`BACKEND_CONTRACT.md`](./docs/BACKEND_CONTRACT.md)

---

## Current Working MVP Baseline

The implementation plan currently targets a controlled beta. This baseline is not a final product commitment; Phase 0 validation and product-owner decisions remain authoritative.

### Merchant Dashboard
- Account registration and login (JWT + Refresh Tokens)
- Connect a Salla store (OAuth)
- Connect a Zid store (OAuth)
- Connect a Meta Ads account
- Connection health and sync status
- Sales analytics: revenue, orders, AOV, top products
- Campaign analytics: spend, clicks, ROAS
- Team management (Owner + Viewer roles)

### Admin Panel (Internal)
- Merchant list and profiles
- Subscription management
- Connection health overview
- Error logs
- Beta invitations

### Explicitly out of the current working baseline
- Storefront tracking script
- Attribution and customer journey
- Alerts and AI recommendations
- Store write operations
- TikTok / Google Ads integrations

---

## Delivery Phases (Summary)

These phases are a delivery sequence, not a fixed schedule. The first release boundary remains subject to the validation decisions in `PRODUCT_SCOPE.md` and `PRODUCT_ROADMAP.md`.

| Phase | Outcome |
|-------|---------|
| **0 — Validation** | Verify Salla/Zid APIs, webhooks, tracking feasibility |
| **1 — Foundation** | Auth, multi-tenancy, infrastructure, CI/CD |
| **2 — Salla Integration** | OAuth, data sync, webhook handling |
| **3 — Core Analytics** | Sales dashboard, orders, products |
| **4 — Zid Integration** | Same as Salla on the proven pattern |
| **5 — Ads Integration** | Meta Ads — spend, campaigns, basic ROAS |
| **6 — Beta** | 5–10 real merchants, monitored onboarding |
| **7 — v1 Public** | Self-serve onboarding, billing, stable release |

Full detail → [`PRODUCT_ROADMAP.md`](./docs/PRODUCT_ROADMAP.md)

---

## Key Decisions Log

| Decision | Choice | Reason |
|----------|--------|--------|
| Monorepo | Turborepo | Shared types between web and api, single pipeline |
| Node.js runtime | v26 LTS | Active LTS since Oct 2026, supported until Apr 2029 |
| Frontend framework | Next.js 16 — App Router | Latest stable, Turbopack default, server components |
| UI | shadcn/ui + Tailwind | Accessible, unstyled base, full control |
| State | RTK Query + Redux Toolkit | Server state vs UI state separation |
| Backend framework | NestJS 12 | Latest stable, ESM, native observability |
| ORM | Prisma 7 (pinned `^7`) | Stable for production — v8 is still RC |
| Database | PostgreSQL 16 Alpine | Stable, lightweight image |
| Queue | BullMQ + Redis 7 Alpine | Reliable job processing for sync tasks |
| Auth | JWT + Refresh Tokens | Stateless API, secure token rotation |
| Dev services | Docker Compose | One command setup for all developers |
| Production | VPS + Docker Compose | Simple, cost-effective for beta stage |
| CI/CD | GitHub Actions | Free, sufficient for current team size |
| API errors | Translation keys (not hardcoded text) | i18n-ready from day one |

---

## Team

| Role | Responsibilities |
|------|-----------------|
| Frontend Developer | Next.js app, components, RTK Query, Redux |
| Backend Developer | NestJS API, integrations, BullMQ jobs |
| Database Specialist | Prisma schema, migrations, query optimization |

---

## Contributing

1. Read the relevant contract document before writing any code
2. Branch naming: `feature/`, `fix/`, `chore/`
3. PR must pass the contract checklist in the relevant document
4. No PR merges without at least one review
5. No `any` in TypeScript — ever

---

*This README reflects the current working baseline as of November 2026. Update it when an approved product or architectural decision changes.*
