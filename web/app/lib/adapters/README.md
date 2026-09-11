# Wine Black adapters

UI code should not import `@stacks/connect`, `@stacks/transactions`, or `getRuntimeConfig` directly when performing Wine Black contract operations or chain reads that are already abstracted here.

## Modules

| Module | Role |
|--------|------|
| **`wine-black-contract.ts`** | Wallet-facing writes: `place-bet`, `claim-winnings`. Encodes Clarity args and resolves contract id from runtime config. |
| **`wine-black-read-api.ts`** | Read-only pool/market/user data (`wineBlackReadApi`) plus Hiro helpers (`getStacksCoreApiBaseUrl`, `fetchwineBlackContractEvents`). Delegates to `stacks-api`. |
| **`types.ts`** | Re-exports domain types (`Pool`, `ActivityItem`) so presentational components avoid importing `stacks-api` for types only. |

Lower-level modules (`stacks-api`, `appkit-transactions`) remain the implementation; adapters are the stable surface for pages and feature components.

## Testing

- Mock `wineBlackContract` or `wineBlackReadApi` in component tests instead of Stacks SDK modules.
- For read-path activity tests, prefer Soroban RPC/event-service payloads over legacy Stacks transaction shapes.
- Keep direct `@stacks/*` mocks only in compatibility suites that are explicitly labeled as such.
- See `web/tests/lib/wine-black-contract-adapter.test.ts` for isolated adapter behavior.
