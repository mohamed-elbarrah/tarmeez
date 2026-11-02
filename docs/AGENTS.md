# Tarmeez — AGENTS.md
**Version:** 1.0
**Last updated:** November 2026

> This file is written for AI agents. It tells you what this project is, what every document covers, when to read each one, and how they relate to each other. Read this file first — before any other file in this repository.

---

## What is this project?

Tarmeez is a **commerce and marketing intelligence SaaS platform** for merchants on Salla and Zid. It connects store data, advertising data, and first-party tracking into one unified dashboard.

This is a **Monorepo** (Turborepo) with two apps:
- `apps/web` — Next.js 16 merchant dashboard + admin panel
- `apps/api` — NestJS 12 REST API

---

## Document Map

```
docs/
├── AGENTS.md              ← You are here. Read first, always.
├── ../README.md           ← Project overview, setup, decisions log
├── PRODUCT_VISION.md      ← Why the product exists, principles, what it is NOT
├── PRODUCT_SCOPE.md       ← Feature boundaries, phased direction, open questions
├── PRODUCT_ROADMAP.md     ← Delivery phases, timelines, risks
├── EXECUTION_PLAN.md      ← Current implementation sequence and checkpoints
├── FRONTEND_CONTRACT.md   ← Mandatory frontend patterns and rules
└── BACKEND_CONTRACT.md    ← Mandatory backend patterns and rules
```

---

## When to Read Each Document

### Always read first
| Document | Read when |
|----------|-----------|
| `AGENTS.md` | Start of every session — before touching any file |
| Root `README.md` | You need the full picture: stack, setup, architecture, key decisions |

### Read when working on product decisions
| Document | Read when |
|----------|-----------|
| `PRODUCT_VISION.md` | You are asked about what Tarmeez is, who it serves, or its principles. Also read when a request might conflict with the product's stated boundaries |
| `PRODUCT_SCOPE.md` | You are asked about what is in or out of scope, which features belong to which phase, or what decisions are still open |
| `PRODUCT_ROADMAP.md` | You are asked about delivery order, phase timelines, workstreams, or risks |
| `EXECUTION_PLAN.md` | You are implementing the currently selected delivery sequence |

### Read when writing or reviewing code
| Document | Read when |
|----------|-----------|
| `FRONTEND_CONTRACT.md` | You are about to write, review, or reason about ANY file inside `apps/web/` |
| `BACKEND_CONTRACT.md` | You are about to write, review, or reason about ANY file inside `apps/api/` |

> **Rule:** Never write a single line of code in either app without first confirming you have read the relevant contract in this session. The contracts are the law — they override any pattern you know from training data.

---

## Document Relationships

```
PRODUCT_VISION.md
      │
      │ defines boundaries and principles
      ▼
PRODUCT_SCOPE.md
      │
      │ scopes the features per phase
      ▼
PRODUCT_ROADMAP.md
      │
      │ sequences the delivery
      ▼
      ├── FRONTEND_CONTRACT.md  ← governs apps/web implementation
      └── BACKEND_CONTRACT.md   ← governs apps/api implementation
```

The root `README.md` sits across all of them — it is the entry point that summarises every layer and links to each document.

## Document Authority

When documents disagree, use this order of authority:

1. `PRODUCT_VISION.md` — product purpose and principles.
2. `PRODUCT_SCOPE.md` — approved boundaries and open decisions.
3. `PRODUCT_ROADMAP.md` — delivery sequence and validation gates.
4. `EXECUTION_PLAN.md` — implementation sequence for the current plan.
5. `FRONTEND_CONTRACT.md` / `BACKEND_CONTRACT.md` — technical implementation rules.
6. Root `README.md` — setup summary and quick reference.

If a decision is not approved in the product documents, do not treat an implementation plan or README summary as final. Flag the conflict and record the decision before expanding scope.

---

## Codebase Map

```
tarmeez/
├── apps/
│   ├── web/                    # Next.js 16 — governed by FRONTEND_CONTRACT.md
│   │   └── src/
│   │       ├── app/            # Pages — Server Components only
│   │       ├── components/     # ui/ · common/ · features/ · layouts/
│   │       ├── store/          # Redux — UI state only
│   │       ├── services/       # RTK Query — all API calls
│   │       ├── hooks/          # Custom hooks
│   │       ├── lib/            # utils, constants
│   │       └── types/          # TypeScript types
│   │
│   └── api/                    # NestJS 12 — governed by BACKEND_CONTRACT.md
│       └── src/
│           ├── features/       # One folder per feature (auth, merchants, connections, analytics, admin)
│           ├── common/         # Guards, filters, interceptors, decorators, pipes
│           ├── config/         # All env config — ConfigService only
│           ├── prisma/         # Single PrismaService instance
│           └── jobs/           # BullMQ queues and processors
│
└── packages/
    ├── types/                  # Shared TypeScript types between web and api
    └── utils/                  # Shared utility functions
```

---

## Tech Stack at a Glance

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend framework | Next.js App Router | 16 |
| UI components | shadcn/ui + Tailwind CSS | latest |
| Server state | RTK Query | latest |
| UI state | Redux Toolkit | latest |
| Backend framework | NestJS | 12 |
| ORM | Prisma | 7 (pinned — v8 is RC) |
| Database | PostgreSQL Alpine | 16 |
| Queue | BullMQ + Redis Alpine | Redis 7 |
| Auth | JWT + Refresh Tokens | — |
| Runtime | Node.js LTS | 26 |
| Monorepo | Turborepo | latest |
| Containers | Docker + Docker Compose | — |
| Deployment | VPS | Docker Compose |

---

## Core Architecture Rules

These rules appear in the contracts. They are repeated here so you never violate them by accident.

### Frontend (`apps/web`)
1. `'use client'` only in leaf components — never in pages or layouts
2. All API calls through **RTK Query** — never fetch or axios directly
3. **Server state** (API data) lives in RTK Query — never in Redux
4. **UI state** (sidebar, theme, auth user) lives in Redux slices
5. **Named exports** only — never `export default` for components
6. Every component showing API data must handle **loading + error + empty**
7. No `any` in TypeScript

### Backend (`apps/api`)
1. All DB access through **Repository classes** — never Prisma in a controller or service directly
2. All config through **ConfigService** — never `process.env` in feature code
3. All errors thrown as **`AppException`** with a translation key — never hardcoded text
4. All incoming data validated via **DTOs** with `class-validator` — never manual checks
5. All list endpoints return the shared **`PaginatedResult`** shape
6. Long-running tasks go to **BullMQ** — never inline async in a request cycle
7. Sensitive actions written to **`audit_logs`** table
8. Use NestJS **Logger** with class context — never `console.log`
9. No `any` in TypeScript

---

## API Contract Between Frontend and Backend

### Every API response follows this envelope:

**Success:**
```json
{
  "success": true,
  "data": { },
  "meta": { "total": 0, "page": 1, "perPage": 20, "totalPages": 0 }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "key": "errors.connection.not_found",
    "statusCode": 404,
    "details": { }
  }
}
```

### Error key format: `errors.<feature>.<description>`
```
errors.auth.invalid_credentials
errors.connection.not_found
errors.merchant.already_exists
```

> **Critical:** The API never sends hardcoded text in error messages. It always sends a translation key. The frontend resolves the key to a human-readable string using its i18n layer.

---

## Data Flow

```
User action in browser
      │
      ▼
RTK Query mutation / query   (apps/web/services/)
      │
      ▼
NestJS Controller            (apps/api/features/<feature>/<feature>.controller.ts)
      │  validates via DTO
      ▼
NestJS Service               (apps/api/features/<feature>/<feature>.service.ts)
      │  business logic
      ▼
Repository                   (apps/api/features/<feature>/<feature>.repository.ts)
      │  Prisma calls only here
      ▼
PostgreSQL
```

**For long-running operations (sync, data ingestion):**
```
NestJS Service
      │
      ▼
BullMQ Queue                 (apps/api/jobs/queues/)
      │
      ▼
BullMQ Processor             (apps/api/jobs/processors/)
      │
      ▼
External API (Salla / Zid / Meta)
      │
      ▼
PostgreSQL (via Repository)
```

---

## Feature Boundaries

| Feature | Scope | App |
|---------|-------|-----|
| `auth` | Registration, login, JWT, refresh tokens | api |
| `merchants` | Merchant accounts, profiles, team members | api |
| `connections` | OAuth with Salla, Zid, Meta — token storage, sync trigger | api |
| `analytics` | Sales metrics, order data, campaign data | api |
| `admin` | Internal team panel — merchant management, subscriptions, logs | api |
| `(auth)` route group | Login, register pages | web |
| `(dashboard)` route group | Merchant-facing pages | web |
| `(admin)` route group | Internal admin pages | web |

---

## MVP Boundaries — Current Working Baseline

The following is the current implementation baseline. It remains subject to the Phase 0 validation and product-owner decisions recorded in `PRODUCT_SCOPE.md` and `PRODUCT_ROADMAP.md`.

### In scope for MVP (Beta):
- Merchant auth (register, login, refresh)
- Connect Salla store (OAuth + sync)
- Connect Zid store (OAuth + sync)
- Connect Meta Ads account
- Sales analytics dashboard
- Campaign analytics (spend, ROAS)
- Team management (Owner + Viewer)
- Admin panel (merchants, subscriptions, error logs, invitations)

### Explicitly out of scope — do not build or suggest:
- Storefront tracking script
- Customer journey / attribution
- AI recommendations or alerts
- Store write operations (create/edit products, orders)
- TikTok Ads or Google Ads integrations
- Self-serve billing (manual in beta)

> If a request asks you to build something outside the current baseline or inside an open-decision area, flag it and confirm the scope before proceeding.

---

## Shared Types (`packages/types`)

Types used by both `apps/web` and `apps/api` live in `packages/types`. When you add a type that both apps need, put it there — not in either app's local `/types` folder.

Examples of shared types:
- `Merchant`, `MerchantStatus`
- `Connection`, `ConnectionPlatform`, `ConnectionStatus`
- `ApiSuccessResponse<T>`, `ApiErrorResponse`, `PaginatedResult<T>`

---

## Environment Variables

### Backend (`apps/api/.env`)
```
NODE_ENV · PORT · FRONTEND_URL
DATABASE_URL
JWT_ACCESS_SECRET · JWT_REFRESH_SECRET · JWT_ACCESS_EXPIRES_IN · JWT_REFRESH_EXPIRES_IN
REDIS_HOST · REDIS_PORT
SALLA_CLIENT_ID · SALLA_CLIENT_SECRET · SALLA_WEBHOOK_SECRET
ZID_CLIENT_ID · ZID_CLIENT_SECRET
META_APP_ID · META_APP_SECRET
```

### Frontend (`apps/web/.env.local`)
```
NEXT_PUBLIC_API_URL
```

---

## Naming Conventions — Quick Reference

| Context | Convention | Example |
|---------|-----------|---------|
| Frontend components | PascalCase | `ConnectionCard.tsx` |
| Frontend hooks | camelCase + use | `useAuth.ts` |
| Frontend slices | camelCase + Slice | `uiSlice.ts` |
| Frontend services | camelCase + Api | `connectionsApi.ts` |
| Backend files | kebab-case | `connections.service.ts` |
| Backend classes | PascalCase | `ConnectionsService` |
| Backend DTOs | PascalCase + Dto | `CreateConnectionDto` |
| DB tables | snake_case plural | `merchants` |
| DB columns | snake_case | `merchant_id` |
| Prisma models | PascalCase singular | `Merchant` |
| Enums (DB) | SCREAMING_SNAKE_CASE | `TRIAL`, `CONNECTED` |
| BullMQ job names | `feature:action` | `salla:full-sync` |
| Error keys | `errors.feature.description` | `errors.auth.invalid_credentials` |
| Branch names | `type/description` | `feature/salla-oauth` |

---

## What to Do When You Are Unsure

| Situation | Action |
|-----------|--------|
| Not sure if a feature is in MVP scope | Read `PRODUCT_SCOPE.md` |
| Not sure which phase a feature belongs to | Read `PRODUCT_ROADMAP.md` |
| Not sure if something violates product principles | Read `PRODUCT_VISION.md` |
| About to write frontend code | Read `FRONTEND_CONTRACT.md` first |
| About to write backend code | Read `BACKEND_CONTRACT.md` first |
| Not sure where a new file belongs | Check the folder structure in the relevant contract |
| Not sure which type of state (Redux vs RTK Query) | Server data → RTK Query. UI-only → Redux |
| Not sure if a type is shared or local | If both web and api use it → `packages/types`. Otherwise → local `/types` |
| A request conflicts with documented decisions | Flag it. Do not silently override a documented decision |

---

## Principles to Never Violate

1. **No hardcoded error text** — translation keys only
2. **No Prisma outside repositories** — the repository layer is the only DB gateway
3. **No `process.env` outside `config/`** — config is centralised
4. **No `any` in TypeScript** — anywhere, ever
5. **No `export default` for components** — named exports only
6. **No server state in Redux** — RTK Query owns all API data
7. **No inline long-running work** — BullMQ for anything async and heavy
8. **No unhandled states** — every data component handles loading, error, and empty
9. **No unaudited sensitive actions** — write to `audit_logs`
10. **No building out-of-scope features** without explicit confirmation

## Contribution Rules

- Use branches named `feature/`, `fix/`, `chore/`, or `docs/`.
- Keep changes small and focused; explain product, API, database, and security impact in the PR.
- Before opening a PR, run the repository's lint, typecheck, build, and relevant test commands.
- Database changes require a reviewed Prisma migration and a rollback or recovery note.
- Never commit secrets, tokens, customer data, or credentials; never expose them in logs.
- Every feature needs acceptance criteria, loading/error/empty states where relevant, and tests for important failure paths.
- Update the relevant contract or decision log when a rule or architectural decision changes.
- A feature is done only after implementation, tests, review, documentation, and integration checks are complete.

---

*This file must be updated whenever a major architectural decision changes, a new document is added, or the MVP scope is revised.*
