# Architecture

DAX Engineering's system covers parts sales, costing, import and local purchasing, stores,
workshop, warranty and accounts. It is built one module at a time. **Phase 1 is Stores /
Inventory only**, with no money data (QuickBooks stays the money book). Every later module
plugs in without changing inventory code.

Three goals drive the design:

1. **Lego modules.** A module is a set of libraries with a public contract. Modules only talk
   through contracts, ports and events.
2. **An admin-controlled Access Control Matrix.** Module → feature → action permissions, with row
   scopes and per-field read/write grants, all editable in the admin panel.
3. **Data sensitivity at the root.** The API only queries and sends the fields a user may see.
   Restricted data is encrypted and every read of it is audited.

## Decisions

| Area             | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack            | Nx + pnpm · Next.js 16 (`web`, `admin`) · NestJS 11 (`api`) · Postgres 18 · Prisma 7 · Mantine · Zod 4                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Hosting          | Contabo VPS · Dokploy (Traefik TLS) · staging and production stacks · GitHub Actions                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Auth             | Better Auth inside NestJS, login only · sign in with username or email · optional TOTP 2FA, mandatory for super admins · no self sign-up                                                                                                                                                                                                                                                                                                                                                                                |
| Passwords        | 12+ characters, no breach-list check · reset by email link (Resend), every account has an email · 5 failed sign-ins lock the account for 15 minutes                                                                                                                                                                                                                                                                                                                                                                     |
| First admin      | Created on first boot from `BOOTSTRAP_ADMIN_*` env vars when no users exist; must change the password and set up 2FA at first sign-in                                                                                                                                                                                                                                                                                                                                                                                   |
| API path         | Next.js is the gateway: the browser talks only to Next.js; the API is on a private network                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Authorization    | Own ACM · many roles per user + per-user allow/deny overrides (deny wins) · scope per grant: Own / Department / All (store list ready for later)                                                                                                                                                                                                                                                                                                                                                                        |
| Field visibility | Per-field read/write grants · hidden fields never selected or sent · tiers: Internal / Confidential / Restricted                                                                                                                                                                                                                                                                                                                                                                                                        |
| Super admin      | Sees everything; Restricted reads still audited · only super admins assign the Super Admin role or edit super admin accounts                                                                                                                                                                                                                                                                                                                                                                                            |
| Admin access     | Permission-based (`core.admin.access` + `core.*` permissions) · delegated admins hand out only what they hold · user management follows scope (Department = own departments) · 2FA is a per-role switch                                                                                                                                                                                                                                                                                                                 |
| Audit            | All changes with before/after + Restricted reads and exports · append-only (DB trigger) · kept forever                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Encryption       | App-level AES-256-GCM for Restricted columns                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Modularity       | Modular monolith + module registry (admin enables/disables) · one Postgres schema per module · REST + shared Zod contracts                                                                                                                                                                                                                                                                                                                                                                                              |
| Processes        | Explicit state machines per document + a shared approvals service                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Numbering        | Configurable series, April financial year in Colombo time (`26` = Apr 2026 – Mar 2027), gap-free                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Jobs / files     | Own transactional outbox table + worker process (pg-boss dropped: it creates tables at runtime, which the app role may not) · Cloudflare R2 private buckets                                                                                                                                                                                                                                                                                                                                                             |
| Stores UX        | Phone camera scanning in a PWA (online only) · QR labels on A4 sticker sheets (3×8) · bin codes Zone-Rack-Shelf-Position, e.g. A-01-03-B                                                                                                                                                                                                                                                                                                                                                                                |
| Master data      | Brands and machine models are managed lists; every item has a brand · superseded parts show "replaced by" and old stock can still be issued · customer/supplier codes auto-numbered (CUS-0001, SUP-0001) · CSV import for items, customers, suppliers (dry run, all-or-nothing) · no item photos yet                                                                                                                                                                                                                    |
| Receiving        | No expected arrivals: every delivery is received on a GRN against a supplier, and each line has an optional delivery-note quantity used for short/excess reports · damaged goods received into quarantine · over-receipt allowed and flagged as excess · stock is free only after put-away · one person may check and post · GRN/FOR vs GRN/LOC from the supplier, editable · no back-dating (delivery date kept as information) · a posted GRN can be reversed by the Stores Manager only while its stock is untouched |

## Topology

```
Browser / phone ──HTTPS──► Traefik (Dokploy)
   app.<domain>   ─► web   (Next.js staff PWA)  ┐   internal "backend" network
   admin.<domain> ─► admin (Next.js admin)      ├─► api (NestJS) ─► Postgres
                                                ┘                ─► R2 (files, backups)
```

The API and Postgres have no public route. Each Next.js app calls the API with its own
internal token, the user's session cookie and a request id. Admin API routes accept only the
admin app's token.

## Authentication

- **Two Better Auth instances** in the API, one per app (`web`, `admin`), sharing the `auth`
  schema. Cookies are host-only and prefixed `dax-web.` / `dax-admin.`. Each session records
  the app that created it, and the API rejects a session used from the other app.
- **Admin app** sign-in needs the `core.admin.access` permission; super admins have it.
- **Internal tokens:** every API call carries `x-internal-token`; the token decides which app is
  calling. Only `/api/health/*` is open, for container probes.
- **Next.js auth proxy** (`/api/auth/*` in each app) forwards an allowlist of sign-in, password and
  two-step endpoints. It checks the request is same-origin, forwards only that app's cookies, and
  strips session tokens and user records from response bodies.
- **Default deny:** a global guard requires a session on every API route unless it is marked
  `@Public()`. Users with a pending password change or a missing 2FA (super admins) can only
  reach `/api/me` until they finish setup.
- **Email** leaves the server only through Resend. The API joins an outbound-only `egress`
  network for this; it still has no public route.
- **Users** are created by a super admin in the admin app and get a 72-hour email link to set
  their password. Admins can unlock, deactivate and resend links.
- **Lockout:** 5 wrong passwords lock the account for 15 minutes; the two-step code has its own
  5-attempt lockout. Per-IP rate limits apply in production.

## Repository layout and boundaries

```
apps/        api · web · admin · web-e2e
libs/
  shared/        contracts · util · ui
  platform/      db · core · contract
  web-platform/  data-access · shell
  <module>/      contract · server · web      (parties, inventory, later sales, commercial...)
tools/scripts/   prisma-lint · copy-lint
infra/           postgres roles · Dockerfiles · Dokploy compose
```

Each project carries `scope:*` and `type:*` tags. `@nx/enforce-module-boundaries` (root
`eslint.config.mjs`) enforces:

- a module imports platform, shared, its own libs, and **only the `contract` lib** of other modules;
- platform never imports modules; only apps compose modules;
- browser-side libs (`web`, `ui`, `data-access`) never import server libs or server packages;
- contracts stay framework-free (no Nest, Prisma, React, Mantine).

Further ESLint rules ban Next.js shared caching (`'use cache'`, `unstable_cache`, `force-cache`)
in the web apps and libs, because a shared cache can serve one user's filtered data to another.

### Prisma

One schema folder at `libs/platform/db/prisma/schema/` with one subfolder per module, one
generated client. `prisma-lint` enforces three rules:

- `@@schema` matches the folder;
- no relation crosses modules (`auth`, `core` and `audit` may relate to each other);
- migration names start with a module key.

Cross-module references are plain uuid columns with a name snapshot. A typed per-module facade
(`ModuleDb<'inventory'>`) will expose only that module's tables. CHECK constraints, triggers and
grants live in migration SQL.

### Database roles

| Role           | Can                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| `dax_owner`    | Owns every schema and table; cannot log in                                                                        |
| `dax_migrator` | Runs migrations; every session acts as `dax_owner`                                                                |
| `dax_app`      | API and worker: data only, no DDL, 15 s statement timeout. INSERT + SELECT only on the stock ledger and audit log |
| `dax_backup`   | Read-only, for `pg_dump`                                                                                          |

`libs/platform/db/prisma/sql/grants.sql` reapplies grants after every migration and picks up
new module schemas automatically.

## Module system

A module's **manifest** (in its contract lib) is pure data. It declares:

- features and actions, with allowed scopes and approval flags;
- number series;
- menu entries;
- dependencies;
- default grants for seeded roles.

Typed permission keys such as `'inventory.grn.post'` are derived from it. See
`libs/shared/contracts/src/lib/module-manifest.ts` and `libs/inventory/contract`.

- **Registry sync on boot.** Upserts modules, features, permissions, entities, fields and series
  into `core` tables. Vanished keys are marked removed (grants are never deleted). Default grants
  apply only to newly seen permissions. Boot fails if a route lacks a permission decorator.
- **Field classification.** Each entity's field metadata is keyed by Prisma's generated field
  enum, so an unclassified column fails to compile.
- **Enable / disable.** The API composes only enabled modules at boot, so a disabled module has
  no routes, subscribers or jobs. Toggling checks dependencies in both directions and restarts
  the API. Tables always exist.
- **Integration between modules** happens only through:
  1. **Ports**: interfaces in a contract lib that join the caller's transaction. Inventory's
     ports cover availability, reserve/release, requestIssue, expectArrival, startMrnFromHold
     and flagReorder.
  2. **Domain events**: versioned Zod schemas written to `core.outbox_event` inside the business
     transaction; the worker delivers them. Subscribers are idempotent (`core.processed_event`).
  3. **Extension hooks**, e.g. an MRN release gate list that is empty in phase 1 and lets
     Accounts add release clearance later.
  4. **Web extension slots** filled by `apps/web`.

## Access Control Matrix (schema `core`)

| Table                                   | Purpose                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| `module`, `feature`, `permission`       | Registry synced from manifests                                                  |
| `entity`, `field`                       | Field registry: tier, encrypted, locked (always readable), writable, filterable |
| `department`                            | Stores, Parts Sales, Workshop, Sales, Accounts, Commercial, Finance, Management |
| `role`                                  | Includes `isSuperAdmin` and `require2fa`                                        |
| `role_permission`                       | Role × permission × scope (+ store list)                                        |
| `role_field_grant`                      | Role × field × read/write. Only deviations from the tier default are stored     |
| `user_role`, `user_permission_override` | Many roles per user; GRANT/DENY overrides with reason and expiry                |
| `user_profile`, `policy_epoch`          | Departments, and version counters for cache invalidation                        |

**Resolution rules:**

- Permissions: the union of the user's roles, with the widest scope winning. GRANT overrides
  are added and DENY overrides removed (deny wins). Disabled modules are dropped.
- Fields:
  - by default, Internal fields are readable and Confidential/Restricted are hidden;
  - grant rows override the default;
  - write access is always a subset of read access.
- Policies are cached per user and invalidated by database triggers when anything changes.

## Visibility layer (API request pipeline)

1. Internal caller check (per-app token).
2. Session (Better Auth), then policy, then request context.
3. Module enabled.
4. Permission: `@Requires('inventory.grn.post')`. Every route needs one; **default deny**.
5. Strict Zod validation, then a writable-fields check, then an idempotency key.
6. Queries use `scopeWhere` (row scope; out of scope returns 404) and `buildSelect`
   (**only readable columns are selected**).
7. The response passes `project()`: an allowlist of keys, decryption, Restricted-read audit,
   type conversion.

Contracts mark gated fields optional: an absent key means "not visible to you". Filtering and
sorting are only allowed on readable fields, search indexes only cover Internal fields, and the
audit viewer and exports run through the same projection.

## Sensitive data

- **Classification:** checked at compile time and in CI.
- **Physical separation:** money data lives in its own module schema, never as columns on
  inventory tables.
- **Column encryption:** AES-256-GCM with a key id prefix for rotation. Additional data binds
  each value to its table, column and row. The key is held outside the database. This protects
  dumps and backups, not a full server compromise.
- **Logs:** pino redacts cookies, auth headers, tokens and secrets. Request bodies are never
  logged.
- **Headers:** Helmet on the API. Next.js sends nosniff, `frame-ancestors`, referrer and
  permissions policies, plus a per-request nonce CSP from each app's `proxy.ts`.
- **Files:** stored in a private R2 bucket. A download needs a permission and scope check, an
  audit row, then a 60-second signed URL.
- **Backups:** nightly `pg_dump` encrypted with `age` to a separate R2 bucket. Monthly restore
  drill.

## Inventory domain (phase 1)

- **Master data:**
  - items, with supersession and alternate/manufacturer barcodes;
  - store → zone → bin, one default store for now. Bin kinds: storage, receiving, quarantine,
    warranty.
- **Stock engine:** one posting service is the only code that changes stock.
  - Balances have CHECK constraints: on hand ≥ 0, held ≥ 0, held ≤ on hand.
  - The ledger is append-only.
  - Reservations are one mechanism for holds, MRNs and future sales orders.
  - Numbers are assigned on post, never at draft.

| Document                           | Flow                                                       | Stock effect                                        |
| ---------------------------------- | ---------------------------------------------------------- | --------------------------------------------------- |
| GRN (FOR, LOC)                     | Draft → Checked → Posted → Put away                        | receive into receiving bin, then move to target bin |
| Discrepancy                        | Open → Closed                                              | damaged quantity to quarantine                      |
| MRN (PRT, SRV, SAL)                | Draft → Submitted → Checked → Ready → Issued → Closed      | reserve                                             |
| AOD (SER, REP, INS, BRK, DIR, HIR) | Picking → Issued → Signed                                  | consume reservation, issue                          |
| Hold                               | Active → Converted / Released / Expired                    | hold / release                                      |
| Return note                        | Draft → Posted                                             | back to a bin, or quarantine if damaged             |
| Stock count (cycle, full, opening) | Counting → Submitted → Approved by Stores Manager → Posted | adjust                                              |
| Warranty tag                       | Tagged → Sent / Returned / Scrapped → Closed               | none (custody only)                                 |

**Seeded roles:** Super Admin, Stores Manager, Stores Keeper, Stock Viewer. In phase 1 other
departments are read-only viewers.

## Adding a module later (example: costing)

1. Generate `libs/commercial/{contract,server,web}` and `prisma/schema/commercial/`.
2. Add tables with cost fields marked **Restricted + encrypted**.
3. The manifest declares its features, approvals, series, menu and `dependsOn: ['inventory']`.
4. Subscribe to `inventory.goods_received.v1`; call `expectArrival()` when a PO is placed.
5. Deploy. The module appears in admin as disabled. Grant cost fields only to the right roles,
   then enable it.
6. **No changes in `libs/inventory/*`.** If one is needed, the boundaries are wrong.

## Milestones

| #   | Scope                                                                                                          | Status |
| --- | -------------------------------------------------------------------------------------------------------------- | ------ |
| M0  | Workspace, boundaries, Prisma layout, DB roles, logging, health, Docker, CI                                    | done   |
| M1  | Better Auth in NestJS, Next auth proxy, login/2FA screens, internal tokens                                     | built  |
| M2  | Registry, ACM, policy cache, visibility layer, audit, crypto, numbering, approvals, files, events, admin panel | built  |
| M3  | Parties, items, bins, QR labels, stock views, scanner, PWA                                                     | built  |
| M4  | Stock engine, receiving, GRN, put-away                                                                         | built  |
| M5  | MRN, AOD, holds                                                                                                |        |
| M6  | Returns, counts, warranty bin, reports                                                                         |        |
| M7  | Hardening, backup drill, UAT, go-live                                                                          |        |

## Open points to confirm with DAX

- MRN subtype for the Sales department (SAL assumed).
- Financial-year label convention (start year assumed).
- Whether direct-sale AODs may leave without Accounts release in phase 1.
- Whether users can belong to several departments (modelled as a list).
- Label size and printer.
- Whether damaged received goods go to quarantine or are rejected at the dock.
