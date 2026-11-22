# Admin API

**Status:** First admin dashboard endpoint implemented. Admin users are global accounts and do not belong to merchant workspaces.

## List merchant users

`GET /admin/users` returns merchant-role users (including invited viewers) with safe workspace information when they have a workspace. It excludes admin accounts and never returns password hashes or session tokens. Unverified signups may have `workspace: null` until signup is completed.

```http
GET http://localhost:4000/admin/users?page=1&perPage=25&search=ali
Authorization: Bearer <ADMIN_ACCESS_TOKEN>
```

Query parameters:

- `page`: 1-based page number; defaults to `1`.
- `perPage`: 1–100; defaults to `25`.
- `search`: optional substring search over user name and email, max 100 characters.

Example response:

```json
{
  "success": true,
  "data": [
    {
      "id": "<user-id>",
      "email": "merchant@example.com",
      "name": "Example Merchant",
      "role": "MERCHANT",
      "status": "ACTIVE",
      "emailVerifiedAt": "<ISO timestamp>",
      "createdAt": "<ISO timestamp>",
      "workspace": {
        "id": "<workspace-id>",
        "name": "Example Store",
        "status": "ACTIVE",
        "membershipRole": "OWNER",
        "createdAt": "<ISO timestamp>"
      }
    }
  ],
  "meta": { "total": 1, "page": 1, "perPage": 25, "totalPages": 1 }
}
```

This endpoint requires a valid Tarmeez access token for a user with `role: "ADMIN"`. A merchant token receives `403`; a missing/invalid token receives `401`.

## Create the first admin

From the repository root, run:

```bash
pnpm --filter api admin:bootstrap
```

The interactive command asks for the admin email, name, and password (minimum 12 characters). It creates a verified global admin without a workspace and permits only one admin account. Then log in through `POST /auth/login` and use the returned `data.accessToken` as the Bearer token above.
