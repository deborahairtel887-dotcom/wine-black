# Implementation Tasks — Monorepo Extraction (frontend-extraction)

## Overview

These tasks implement the full extraction of `agegg-stellar` into three standalone repositories: `agegg-frontend`, `agegg-contracts`, and `agegg-bot`. Tasks are ordered by dependency — complete all tasks in a phase before starting the next.

---

## Phase 0 — Preparation

- [ ] 0.1 Install and verify `git filter-repo`
  - Run `pip install git-filter-repo` (or `pip3 install git-filter-repo`)
  - Verify with `git filter-repo --version` (requires ≥ 2.38.0)
  - Confirm git version ≥ 2.36 with `git --version`

- [ ] 0.2 Audit cross-workspace imports in the monorepo
  - Run `grep -r "from.*contracts/" web/` — must return no results
  - Run `grep -r "from.*bot/" web/` — must return no results
  - Run `grep -r "path.*web/" Cargo.toml contracts/` — must return no results
  - Run `grep -r "path.*bot/" Cargo.toml contracts/` — must return no results
  - Run `grep -r "from.*web/" bot/` — must return no results
  - Document any findings before proceeding
  - Acceptance: all checks return zero results

- [ ] 0.3 Create a full backup of the monorepo
  - `cp -r agegg-stellar agegg-stellar-backup`
  - Tag current HEAD: `git tag pre-extraction`
  - Acceptance: backup directory exists and is identical to source

---

## Phase 1 — Extract `agegg-contracts`

- [ ] 1.1 Clone and filter the contracts repo
  - `git clone --no-local ./agegg-stellar agegg-contracts`
  - `cd agegg-contracts`
  - Run `git filter-repo --path contracts/ --path src/ --path Cargo.toml --path Cargo.lock --path scripts/ --path deployments/ --prune-degenerate-commits`
  - Acceptance: `git log --oneline | wc -l` shows only commits that touched `contracts/`, `src/`, or root Cargo files

- [ ] 1.2 Verify the Rust workspace is self-contained
  - Run `cargo build` from repo root
  - Run `cargo test` from repo root
  - Acceptance: both commands succeed with zero errors

- [ ] 1.3 Adapt `scripts/bootstrap.sh` for contracts-only
  - Remove the Node.js / npm prerequisite checks and web dependency install steps
  - Keep: Rust/Cargo checks, Stellar CLI check, rustfmt/clippy component checks, `cargo build`, `cargo test`
  - Update the summary output to reflect contracts-only commands
  - Acceptance: `./scripts/bootstrap.sh` runs successfully in the new repo

- [ ] 1.4 Create `.github/workflows/ci.yml` for contracts
  - Port the `contract-checks` job from the monorepo `ci.yml` verbatim
  - Port the `contract-benchmarks` job from the monorepo `ci.yml` verbatim
  - Remove the `web-checks` job entirely
  - Verify workflow file paths (scripts use relative paths from repo root — no changes needed)
  - Port `benchmarks.yml`, `fuzz.yml`, `security-audit.yml`, `deploy-testnet.yml`, `deploy-mainnet.yml` from `.github/workflows/`, updating any `web/` path references
  - Acceptance: YAML is valid (`yamllint .github/workflows/*.yml`), no references to `web/`, `npm`, or `node`

- [ ] 1.5 Write `README.md` for the contracts repo
  - Follow the README outline in the design document exactly
  - Include: title + badges, overview, Mermaid architecture diagram, pool lifecycle diagram, prerequisites, quick start, build/test commands, contract structure, WASM size budget table, deployment links, scripts reference, contributing, license
  - All internal links must resolve within the repo (no links to `web/` or `bot/` content)
  - Acceptance: all links are valid; `cargo test` command in README matches actual command

- [ ] 1.6 Write `CHANGELOG.md` (contracts)
  - Copy entries from the monorepo `CHANGELOG.md` that reference `contracts/`, Soroban, Rust, or smart-contract behaviour
  - Remove or clearly attribute entries unrelated to contracts
  - Acceptance: no entries reference frontend or bot changes

- [ ] 1.7 Run smoke test for contracts
  - Create `scripts/smoke-test.sh` with contents from design document
  - Make executable: `chmod +x scripts/smoke-test.sh`
  - Run from a fresh clone in a temp directory: clone → `./scripts/smoke-test.sh`
  - Acceptance: script exits 0 with "✓ Smoke test passed."

---

## Phase 2 — Extract `agegg-bot`

- [ ] 2.1 Clone and filter the bot repo
  - `git clone --no-local ./agegg-stellar agegg-bot`
  - `cd agegg-bot`
  - Run `git filter-repo --path bot/ --path-rename 'bot/::' --prune-degenerate-commits`
  - Acceptance: `bot/` contents are now at repo root (`src/`, `package.json`, `Dockerfile`, etc.)

- [ ] 2.2 Verify Node.js dependencies install cleanly
  - Run `npm install` from repo root
  - Acceptance: exits 0 with no errors; `node_modules/` is created

- [ ] 2.3 Verify tests pass
  - Run `npm test` (maps to `vitest run`)
  - Acceptance: all tests pass, no import errors

- [ ] 2.4 Create `.env.example`
  - Create file at repo root with contents from the design document (derived from `DEPLOYMENT.md` env var table)
  - Include all variables: `STELLAR_RPC_URL`, `CONTRACT_ID`, `BOT_SECRET_KEY`, `STELLAR_NETWORK`, `POLL_INTERVAL_MS`, `BATCH_SIZE`, `DRY_RUN`, `AUTO_SETTLE_ENABLED`, `DEFAULT_WINNING_OUTCOME`, `MAX_RETRIES`, `RETRY_BASE_DELAY_MS`, `WEBHOOK_URL`, `WEBHOOK_SECRET`, `LOG_LEVEL`
  - Mark required vs optional with inline comments
  - Acceptance: file exists, covers every variable documented in `DEPLOYMENT.md`

- [ ] 2.5 Create `.github/workflows/ci.yml` for the bot
  - Use the workflow design from the design document (Node 22, `npm ci`, `npm run lint`, `npm test`)
  - Triggers: `push` and `pull_request` to `main`
  - Acceptance: YAML is valid; no references to Rust, Cargo, or Soroban

- [ ] 2.6 Write `README.md` for the bot repo
  - Follow the README outline in the design document exactly
  - Derive content from `DEPLOYMENT.md` — cover: overview, prerequisites, quick start, full env var table, dry-run, oracle integration, Docker, Railway, Fly.io deployment, monitoring/logging, security checklist, troubleshooting
  - Remove any references to the monorepo, `web/`, or `contracts/`
  - Acceptance: a developer can follow README alone to deploy the bot to Railway without referencing any external doc

- [ ] 2.7 Create `scripts/smoke-test.sh` for the bot
  - Contents from design document (`npm ci` → `npm run lint` → `npm test`)
  - Make executable
  - Run from a fresh temp clone
  - Acceptance: exits 0

---

## Phase 3 — Extract `agegg-frontend`

- [ ] 3.1 Clone and filter the frontend repo
  - `git clone --no-local ./agegg-stellar agegg-frontend`
  - `cd agegg-frontend`
  - Run `git filter-repo --path web/ --path packages/widget/ --path-rename 'web/::' --prune-degenerate-commits`
  - Acceptance: `web/` contents are at repo root; `packages/widget/` is at `packages/widget/` relative to root

- [ ] 3.2 Create the root `package.json` (workspace)
  - Create `package.json` at repo root with contents from the design document (npm workspaces pointing to `packages/widget`, scripts for dev/build/test/lint/widget:build)
  - Do NOT copy `web/package.json` over this — the existing `package.json` (moved from `web/package.json`) is the app package; the new root file is the workspace envelope
  - Acceptance: `npm install` at repo root installs both app and widget dependencies without errors

- [ ] 3.3 Verify frontend builds cleanly
  - Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_NETWORK=testnet`
  - Run `npm run build` (Next.js production build)
  - Acceptance: build exits 0 with no TypeScript or import errors

- [ ] 3.4 Verify tests pass
  - Run `npm run test -- --run`
  - Acceptance: all Vitest tests pass

- [ ] 3.5 Verify `.env.example` is correct and complete
  - Confirm file is present at repo root (moved from `web/.env.example` by filter-repo)
  - Cross-check all variables referenced in `app/lib/env-boundary.ts` (or equivalent runtime config file) are documented
  - Acceptance: no undocumented `NEXT_PUBLIC_*` variables exist in the codebase

- [ ] 3.6 Create `.github/workflows/ci.yml` for the frontend
  - Port the `web-checks` job from the monorepo `ci.yml`
  - Remove `working-directory: ./web` from all steps
  - Update `cache-dependency-path` from `web/package-lock.json` to `package-lock.json`
  - Preserve the bundle size budget check with the same thresholds (`BUDGET_TOTAL_KB=5800`, `BUDGET_JS_KB=5000`, `BUDGET_CSS_KB=80`)
  - Remove the `contract-checks` and `contract-benchmarks` jobs entirely
  - Acceptance: YAML is valid; no references to `cargo`, `rustup`, or `stellar`

- [ ] 3.7 Create `.github/workflows/preview-deploy.yml` for the frontend
  - Port from the monorepo `preview-deploy.yml`
  - Update `paths` trigger from `web/**` to `**` (entire repo is frontend)
  - Remove `working-directory: ./web` from all steps
  - Update `cache-dependency-path` to `package-lock.json`
  - Update PR comment docs link from `../../docs/preview-deployments.md` to `docs/preview-deployments.md` (copy the doc into the repo)
  - Preserve all three jobs: `deploy-preview`, `cleanup-preview`, commit status creation
  - Acceptance: YAML is valid; Vercel deploy steps reference no monorepo-specific paths

- [ ] 3.8 Copy relevant documentation files
  - Copy `docs/preview-deployments.md` from monorepo → `docs/preview-deployments.md` in frontend repo
  - Copy `web/DEVELOPMENT.md` → `DEVELOPMENT.md` at root (update any `../` relative links that no longer apply)
  - Copy `web/docs/` directory → `docs/` (includes `WALLET_NETWORK_SUPPORT.md`, `POLLING_POLICY.md`, etc.)
  - Remove any links or references to `contracts/`, `bot/`, or the monorepo root
  - Acceptance: all links in `README.md` and `DEVELOPMENT.md` resolve to files within the repo

- [ ] 3.9 Write `README.md` for the frontend repo
  - Follow the README outline in the design document exactly
  - Include: title + badges, overview, tech stack table, prerequisites, quick start, env var table, available scripts table, project structure, contract integration note, wallet support link, deployment guide, contributing, license
  - Contract integration note must explain: contract interaction is via Stellar SDK RPC; set `NEXT_PUBLIC_SOROBAN_CONTRACT_ID` for your deployment; no Rust toolchain required
  - Acceptance: a new frontend developer can clone and run `npm run dev` by following the README alone

- [ ] 3.10 Write `CHANGELOG.md` (frontend)
  - Copy entries from the monorepo `CHANGELOG.md` that reference frontend, UI, Next.js, React, wallet, or widget changes
  - Remove or clearly attribute entries unrelated to the frontend
  - Acceptance: no entries reference contract ABI changes or bot operational changes

- [ ] 3.11 Create `scripts/smoke-test.sh` for the frontend
  - Contents from design document (`npm ci` → lint → test → build)
  - Make executable
  - Run from a fresh temp clone with `.env.local` containing `NEXT_PUBLIC_NETWORK=testnet`
  - Acceptance: exits 0

---

## Phase 4 — Validation

- [ ] 4.1 Verify correctness property P1 — frontend import isolation
  - In `agegg-frontend`, run `npm run build` from a clean clone
  - Run `tsc --noEmit`
  - Grep for any imports containing absolute paths outside the repo: `grep -r "from.*\.\./\.\." app/ components/ lib/` — must return no results that escape the repo root
  - Acceptance: build succeeds; no out-of-repo imports found

- [ ] 4.2 Verify correctness property P2 — contracts Cargo workspace closure
  - In `agegg-contracts`, run `cargo build`
  - Check `Cargo.toml` for any `path = "../../..."` dependencies: `grep -r 'path = "\.\.' contracts/ Cargo.toml`
  - Acceptance: build succeeds; no path dependencies escape the repo

- [ ] 4.3 Verify correctness property P3 — bot Node dependency closure
  - In `agegg-bot`, delete `node_modules/` and run `npm ci` from scratch
  - Check `package.json` for any `file:` or `workspace:` references: `grep -E '"(file:|workspace:)' package.json`
  - Acceptance: `npm ci` succeeds; no local path dependencies

- [ ] 4.4 Verify correctness property P4 — CI cross-contamination
  - In `agegg-frontend/.github/workflows/ci.yml`: `grep -i cargo` and `grep -i rustup` — must return no results
  - In `agegg-contracts/.github/workflows/ci.yml`: `grep -i 'npm run\|next build\|npx' ` — must return no results
  - Acceptance: all checks return zero matches

- [ ] 4.5 Run all three smoke tests from clean clones
  - For each repo: clone into a temp directory → run `./scripts/smoke-test.sh`
  - Acceptance: all three exit 0; any failure blocks this task from completing

- [ ] 4.6 Verify Git history preservation
  - For each repo, pick 3 representative files and verify commit history is non-trivial:
    - `git log --oneline -- <file>` should show ≥ 1 commit from the original monorepo
  - Files to check: `web/app/page.tsx` (→ `app/page.tsx` in frontend), `contracts/agegg/src/lib.rs`, `bot/src/poller.ts`
  - Acceptance: history is non-empty for all checked files

---

## Phase 5 — Publication and Handoff

- [ ] 5.1 Push repos to GitHub
  - Create three new GitHub repositories (empty, no README): `agegg-frontend`, `agegg-contracts`, `agegg-bot`
  - Add remote and push: `git remote add origin <url>` → `git push -u origin main`
  - Acceptance: all three repos are live on GitHub with full history

- [ ] 5.2 Configure branch protection for each repo
  - Require status checks to pass before merging (use the `CI` workflow job as the required check)
  - Require at least 1 PR review
  - Prevent direct pushes to `main`
  - Acceptance: branch protection rules are active on all three repos

- [ ] 5.3 Configure Vercel for `agegg-frontend`
  - Create a new Vercel project linked to `agegg-frontend`
  - Set root directory to `.` (repo root, not `web/`)
  - Set build command to `npm run build`
  - Set output directory to `.next`
  - Add `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` as GitHub Actions secrets
  - Add all required environment variables in Vercel dashboard for Preview environment
  - Acceptance: a test PR triggers a preview deployment and posts a URL comment

- [ ] 5.4 Configure GitHub Actions secrets for contracts
  - Add any deploy secrets needed by `deploy-testnet.yml` and `deploy-mainnet.yml` (Stellar account keys, RPC URLs)
  - Acceptance: secrets are set; deploy workflow is runnable

- [ ] 5.5 Archive the original monorepo
  - Add a notice to the monorepo `README.md` at the top:
    ```markdown
    > ⚠️ **This monorepo has been split.** Active development continues in:
    > - [agegg-frontend](<url>)
    > - [agegg-contracts](<url>)
    > - [agegg-bot](<url>)
    ```
  - Archive the repository in GitHub settings (Settings → Danger Zone → Archive)
  - Acceptance: monorepo is read-only; notice is visible on the repo homepage
