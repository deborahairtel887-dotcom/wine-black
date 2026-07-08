# Design Document — Monorepo Extraction (frontend-extraction)

## Overview

The `agegg-stellar` monorepo co-locates three logically independent workspaces:

| Source paths | New standalone repo | Primary tech |
|---|---|---|
| `web/`, `packages/widget/` | `agegg-frontend` | Node 22, Next.js 16, React 19, Vitest 4, Vercel |
| `contracts/`, `src/`, root `Cargo.toml`, root `Cargo.lock` | `agegg-contracts` | Rust stable, Soroban SDK, Stellar CLI |
| `bot/` | `agegg-bot` | Node 22, TypeScript 5.5, `@stellar/stellar-sdk` 16, Vitest 4 |

The extraction uses `git filter-repo` to rewrite history so each new repository contains only the commits that touched its source paths. No cross-repo runtime dependencies exist at the code level, making the split clean and dependency-free.

---

## Key Findings from Codebase Audit

### No Rust/WASM bindings in the frontend
`web/lib/contract.ts` imports only from `@/app/lib/adapters/agegg-contract` and `@/app/lib/freighter-adapter` — TypeScript files that live entirely within `web/`. Contract interaction goes through Stellar SDK RPC calls at runtime; no `.wasm` files or Rust-generated ABI JSON are imported anywhere in the frontend build graph. Requirement 7 is therefore satisfied automatically: the TypeScript adapter layer travels with `web/` during extraction and requires no vendoring step.

### Widget is a standalone published package
`web/package.json` does **not** list `@agegg/widget` as a dependency. The widget is built and published independently. The frontend repo will include `packages/widget/` as a workspace sibling for local development convenience (Requirement 2.9), but the web app does not consume it from the local workspace at build time.

### Bot has zero overlap with frontend or contracts
`bot/package.json` references only `@stellar/stellar-sdk`, `dotenv`, and dev tooling. There are no path-based imports into `web/` or `contracts/`.

### CI workflow path adjustments required
The existing `contract-checks` CI job uses `working-directory: ./contracts/predinex` and calls `scripts/measure-contract-wasm-size.sh` from the repo root. In `predinex-contracts`, `contracts/predinex` becomes the root and the script moves to `scripts/`. Workflow paths must be updated accordingly.

---

## Architecture

### Repository Layout

#### `predinex-frontend`

```
predinex-frontend/
├── app/                        # Next.js App Router (from web/app/)
├── components/                 # Reusable UI components (from web/components/)
├── lib/                        # Core logic, hooks, adapters (from web/lib/)
├── providers/                  # React context providers (from web/providers/)
├── public/                     # Static assets (from web/public/)
├── tests/                      # Vitest + Playwright tests (from web/tests/)
├── docs/                       # Frontend-specific docs (from web/docs/)
├── scripts/                    # Frontend utility scripts (from web/scripts/)
├── packages/
│   └── widget/                 # @predinex/widget (from packages/widget/)
│       ├── src/
│       ├── package.json
│       ├── vite.config.ts
│       └── vitest.config.ts
├── .env.example                # Copied from web/.env.example
├── .github/
│   └── workflows/
│       ├── ci.yml              # Lint + test + build + bundle budget
│       └── preview-deploy.yml  # Vercel preview deployment
├── .gitignore
├── eslint.config.mjs
├── globals.css
├── next.config.ts
├── package.json                # Workspace root (see below)
├── playwright.config.ts
├── postcss.config.mjs
├── tsconfig.json
├── typedoc.json
├── vercel.json
├── vitest.config.ts
├── CHANGELOG.md                # Frontend-relevant entries only
└── README.md
```

Root `package.json` for the frontend repo (npm workspaces):

```json
{
  "name": "predinex-frontend",
  "private": true,
  "workspaces": ["packages/widget"],
  "scripts": {
    "dev":            "next dev --webpack",
    "build":          "next build --webpack",
    "start":          "next start",
    "lint":           "eslint",
    "test":           "vitest",
    "test:coverage":  "vitest --coverage",
    "test:visual":    "playwright test",
    "doc":            "typedoc",
    "widget:build":   "npm run build --workspace=packages/widget"
  }
}
```

The workspace declaration allows `npm install` at the repo root to install both `web/` dependencies and widget devDependencies in one pass, while keeping each package's `package.json` intact.

#### `predinex-contracts`

```
predinex-contracts/
├── contracts/
│   ├── predinex/               # Main prediction-market contract
│   │   ├── src/
│   │   ├── tests/
│   │   ├── Cargo.toml
│   │   └── Cargo.lock
│   ├── pool/
│   ├── wave_pool/
│   └── scripts/
├── src/                        # Shared Rust source (fee_manager.rs, pool.rs)
├── scripts/
│   ├── bootstrap.sh            # Adapted for contracts-only setup
│   ├── rollback.sh
│   └── measure-contract-wasm-size.sh
├── deployments/
│   └── .gitkeep
├── docs/
│   ├── CONTRACT_API.md
│   ├── CONTRACT_SPEC.md
│   ├── CONTRACT_INPUT_VALIDATION.md
│   ├── CONTRACT_UPGRADE_PROCEDURE.md
│   ├── STORAGE_OPTIMIZATION.md
│   ├── DEPLOYMENT_RUNBOOK.md
│   └── deployment-guide.md
├── .github/
│   └── workflows/
│       ├── ci.yml              # fmt + clippy + test + WASM size
│       ├── benchmarks.yml
│       ├── fuzz.yml
│       ├── deploy-testnet.yml
│       ├── deploy-mainnet.yml
│       └── security-audit.yml
├── Cargo.toml                  # Root workspace (was monorepo root)
├── Cargo.lock
├── .gitignore
├── CHANGELOG.md                # Contract-relevant entries only
└── README.md
```

#### `predinex-bot`

```
predinex-bot/
├── src/
│   ├── config.ts
│   ├── config.test.ts
│   ├── contract-client.ts
│   ├── executor.ts
│   ├── index.ts
│   ├── logger.ts
│   ├── poller.ts
│   ├── poller.test.ts
│   ├── retry.ts
│   ├── retry.test.ts
│   ├── types.ts
│   ├── webhook.ts
│   └── webhook.test.ts
├── .env.example                # Derived from DEPLOYMENT.md env var table
├── .dockerignore
├── .gitignore
├── .github/
│   └── workflows/
│       └── ci.yml              # Type-check + test
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md                   # Derived from DEPLOYMENT.md
```

---

## Extraction Process

### Tool: `git filter-repo`

`git filter-repo` is used in preference to `git subtree` because it:
- Rewrites commit history cleanly, removing all commits that only touched other workspaces
- Handles multiple source paths in one pass with `--path`
- Produces a correctly sized history without synthetic merge commits

**Prerequisites:**
```bash
pip install git-filter-repo
# Verify
git filter-repo --version
```

### Step 1 — Extract `predinex-frontend`

```bash
# 1. Clone a fresh copy of the monorepo (filter-repo requires a clean clone)
git clone --no-local /path/to/predinex-stellar predinex-frontend
cd predinex-frontend

# 2. Keep only web/ and packages/widget/ history
git filter-repo \
  --path web/ \
  --path packages/widget/ \
  --prune-degenerate-commits

# 3. Move web/ contents to repo root
git filter-repo --subdirectory-filter web/
# packages/widget/ is now missing — restore it via a second pass on the original
# OR use path renaming in a single invocation:

# Alternative single-pass approach using --path-rename:
git clone --no-local /path/to/predinex-stellar predinex-frontend
cd predinex-frontend
git filter-repo \
  --path web/ \
  --path packages/widget/ \
  --path-rename 'web/::' \
  --prune-degenerate-commits
```

After filtering, add the workspace `package.json` at root and `.github/` workflows (these are new files, committed directly — they have no monorepo history to preserve).

### Step 2 — Extract `predinex-contracts`

```bash
git clone --no-local /path/to/predinex-stellar predinex-contracts
cd predinex-contracts

git filter-repo \
  --path contracts/ \
  --path src/ \
  --path Cargo.toml \
  --path Cargo.lock \
  --path scripts/ \
  --path deployments/ \
  --path docs/ \
  --prune-degenerate-commits
```

Adapt `Cargo.toml` workspace members if any non-`contracts/predinex` paths changed:
```toml
[workspace]
members = ["contracts/predinex"]
resolver = "2"
```

Update `scripts/bootstrap.sh` to remove the Node.js / web dependency checks.

### Step 3 — Extract `predinex-bot`

```bash
git clone --no-local /path/to/predinex-stellar predinex-bot
cd predinex-bot

git filter-repo \
  --path bot/ \
  --path-rename 'bot/::' \
  --prune-degenerate-commits
```

`bot/` contents (including `Dockerfile`, `docker-compose.yml`, `package.json`, `src/`) will all be at the root.

---

## CI/CD Workflow Designs

### `predinex-frontend` — `ci.yml`

Based directly on the `web-checks` job in the monorepo's `ci.yml`, with these adjustments:
- `working-directory` removed (files are now at repo root)
- `cache-dependency-path: package-lock.json` (was `web/package-lock.json`)
- Bundle size budget thresholds preserved (`BUDGET_TOTAL_KB=5800`, `BUDGET_JS_KB=5000`, `BUDGET_CSS_KB=80`)
- No `contract-checks` job

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  web-checks:
    name: Web Checks
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npm run test -- --run
      - run: npm run build
      - name: Bundle size budget check
        if: github.event_name == 'pull_request'
        run: |
          BUDGET_TOTAL_KB=5800
          BUDGET_JS_KB=5000
          BUDGET_CSS_KB=80
          # ... (identical budget-check shell block from monorepo ci.yml)
```

### `predinex-frontend` — `preview-deploy.yml`

Ported directly from the monorepo's `preview-deploy.yml` with these adjustments:
- `paths` trigger changed from `web/**` to `**` (entire repo is the frontend)
- `working-directory: ./web` removed from all steps
- `cache-dependency-path: package-lock.json` (was `web/package-lock.json`)
- Secrets remain the same: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`
- PR comment references updated (no reference to monorepo docs paths)

### `predinex-contracts` — `ci.yml`

Based directly on the `contract-checks` job in the monorepo's `ci.yml`, with these adjustments:
- `working-directory: ./contracts/predinex` preserved (relative path unchanged)
- Script path updated: `bash scripts/measure-contract-wasm-size.sh` (was `bash scripts/measure-contract-wasm-size.sh` — same, script is at root)
- `--manifest-path contracts/predinex/Cargo.toml` preserved
- No `web-checks` job
- Benchmarks, fuzz, security-audit, and deploy workflows ported as-is with minor path fixes

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  contract-checks:
    name: Contract Checks
    runs-on: ubuntu-latest
    permissions:
      contents: read
      issues: write
      pull-requests: write
    env:
      WASM_SIZE_LIMIT_BYTES: 327680
      WASM_SIZE_WARN_PERCENT: 80
      WASM_SIZE_FAIL_PERCENT: 95
      WASM_SIZE_BUILD_OPTIMIZE: 'true'
    defaults:
      run:
        working-directory: ./contracts/predinex
    steps:
      - uses: actions/checkout@v4
      - uses: actions-rust-lang/setup-rust-toolchain@v1
        with:
          toolchain: stable
          components: rustfmt, clippy
      - run: rustup target add wasm32v1-none
      - run: cargo fmt --check
      - run: cargo clippy -- -D warnings
      - run: cargo test
      # ... WASM size measurement steps (identical to monorepo)
```

### `predinex-bot` — `ci.yml`

New workflow, modelled on the monorepo's `web-checks` pattern:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  bot-checks:
    name: Bot Checks
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: package-lock.json
      - run: npm ci
      - name: Type-check
        run: npm run lint        # bot uses "lint": "tsc --noEmit"
      - name: Test
        run: npm test            # vitest run
```

---

## Environment Files

### `predinex-frontend` — `.env.example`

Copied verbatim from `web/.env.example`. All variables are already correctly documented:

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_NETWORK` | ✅ | `testnet` or `mainnet` |
| `NEXT_PUBLIC_APP_URL` | — | App URL for WalletConnect metadata |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | — | WalletConnect Cloud project ID |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | — | Web Push VAPID public key |
| `VAPID_PRIVATE_KEY` | — | Server-side VAPID private key |
| `VAPID_SUBJECT` | — | VAPID contact email |
| `NEXT_PUBLIC_SOROBAN_RPC_URL` | — | Soroban RPC endpoint override |
| `NEXT_PUBLIC_SOROBAN_CONTRACT_ID` | — | Deployed contract C-strkey |
| `DEBUG` | — | Enable debug logging |
| `NEXT_PUBLIC_ENABLE_DISPUTE_MOCK_DATA` | — | Show mock dispute data in dev |

### `predinex-bot` — `.env.example`

New file derived from the env var table in `bot/DEPLOYMENT.md`:

```dotenv
# Predinex Settlement Bot — Environment Configuration
# Copy to .env and fill in values before running.

# === REQUIRED ===
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
CONTRACT_ID=C...
BOT_SECRET_KEY=S...

# === OPTIONAL ===
STELLAR_NETWORK=testnet
POLL_INTERVAL_MS=300000
BATCH_SIZE=100
DRY_RUN=false
AUTO_SETTLE_ENABLED=false
DEFAULT_WINNING_OUTCOME=0
MAX_RETRIES=3
RETRY_BASE_DELAY_MS=1000
WEBHOOK_URL=
WEBHOOK_SECRET=
LOG_LEVEL=info
```

---

## README Outlines

### `predinex-frontend/README.md`

1. Project title + badges (status, Node version, Next.js version, license)
2. Overview — what this repo is, what it builds
3. Tech stack table (Next.js 16, React 19, Tailwind CSS 4, TypeScript, Vitest, Playwright, Vercel)
4. Prerequisites (Node 18+, npm)
5. Quick start (clone → `npm install` → copy `.env.example` → `npm run dev`)
6. Environment variables table (from `.env.example`)
7. Available scripts table (`dev`, `build`, `test`, `lint`, `test:coverage`, `test:visual`, `widget:build`)
8. Project structure (app/, components/, lib/, packages/widget/)
9. Contract integration note — explain that contract interaction is via Stellar SDK RPC; point to `NEXT_PUBLIC_SOROBAN_CONTRACT_ID` env var; link to `predinex-contracts` repo for ABI changes
10. Wallet support — link to `docs/WALLET_NETWORK_SUPPORT.md`
11. Deployment (Vercel — link to `vercel.json` and preview deployment docs)
12. Contributing
13. License (ISC)

### `predinex-contracts/README.md`

1. Project title + badges (Rust version, Soroban SDK version, license)
2. Overview — Soroban smart contracts for Predinex prediction markets
3. Architecture overview with the Mermaid system diagram (from monorepo README)
4. Pool lifecycle state diagram (from monorepo README)
5. Prerequisites (Rust stable, Stellar CLI, `wasm32v1-none` target)
6. Quick start (clone → `./scripts/bootstrap.sh`)
7. Build commands (`cargo build`, `stellar contract build`)
8. Test commands (`cargo test`, `cargo clippy`, `cargo fmt`)
9. Contract structure (contracts/predinex, contracts/pool, contracts/wave_pool, src/)
10. Deployment guide — link to `docs/DEPLOYMENT_RUNBOOK.md` and `docs/deployment-guide.md`
11. Contract API reference — link to `docs/CONTRACT_API.md`
12. WASM size budget (327,680 bytes / 320 KiB limit; warning at 80%, failure at 95%)
13. Scripts reference (`bootstrap.sh`, `rollback.sh`, `measure-contract-wasm-size.sh`)
14. Contributing
15. License (ISC)

### `predinex-bot/README.md`

Content derived directly from `bot/DEPLOYMENT.md`, restructured as a project README:

1. Project title + badges (Node version, license)
2. Overview — what the bot does (polls Predinex contract, settles expired pools)
3. Prerequisites (Node 18+, npm, OR Docker)
4. Quick start (clone → `npm install` → copy `.env.example` → `npm run build` → `npm start`)
5. Environment variables table (full table from DEPLOYMENT.md)
6. Dry-run mode (`DRY_RUN=true`)
7. Auto-settlement and oracle integration (oracle hook in `src/poller.ts`)
8. Docker usage (build + run, docker-compose)
9. Cloud deployment (Railway, Fly.io — from DEPLOYMENT.md)
10. Monitoring — structured log format, key log messages table, webhook verification
11. Security checklist
12. Troubleshooting (common errors from DEPLOYMENT.md)
13. Contributing
14. License (ISC)

---

## Smoke Test Scripts

### `predinex-frontend` — `scripts/smoke-test.sh`

```bash
#!/usr/bin/env bash
# Validates a clean-checkout build of predinex-frontend.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "[1/4] Installing dependencies..."
npm ci

echo "[2/4] Running linter..."
npm run lint

echo "[3/4] Running unit tests..."
npm run test -- --run

echo "[4/4] Building production bundle..."
npm run build

echo "✓ Smoke test passed."
```

### `predinex-contracts` — `scripts/smoke-test.sh`

```bash
#!/usr/bin/env bash
# Validates a clean-checkout build of predinex-contracts.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "[1/3] Checking Rust format..."
cargo fmt --check

echo "[2/3] Running Clippy..."
cargo clippy -- -D warnings

echo "[3/3] Running contract tests..."
cargo test

echo "✓ Smoke test passed."
```

### `predinex-bot` — `scripts/smoke-test.sh`

```bash
#!/usr/bin/env bash
# Validates a clean-checkout build of predinex-bot.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "[1/3] Installing dependencies..."
npm ci

echo "[2/3] Type-checking..."
npm run lint

echo "[3/3] Running tests..."
npm test

echo "✓ Smoke test passed."
```

---

## Contract ABI / Bindings — No Vendoring Required

A detailed audit of `web/lib/contract.ts` and its import chain confirms:

- `web/lib/contract.ts` imports from `@/app/lib/adapters/predinex-contract` (TypeScript, lives in `web/app/lib/`)
- `web/app/lib/adapters/` contains TypeScript adapter files that call the Stellar SDK (`@stellar/stellar-sdk`) via RPC
- There are no imports of generated `.wasm` files, `.json` ABI files, or Rust-generated TypeScript bindings
- `@stellar/stellar-sdk 16.0.1` is a regular npm dependency already in `web/package.json`

Therefore, **Requirement 7 requires no additional action** beyond moving `web/` to the repo root. The frontend README should document this explicitly: to pick up a new contract deployment, update `NEXT_PUBLIC_SOROBAN_CONTRACT_ID` in `.env.local`.

---

## Correctness Properties

These properties define the correctness invariants for the extraction and can be verified programmatically post-extraction.

### P1 — Import isolation
For every TypeScript/JavaScript file `f` in `predinex-frontend`:
```
∀ import_path ∈ imports(f) :
  resolve(import_path, base=repo_root) starts_with repo_root
```
No import resolves to a path outside the repo root. Verified by running `tsc --noEmit` and `npm run build` from a clean clone.

### P2 — Cargo workspace closure  
For every crate `c` in the `predinex-contracts` workspace:
```
∀ dep ∈ path_dependencies(c) :
  path(dep) starts_with repo_root
```
No `path = "../../../something"` dependency escapes the repo. Verified by `cargo build`.

### P3 — Node dependency closure  
For `predinex-bot`:
```
∀ dep ∈ dependencies(bot/package.json) :
  dep is a registry package (not a file: or workspace: reference)
```
Verified by `npm ci` succeeding from a clean directory with no prior `node_modules`.

### P4 — CI cross-contamination absence  
For `predinex-frontend`:
```
∀ step ∈ ci_workflow_steps :
  "cargo" ∉ step.run AND
  "rustup" ∉ step.run AND
  "stellar contract" ∉ step.run
```
For `predinex-contracts`:
```
∀ step ∈ ci_workflow_steps :
  "npm" ∉ step.run AND
  "next" ∉ step.run
```

### P5 — Environment completeness  
For each repo, the smoke test must pass from a clean clone with only the `.env.example` values filled in (no secrets from another repo required).

### P6 — History preservation  
For each file `f` in a new repo, the first commit in the new repo's log for `f` must match the earliest monorepo commit that touched `f`. Verified by comparing `git log --follow -- <file>` output before and after extraction.

---

## Migration Checklist

| Step | Repo | Action |
|---|---|---|
| 1 | All | Audit monorepo for any remaining cross-path references using `grep -r` |
| 2 | frontend | Run `git filter-repo` with `--path web/ --path packages/widget/ --path-rename 'web/::'` |
| 3 | contracts | Run `git filter-repo` with `--path contracts/ --path src/ --path Cargo.toml --path Cargo.lock --path scripts/` |
| 4 | bot | Run `git filter-repo` with `--path bot/ --path-rename 'bot/::'` |
| 5 | frontend | Add root `package.json` (workspace), copy `.env.example`, add `.github/workflows/` |
| 6 | contracts | Adapt `scripts/bootstrap.sh` (remove Node.js checks), adapt CI workflow paths |
| 7 | bot | Create `.env.example`, create `README.md`, add `.github/workflows/ci.yml` |
| 8 | All | Run smoke test scripts from a clean clone |
| 9 | All | Verify P1–P6 correctness properties |
| 10 | All | Push to new GitHub repos, configure branch protection and secrets |
| 11 | frontend | Configure Vercel project: root directory = `.`, build command = `npm run build` |
| 12 | All | Archive or deprecation-notice the original monorepo |
