/**
 * wine-black-contract — canonical re-export alias for the Predinex contract adapter.
 *
 * The contract was originally named `wine-black`; several components import
 * from this path. This file re-exports everything from the canonical
 * `predinex-contract` adapter so both import paths work identically.
 *
 * New code should import from `./predinex-contract` directly.
 */
export { wineBlackContract } from "./predinex-contract";
