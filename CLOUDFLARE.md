# Running on Cloudflare Workers + D1

This fork runs the Reviewskits API and admin dashboard as a single Cloudflare Worker (`apps/server`), with D1 in place
of Postgres. Changes from upstream:

- **Database:** Drizzle schema ported to `sqlite-core` (uuids as text, timestamps as unix ms, JSON as text).
  Migrations live in `apps/server/migrations` and are applied with `wrangler d1 migrations apply`.
- **Queries:** Postgres-only SQL (`NOW() - INTERVAL`, `date_trunc`, `::integer`, `arrayContains`) replaced with
  SQLite equivalents; the rate limiter is a single atomic upsert (D1 has no interactive transactions).
- **Auth:** better-auth on the D1 adapter, with PBKDF2 (WebCrypto) password hashing so sign-in stays inside Workers
  CPU limits. Single-owner install: the first account becomes the admin and later sign-ups are refused.
- **Submissions:** `POST /api/v1/public/reviews` requires the `x-submit-secret` header (`SUBMIT_SECRET`), so reviews
  can only arrive through a trusted server that has already verified the reviewer (for example, a verified purchase).
- **Email:** nodemailer can't run on Workers, so email notifications are off; new reviews appear in the dashboard.
- **Serving:** the admin build (`apps/admin/dist`) is served as static assets by the same Worker; `/api/*`, `/doc`
  and `/ui` reach the API.

Local check: `apps/server/scripts/e2e-cloudflare.sh` (starts `wrangler dev` on local D1 and runs 20 checks).

Licensed AGPL-3.0, like upstream.
