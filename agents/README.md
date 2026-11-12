# /agents — Provider Agent & Verifier Service

This folder contains the off-chain autonomous processes that interact with the smart contracts.

## What goes here

| File / folder | Purpose |
|---|---|
| `provider/` | Provider agent: watches for `JobAssigned` events, downloads spec by CID, runs the job in a container, uploads output to IPFS, computes result hash (+ optional Merkle root of checkpoints), calls `commitResult` on-chain |
| `verifier/` | Verifier service: watches for verifier selection events, re-executes the sampled portion or full job depending on tier, compares results, signs an attestation, calls `submitAttestation` on-chain |
| `shared/` | Shared wallet helpers, IPFS client, contract ABIs |
| `jobs/` | Supported workload definitions (deterministic hash workload, matrix multiply, tolerance-bound workload) |
| `Dockerfile.provider` | Container for the provider agent |
| `Dockerfile.verifier` | Container for the verifier service |

## Cheat mode (for demo)

Set `AGENT_CHEAT_MODE=true` in `.env` to make the provider agent return a deliberately wrong result hash. This triggers detection and slashing, demonstrating the enforcement mechanism.

## Setup (once agents exist)

```bash
npm install
cp .env.example .env   # fill in values
npm run provider       # start provider agent
npm run verifier       # start verifier service
```

## Notes

- Each agent uses its own wallet — never share keys between agents.
- Supported workloads for MVP: deterministic hash, matrix multiplication, one tolerance-bound workload (D and T reproducibility classes).
- See `docs/SPEC.md` for `commitResult` arguments, attestation format, and verifier selection logic.
- Consumes `contracts/deployments/<network>.json` for contract address and ABI.
