# Deploying on Dokploy

One Contabo VPS runs two Dokploy compose projects from `infra/dokploy/compose.yml`:
`dax-staging` and `dax-prod`. They share nothing: separate databases, volumes, secrets and
(from the files milestone) separate R2 buckets. Staging only ever holds fake data.

## Environment variables (set per project in the Dokploy UI)

| Variable                      | Notes                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `IMAGE_REGISTRY`              | e.g. `ghcr.io/<github-org>`                                                                                                           |
| `IMAGE_TAG`                   | `staging` or `production` (CI moves these tags; every image also has an immutable SHA tag for rollback)                               |
| `POSTGRES_SUPERUSER_PASSWORD` | Only used by Postgres itself. Long random value                                                                                       |
| `DAX_MIGRATOR_PASSWORD`       | Migration role                                                                                                                        |
| `DAX_APP_PASSWORD`            | Runtime app role                                                                                                                      |
| `DAX_BACKUP_PASSWORD`         | Read-only backup role                                                                                                                 |
| `LOG_LEVEL`                   | `info` (default)                                                                                                                      |
| `BETTER_AUTH_SECRET`          | Signs session cookies. Long random value; changing it signs everyone out                                                              |
| `INTERNAL_TOKEN_WEB`          | Shared by `api` and `web`. Must differ from the admin token                                                                           |
| `INTERNAL_TOKEN_ADMIN`        | Shared by `api` and `admin`                                                                                                           |
| `WEB_ORIGIN`                  | e.g. `https://stores.<domain>` (no trailing slash)                                                                                    |
| `ADMIN_ORIGIN`                | e.g. `https://admin.<domain>`                                                                                                         |
| `RESEND_API_KEY`              | Resend key with send-only permission                                                                                                  |
| `MAIL_FROM`                   | e.g. `DAX <no-reply@<domain>>`; the domain must be verified in Resend                                                                 |
| `BOOTSTRAP_ADMIN_*`           | `NAME`, `USERNAME`, `EMAIL`, `PASSWORD`. Set for the first deploy only, then delete them                                              |
| `DATA_ENCRYPTION_KEYS`        | Key ring for Restricted columns: `k1:<base64 32 bytes>`, comma-separated when rotating. Back it up offline; losing it loses that data |
| `DATA_ENCRYPTION_ACTIVE_KEY`  | Id of the key new values are encrypted with, e.g. `k1`                                                                                |
| `S3_ENDPOINT`                 | Cloudflare R2: `https://<account-id>.r2.cloudflarestorage.com` (no bucket in the URL)                                                 |
| `S3_BUCKET`                   | Private R2 bucket for this project only, e.g. `dax-staging-files` or `dax-prod-files`. No public access                               |
| `S3_ACCESS_KEY_ID`            | R2 API token scoped to that one bucket with **Object Read & Write** only (no admin, no other buckets)                                 |
| `S3_SECRET_ACCESS_KEY`        | Secret for the same R2 token                                                                                                          |
| `S3_REGION`                   | `auto` (default) for R2                                                                                                               |

Generate each password, secret and token with `openssl rand -hex 32`. Hex keeps them safe inside connection URLs.

## First deploy

1. Set the `BOOTSTRAP_ADMIN_*` variables and deploy. The API creates the first super admin
   only when the database has no users.
2. Sign in to the admin app with that account. It must choose a new password and set up
   two-step sign-in before anything else.
3. Delete the four `BOOTSTRAP_ADMIN_*` variables from Dokploy and redeploy. The API logs a
   warning while they are still set.

## Domains

In Dokploy, add a domain to the `web` service (port 3000) and to the `admin` service (port 3000).
Never add a domain to `api` or `postgres`: they must stay on the internal `backend` network.
For staging, add an IP allowlist middleware so only the office and developers can reach it.

## Server hardening checklist

- Dokploy dashboard: 2FA on, reachable only from allowlisted IPs.
- SSH: keys only, no root password login; `ufw` allows 80 and 443, and 22 from allowlisted IPs only.
- `unattended-upgrades` enabled.
- Encrypted nightly backups to R2 arrive in the go-live milestone (`infra/backup`).
