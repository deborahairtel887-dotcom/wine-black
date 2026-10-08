/**
 * wine-black-read-api — canonical re-export alias for the Predinex read adapter.
 *
 * The contract was originally named `wine-black`; several pages import from
 * this path. This file re-exports everything from the canonical
 * `predinex-read-api` adapter so both import paths work identically.
 *
 * New code should import from `./predinex-read-api` directly.
 */
export {
  wineBlackReadApi,
  getStacksCoreApiBaseUrl,
  fetchWineBlackContractEvents,
} from "./predinex-read-api";
export type { PoolExtendedMetadata } from "./predinex-read-api";
