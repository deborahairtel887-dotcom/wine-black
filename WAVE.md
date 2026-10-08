# Contributing via Drips Wave 🌊

This project participates in the **[Stellar Wave Program](https://www.drips.network/wave/stellar)** — a recurring weekly sprint where contributors earn Points (which translate to real rewards) for meaningful open-source work on the Stellar ecosystem.

If you arrived here from [drips.network/wave/stellar](https://www.drips.network/wave/stellar), you're in the right place. This document tells you exactly how to get started.

---

## What is Drips Wave?

Drips Wave is a structured contribution program run by [Drips Network](https://www.drips.network). Each **Wave** is a 7-day sprint in which contributors:

1. Pick up tagged issues from eligible repositories.
2. Submit a pull request that passes CI and gets reviewed.
3. Earn **Points** proportional to the difficulty and quality of the contribution.
4. Receive rewards from the monthly budget (currently $75,000 per Stellar Wave).

You don't need to create an account to contribute — just fork, code, and open a PR.

**Full program rules:** [docs.drips.network/wave/terms-and-rules](https://docs.drips.network/wave/terms-and-rules)

---

## Project Overview

Wine Black Stellar is a prediction-market protocol on Stellar/Soroban. The repository has three main components:

| Component | Path | Language | Role |
|-----------|------|----------|------|
| Smart contract | `contracts/predinex/` | Rust (Soroban) | On-chain pool, bet, settlement logic |
| Settlement bot | `bot/` | TypeScript | Polls for expired pools; auto-settles or alerts |
| Web app | `web/` | Next.js 14 / TypeScript | Frontend UI for markets |

---

## Finding Issues for the Current Wave

All Wave-eligible issues are tagged **`good first issue`** or **`wave`** in the GitHub Issues tab. During an active Wave, those issues are listed at:

[drips.network/wave/stellar/issues](https://www.drips.network/wave/stellar/issues)

### Issue difficulty guide

| Label | Typical scope | Who it's for |
|-------|--------------|--------------|
| `good first issue` | Single file, clear acceptance criteria, < 4 hrs | First-time contributors |
| `wave` | Multi-file, requires understanding the data flow | Experienced contributors |
| `contract` | Rust / Soroban changes, requires `cargo test` to pass | Rust/smart-contract devs |

---

## Quick-Start (15 minutes to first green CI)

### 1. Clone and install

```bash
git clone https://github.com/your-org/wine-black.git
cd wine-black
./scripts/bootstrap.sh        # verifies Rust, Node, Stellar CLI, etc.
```

### 2. Set up the web app

```bash
cd web
cp ../.env.example .env.local   # fill in NEXT_PUBLIC_SOROBAN_CONTRACT_ID
npm install
npm run dev                     # http://localhost:3000
```

### 3. Run checks before pushing

**Web:**
```bash
cd web
npm run lint
npm test -- --run
npm run build
```

**Contract (only if you touched Rust files):**
```bash
cd contracts/predinex
cargo fmt --check
cargo clippy -- -D warnings
cargo test
```

**Bot (only if you touched `bot/src/`):**
```bash
cd bot
npm ci
npm run lint
npm test
```

All three check suites must pass for CI to go green. The full CI spec is in `.github/workflows/ci.yml`.

---

## What Makes a Good Wave Contribution?

The Drips Wave reviewers evaluate contributions on **real value delivered**, not just lines changed. Here are the things that matter most for this project:

### Bug fixes
- Point directly to the broken behaviour in a test or CI log.
- Include a test that reproduces the bug **before** the fix and passes **after**.

### New smoke/unit tests
- Follow the existing pattern in `web/tests/routes/smoke.test.tsx`.
- Each new test should cover a page or utility that currently has no coverage.

### Oracle improvements
- The settlement bot's `resolveWinningOutcome()` in `bot/src/poller.ts` is deliberately extensible. A contribution that wires in a real price-feed query (Horizon, Pyth, Reflector) for a specific pool type is a great Wave issue.

### Documentation
- Fix a broken command, dead link, or outdated file path (the contract formerly had a different name — `wine-black` — and references to it may still exist in docs).

---

## Contribution Workflow

1. **Comment on the issue** to signal you are working on it.
2. **Fork** the repo and create a branch:
   ```
   feat/your-short-description
   fix/issue-123-short-description
   docs/update-wave-guide
   ```
3. **Open a draft PR** early so reviewers can give early feedback.
4. **Fill in the PR template** completely — incomplete descriptions slow down review significantly.
5. **Mark the PR ready** once all checks pass.

The full PR checklist is in [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## Key Files to Know

| File | Why it matters |
|------|---------------|
| `contracts/predinex/src/lib.rs` | The entire on-chain contract logic |
| `bot/src/poller.ts` | Oracle hook + settlement loop |
| `web/app/lib/soroban-transaction-service.ts` | TX building / signing / polling |
| `web/app/lib/soroban-event-service.ts` | Event decoding for the activity feed |
| `web/tests/routes/smoke.test.tsx` | Route smoke tests — add one for every new page |
| `docs/contract-api.md` | Public contract function reference |
| `web/docs/CONTRACT_EVENTS.md` | On-chain event schema |

---

## Getting Help

- **Discord:** [discord.gg/t8XBXZAEs5](https://discord.gg/t8XBXZAEs5) — `#stellar-wave` channel
- **Drips Wave docs:** [docs.drips.network/wave](https://docs.drips.network/wave)
- **GitHub Issues:** Open an issue if you find a bug in the contribution setup itself

Happy waving 🌊
