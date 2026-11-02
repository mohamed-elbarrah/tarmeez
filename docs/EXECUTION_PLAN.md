# Tarmeez — Execution Plan (MVP)
**Version:** 1.0
**Last updated:** November 2026
**Goal:** A stable, testable MVP ready for real merchant beta

> This is an implementation sequence, not an approved delivery schedule. The week labels are rough planning placeholders and must not override the validation gates or open decisions in `PRODUCT_SCOPE.md` and `PRODUCT_ROADMAP.md`.

---

## Overview

```
Phase 0 — Project Foundation        (Week 1)
Phase 1 — Backend: Auth & Core      (Weeks 2–3)
Phase 2 — Backend: Commerce         (Weeks 4–6)
Phase 3 — Backend: Advertising      (Week 7)
Phase 4 — Backend: Admin APIs       (Week 8)
Phase 5 — Frontend: Foundation      (Week 9)
Phase 6 — Frontend: Admin Panel     (Weeks 10–11)
Phase 7 — Frontend: Merchant Dashboard (Weeks 12–15)
Phase 8 — QA & Beta Prep            (Week 16)
```

The total duration is not committed. Re-estimate after Phase 0 validation and after the first complete integration slice.

---

## Phase 0 — Project Foundation
### Goal: One command starts everything. Zero config friction for any developer.
### Duration: Week 1

---

### Step 0.1 — Monorepo Setup
**What:**
Initialize the Turborepo monorepo with the correct folder structure.

**Why:**
Everything else is built on top of this. Getting it wrong now means painful restructuring later.

**Tasks:**
- Init Turborepo with pnpm workspaces
- Create `apps/web`, `apps/api`, `packages/types`, `packages/utils`
- Configure `turbo.json` with `dev`, `build`, `lint` pipelines
- Set up shared `tsconfig.base.json`
- Add `.gitignore`, `.env.example` files for both apps

**Result:**
```bash
pnpm dev   # starts both apps in parallel
pnpm build # builds both apps
pnpm lint  # lints both apps
```

---

### Step 0.2 — Docker Compose (Dev Services)
**What:**
Docker Compose file that starts PostgreSQL and Redis only. Code runs locally.

**Why:**
Every developer runs `docker compose up` and has a working database instantly — no manual PostgreSQL installation.

**Tasks:**
- `docker-compose.dev.yml` with:
  - `postgres:16-alpine` on port 5432
  - `redis:7-alpine` on port 6379
- Persistent volumes for both
- Health checks on both services
- Document the startup command in README

**Result:**
```bash
docker compose -f docker-compose.dev.yml up -d
# PostgreSQL and Redis are ready
```

---

### Step 0.3 — NestJS Project Scaffold
**What:**
Create the NestJS app following BACKEND_CONTRACT.md exactly.

**Why:**
The contract defines the structure. Scaffolding correctly now means every future module just slots in.

**Tasks:**
- Init NestJS project in `apps/api`
- Create folder structure: `features/`, `common/`, `config/`, `prisma/`, `jobs/`
- Set up `ConfigModule` with all config files (app, database, jwt, bull)
- Register `GlobalExceptionFilter`, `ResponseInterceptor`, `ValidationPipe` in `main.ts`
- Create `PrismaService` and `PrismaModule`
- Add `GET /health` endpoint that checks DB + Redis connectivity

**Result:**
```bash
curl http://localhost:4000/health
# { "success": true, "data": { "db": "ok", "redis": "ok" } }
```

---

### Step 0.4 — Prisma Schema (Initial)
**What:**
Write the initial database schema covering all MVP models.

**Why:**
The schema is the contract between backend and database. Defining it upfront prevents migration chaos later.

**Models to create:**
```prisma
Merchant         # core merchant account
RefreshToken     # stored hashed refresh tokens
Connection       # store + ad account connections
Order            # synced orders from commerce platforms
Product          # synced products
Customer         # synced customers
CampaignStat     # synced ad campaign data
AuditLog         # sensitive action trail
Invitation       # beta invitations
```

**Tasks:**
- Write full schema with all relations, enums, and field mappings
- Run first migration: `prisma migrate dev --name init`
- Verify all tables created correctly

---

### Step 0.5 — CI/CD Pipeline
**What:**
GitHub Actions workflow that runs on every PR.

**Why:**
Catch broken code before it reaches main. Non-negotiable from day one.

**Tasks:**
- Workflow: install → lint → build → test (on PR to main)
- Separate workflow: deploy to VPS (on push to main)
- Add branch protection: no direct push to main

---

## Phase 1 — Backend: Auth & Core
### Goal: A merchant can register, log in, and stay logged in securely.
### Duration: Weeks 2–3

---

### Step 1.1 — Auth Module
**What:**
Full authentication system with JWT access tokens and refresh tokens.

**Why:**
Every other endpoint requires authentication. This must be solid before anything else.

**Endpoints:**
```
POST /auth/register          # create merchant account
POST /auth/login             # returns access + refresh token
POST /auth/refresh           # exchange refresh token for new access token
POST /auth/logout            # invalidate refresh token
POST /auth/forgot-password   # send reset email
POST /auth/reset-password    # set new password with token
```

**Implementation details:**
- Access token: JWT, 15 minutes
- Refresh token: random UUID, hashed with bcrypt, stored in DB, 7 days
- Password: hashed with bcrypt (rounds: 12)
- Forgot password: signed URL token, expires in 1 hour
- All errors via `AppException` with translation keys

**Guards and Strategies:**
- `JwtStrategy` — validates access token
- `JwtRefreshStrategy` — validates refresh token
- `JwtAuthGuard` — protects routes
- `RolesGuard` — enforces MERCHANT / ADMIN roles

---

### Step 1.2 — Merchants Module
**What:**
Endpoints for managing merchant profile and workspace.

**Endpoints:**
```
GET   /merchants/me              # get own profile
PATCH /merchants/me              # update own profile
GET   /merchants/me/team         # list team members
POST  /merchants/me/team/invite  # invite a team member
DELETE /merchants/me/team/:id    # remove a team member
```

**Why now:**
Every other resource (connections, analytics) belongs to a merchant. This establishes that ownership layer.

---

### Step 1.3 — Shared packages/types
**What:**
Define all shared TypeScript interfaces in `packages/types`.

**Why:**
Frontend and Backend must agree on the same type shapes. Defining them once in a shared package eliminates inconsistency.

**Types to define:**
```typescript
// Merchant
Merchant, MerchantStatus

// Connections
Connection, ConnectionPlatform, ConnectionStatus

// Commerce
Order, OrderStatus, Product, Customer

// Ads
CampaignStat

// API
ApiSuccessResponse<T>, ApiErrorResponse, PaginatedResult<T>

// Auth
AuthUser, TokenPair
```

---

## Phase 2 — Backend: Commerce Integration
### Goal: A merchant can connect Salla or Zid and see their orders synced automatically.
### Duration: Weeks 4–6

---

### Step 2.1 — Provider Interface
**What:**
Define the shared `CommerceProvider` interface that Salla and Zid both implement.

**Why:**
This is the foundation of the unified approach we decided on. Write it once — add providers without changing the core logic.

```typescript
// features/connections/providers/commerce-provider.interface.ts
interface CommerceProvider {
  getAuthUrl(state: string): string
  exchangeCode(code: string): Promise<TokenPair>
  refreshToken(token: string): Promise<TokenPair>
  fetchOrders(since?: Date): Promise<NormalizedOrder[]>
  fetchProducts(): Promise<NormalizedProduct[]>
  fetchCustomers(): Promise<NormalizedCustomer[]>
}
```

**NormalizedOrder, NormalizedProduct, NormalizedCustomer** are our own internal shapes — not Salla's or Zid's raw shapes. Each provider maps its raw data to our format.

---

### Step 2.2 — Salla Provider
**What:**
Implement `CommerceProvider` for Salla.

**Tasks:**
- Register a Salla Developer App (get CLIENT_ID, CLIENT_SECRET)
- Implement OAuth flow (getAuthUrl, exchangeCode, refreshToken)
- Implement data fetching (fetchOrders, fetchProducts, fetchCustomers)
- Map Salla's raw response fields to our NormalizedOrder/Product/Customer shapes
- Handle Salla API rate limits and pagination

---

### Step 2.3 — Zid Provider
**What:**
Implement the same `CommerceProvider` interface for Zid.

**Why this is fast:**
The interface is already defined. The connection logic is already written. You only write the Zid-specific API calls and field mappings.

**Tasks:**
- Register a Zid Developer App
- Implement the same interface methods for Zid's API
- Map Zid's field names to our normalized shapes

---

### Step 2.4 — Connections Module
**What:**
The API that manages connecting, syncing, and disconnecting stores.

**Endpoints:**
```
GET  /connections                    # list merchant's connections
POST /connections/:platform/init     # returns OAuth URL (salla or zid)
GET  /connections/:platform/callback # OAuth callback — saves tokens, triggers sync
GET  /connections/:id                # connection detail + sync history
DELETE /connections/:id              # disconnect store
POST /connections/:id/sync           # manual re-sync trigger
```

**Key logic:**
- `platform` param selects the right provider automatically
- Tokens stored encrypted in DB
- On successful OAuth: immediately dispatch a `full-sync` BullMQ job
- Connection status updates automatically (CONNECTED / ERROR / EXPIRED)

---

### Step 2.5 — Sync Jobs (BullMQ)
**What:**
Background jobs that pull data from commerce platforms and store it in our DB.

**Why BullMQ and not direct API calls:**
A full sync of a large store can take minutes. An HTTP request cannot wait that long. BullMQ handles retries, failures, and scheduling independently.

**Jobs:**
```
commerce:full-sync
  └── Triggered: on first connection
  └── Does: fetches all orders + products + customers since store creation
  └── Retry: 3 attempts, exponential backoff

commerce:incremental-sync
  └── Triggered: every 30 minutes (scheduled) per active connection
  └── Does: fetches only new/updated data since last sync
  └── Retry: 3 attempts, exponential backoff
```

**How the provider pattern works here:**
```typescript
// sync.processor.ts — same code, any platform
async process(job: Job) {
  const connection = await this.repo.findById(job.data.connectionId)
  const provider = this.providerFactory.get(connection.platform) // salla or zid
  const orders = await provider.fetchOrders(job.data.since)
  await this.ordersRepo.upsertMany(orders)
}
```

---

### Step 2.6 — Analytics Endpoints (Commerce)
**What:**
Read-only endpoints that query our DB (not Salla/Zid directly) and return analytics data.

**Why query our DB and not the platform API directly:**
Speed, consistency, and independence. Once data is synced to our DB, analytics are instant.

**Endpoints:**
```
GET /analytics/sales
    ?from=&to=&platform=     # revenue, orders, AOV — with date range filter

GET /analytics/orders
    ?page=&status=&platform= # paginated orders list

GET /analytics/orders/:id    # single order detail

GET /analytics/products
    ?from=&to=               # top products by revenue

GET /analytics/customers
    ?from=&to=               # new vs returning, top spenders
```

---

## Phase 3 — Backend: Advertising Integration
### Goal: A merchant can connect Meta Ads and see campaign performance alongside sales.
### Duration: Week 7

---

### Step 3.1 — Ads Provider Interface
**What:**
Same provider pattern — but for advertising platforms.

```typescript
interface AdsProvider {
  getAuthUrl(state: string): string
  exchangeCode(code: string): Promise<TokenPair>
  fetchCampaigns(since?: Date): Promise<NormalizedCampaignStat[]>
}
```

**NormalizedCampaignStat:**
```typescript
{
  platformCampaignId: string
  name: string
  spend: number
  clicks: number
  impressions: number
  reportedConversions: number
  date: Date
  platform: 'META' | 'TIKTOK' | 'GOOGLE'
}
```

---

### Step 3.2 — Meta Ads Provider
**What:**
Implement the `AdsProvider` interface for Meta (Facebook) Ads.

**Tasks:**
- Register Meta App (get APP_ID, APP_SECRET)
- OAuth flow: merchant selects their Ad Account
- Fetch campaigns, spend, clicks, impressions via Meta Marketing API
- Map to NormalizedCampaignStat

---

### Step 3.3 — Ads Sync Job
**What:**
BullMQ job that syncs campaign stats daily.

```
ads:sync
  └── Triggered: daily (scheduled) + on first connection
  └── Does: fetches last 90 days of campaign stats
  └── Retry: 3 attempts
```

---

### Step 3.4 — Analytics Endpoints (Ads)
```
GET /analytics/ads
    ?from=&to=&platform=     # spend, clicks, impressions, ROAS by campaign
```

**ROAS calculation (basic):**
```
ROAS = revenue (from our DB) / spend (from Meta) for same date range
```
No attribution yet — just side-by-side numbers.

---

## Phase 4 — Backend: Admin APIs
### Goal: The Tarmeez team can manage merchants, monitor the system, and run the beta.
### Duration: Week 8

---

### Step 4.1 — Admin Merchants
```
GET   /admin/merchants              # all merchants, paginated + filterable
GET   /admin/merchants/:id          # full merchant profile
PATCH /admin/merchants/:id/suspend  # suspend account
PATCH /admin/merchants/:id/activate # activate account
```

---

### Step 4.2 — Admin System Monitoring
```
GET /admin/system/connections   # health of all connections across all merchants
GET /admin/system/logs          # failed sync jobs — merchant, platform, error, time
GET /admin/system/audit         # audit log — who did what and when
```

---

### Step 4.3 — Admin Subscriptions
```
GET   /admin/subscriptions          # all subscriptions
GET   /admin/subscriptions/:id      # detail + invoice history
PATCH /admin/subscriptions/:id/plan # manually change plan (beta: manual billing)
```

---

### Step 4.4 — Beta Invitations
```
POST /admin/invitations             # send beta invitation email
GET  /admin/invitations             # list — sent, accepted, pending
```

---

### Step 4.5 — Admin Team
```
GET    /admin/team        # list internal Tarmeez team members
POST   /admin/team        # add team member
DELETE /admin/team/:id    # remove team member
```

---

### ✅ Backend Complete Checkpoint

At the end of Phase 4, the entire backend is done:

```
✅ Merchant registration and login
✅ Salla + Zid OAuth and data sync
✅ Meta Ads OAuth and campaign sync
✅ Sales analytics (revenue, orders, products, customers)
✅ Ads analytics (spend, clicks, ROAS)
✅ Admin: merchant management
✅ Admin: system health and error logs
✅ Admin: audit trail
✅ Admin: beta invitations
✅ All endpoints tested via Postman / HTTP client
```

**Do not start Phase 5 until this checkpoint is fully verified.**

---

## Phase 5 — Frontend: Foundation
### Goal: The Next.js app is scaffolded, connected to the API, and auth works end-to-end.
### Duration: Week 9

---

### Step 5.1 — Next.js Scaffold
**What:**
Create `apps/web` following FRONTEND_CONTRACT.md exactly.

**Tasks:**
- Init Next.js 16 with App Router in `apps/web`
- Set up folder structure: `app/`, `components/`, `store/`, `services/`, `hooks/`, `lib/`, `types/`
- Configure `tsconfig.json` with path aliases (`@/`)
- Install and configure shadcn/ui
- Install Redux Toolkit + RTK Query
- Set up Tailwind with RTL support (`dir="rtl"`)

---

### Step 5.2 — Redux Store + RTK Query Base
**What:**
The state management foundation everything else builds on.

**Tasks:**
- `store/index.ts` — configureStore
- `store/hooks.ts` — useAppDispatch, useAppSelector
- `store/slices/uiSlice.ts` — sidebar, theme
- `store/slices/authSlice.ts` — logged-in user data + token
- `services/baseApi.ts` — createApi with auth header injection
- `ReduxProvider` wrapped in root `layout.tsx`

---

### Step 5.3 — Auth Flow (End-to-End)
**What:**
The complete login / register / logout flow connecting to the real API.

**Tasks:**
- `services/authApi.ts` — login, register, refresh, logout mutations
- Auth pages: Login, Register, Forgot Password, Reset Password
- Token storage in Redux + httpOnly cookie strategy for refresh token
- Route protection: middleware that redirects unauthenticated users
- Auto-refresh: RTK Query baseQuery wrapper that refreshes token on 401

**Result:**
A developer can register, log in, and stay logged in. The token is sent on every API call automatically.

---

## Phase 6 — Frontend: Admin Panel
### Goal: The Tarmeez team can fully manage the beta from a real UI.
### Duration: Weeks 10–11

---

### Why Admin Panel before Merchant Dashboard?
Before any real merchant touches the product, the team needs to:
- See who signed up
- Activate beta accounts
- Monitor sync health
- Read error logs

Without this, you are blind.

---

### Step 6.1 — Admin Layout
- Sidebar with navigation links to all admin sections
- Header with logged-in admin name + logout
- Route group `(admin)` with its own layout

---

### Step 6.2 — Merchants Management
**Pages:**
- `/admin/merchants` — searchable, filterable table of all merchants
- `/admin/merchants/[id]` — full profile: data, connections, subscription, activity log, suspend/activate buttons

**Components:**
- `MerchantsTable` — DataTable with search + status filter
- `MerchantProfile` — tabs: Overview / Connections / Subscription / Audit

---

### Step 6.3 — System Monitoring
**Pages:**
- `/admin/system/connections` — cards for each connection showing status, last sync, error count
- `/admin/system/logs` — filterable error log table (by merchant, platform, date)
- `/admin/system/audit` — audit trail table (action, target, actor, timestamp)

---

### Step 6.4 — Subscriptions
**Pages:**
- `/admin/subscriptions` — table of all subscriptions with plan + payment status
- `/admin/subscriptions/[id]` — invoice history + manual plan change

---

### Step 6.5 — Invitations
**Page:**
- `/admin/invitations` — send new beta invite (email input), table of sent invites with status (pending / accepted)

---

### Step 6.6 — Admin Team
**Page:**
- `/admin/team` — list internal team, add/remove members

---

### ✅ Admin Panel Complete Checkpoint

```
✅ Admin can log in separately from merchants
✅ Admin can see and search all merchants
✅ Admin can view a merchant's full profile and connections
✅ Admin can suspend or activate a merchant
✅ Admin can monitor sync health and read error logs
✅ Admin can send and track beta invitations
✅ Admin can manage the internal team
```

**Do not start Phase 7 until this checkpoint is fully verified.**

---

## Phase 7 — Frontend: Merchant Dashboard
### Goal: A merchant can connect their store, see their data, and understand their performance.
### Duration: Weeks 12–15

---

### Step 7.1 — Merchant Layout
- Sidebar with navigation (Overview, Connections, Analytics, Settings)
- Header: workspace name, user menu, logout
- Route group `(dashboard)` with its own layout separate from admin

---

### Step 7.2 — Onboarding Wizard
**What:**
A guided 3-step flow shown to every new merchant on first login.

**Why first:**
This is the first thing every merchant sees. If it is broken, nothing else matters.

**Steps:**
```
Step 1: Connect your store (Salla or Zid)
Step 2: Connect your ad account (Meta — optional, skippable)
Step 3: You're ready — go to dashboard
```

**Page:** `/onboarding`

---

### Step 7.3 — Connections
**Pages:**
- `/connections` — list of connected stores and ad accounts, status, last sync, add new
- `/connections/[id]` — connection detail: status, sync history, permissions, disconnect button
- `/connections/salla` — Salla OAuth initiation page
- `/connections/zid` — Zid OAuth initiation page
- `/connections/meta` — Meta Ads OAuth + ad account selector

**Key UX detail:**
After OAuth redirect back, show a "Syncing your data..." state with a progress indicator. The merchant should not see an empty dashboard.

---

### Step 7.4 — Overview Dashboard
**Page:** `/overview`

**Widgets:**
- Total revenue (current period vs previous period, % change)
- Total orders (same comparison)
- Average order value (same comparison)
- Top product (name + revenue)
- Connection status cards (Salla ✅ / Meta ✅)
- Recent orders (last 5)
- Period selector: today / 7 days / 30 days / custom

---

### Step 7.5 — Sales Analytics
**Pages:**

`/analytics/sales`
- Revenue over time (line chart)
- Orders over time (bar chart)
- AOV over time
- Period selector + platform filter (if multiple stores connected)

`/analytics/orders`
- Paginated orders table: order ID, date, customer, total, status
- Filters: status, date range, platform

`/analytics/orders/[id]`
- Order detail: line items, customer info, platform, status history

`/analytics/products`
- Top products table: name, units sold, revenue
- Sortable by revenue or units

`/analytics/customers`
- New vs returning chart
- Top customers by spend table

---

### Step 7.6 — Ads Analytics
**Page:** `/analytics/ads`
- Campaign table: name, spend, clicks, impressions, ROAS
- Total spend vs total revenue (side by side — not attributed)
- Period selector
- Platform filter (Meta only in MVP)
- Disclaimer: "ROAS shown is total revenue ÷ total spend for the selected period. It does not represent per-ad attribution."

---

### Step 7.7 — Settings
**Pages:**

`/settings/profile`
- Name, email, change password form

`/settings/workspace`
- Workspace name, timezone, currency selector

`/settings/team`
- Team members list with roles (Owner / Viewer)
- Invite by email form
- Remove member button (Owner only)

`/settings/subscription`
- Current plan name
- Renewal date
- Beta notice: "You are on a beta plan — billing starts after beta period"

---

## Phase 8 — QA & Beta Preparation
### Goal: The product is stable, tested, and ready for real merchants.
### Duration: Week 16

---

### Step 8.1 — End-to-End Testing
Test every critical user flow manually:

```
Merchant flows:
□ Register → receive email → verify → log in
□ Connect Salla → OAuth → sync starts → data appears in dashboard
□ Connect Zid → same flow
□ Connect Meta Ads → campaigns appear in ads page
□ Log out → refresh token expires → redirected to login
□ Invite team member → they log in with Viewer role → cannot change settings

Admin flows:
□ Admin logs in
□ Sees new merchant in list
□ Activates merchant account
□ Sees merchant's connections and sync status
□ Reads error log after a failed sync
□ Sends beta invitation → merchant receives email
```

---

### Step 8.2 — Error Handling Audit
Go through every page and verify:
- Loading state shows Skeleton (not blank page)
- Error state shows EmptyState with retry button
- Empty state shows correct empty message
- API errors show the correct translated message

---

### Step 8.3 — Performance Baseline
- Largest Contentful Paint < 2.5s on overview page
- API response time < 500ms for analytics endpoints
- Sync job completes within reasonable time for a store with 1000 orders

---

### Step 8.4 — Security Review
```
□ All routes are protected — unauthenticated requests return 401
□ Merchant A cannot access Merchant B's data (test this explicitly)
□ Admin routes return 403 for merchant tokens
□ Tokens are not exposed in logs
□ Refresh tokens are hashed in DB
□ All sensitive actions are in audit_log
```

---

### Step 8.5 — Production Deployment
```
□ Docker Compose production config written
□ Environment variables set on VPS
□ SSL certificate configured (Let's Encrypt)
□ Database backup scheduled
□ Redis persistence configured
□ GitHub Actions deploy pipeline tested
□ Health check endpoint monitored
```

---

### Step 8.6 — Beta Merchant Onboarding
```
□ Send invitations to 5–10 selected merchants
□ Each merchant onboarded with manual assistance (not self-serve)
□ Feedback collected after first week
□ Critical bugs fixed before wider rollout
```

---

## ✅ MVP Complete — Final Checklist

```
Infrastructure
□ Monorepo running with single pnpm dev command
□ Docker Compose starts PostgreSQL + Redis
□ GitHub Actions runs on every PR
□ VPS deployed with SSL

Backend
□ Auth (register, login, refresh, logout, password reset)
□ Salla OAuth + data sync (orders, products, customers)
□ Zid OAuth + data sync
□ Meta Ads OAuth + campaign sync
□ Analytics endpoints (sales + ads)
□ Admin endpoints (merchants, system, subscriptions, invitations, team)
□ BullMQ jobs running reliably with retry
□ Audit log capturing sensitive actions
□ All errors return translation keys

Frontend
□ Admin Panel fully functional
□ Merchant auth pages
□ Onboarding wizard
□ Connections (Salla + Zid + Meta)
□ Overview dashboard
□ Sales analytics (sales, orders, products, customers)
□ Ads analytics
□ Settings (profile, workspace, team, subscription)
□ All three states handled everywhere (loading, error, empty)
□ RTL layout correct throughout

Quality
□ No TypeScript any
□ No console.log in production
□ No hardcoded error text
□ Security: tenant isolation verified
□ Performance baseline met
□ 5–10 beta merchants onboarded
```

---

## Dependency Map — What Blocks What

```
Phase 0 (Foundation)
    └── blocks everything

Phase 1 (Auth & Core)
    └── blocks Phase 2, 3, 4

Phase 2 (Commerce)
    └── blocks Phase 7.4, 7.5 (dashboard data)

Phase 3 (Ads)
    └── blocks Phase 7.6 (ads analytics)

Phase 4 (Admin APIs)
    └── blocks Phase 6 (Admin Panel UI)

Phase 5 (Frontend Foundation)
    └── blocks Phase 6 and 7

Phase 6 (Admin Panel)
    └── blocks Phase 8 (need admin to manage beta merchants)

Phase 7 (Merchant Dashboard)
    └── blocks Phase 8

Phase 6 and Phase 7 CAN run in parallel
if you have two frontend developers.
```

---

*Last updated: November 2026*
