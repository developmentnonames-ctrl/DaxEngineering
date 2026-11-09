# Deploying on Dokploy

One Contabo VPS runs two Dokploy compose projects from `infra/dokploy/compose.yml`:
`dax-staging` and `dax-prod`. They share nothing: separate databases, volumes, secrets and
(from the files milestone) separate R2 buckets. Staging only ever holds fake data.

## Environment variables (set per project in the Dokploy UI)

| Variable                      | Notes                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| `IMAGE_REGISTRY`              | e.g. `ghcr.io/<github-org>`                                                                             |
| `IMAGE_TAG`                   | `staging` or `production` (CI moves these tags; every image also has an immutable SHA tag for rollback) |
| `POSTGRES_SUPERUSER_PASSWORD` | Only used by Postgres itself. Long random value                                                         |
| `DAX_MIGRATOR_PASSWORD`       | Migration role                                                                                          |
| `DAX_APP_PASSWORD`            | Runtime app role                                                                                        |
| `DAX_BACKUP_PASSWORD`         | Read-only backup role                                                                                   |
| `LOG_LEVEL`                   | `info` (default)                                                                                        |

Generate each password with `openssl rand -hex 32`. Hex keeps them safe inside connection URLs.

## Domains

In Dokploy, add a domain to the `web` service (port 3000) and to the `admin` service (port 3000).
Never add a domain to `api` or `postgres`: they must stay on the internal `backend` network.
For staging, add an IP allowlist middleware so only the office and developers can reach it.

## Server hardening checklist

- Dokploy dashboard: 2FA on, reachable only from allowlisted IPs.
- SSH: keys only, no root password login; `ufw` allows 80 and 443, and 22 from allowlisted IPs only.
- `unattended-upgrades` enabled.
- Encrypted nightly backups to R2 arrive in the go-live milestone (`infra/backup`).
