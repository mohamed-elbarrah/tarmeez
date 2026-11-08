# Salla connections and commerce sync API

**Status:** Salla Easy Mode connection and first background-import implementation. Tested connection authorization with a demo store. Product, customer, and order import uses BullMQ workers; live store-event resync still requires verification against Salla's endpoint/event payloads. This feature supplies data to Tarmeez analytics; it does not write changes back to Salla.

All records and credentials belong to the Tarmeez **Merchant workspace**. Owners can start connections and syncs; workspace members can read connections, sync status, and imported data. Every query is scoped to the caller's workspace.

## API endpoints

Local API base URL: `http://localhost:4000`. Successful responses use `{ "success": true, "data": ... }`; paginated data also includes `meta`.

| Method | Path | Who | What it does |
|---|---|---|---|
| `POST` | `/connections/salla/start` | Workspace owner | Starts a 15-minute Salla install intent. |
| `POST` | `/webhooks/salla/app-events` | Salla webhook | Receives authorization and supported store events. No Tarmeez JWT. |
| `GET` | `/connections` | Workspace member | Lists connected stores without credentials. |
| `POST` | `/connections/:connectionId/sync` | Workspace owner | Queues an initial/manual sync. Defaults to all resource types. |
| `GET` | `/connections/:connectionId/sync-runs` | Workspace member | Lists up to 20 recent sync runs. |
| `GET` | `/connections/:connectionId/products?page=1&perPage=25` | Workspace member | Lists imported products. |
| `GET` | `/connections/:connectionId/customers?page=1&perPage=25` | Workspace member | Lists imported customers. |
| `GET` | `/connections/:connectionId/orders?page=1&perPage=25` | Workspace member | Lists imported orders and line items. |
| `DELETE` | `/connections/:connectionId` | Workspace owner | Disconnects the store and clears saved tokens. |

Protected endpoints require:

```http
Authorization: Bearer <TARMEEZ_ACCESS_TOKEN>
```

### Start/authorize the Salla connection

```http
POST /connections/salla/start
Content-Type: application/json
Authorization: Bearer <TARMEEZ_ACCESS_TOKEN>
```

```json
{ "storeUrl": "https://demostore.salla.sa" }
```

Use the store's storefront domain. The implementation matches the Salla identity hostname to this value; a temporary signed demo URL works because only its hostname is used, but the base domain is preferred. The caller must be the workspace owner.

Example response:

```json
{
  "success": true,
  "data": {
    "intentId": "<intent-id>",
    "installationUrl": "https://s.salla.sa/apps/install/<SALLA_APP_ID>",
    "expiresAt": "<ISO timestamp>"
  }
}
```

Open `installationUrl` in a browser and approve the app on that store before the intent expires (15 minutes). Salla sends `app.store.authorize` to the configured app-event webhook. The API verifies Salla's Token security header, uses the provided access token to call the OAuth User Info endpoint, matches the verified store domain to the pending intent, and saves an encrypted credential plus store identity. A repeated authorization event updates the existing connection's token pair.

### Start an import

Queue all three resources:

```http
POST /connections/<connectionId>/sync
Authorization: Bearer <TARMEEZ_ACCESS_TOKEN>
Content-Type: application/json
```

```json
{ "resource": "ALL" }
```

Or queue one resource:

```json
{ "resource": "PRODUCTS" }
```

Allowed values are `ALL`, `PRODUCTS`, `CUSTOMERS`, and `ORDERS`. The request queues a BullMQ job and returns without waiting for the import:

```json
{
  "success": true,
  "data": {
    "syncRunId": "<run-id>",
    "resource": "ALL",
    "status": "QUEUED",
    "createdAt": "<ISO timestamp>"
  }
}
```

Only one worker processes a queue job at a time per worker process. The worker fetches pages and upserts on `(connectionId, externalId)`, making a retry safe against duplicate records. `ALL` runs products, customers, then orders. Orders include line items and retain source product/customer IDs even when related records have not yet been imported.

### Monitor the import

```http
GET /connections/<connectionId>/sync-runs
Authorization: Bearer <TARMEEZ_ACCESS_TOKEN>
```

Poll this endpoint until the run is `SUCCEEDED` or `FAILED`. Runs report resource, fetched/upserted counts, cursor, timestamps, and safe error information. A run may be retried by BullMQ after a temporary failure.

### Inspect imported records

```http
GET /connections/<connectionId>/products?page=1&perPage=25
GET /connections/<connectionId>/customers?page=1&perPage=25
GET /connections/<connectionId>/orders?page=1&perPage=25
Authorization: Bearer <TARMEEZ_ACCESS_TOKEN>
```

`page` starts at 1; `perPage` is 1–100 and defaults to 25. Responses include standard pagination metadata. Monetary fields are stored as database decimals; source dates/statuses and source IDs are retained in normalized columns. Customer contact fields are currently persisted; production retention/access rules should be reviewed before collecting real customers.

### Disconnect

```http
DELETE /connections/<connectionId>
Authorization: Bearer <TARMEEZ_ACCESS_TOKEN>
```

This marks the connection disconnected and clears the stored credentials. It does not delete already-imported analytics data; define and implement the product's retention/deletion behavior separately.

## Salla webhook update behavior

Configure app events and the needed **Store Events** in Salla Partners. The webhook URL is `/webhooks/salla/app-events`; use the same Token secret in Salla and `SALLA_WEBHOOK_SECRET`. This endpoint also supports Signature verification when Salla sends `X-Salla-Signature`; raw request bytes are enabled in NestJS for this purpose.

Recognized store event families are orders, products, and customers. The API maps them to their resource and queues a resource resync for the matching connected store. Duplicate events for the same store/resource are coalesced within a one-minute window. Salla retries failed webhook delivery, so the endpoint validates before acknowledging and queue failures return a non-2xx response for retry.

**Current limitation:** a store event currently causes a paginated resync of that resource rather than a targeted single-record fetch. Confirm Salla's current event payloads, supported event names, detail endpoints, update filters, and rate-limit behavior before production; then replace broad resyncs with targeted upserts or documented incremental queries where possible. A periodic reconciliation sync is still recommended to recover missed events.

## Setup and end-to-end test

### 1. Configure API environment

In `apps/api/.env`, configure:

```env
SALLA_APP_ID=<app ID from Salla Partners>
SALLA_WEBHOOK_SECRET=<Token secret configured in Salla>
SALLA_TOKEN_ENCRYPTION_KEY=<base64-encoded 32-byte key>
SALLA_CLIENT_ID=<OAuth client ID>
SALLA_CLIENT_SECRET=<OAuth client secret>
```

Generate the encryption key with `openssl rand -base64 32`. It encrypts access/refresh tokens at rest. OAuth client credentials are needed to refresh tokens; never expose them to the frontend or commit them. `SALLA_WEBHOOK_SECRET` is not the OAuth Client Secret.

### 2. Apply migrations and run services

From the repository root, apply migrations to the database you will test against:

```bash
pnpm --filter api exec prisma migrate deploy
```

This creates connection, sync-run, product, customer, order, and order-item tables. Ensure PostgreSQL and Redis are running, then start the API:

```bash
pnpm --filter api dev
```

Check local API health: `curl -i http://localhost:4000/health`.

### 3. Expose the local API

Run a public HTTPS tunnel to local port 4000 and keep it running. Check `https://<CURRENT-TUNNEL-HOST>/health`. If the tunnel URL expires/changes, update Salla's webhook URL. Salla cannot reach `localhost`.

### 4. Configure Salla Partners

- Set app webhook URL to `https://<CURRENT-TUNNEL-HOST>/webhooks/salla/app-events`.
- Select Token security if Signature is unavailable, set its secret, and copy it to `SALLA_WEBHOOK_SECRET`.
- Enable the Easy Mode app authorization event and select the currently supported Store Events for product, order, and customer changes.
- Grant only the required read scopes. Confirm their exact names in the Partner Portal/API documentation; do not grant write scopes for this read-only analytics integration unless Salla requires them.
- Use a Salla demo store for testing.

### 5. Test with EchoAPI and a browser

1. In EchoAPI, `POST http://localhost:4000/auth/login` with the merchant owner's email/password. Copy `data.accessToken`.
2. In EchoAPI, `POST http://localhost:4000/connections/salla/start`, with `Authorization: Bearer <token>` and body `{ "storeUrl": "https://<demo-store-domain>" }`.
3. Open `data.installationUrl` in a browser and approve the app. If it is already installed, uninstall it from the demo store's Installed Apps, then start a fresh intent and install again.
4. Confirm the tunnel shows a successful `POST /webhooks/salla/app-events` and `GET /connections` shows `status: CONNECTED`.
5. Start import with `POST /connections/<id>/sync` and body `{ "resource": "ALL" }`.
6. Poll `GET /connections/<id>/sync-runs`. When status is `SUCCEEDED`, inspect each dataset using the products/customers/orders GET routes above.
7. Change a product, customer, or order in the demo store if possible, then confirm Salla delivers the configured Store Event and a new sync run is queued. Verify the imported row is updated, not duplicated.

## Failure handling and known limits

- **503 on connection start:** check `SALLA_APP_ID` and restart the API.
- **Webhook 401:** verify Salla's Token setting, the `Authorization` header, and exact `SALLA_WEBHOOK_SECRET` match.
- **Webhook delivered but no connection:** the intent may have expired, or the identity hostname may not match the submitted store URL.
- **Sync run FAILED:** inspect `errorKey`/`errorMessage` and the API logs. Check scopes, token validity, Redis, Salla rate limits, and the actual endpoint response shape.
- **Token refresh:** refresh tokens are single-use. The worker uses a database lease to serialize refreshes; set OAuth client credentials. Salla may also send renewed token pairs through app authorization/update events.
- **Privacy:** customer email/phone are personal data. Define data minimization, retention, deletion, and access policies before production.
- **Analytics:** these tables are the source facts, not final reports. Define metric semantics for cancelled/refunded orders, status history, currencies, timezone, discounts, and line-item variants before computing KPIs.

## Salla API references

Salla Merchant API base URI is `https://api.salla.dev/admin/v2`; calls use `Authorization: Bearer <ACCESS_TOKEN>`. See the official endpoint pages for [Products](https://docs.salla.dev/api-5394168), [Orders](https://docs.salla.dev/api-5394146), [Customers](https://docs.salla.dev/api-5394121), [App Events](https://docs.salla.dev/doc-421413), and [Webhooks](https://docs.salla.dev/doc-421119). Endpoint-specific response fields and pagination should be verified against those current pages and a demo-store response before production use.
