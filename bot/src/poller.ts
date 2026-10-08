/**
 * Polling orchestrator.
 *
 * Runs a periodic loop that:
 *   1. Scans all pools for expired-but-unsettled entries.
 *   2. Determines the winning outcome for each (oracle or default).
 *   3. Batches them into settle_pools calls.
 *   4. Logs and notifies on results.
 *
 * Winning outcome resolution
 * ─────────────────────────
 * Binary prediction pools require an external signal to determine the winner.
 * The bot supports two modes:
 *
 *   AUTO_SETTLE_ENABLED=false (default)
 *     The bot only LOGS expired pools — it does NOT submit transactions.
 *     A human admin reviews the list and calls settle_pool manually (or
 *     integrates an oracle before enabling auto-settle).
 *
 *   AUTO_SETTLE_ENABLED=true
 *     The bot settles using DEFAULT_WINNING_OUTCOME for every pool.
 *     This is suitable when:
 *       - The contract has a built-in oracle already writing the winner, OR
 *       - You are running a protocol-controlled market where a specific
 *         outcome is always authoritative (e.g., "resolved by admin"), OR
 *       - You have patched resolveWinningOutcome() below with your own logic.
 *
 *   Custom oracle integration
 *     Replace the resolveWinningOutcome() function body with a call to your
 *     off-chain oracle or API. The function receives the full Pool object so
 *     you can use pool.title / pool.outcome_a_name / pool.outcome_b_name to
 *     look up the correct outcome.
 */

import type { BotConfig } from "./config.js";
import type { CycleSummary, SettlementAttempt } from "./types.js";
import type { Pool } from "./types.js";
import { ContractClient } from "./contract-client.js";
import { Executor } from "./executor.js";
import { logger } from "./logger.js";
import { notify } from "./webhook.js";

// ─── Horizon price-feed helper ────────────────────────────────────────────────

/**
 * Fetches the last trade price of an asset pair from Stellar Horizon.
 *
 * Uses the `/order_book` endpoint which is available on both testnet and pubnet
 * without authentication.  Returns `null` when the order book has no trades or
 * the request fails, so the caller can fall back gracefully.
 *
 * @param base     - Base asset.  Use `"native"` for XLM.
 * @param counter  - Counter asset.  Use `"native"` for XLM.
 * @param horizonUrl - Horizon base URL (e.g. `https://horizon-testnet.stellar.org`).
 *
 * @example
 * // Fetch the XLM/USDC mid-price from testnet
 * const price = await fetchHorizonPrice(
 *   { type: "native" },
 *   { type: "credit_alphanum4", code: "USDC", issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" },
 *   "https://horizon-testnet.stellar.org"
 * );
 */
export async function fetchHorizonPrice(
  base: HorizonAsset,
  counter: HorizonAsset,
  horizonUrl = "https://horizon-testnet.stellar.org",
): Promise<number | null> {
  try {
    const params = new URLSearchParams({
      selling_asset_type: base.type,
      ...(base.type !== "native" && {
        selling_asset_code: (base as HorizonIssuedAsset).code,
        selling_asset_issuer: (base as HorizonIssuedAsset).issuer,
      }),
      buying_asset_type: counter.type,
      ...(counter.type !== "native" && {
        buying_asset_code: (counter as HorizonIssuedAsset).code,
        buying_asset_issuer: (counter as HorizonIssuedAsset).issuer,
      }),
      limit: "1",
    });

    const url = `${horizonUrl}/order_book?${params.toString()}`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      logger.warn("Horizon order-book request failed", {
        status: response.status,
        url,
      });
      return null;
    }

    const data = (await response.json()) as HorizonOrderBook;

    // Use the mid-price between best bid and ask when both sides are present;
    // fall back to whichever side has a price.
    const bid = parseFloat(data.bids?.[0]?.price ?? "0");
    const ask = parseFloat(data.asks?.[0]?.price ?? "0");

    if (bid > 0 && ask > 0) return (bid + ask) / 2;
    if (ask > 0) return ask;
    if (bid > 0) return bid;
    return null;
  } catch (err) {
    logger.warn("fetchHorizonPrice error", { error: String(err) });
    return null;
  }
}

type HorizonNativeAsset = { type: "native" };
type HorizonIssuedAsset = {
  type: "credit_alphanum4" | "credit_alphanum12";
  code: string;
  issuer: string;
};
type HorizonAsset = HorizonNativeAsset | HorizonIssuedAsset;

interface HorizonOrderBook {
  bids?: Array<{ price: string; amount: string }>;
  asks?: Array<{ price: string; amount: string }>;
}

// ─── Oracle hook ─────────────────────────────────────────────────────────────

/**
 * Determine the winning outcome index for an expired pool.
 *
 * This function is the **single integration point** for external price/oracle
 * data.  The implementation below shows three concrete strategies; pick the one
 * that matches your pool design and delete the others.
 *
 * Return `null` to skip settling a pool — the bot will log it as needing manual
 * settlement and will try again on the next cycle.
 *
 * Outcome index convention (matches the Soroban contract):
 *   0 = outcome_a wins
 *   1 = outcome_b wins
 *
 * ─── Strategy A: Horizon price threshold ────────────────────────────────────
 *
 * For pools whose title follows the pattern "XLM > $0.15" or "BTC > $50000",
 * extract the threshold and compare against the live Horizon mid-price.
 *
 *   Pool title  : "Will XLM/USDC trade above $0.15 by end of month?"
 *   outcome_a   : "Yes"   → outcome index 0
 *   outcome_b   : "No"    → outcome index 1
 *
 * ─── Strategy B: Admin/operator manual key ──────────────────────────────────
 *
 * Keep AUTO_SETTLE_ENABLED=false and resolve via an authenticated endpoint that
 * only the pool admin can write to.  The oracle fetches the admin's decision.
 *
 * ─── Strategy C: Default fallback ───────────────────────────────────────────
 *
 * Use DEFAULT_WINNING_OUTCOME for all pools.  Useful for protocol-controlled
 * markets where outcome_a is always authoritative (e.g. test deployments).
 */
async function resolveWinningOutcome(
  poolId: number,
  pool: Pool,
  config: BotConfig,
): Promise<number | null> {
  // ── Strategy A: Stellar Horizon price-based resolution ───────────────────
  //
  // Detect price-threshold pools by checking pool.title for a pattern like
  // "XLM > 0.15" or "BTC > 50000".  Adjust the regex to match your title
  // convention.  Remove this block if you don't use price-threshold pools.
  //
  const pricePattern = /\b(xlm|btc|eth)\s*[>＞]\s*\$?([\d,.]+)/i;
  const match = pricePattern.exec(pool.title ?? "");

  if (match) {
    const asset = match[1]!.toUpperCase();
    const threshold = parseFloat((match[2] ?? "0").replace(/,/g, ""));

    // Map asset tickers to their Stellar representations.
    // Extend this map with any additional assets your pools reference.
    const USDC_ISSUER_TESTNET =
      "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

    const assetToHorizon: Record<string, { base: HorizonAsset; counter: HorizonAsset }> = {
      XLM: {
        base: { type: "native" },
        counter: {
          type: "credit_alphanum4",
          code: "USDC",
          issuer: USDC_ISSUER_TESTNET,
        },
      },
      // Add BTC, ETH, etc. when you have Stellar-wrapped issuers for them.
    };

    const pair = assetToHorizon[asset];
    if (pair) {
      const horizonUrl =
        config.network === "mainnet"
          ? "https://horizon.stellar.org"
          : "https://horizon-testnet.stellar.org";

      const currentPrice = await fetchHorizonPrice(
        pair.base,
        pair.counter,
        horizonUrl,
      );

      if (currentPrice !== null) {
        logger.info("Horizon price resolved for pool", {
          poolId,
          asset,
          threshold,
          currentPrice,
          outcome: currentPrice > threshold ? "outcome_a (Yes)" : "outcome_b (No)",
        });

        // outcome index 0 = outcome_a = "Yes, the price exceeded the threshold"
        // outcome index 1 = outcome_b = "No, the price did NOT exceed the threshold"
        return currentPrice > threshold ? 0 : 1;
      }

      logger.warn("Could not fetch Horizon price — deferring to manual settlement", {
        poolId,
        asset,
      });
      return null; // defer to next cycle or manual resolution
    }
  }

  // ── Strategy B: Custom external oracle endpoint ──────────────────────────
  //
  // Uncomment and adapt to call your own resolution service.
  //
  // const ORACLE_URL = process.env["ORACLE_ENDPOINT_URL"];
  // if (ORACLE_URL) {
  //   try {
  //     const res = await fetch(`${ORACLE_URL}/resolve/${poolId}`, {
  //       headers: { Authorization: `Bearer ${process.env["ORACLE_SECRET"]}` },
  //       signal: AbortSignal.timeout(5_000),
  //     });
  //     if (res.ok) {
  //       const { outcome } = (await res.json()) as { outcome: number | null };
  //       if (outcome === 0 || outcome === 1) return outcome;
  //     }
  //   } catch (err) {
  //     logger.warn("Oracle endpoint error", { poolId, error: String(err) });
  //   }
  //   return null; // defer when oracle is reachable but doesn't have an answer yet
  // }

  // ── Strategy C: Default fallback ─────────────────────────────────────────
  //
  // Falls through to DEFAULT_WINNING_OUTCOME when no other strategy matched.
  // Remove this when you have a real oracle so pools don't get silently
  // settled with the wrong outcome.
  //
  void poolId;
  void pool;

  return config.defaultWinningOutcome;
}

// ─── Poller ───────────────────────────────────────────────────────────────────

export class Poller {
  private readonly client: ContractClient;
  private readonly executor: Executor;
  private readonly config: BotConfig;
  private running = false;
  private cycleCount = 0;
  /** Pool IDs that failed in a previous cycle — tracked for escalation logging */
  private readonly persistentFailures = new Map<number, number>();

  constructor(config: BotConfig) {
    this.config = config;
    this.client = new ContractClient(config);
    this.executor = new Executor(config);
  }

  /**
   * Run one complete poll cycle.
   * Returns a summary of what was found and settled.
   */
  async runCycle(): Promise<CycleSummary> {
    const cycleStart = Date.now();
    this.cycleCount++;

    logger.info("Starting settlement cycle", {
      cycle: this.cycleCount,
      dryRun: this.config.dryRun,
      autoSettle: this.config.autoSettleEnabled,
    });

    let poolsScanned = 0;
    let poolsExpiredUnsettled = 0;
    let settlementsAttempted = 0;
    let settlementsSucceeded = 0;
    let settlementsFailed = 0;

    try {
      // ── Step 1: find expired unsettled pools ────────────────────────────
      const expired = await this.client.findExpiredUnsettledPools(
        this.config.batchSize,
      );

      // We need the total pool count for the "scanned" metric but we already
      // fetched it inside findExpiredUnsettledPools. Re-fetch is cheap enough.
      poolsScanned = await this.client.getPoolCount();
      poolsExpiredUnsettled = expired.length;

      logger.info("Pool scan complete", {
        poolsScanned,
        poolsExpiredUnsettled,
        cycle: this.cycleCount,
      });

      if (poolsExpiredUnsettled === 0) {
        logger.info("No expired unsettled pools found");
        return {
          cycleStartTs: cycleStart,
          poolsScanned,
          poolsExpiredUnsettled: 0,
          settlementsAttempted: 0,
          settlementsSucceeded: 0,
          settlementsFailed: 0,
          durationMs: Date.now() - cycleStart,
        };
      }

      // ── Step 2: resolve winning outcomes ────────────────────────────────
      const candidates: Array<{ poolId: number; winningOutcome: number }> = [];

      for (const { poolId, pool } of expired) {
        if (!this.config.autoSettleEnabled) {
          // Alert mode only: log but don't settle
          logger.warn("Pool needs manual settlement (AUTO_SETTLE_ENABLED=false)", {
            poolId,
            title: pool.title,
            expiry: new Date(Number(pool.expiry) * 1000).toISOString(),
            participant_count: pool.participant_count,
            outcome_a: pool.outcome_a_name,
            outcome_b: pool.outcome_b_name,
          });
          continue;
        }

        const winningOutcome = await resolveWinningOutcome(poolId, pool, this.config);

        if (winningOutcome === null) {
          logger.warn("Could not resolve winning outcome — skipping pool", {
            poolId,
            title: pool.title,
          });
          continue;
        }

        candidates.push({ poolId, winningOutcome });
      }

      if (candidates.length === 0) {
        logger.info("No pools to settle in this cycle", {
          reason: this.config.autoSettleEnabled
            ? "all outcomes unresolvable"
            : "AUTO_SETTLE_ENABLED=false",
        });

        return {
          cycleStartTs: cycleStart,
          poolsScanned,
          poolsExpiredUnsettled,
          settlementsAttempted: 0,
          settlementsSucceeded: 0,
          settlementsFailed: 0,
          durationMs: Date.now() - cycleStart,
        };
      }

      // ── Step 3: execute settlements ──────────────────────────────────────
      settlementsAttempted = candidates.length;
      const results: SettlementAttempt[] = await this.executor.settleAll(candidates);

      settlementsSucceeded = results.filter((r) => r.success).length;
      settlementsFailed = results.filter((r) => !r.success).length;

      // ── Step 4: track persistent failures ───────────────────────────────
      for (const result of results) {
        if (result.success) {
          this.persistentFailures.delete(result.poolId);
        } else {
          const prev = this.persistentFailures.get(result.poolId) ?? 0;
          const failCount = prev + 1;
          this.persistentFailures.set(result.poolId, failCount);

          if (failCount >= 3) {
            logger.error("Pool has failed to settle repeatedly — manual intervention needed", {
              poolId: result.poolId,
              failureCount: failCount,
              lastError: result.error,
            });
          }
        }
      }

      // ── Step 5: notify ───────────────────────────────────────────────────
      const successfulSettlements = results.filter((r) => r.success);
      if (successfulSettlements.length > 0) {
        await notify(this.config, successfulSettlements);
      }

      logger.info("Settlement cycle complete", {
        cycle: this.cycleCount,
        poolsScanned,
        poolsExpiredUnsettled,
        settlementsAttempted,
        settlementsSucceeded,
        settlementsFailed,
        durationMs: Date.now() - cycleStart,
      });
    } catch (err) {
      logger.error("Settlement cycle encountered unhandled error", {
        cycle: this.cycleCount,
        error: String(err),
        stack: err instanceof Error ? err.stack : undefined,
        durationMs: Date.now() - cycleStart,
      });
    }

    return {
      cycleStartTs: cycleStart,
      poolsScanned,
      poolsExpiredUnsettled,
      settlementsAttempted,
      settlementsSucceeded,
      settlementsFailed,
      durationMs: Date.now() - cycleStart,
    };
  }

  /**
   * Start the polling loop. Runs indefinitely until stop() is called or
   * the process receives a termination signal.
   *
   * The interval timer is reset after each cycle completes so long-running
   * cycles don't pile up (scheduling is "every N ms after completion").
   */
  async start(): Promise<void> {
    if (this.running) {
      logger.warn("Poller already running");
      return;
    }

    this.running = true;
    logger.info("Settlement bot started", {
      network: this.config.network,
      contractId: this.config.contractId,
      pollIntervalMs: this.config.pollIntervalMs,
      dryRun: this.config.dryRun,
      autoSettleEnabled: this.config.autoSettleEnabled,
    });

    while (this.running) {
      await this.runCycle();

      if (!this.running) break;

      logger.debug("Sleeping until next cycle", {
        sleepMs: this.config.pollIntervalMs,
      });
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          resolve();
        }, this.config.pollIntervalMs);

        // Allow the timer to be cleared by stop()
        (this as unknown as Record<string, unknown>)["_sleepTimer"] = timer;
      });
    }

    logger.info("Settlement bot stopped gracefully");
  }

  stop(): void {
    this.running = false;
    const timer = (this as unknown as Record<string, unknown>)["_sleepTimer"];
    if (timer) clearTimeout(timer as ReturnType<typeof setTimeout>);
  }
}
