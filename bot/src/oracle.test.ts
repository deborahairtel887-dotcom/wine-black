/**
 * Unit tests for the Horizon price-feed helper exported from poller.ts.
 *
 * Uses vi.stubGlobal to intercept `fetch` calls so no real network requests
 * are made during the test suite.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchHorizonPrice } from "./poller.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeOrderBook(bid: string | null, ask: string | null) {
  return {
    bids: bid !== null ? [{ price: bid, amount: "1000" }] : [],
    asks: ask !== null ? [{ price: ask, amount: "1000" }] : [],
  };
}

function mockFetch(
  body: unknown,
  options: { ok?: boolean; status?: number } = {},
) {
  const { ok = true, status = 200 } = options;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status,
      json: () => Promise.resolve(body),
    }),
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("fetchHorizonPrice", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the mid-price when both bid and ask are present", async () => {
    mockFetch(makeOrderBook("0.12", "0.14"));
    const price = await fetchHorizonPrice(
      { type: "native" },
      {
        type: "credit_alphanum4",
        code: "USDC",
        issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      },
    );
    // mid-price of (0.12 + 0.14) / 2
    expect(price).toBeCloseTo(0.13, 5);
  });

  it("returns the ask price when only asks exist", async () => {
    mockFetch(makeOrderBook(null, "0.18"));
    const price = await fetchHorizonPrice({ type: "native" }, { type: "native" });
    expect(price).toBeCloseTo(0.18, 5);
  });

  it("returns the bid price when only bids exist", async () => {
    mockFetch(makeOrderBook("0.11", null));
    const price = await fetchHorizonPrice({ type: "native" }, { type: "native" });
    expect(price).toBeCloseTo(0.11, 5);
  });

  it("returns null when the order book is empty", async () => {
    mockFetch({ bids: [], asks: [] });
    const price = await fetchHorizonPrice({ type: "native" }, { type: "native" });
    expect(price).toBeNull();
  });

  it("returns null when Horizon responds with a non-OK status", async () => {
    mockFetch({}, { ok: false, status: 503 });
    const price = await fetchHorizonPrice({ type: "native" }, { type: "native" });
    expect(price).toBeNull();
  });

  it("returns null when fetch rejects (network error)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error")),
    );
    const price = await fetchHorizonPrice({ type: "native" }, { type: "native" });
    expect(price).toBeNull();
  });

  it("uses the correct Horizon URL for mainnet", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(makeOrderBook("0.10", "0.11")),
    });
    vi.stubGlobal("fetch", fetchSpy);

    await fetchHorizonPrice(
      { type: "native" },
      {
        type: "credit_alphanum4",
        code: "USDC",
        issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      },
      "https://horizon.stellar.org",
    );

    const url: string = fetchSpy.mock.calls[0]?.[0] ?? "";
    expect(url).toContain("horizon.stellar.org/order_book");
  });

  it("includes asset parameters in the Horizon query string", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(makeOrderBook("0.10", "0.11")),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
    await fetchHorizonPrice(
      { type: "native" },
      { type: "credit_alphanum4", code: "USDC", issuer: USDC_ISSUER },
    );

    const url: string = fetchSpy.mock.calls[0]?.[0] ?? "";
    expect(url).toContain("selling_asset_type=native");
    expect(url).toContain("buying_asset_code=USDC");
    expect(url).toContain(`buying_asset_issuer=${USDC_ISSUER}`);
  });
});
