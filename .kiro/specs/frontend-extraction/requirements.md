# Requirements Document

## Introduction

The `agegg-stellar` monorepo currently co-locates three distinct workspaces: a Next.js frontend (`web/`), a Rust/Soroban smart-contract suite (`contracts/`), and a TypeScript settlement bot (`bot/`), together with a shared embeddable widget (`packages/widget/`). Development velocity on the frontend is slowed by the monorepo entanglement: shared tooling, cross-workspace CI noise, and the cognitive overhead of unrelated codebases.

This feature extracts the `web/` frontend (and its companion `packages/widget/`) into a fully self-contained standalone repository so that frontend development can proceed independently. The existing `contracts/` and `bot/` workspaces are each extracted into their own repositories as well, preserving their full history and operational independence. The result is three clean, focused repositories that can be versioned, deployed, and contributed to separately.

## Glossary

- **Monorepo**: The existing `agegg-stellar` Git repository containing all workspaces.
- **Frontend_Repo**: The new standalone repository that contains only `web/` and `packages/widget/`.
- **Contracts_Repo**: The new standalone repository that contains only `contracts/` and the root Rust workspace files.
- **Bot_Repo**: The new standalone repository that contains only `bot/`.
- **Extraction**: The process of moving a workspace subtree out of the Monorepo into its own Git repository with preserved history.
- **Root_Artifacts**: Files at the monorepo root that are shared (`.gitignore`, `README.md`, `CHANGELOG.md`, `scripts/`, `docs/`) and must be selectively copied or adapted per target repository.
- **Widget**: The `packages/widget/` embeddable package (`@agegg/widget`) that is built and consumed by the frontend.
- **CI**: GitHub Actions workflows stored under `.github/`.
- **Env_File**: The `.env.example` template that documents all required and optional environment variables for a workspace.

---

## Requirements

### Requirement 1: Identify and document all cross-workspace dependencies

**User Story:** As a developer performing the extraction, I want a clear map of every cross-workspace file reference and shared dependency, so that no dependency is accidentally broken when the workspaces are separated.

#### Acceptance Criteria

1. THE Frontend_Repo SHALL NOT import any file from `contracts/` or `bot/` at build time.
2. THE Frontend_Repo SHALL NOT reference any Rust or Soroban toolchain in its package scripts or CI workflows.
3. WHEN a dependency audit is run against `web/package.json`, THE Dependency_Auditor SHALL confirm that no `@agegg/*` package other than `@agegg/widget` is listed as a dependency.
4. THE Contracts_Repo SHALL NOT reference any Node.js package from `web/` or `bot/` in its Cargo workspace.
5. THE Bot_Repo SHALL NOT reference any Rust crate or Soroban toolchain in its `package.json`.

---

### Requirement 2: Extract the frontend into a standalone repository

**User Story:** As a frontend developer, I want the `web/` directory and the `packages/widget/` package to live in a dedicated repository, so that I can develop, test, and deploy the frontend without touching contracts or bot code.

#### Acceptance Criteria

1. THE Frontend_Repo SHALL contain the full contents of `web/` at its root (i.e., `web/` becomes the root of the repository, not a subdirectory).
2. THE Frontend_Repo SHALL contain the `packages/widget/` directory preserved under `packages/widget/` relative to the new root.
3. THE Frontend_Repo SHALL retain Git commit history for all files that originated in `web/` and `packages/widget/`.
4. WHEN `npm install` is run in the Frontend_Repo root, THE Package_Manager SHALL install all dependencies listed in `web/package.json` without errors.
5. WHEN `npm run build` is run in the Frontend_Repo root, THE Build_System SHALL produce a successful Next.js production build.
6. WHEN `npm run test` is run in the Frontend_Repo root, THE Test_Runner SHALL execute the full Vitest test suite and report results.
7. THE Frontend_Repo SHALL include an `.env.example` file at its root that documents all environment variables required by the frontend, derived from the existing `web/.env.example`.
8. THE Frontend_Repo SHALL include a `README.md` that describes the standalone repository, its purpose, local setup steps, and available scripts.
9. IF the Widget build is required by the frontend, THEN THE Frontend_Repo SHALL include a `packages/widget/` workspace entry in a root-level `package.json` (npm/pnpm workspace) so the widget can be built locally.

---

### Requirement 3: Extract the contracts into a standalone repository

**User Story:** As a smart-contract developer, I want the Rust/Soroban contracts to live in a dedicated repository, so that I can build, test, and deploy contracts independently of the frontend.

#### Acceptance Criteria

1. THE Contracts_Repo SHALL contain `contracts/` and `src/` directories and the root `Cargo.toml` and `Cargo.lock` at its root.
2. THE Contracts_Repo SHALL retain Git commit history for all files that originated in `contracts/` and `src/`.
3. WHEN `cargo build` is run in the Contracts_Repo root, THE Rust_Toolchain SHALL compile the workspace without errors.
4. WHEN `cargo test` is run in the Contracts_Repo root, THE Rust_Toolchain SHALL run all contract unit and integration tests without errors.
5. THE Contracts_Repo SHALL include a `README.md` describing the contract architecture, local build prerequisites, and deployment instructions, adapted from the relevant sections of the Monorepo README.
6. THE Contracts_Repo SHALL include the `scripts/` deployment scripts (`bootstrap.sh`, `rollback.sh`, `measure-contract-wasm-size.sh`) relevant to contract operations.

---

### Requirement 4: Extract the bot into a standalone repository

**User Story:** As a DevOps engineer, I want the settlement bot to live in a dedicated repository, so that it can be deployed, monitored, and iterated on without coupling to frontend releases.

#### Acceptance Criteria

1. THE Bot_Repo SHALL contain the full contents of `bot/` at its root (i.e., `bot/` becomes the root of the repository).
2. THE Bot_Repo SHALL retain Git commit history for all files that originated in `bot/`.
3. WHEN `npm install` is run in the Bot_Repo root, THE Package_Manager SHALL install all dependencies listed in `bot/package.json` without errors.
4. WHEN `npm test` is run in the Bot_Repo root, THE Test_Runner SHALL execute all Vitest tests and report results.
5. THE Bot_Repo SHALL include a `README.md` derived from `bot/DEPLOYMENT.md` that covers environment setup, Docker usage, and dry-run instructions.
6. THE Bot_Repo SHALL include the `Dockerfile` and `docker-compose.yml` at its root.

---

### Requirement 5: Adapt CI/CD workflows for each standalone repository

**User Story:** As a developer, I want each standalone repository to have its own CI workflow that only runs the checks relevant to that workspace, so that unrelated failures do not block merges.

#### Acceptance Criteria

1. THE Frontend_Repo SHALL include a GitHub Actions workflow that runs `npm run lint`, `npm run test`, and `npm run build` on every push and pull request to the default branch.
2. THE Contracts_Repo SHALL include a GitHub Actions workflow that runs `cargo fmt --check`, `cargo clippy -- -D warnings`, and `cargo test` on every push and pull request.
3. THE Bot_Repo SHALL include a GitHub Actions workflow that runs `npm run lint` and `npm test` on every push and pull request.
4. WHEN a CI workflow in the Frontend_Repo triggers, THE CI_System SHALL NOT execute any Rust or Soroban build steps.
5. WHEN a CI workflow in the Contracts_Repo triggers, THE CI_System SHALL NOT execute any Node.js or npm build steps.
6. WHERE preview deployments are configured, THE Frontend_Repo CI workflow SHALL include a preview deployment job that posts the preview URL as a pull request comment, consistent with the existing monorepo setup described in `docs/preview-deployments.md`.

---

### Requirement 6: Preserve and adapt shared documentation and root artifacts

**User Story:** As any developer onboarding to a standalone repository, I want the repository's README and docs to be accurate and self-contained, so that I can set up the project without referring to the old monorepo.

#### Acceptance Criteria

1. THE Frontend_Repo SHALL NOT contain documentation sections or links that reference `contracts/`, `bot/`, or the original Monorepo structure.
2. THE Contracts_Repo SHALL NOT contain documentation sections or links that reference `web/`, `bot/`, or the original Monorepo structure.
3. THE Bot_Repo SHALL NOT contain documentation sections or links that reference `web/`, `contracts/`, or the original Monorepo structure.
4. WHEN a developer follows the setup steps in any repository's `README.md`, THE Repository SHALL reach a runnable state without requiring files from another repository.
5. THE Frontend_Repo SHALL carry over the `CHANGELOG.md` sections relevant to the frontend and Widget, with entries unrelated to other workspaces removed or clearly attributed.

---

### Requirement 7: Maintain a stable contract ABI reference in the frontend

**User Story:** As a frontend developer, I want the frontend repository to include a copy of the contract ABI or type bindings it depends on, so that I can compile and type-check the frontend without access to the Contracts_Repo.

#### Acceptance Criteria

1. THE Frontend_Repo SHALL include a vendored or auto-generated copy of any Soroban contract bindings or ABI files that are imported by `web/lib/contract.ts` or its transitive dependencies.
2. WHEN `npm run build` is run in the Frontend_Repo, THE Build_System SHALL resolve all contract type imports from files within the Frontend_Repo without requiring a local clone of the Contracts_Repo.
3. THE Frontend_Repo README SHALL document the process for regenerating the vendored contract bindings when the contract ABI changes, including the command and which Contracts_Repo version to source from.

---

### Requirement 8: Validate each extraction with a clean-checkout smoke test

**User Story:** As a developer, I want to verify that each standalone repository works correctly after a fresh clone with no prior build artifacts, so that onboarding is reliable and reproducible.

#### Acceptance Criteria

1. WHEN a developer clones the Frontend_Repo into a clean directory and runs `npm install && npm run build`, THE Build_System SHALL succeed without requiring any files from outside the repository.
2. WHEN a developer clones the Contracts_Repo into a clean directory and runs `cargo build`, THE Rust_Toolchain SHALL succeed without requiring any files from outside the repository.
3. WHEN a developer clones the Bot_Repo into a clean directory and runs `npm install && npm test`, THE Test_Runner SHALL succeed without requiring any files from outside the repository.
4. IF any smoke test fails, THEN THE Extraction_Process SHALL be considered incomplete and the responsible workspace SHALL be fixed before the extraction is marked done.
