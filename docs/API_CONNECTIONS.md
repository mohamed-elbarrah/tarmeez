# Salla Connections and Commerce Sync API

**Status:** Salla Custom Mode OAuth and background commerce import. Salla production use requires explicit Custom Mode approval in the Salla Partner Portal. Tarmeez reads store data for analytics and does not write changes back to Salla.

Each connection is owned by the user who completes authorization and belongs to exactly one Tarmeez merchant workspace. The workspace owner starts and disconnects a connection; workspace members can read connection status and imported data through workspace-scoped endpoints.

## API endpoints

| Method | Path | Who | Purpose |
|---|---|---|---|
| `POST` | `/connections/salla/start` | Workspace owner | Creates a 15-minute OAuth intent and returns `authorizationUrl`. |
| `GET` | `/connections/salla/callback` | Salla redirect | Consumes the one-time state, exchanges the code, and redirects to the web result page. |
| `GET` | `/connections/salla/intents/:intentId` | Workspace member | Reads safe authorization status. |
| `POST` | `/webhooks/salla/app-events` | Salla webhook | Verifies and processes authorization updates and store events. No Tarmeez JWT. |
| `GET` | `/connections` | Workspace member | Lists connected stores without credentials. |
| `POST` | `/connections/:connectionId/sync` | Workspace owner | Queues an initial or manual sync. |
| `GET` | `/connections/:connectionId/sync-runs` | Workspace member | Lists recent sync runs. |
| `GET` | `/connections/:connectionId/products?page=1&perPage=25` | Workspace member | Lists imported products. |
| `GET` | `/connections/:connectionId/customers?page=1&perPage=25` | Workspace member | Lists imported customers. |
| `GET` | `/connections/:connectionId/orders?page=1&perPage=25` | Workspace member | Lists imported orders and line items. |
| `DELETE` | `/connections/:connectionId` | Workspace owner | Disconnects the store and clears saved credentials. |

Protected endpoints require `Authorization: Bearer <TARMEEZ_ACCESS_TOKEN>`. The start request body is empty:

```http
POST /connections/salla/start
Authorization: Bearer <TARMEEZ_ACCESS_TOKEN>
Content-Type: application/json
```

```json
{}
```

The response contains an intent ID, exact Salla authorization URL, and expiry:

```json
{
  "success": true,
  "data": {
    "intentId": "<intent-id>",
    "authorizationUrl": "https://accounts.salla.sa/oauth2/auth?...",
    "expiresAt": "<ISO timestamp>"
  }
}
```

## One-click Custom Mode flow

1. Set `SALLA_ENABLED=true` only after the Salla production Custom Mode approval is confirmed.
2. The workspace owner clicks Connect. Tarmeez creates a short-lived intent, stores only a hash of a random state value, and returns `authorizationUrl`.
3. The browser opens that URL. The request includes `response_type=code`, `offline_access`, the exact configured redirect URI, and the state value. Grant only the required read-only product, customer, and order scopes in the Partner Portal.
4. Salla redirects to `SALLA_REDIRECT_URI` with `code`, `state`, or a provider error. The API consumes the state once, exchanges the code server-side, retrieves the Salla store identity, encrypts access and refresh tokens, and records the connection against the initiating user and workspace.
5. The callback redirects to the frontend result route with only `intentId` and a safe status. The UI polls the intent endpoint; credentials and provider errors are never returned to the browser.
6. A completed connection queues the initial products, customers, and orders import. Poll sync runs until `SUCCEEDED` or `FAILED`.

Connection creation, reauthorization, and disconnect audit rows are written in the same database transaction as their credential mutation; an audit failure rolls back that mutation. Webhook and system audit telemetry is allowlisted, tenant-scoped, and best-effort.

State is random, hashed at rest, single-use, short-lived, and bound to the initiating workspace/user. The callback must use the exact redirect URI registered in Salla; do not accept a callback URI, workspace, or store URL from the browser. Never log authorization codes, access tokens, refresh tokens, client secrets, webhook secrets, or encryption keys.

## Webhooks

Configure the app-events URL as `https://<api-host>/webhooks/salla/app-events`. Configure the same Token security secret in Salla and `SALLA_WEBHOOK_SECRET`, or configure Salla Signature delivery if enabled by the Partner Portal. The API validates the raw request before acknowledging it. Invalid signatures return 401 so Salla can retry.

Authorization update events can refresh a connection's token pair. Product, customer, and order events queue a resource resync for the matching store. Durable Salla event IDs are exact dedupe keys; events without an event ID receive a unique fallback and are not treated as idempotent, so periodic reconciliation remains required. Unknown stores and unsupported events are acknowledged without exposing internal details. Webhook delivery is Salla's responsibility to retry; Tarmeez should also run periodic reconciliation because no webhook system guarantees delivery. Current event handling performs a paginated resource resync rather than a targeted record fetch, so verify current Salla payloads, event names, rate limits, and detail endpoints before optimizing it.

## Tokens and failure recovery

`SALLA_TOKEN_ENCRYPTION_KEY` is a base64-encoded 32-byte key used for AES-256-GCM token storage. `SALLA_CLIENT_SECRET`, `SALLA_WEBHOOK_SECRET`, and the encryption key are separate values. `offline_access` is required so workers can refresh access without user interaction. Refresh tokens may be single-use; the worker serializes refreshes with a database lease and stores the complete renewed token pair.

If authorization is denied, the code is missing, state is invalid/expired, or the provider exchange fails, the intent becomes `FAILED` with a safe failure code. The user can start a new intent. If refresh fails or Salla revokes access, mark the connection `REAUTH_REQUIRED`, preserve imported analytics data, and have the workspace owner run the one-click flow again. If initial queueing fails after credentials are stored, retry the sync; do not repeat OAuth unless the connection requires reauthorization. Disconnect clears credentials but does not delete imported data.

## Configuration

In `apps/api/.env`, configure the following. Keep `SALLA_ENABLED=false` until setup and approval are complete:

```env
SALLA_ENABLED=false
SALLA_REDIRECT_URI=http://localhost:4000/connections/salla/callback
SALLA_CLIENT_ID=<OAuth client ID>
SALLA_CLIENT_SECRET=<OAuth client secret>
SALLA_TOKEN_ENCRYPTION_KEY=<base64-encoded 32-byte key>
SALLA_WEBHOOK_SECRET=<Salla Token security secret>
```

Generate the encryption key with `openssl rand -base64 32`. In production, the redirect URI must be HTTPS and must exactly match the Partner Portal registration. When enabled, all five Salla settings are required. Production may run with Salla disabled.

## Salla Partner Portal setup

1. Create or select the Salla app and choose **Custom Mode**. Confirm Salla has approved Custom Mode for the production app; approval is an explicit release requirement, not an assumption based on local testing.
2. Register the exact callback, for example `https://api.example.com/connections/salla/callback`. Register the webhook URL `https://api.example.com/webhooks/salla/app-events`.
3. Configure OAuth client ID and secret. The current authorization request includes `offline_access`; grant only the approved read-only product, customer, and order scopes in the Partner Portal. Do not grant write scopes.
4. Configure app-event delivery, select the supported product, customer, and order store events, and copy the Token security secret to `SALLA_WEBHOOK_SECRET`.
5. Generate a separate encryption key and deploy it as `SALLA_TOKEN_ENCRYPTION_KEY`. Apply database migrations before enabling the flag.
6. Test with a Salla demo store. Log in as a Tarmeez workspace owner, complete the browser flow, confirm the callback result and `CONNECTED` status, run an `ALL` sync, and verify a subsequent store event queues a safe resync.

For local testing, expose the API through a public HTTPS tunnel because Salla cannot reach localhost. Use the exact tunnel callback and webhook URLs temporarily, then replace them before production.

## Import contract

Queue all resources with `{ "resource": "ALL" }`, or one of `PRODUCTS`, `CUSTOMERS`, and `ORDERS`. Jobs are processed by BullMQ and upsert on `(connectionId, externalId)`, making retries safe against duplicates. Poll `/connections/:connectionId/sync-runs`; inspect only safe error keys/messages. Customer email and phone are personal data and require retention, deletion, and access controls before production collection.

## References

Salla Merchant API base URI: `https://api.salla.dev/admin/v2`. Verify current endpoint fields, pagination, OAuth scopes, Custom Mode approval requirements, App Events, and Webhooks documentation before production changes.
