# Store connections API

**Status:** Salla Easy Mode connection implemented and tested with a Salla demo store.  
**Scope:** Authorize one Salla store for a Tarmeez workspace and verify its identity. Product/order import, ongoing sync, and refresh-token rotation are not implemented.

A connection belongs to a **Merchant workspace**, not an individual user. Only workspace owners can start or disconnect a connection; workspace members can list connections. A Salla app event does not contain a Tarmeez workspace ID. To associate it safely, the owner starts a short-lived connection intent with the store's domain; the API matches that domain against the identity retrieved from Salla.

## Endpoints

All routes use the standard response envelope. Local API base URL is `http://localhost:4000`.

| Method | Path | Authentication | Purpose |
|---|---|---|---|
| `POST` | `/connections/salla/start` | Tarmeez bearer token; workspace owner | Create/reuse a 15-minute connection intent and return Salla's app installation URL. |
| `POST` | `/webhooks/salla/app-events` | No Tarmeez token; Salla webhook security | Receive Salla app events. Processes `app.store.authorize` and `app.store.authorized`. |
| `GET` | `/connections` | Tarmeez bearer token; workspace member | List safe connection identity/status for the caller's workspace. |
| `DELETE` | `/connections/:connectionId` | Tarmeez bearer token; workspace owner | Disconnect the workspace's connection and clear its stored credentials. |

### Start a connection

```http
POST /connections/salla/start
Authorization: Bearer <TARMEEZ_ACCESS_TOKEN>
Content-Type: application/json
```

```json
{
  "storeUrl": "https://demostore.salla.sa"
}
```

Use the Salla store's storefront URL/domain, not the Tarmeez URL or a Salla dashboard URL. A temporary signed demo-store URL is also accepted by the current implementation because it matches on the hostname, but prefer the base domain and omit its path/query parameters.

Example success response (`201`):

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

Open `installationUrl` in a browser and approve the app on the intended Salla store before `expiresAt` (15 minutes). The API associates the eventual Salla authorization with the workspace that created the intent only when Salla's verified identity domain matches the requested domain.

### Check status

```http
GET /connections
Authorization: Bearer <TARMEEZ_ACCESS_TOKEN>
```

Example:

```json
{
  "success": true,
  "data": [
    {
      "id": "<connection-id>",
      "platform": "SALLA",
      "externalStoreId": "292438665",
      "storeName": "متجر تجريبي",
      "storeDomain": "https://demostore.salla.sa/...",
      "status": "CONNECTED",
      "connectedAt": "<ISO timestamp>",
      "verifiedAt": "<ISO timestamp>"
    }
  ]
}
```

Tokens are encrypted at rest and never included in API responses. Salla's identity response may include a store URL with a path; matching uses the hostname.

## Local setup and end-to-end testing

### 1. Configure secrets

Set these in `apps/api/.env`:

```env
SALLA_APP_ID=<app ID from Salla Partners>
SALLA_WEBHOOK_SECRET=<secret configured for Salla Token security>
SALLA_TOKEN_ENCRYPTION_KEY=<base64-encoded 32-byte key>
```

Generate the encryption key with:

```bash
openssl rand -base64 32
```

`SALLA_WEBHOOK_SECRET` is the value configured under the Salla app's webhook security secret field. It is **not** the Salla OAuth Client Secret. Do not commit or share these values. Restart the API after changing `.env`.

### 2. Apply the database migration

From the repository root, run once for each database:

```bash
pnpm --filter api exec prisma migrate deploy
```

This creates the store-connection and pending-intent tables. Start the API only after the migration succeeds:

```bash
pnpm --filter api dev
```

The API listens on port `4000`. Check it locally with `curl -i http://localhost:4000/health`.

### 3. Expose the API to Salla

Salla cannot call `localhost`. Start a public HTTPS tunnel to local port `4000`, for example with Pinggy, and keep the tunnel terminal running. Verify the forwarded API responds:

```bash
curl -i https://<CURRENT-TUNNEL-HOST>/health
```

If the tunnel URL changes or expires, use the new URL and update Salla's webhook URL.

### 4. Configure the Salla Partner app

In the Salla Partner app's Webhooks/Notifications settings:

- Set the app webhook URL to `https://<CURRENT-TUNNEL-HOST>/webhooks/salla/app-events`.
- Choose **Token** security if Signature is unavailable.
- Set the security secret and put exactly the same value in `SALLA_WEBHOOK_SECRET`.
- Enable/configure the app events needed for Easy Mode, including `app.store.authorize` if an event selection is shown.
- Configure the minimum scopes needed for store identity. Product and order scopes are not needed for this connection test.

The webhook endpoint verifies Token requests using the `Authorization` header (with an optional `Bearer ` prefix). Signature verification is also supported using `X-Salla-Signature` and the raw request body. The endpoint is public by design; Salla webhook authentication protects it. Successful POSTs return a 2xx response (Nest's default POST status is `201`).

### 5. Run the test with EchoAPI

1. In EchoAPI, log into Tarmeez:

   ```http
   POST http://localhost:4000/auth/login
   Content-Type: application/json
   ```

   ```json
   {
     "email": "<merchant email>",
     "password": "<merchant password>"
   }
   ```

   Copy `data.accessToken`. The account must be the workspace owner to start/disconnect connections.

2. Start the connection:

   ```http
   POST http://localhost:4000/connections/salla/start
   Authorization: Bearer <TARMEEZ_ACCESS_TOKEN>
   Content-Type: application/json
   ```

   ```json
   {
     "storeUrl": "https://<SALLA_DEMO_STORE_DOMAIN>"
   }
   ```

3. Open the returned `data.installationUrl` in a browser. Select the intended demo store and approve the app. If already installed, uninstall it from the demo store's Installed Apps, create a fresh intent, and install/approve again.
4. Confirm the tunnel terminal shows a `POST` to `/webhooks/salla/app-events` with a 2xx status. Salla's webhook log can also confirm delivery.
5. In EchoAPI, call `GET http://localhost:4000/connections` with the same Tarmeez bearer token. A record with `platform: "SALLA"` and `status: "CONNECTED"` confirms success.

The intent expires after 15 minutes; start a new one if it expires. A webhook HTTP 2xx proves the endpoint accepted the request, but check `GET /connections` to confirm that the event was recognized, its identity matched, and the connection was saved.

## Troubleshooting

- **`503` from `/connections/salla/start`:** check `SALLA_APP_ID` in `apps/api/.env`, then restart the API.
- **No public `/health` response:** confirm the API is running on port 4000 and the tunnel points to that port.
- **No webhook request in the tunnel:** check the exact Salla webhook URL, tunnel uptime, and Salla webhook delivery log.
- **Webhook returns `401`:** confirm Salla uses Token security and its configured secret exactly matches `SALLA_WEBHOOK_SECRET`.
- **Webhook arrives but no connection appears:** start a fresh intent, ensure its store domain is correct and not expired, and inspect the API response/logs. The event's access token must allow the Salla User Info request, and that identity must contain a matching store domain.
- **App is already installed:** uninstall it from the demo store's Installed Apps, then create a new intent and reinstall from the new `installationUrl`.

## Not implemented yet

- Product/order/customer synchronization and background jobs.
- Salla refresh-token rotation. Salla refresh tokens are single-use; implement serialized refresh before relying on connections beyond the access-token lifetime.
- Salla revocation/uninstall event handling and automated reauthorization status updates.
- Easy Mode lifecycle testing on multiple concurrent stores/workspaces and production publication review.
