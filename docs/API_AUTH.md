# Authentication API

**Audience:** API consumers and frontend integrators  
**Status:** Implemented  
**Base URL (local):** `http://localhost:4000`

This guide documents the current backend behavior. All successful responses use the standard `{ "success": true, "data": ... }` envelope. Errors use `{ "success": false, "error": ... }`.

## Integration flow

1. Create a merchant account with `POST /auth/register`.
2. Read the six-digit signup code from email and submit it to `POST /auth/verify-email`.
3. Verification completes signup and returns an access token. The API sets the refresh-token cookie.
4. Send the access token as a bearer token to protected endpoints.
5. When the access token expires, call `POST /auth/refresh`; the API rotates the refresh cookie and returns a new access token.

Users can also start a session with `POST /auth/login`. Password reset uses `POST /auth/forgot-password` followed by `POST /auth/reset-password`.

## Session and browser requirements

- **Access token:** JWT returned in the response body. By default it expires after 15 minutes. Send it as `Authorization: Bearer <accessToken>`.
- **Refresh token:** Opaque token stored by the API as a hash and sent only in the `tarmeez_refresh` cookie. The cookie is `HttpOnly`, scoped to `/auth`, and expires after 7 days by default. It is not returned in JSON and is not readable by browser JavaScript.
- Login, signup verification, and refresh set or rotate the cookie. Logout and successful password reset clear it. Session responses use `Cache-Control: no-store`.
- Refresh rotates the token. Reusing a previously rotated token invalidates the active tokens in that token family; the user must log in again.
- Browser clients must send requests with credentials enabled (for example, `credentials: 'include'`). Keep access tokens in memory where practical; do not attempt to read or persist the refresh token.
- CORS allows the single origin configured by `FRONTEND_URL`; credentials are enabled. Origins are not wildcarded. Cookie-authenticated requests with an `Origin` header must match that configured origin. Requests without an `Origin` header are accepted for non-browser clients such as Postman.
- `SameSite` defaults to `Lax`. For cross-site deployments, configure `AUTH_COOKIE_SAME_SITE=none`; the API then sets `Secure`. Production also always sets `Secure`.

## Endpoints

| Method | Path | Purpose | Success status |
|---|---|---|---:|
| `POST` | `/auth/register` | Register a merchant and send a signup OTP | `200` |
| `POST` | `/auth/verify-email` | Verify signup OTP and sign in | `200` |
| `POST` | `/auth/login` | Sign in a verified, active account | `200` |
| `POST` | `/auth/refresh` | Rotate refresh token and issue a new access token | `200` |
| `POST` | `/auth/logout` | Revoke refresh token and clear cookie | `200` |
| `POST` | `/auth/forgot-password` | Request a password-reset OTP | `200` |
| `POST` | `/auth/reset-password` | Set a new password using a reset OTP | `200` |
| `GET` | `/auth/me` | Return the authenticated principal | `200` |

### Request bodies

All request bodies are JSON. Email addresses are trimmed and normalized to lowercase.

```json
// POST /auth/register
{
  "name": "Test Merchant",
  "email": "merchant@example.com",
  "password": "A-strong-test-password"
}
```

`name` is required and limited to 120 characters. Passwords must contain at least 8 characters and be no more than 72 UTF-8 bytes.

```json
// POST /auth/verify-email
{
  "email": "merchant@example.com",
  "code": "123456"
}
```

The signup code is exactly six digits. Signup verification and password-reset codes expire after 10 minutes by default, allow up to 5 attempts, and have a 60-second resend cooldown. These values are configurable.

```json
// POST /auth/login
{
  "email": "merchant@example.com",
  "password": "A-strong-test-password"
}
```

`POST /auth/refresh` and `POST /auth/logout` have no JSON body; send the `tarmeez_refresh` cookie.

```json
// POST /auth/forgot-password
{
  "email": "merchant@example.com"
}
```

```json
// POST /auth/reset-password
{
  "email": "merchant@example.com",
  "code": "123456",
  "newPassword": "A-new-strong-password"
}
```

The new password follows the same length rules as registration. A successful reset revokes all refresh-token sessions for the account; existing access tokens remain valid until they expire.

### Success responses

Registration returns the same response shape whether or not an account already exists. An OTP is sent only when appropriate; use the code delivered to the mailbox.

```json
{
  "success": true,
  "data": {
    "emailVerificationRequired": true,
    "messageKey": "success.auth.verification_code_sent"
  }
}
```

Verification and login return an access token and safe user fields. The refresh cookie is delivered separately through `Set-Cookie`.

```json
{
  "success": true,
  "data": {
    "accessToken": "<access-token>",
    "user": {
      "id": "<user-id>",
      "email": "merchant@example.com",
      "name": "Test Merchant",
      "role": "MERCHANT"
    }
  }
}
```

Password-reset requests intentionally return the same response for existing and non-existing accounts:

```json
{
  "success": true,
  "data": {
    "messageKey": "success.auth.password_reset_code_sent"
  }
}
```

Logout returns `{"success":true,"data":{"messageKey":"success.auth.logged_out"}}`. Successful password reset returns `{"success":true,"data":{"messageKey":"success.auth.password_reset"}}`.

`GET /auth/me` requires a bearer token and currently returns `{ "id": "<user-id>", "role": "MERCHANT" }` inside `data`.

### Authentication and error responses

For protected routes, send:

```http
Authorization: Bearer <accessToken>
```

Errors use this envelope; `details` is included when available:

```json
{
  "success": false,
  "error": {
    "key": "errors.auth.invalid_credentials",
    "statusCode": 401
  }
}
```

Common auth errors:

| Status | Error key | Meaning |
|---:|---|---|
| `400` | `errors.auth.invalid_or_expired_otp` | OTP is invalid, expired, or already used |
| `401` | `errors.auth.invalid_credentials` | Credentials are wrong, or account cannot sign in |
| `401` | `errors.auth.invalid_refresh_token` | Refresh cookie is missing, invalid, or expired |
| `401` | `errors.auth.refresh_token_reused` | A rotated refresh token was reused; sign in again |
| `401` | `errors.auth.unauthorized` | Missing or invalid access token |
| `403` | `errors.auth.forbidden` | Authenticated user lacks the required role |
| `403` | `errors.auth.origin_not_allowed` | Request origin is not allowed |
| `429` | `errors.auth.otp_attempts_exceeded` | OTP attempt limit was reached |
| `429` | `errors.request.invalid` | Request-rate limit was reached |
| `503` | `errors.auth.email_delivery_failed` | Signup verification email could not be delivered |
| `400` | `errors.request.validation_failed` | Request failed DTO validation |

Auth routes are rate limited per client IP using Redis-backed storage: register, verify-email, login, and reset-password allow 5 requests/minute each; refresh allows 30/minute; forgot-password allows 3/minute. The global API limit is 100 requests/minute. A `429` may indicate either an OTP attempt limit or a request-rate limit.

## Local smoke test

Start the API and local email inbox, then register a new address. Read the OTP from the inbox and verify it; `cookies.txt` stores the refresh cookie for subsequent curl requests.

```bash
API=http://localhost:4000

curl -i -X POST "$API/auth/register" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test Merchant","email":"merchant@example.com","password":"A-strong-test-password"}'

curl -i -c cookies.txt -X POST "$API/auth/verify-email" \
  -H 'Content-Type: application/json' \
  -d '{"email":"merchant@example.com","code":"123456"}'

# Copy accessToken from the verification response.
curl -i "$API/auth/me" \
  -H 'Authorization: Bearer <accessToken>'

# Refresh rotates the cookie in cookies.txt and returns a new access token.
curl -i -b cookies.txt -c cookies.txt -X POST "$API/auth/refresh"

curl -i -b cookies.txt -X POST "$API/auth/logout"
```

## Account and role boundaries

- Public registration creates `MERCHANT` accounts only.
- The first `ADMIN` is provisioned using the operator-run CLI. There is currently no API endpoint for creating or promoting additional admins.
- Suspended or unverified accounts cannot sign in.
