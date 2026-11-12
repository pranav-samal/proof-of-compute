# /contracts — Solidity Smart Contracts

This folder contains all on-chain logic for Proof-of-Compute.

## What goes here

| File / folder | Purpose |
|---|---|
| `contracts/ProviderRegistry.sol` | Provider registration, stake deposit/withdraw/lock, reputation, slashing |
| `contracts/VerificationPolicy.sol` | Computes risk score and locks tier/collateral/challenge window before any result can be committed |
| `contracts/JobEscrow.sol` | `registerJob`, `assignProvider`, `commitResult`, verifier selection, `submitAttestation`, quorum, `settle`, dispute escalation |
| `contracts/Receipt.sol` | Non-transferable receipt written at settlement; `getReceipt` by job ID |
| `test/` | Hardhat tests for every happy path and failure case (accepted, rejected, slashed, timeout, challenge) |
| `scripts/deploy.ts` | Hardhat deploy script |
| `deployments/<network>.json` | Deployed addresses and ABI snapshots — consumed by `/frontend` and `/backend` |
| `hardhat.config.ts` | Hardhat config (networks, compiler version) |

## Setup (once contracts exist)

```bash
npm install
npx hardhat compile
npx hardhat test
npx hardhat run scripts/deploy.ts --network localhost
```

## Notes

- **Publish the ABI and events first** (even a stub), so `/frontend` and `/backend` can build against them before the full logic is done.
- Job states: `REGISTERED → ASSIGNED → COMMITTED → VERIFYING → SETTLED / DISPUTED → REFUNDED`
- See `docs/SPEC.md` for all function signatures, events and field names.
