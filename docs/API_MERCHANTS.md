# Merchant Workspace and Team API

**Audience:** API consumers and frontend integrators  
**Status:** Implemented  
**Base URL (local):** `http://localhost:4000`

All successful responses use `{ "success": true, "data": ... }`. Protected routes require `Authorization: Bearer <accessToken>`.

## MVP account and workspace rules

- A `User` is a login identity; a `Merchant` is a business workspace.
- A merchant user has at most one workspace membership in the MVP. Signup without an invitation creates a workspace and its single `OWNER` membership. Admin users are global and have no workspace membership.
- A workspace may have one owner and multiple `VIEWER` members. Invitations can grant only `VIEWER`; ownership transfer is not available.
- Owners may change the workspace name and manage invitations and members. Viewers may read the workspace and team but cannot change settings or manage the team.
- New invitees register using the invitation token and verify their email; this creates a viewer membership without creating a second workspace. An existing, verified user with no membership accepts an invitation through `/auth/accept-invitation`.
- A user already assigned to a workspace cannot accept another workspace invitation in the MVP. Multi-workspace access for agencies is deferred.
- Invitations expire after seven days. The raw token is sent only by email; the database stores its SHA-256 hash. Creating invitations is limited to 10 requests per minute per client IP; resending is limited to 5 per minute.

## Endpoints

| Method | Path | Permission | Purpose | Success status |
|---|---|---|---|---:|
| `GET` | `/merchants/me` | Owner or viewer | Get the caller's workspace and membership | `200` |
| `PATCH` | `/merchants/me` | Owner | Rename the workspace | `200` |
| `GET` | `/merchants/me/team` | Owner or viewer | List workspace members | `200` |
| `GET` | `/merchants/me/team/invitations` | Owner | List pending and expired, non-revoked invitations | `200` |
| `POST` | `/merchants/me/team/invitations` | Owner | Invite an email as a viewer | `201` |
| `POST` | `/merchants/me/team/invitations/:invitationId/resend` | Owner | Rotate the token and resend an invitation | `200` |
| `DELETE` | `/merchants/me/team/invitations/:invitationId` | Owner | Revoke a pending invitation | `200` |
| `DELETE` | `/merchants/me/team/:membershipId` | Owner | Remove a viewer and revoke their refresh sessions | `200` |

All request bodies are JSON. The workspace name is trimmed and limited to 120 characters.

```json
// PATCH /merchants/me
{ "name": "Example Business" }
```

```json
// POST /merchants/me/team/invitations
{ "email": "teammate@example.com" }
```

Invitation creation returns the invitation metadata, never the raw token. The invitation link is emailed to the recipient. A new recipient submits its token during registration:

```json
// POST /auth/register (invitee)
{
  "name": "Team Member",
  "email": "teammate@example.com",
  "password": "A-strong-test-password",
  "invitationToken": "<token-from-invitation-link>"
}
```

The invitee then follows the regular email-verification flow. For an existing, verified user who currently has no workspace membership:

```json
// POST /auth/accept-invitation
{
  "email": "teammate@example.com",
  "password": "Their-current-password",
  "invitationToken": "<token-from-invitation-link>"
}
```

Successful acceptance creates the viewer membership and starts a session. Existing users who already have a membership receive a conflict; accounts are never silently transferred between workspaces.

## Response data

`GET /merchants/me` returns the caller's safe user fields, workspace fields, and membership role. `GET /merchants/me/team` returns an array of membership records with safe user fields (`id`, `email`, and `name`); it does not return credentials or token data.

Invitation list/create/resend responses include `id`, `email`, `role`, `expiresAt`, and `createdAt`. Pending invitations can be revoked or resent. Resending rotates the token and renews the seven-day expiry; the previous link stops working.

## Authorization and errors

Every merchant route resolves the caller's membership. Team operations are scoped to that caller's workspace; a caller cannot act on a membership or invitation from another workspace. Removing the owner is prohibited. Removing a viewer revokes their refresh tokens; the removed user's existing access token cannot resolve a workspace membership.

| Status | Error key | Meaning |
|---:|---|---|
| `401` | `errors.auth.unauthorized` | Missing or invalid access token |
| `403` | `errors.merchant.owner_required` | The action is owner-only |
| `403` | `errors.merchant.workspace_suspended` | The workspace is not active |
| `404` | `errors.merchant.not_found` | The caller has no workspace membership |
| `404` | `errors.merchant.member_not_found` | The target member is not in the caller's workspace |
| `404` | `errors.merchant.invitation_not_found` | The invitation is not pending in the caller's workspace |
| `409` | `errors.merchant.user_already_assigned` | The invitee already belongs to a workspace |
| `409` | `errors.merchant.existing_account_invitation_required` | Use the existing-account acceptance flow; accounts are not transferred |
| `409` | `errors.merchant.invitation_already_pending` | A live invitation already exists for that email |
| `409` | `errors.merchant.owner_cannot_be_removed` | Workspace ownership cannot be removed |
| `400` | `errors.merchant.invitation_invalid_or_expired` | Token is invalid, expired, revoked, or already used |
| `400` | `errors.merchant.invitation_token_required` | A pending invitee must include the invitation token during registration |
| `503` | `errors.auth.email_delivery_failed` | Invitation email could not be delivered |

See [`API_AUTH.md`](API_AUTH.md) for the shared authentication, cookie, CORS, and OTP contract.
