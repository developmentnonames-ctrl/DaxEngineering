# DAX Engineering: working rules

Nx monorepo (pnpm). Next.js apps `web` and `admin`, NestJS `api`, Postgres via Prisma 7.
Phase 1 is Stores / Inventory only; other modules plug in later. Read `docs/architecture.md` before structural changes.

## Commands

- Always run tasks through Nx: `pnpm nx <target> <project>`, `pnpm nx run-many -t lint typecheck test build`.
- Run `pnpm nx sync` after adding a workspace dependency (non-interactive shells don't auto-sync).
- `pnpm check` runs everything CI runs, except format.
- Local DB: `pnpm db:up` (Postgres on 127.0.0.1:55432), then `pnpm db:migrate`.
- Never guess Nx generator flags; check `--help` first.

## Architecture rules (enforced by lint and CI)

- **Modules are lego bricks.** A module (`libs/<module>/{contract,server,web}`) may import platform, shared, its own libs and any module's `contract` lib. Never another module's `server` or `web`.
- **Platform never imports modules.** Only `apps/*` compose modules (`apps/api/src/module-catalog.ts`).
- **Browser code never imports server code** (`type:web|ui|data-access` → no `type:server`, no `@nestjs/*`, `@prisma/*`, `pg`).
- **No Next.js shared caching** of permissioned data: no `'use cache'`, `unstable_cache`, `force-cache`. Fetch per request with `no-store`.
- **Prisma:** every model/enum declares `@@schema("<folder>")`. No relations across module folders: reference by plain uuid + name snapshot. Migration names: `<timestamp>_<module>_<what>`.
- **Database roles:** the app connects as `dax_app` (DML only). Migrations run as `dax_migrator`. Never point `DATABASE_URL` at the migrator or superuser.
- **Stock changes go through one service only** (`StockPostingService`, inventory milestone). Ledger and audit tables are append-only.

## Data sensitivity

- Every database column gets a tier: Internal / Confidential / Restricted. Hidden fields are never selected and never sent.
- Phase 1 stores no money (cost, price, value). Money belongs to a later module with its own restricted schema.
- Never log request bodies, cookies, tokens or Restricted values.
- Secrets live in Dokploy environment settings, never in git. `.env` is for local dev only.

## Product copy

- UI text and docs never mention process maps or document register codes (P1, E2, C5, S2...).
- Use department and role names, never staff names. `pnpm lint:copy` enforces this.

## Code style

- TypeScript strict. Zod for all external input (env, request bodies, API responses in Next).
- Libraries use extensionless relative imports. Libraries used only by Next (`web-data-access`, `web-shell`) use bundler module resolution.
- NestJS tests use Vitest with the SWC plugin (legacy decorators).
- Comments follow the `comments` skill (`.claude/skills/comments`): default to none, one line max, fix the code instead of explaining it.
