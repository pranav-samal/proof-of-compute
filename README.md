# Proof-of-Compute

A blockchain-based decentralised GPU computing marketplace with on-chain verification,
escrow-based payment, and cryptographic receipts.

> **Status:** Frontend complete (mock adapters). Smart contracts, backend, and agents in progress.  
> See [`docs/WORK_PLAN.md`](docs/WORK_PLAN.md) for the MVP task breakdown,
> [`docs/SPEC.md`](docs/SPEC.md) for all shared definitions, and
> [`docs/tasks/`](docs/tasks/) for the four member task files.

---

## Repository Structure

```
Blockchain-cp/
│
├── frontend/        React + TypeScript + Vite UI (complete, mock adapters)
├── contracts/       Solidity contracts, Hardhat tests, deploy scripts
├── backend/         REST API, IPFS pinning, on-chain event indexer
├── agents/          Provider agent, verifier service
├── simulation/      Policy comparison simulator and output JSON
│
└── docs/
    ├── SPEC.md              ← Single source of truth for all names and types
    ├── WORK_PLAN.md         ← MVP task breakdown and dependency order
    ├── PATENT.md            ← Patent draft (written after full flow works)
    └── tasks/
        ├── 01_CONTRACTS.md  ← Member 1 — Solidity, Hardhat, deploy
        ├── 02_BACKEND.md    ← Member 2 — Express, SQLite, IPFS, indexer
        ├── 03_AGENTS.md     ← Member 3 — provider agent, verifier service
        └── 04_INTEGRATION.md← Member 4 — real adapters, simulation, docker-compose
```

---

## How to Run Each Part

### Frontend — works today (mock data)

```bash
cd frontend
npm install
npm run dev
# Open http://localhost:5173
```

The frontend uses mock adapters by default (`VITE_USE_MOCK=true`).
Set `VITE_USE_MOCK=false` and fill in contract addresses after contracts are deployed.

```bash
cd frontend
npm run build     # production build
npm run preview   # preview production build
npx tsc --noEmit  # type check only
```

---

### Contracts (Member 1 — in progress)

```bash
cd contracts
npm install
cp .env.example .env     # fill in DEPLOYER_PRIVATE_KEY, RPC_URL
npx hardhat compile
npx hardhat test
npx hardhat run scripts/deploy.ts --network localhost
```

---

### Backend (Member 2 — in progress)

```bash
cd backend
npm install
cp .env.example .env     # fill in DATABASE_PATH, RPC_URL, PINATA_JWT, contract addresses
npm run dev
# API available at http://localhost:3001
curl http://localhost:3001/health
```

---

### Agents (Member 3 — in progress)

```bash
cd agents
npm install
cp .env.example .env     # fill in PROVIDER_PRIVATE_KEY, VERIFIER_PRIVATE_KEY, RPC_URL
npm run provider         # start provider agent
npm run verifier         # start verifier service
```

---

### Simulation (Member 4 — in progress)

```bash
cd simulation
pip install -r requirements.txt
python simulate.py
# Writes frontend/public/simulation.json
python -m pytest test_simulate.py -v
```

---

## Full Local Stack (once all parts exist)

```bash
# Option A: shell script
bash scripts/start-local.sh

# Option B: Docker Compose
docker compose up --build
# Open http://localhost:5173
```

Manual steps (terminals):
```bash
# Terminal 1 — Hardhat local chain
cd contracts && npx hardhat node

# Terminal 2 — Deploy contracts
cd contracts && npx hardhat run scripts/deploy.ts --network localhost

# Terminal 3 — Backend
cd backend && npm run dev

# Terminal 4 — Provider agent
cd agents && npm run provider

# Terminal 5 — Verifier service
cd agents && npm run verifier

# Terminal 6 — Frontend (real adapters)
cd frontend && VITE_USE_MOCK=false npm run dev
```

---

## Key Design Decisions

| Concept | Description |
|---|---|
| **Policy locked before execution** | Risk score and tier are computed and recorded on-chain before any result can be submitted (SPEC §4.10) |
| **Escrow-based payment** | Funds locked at job registration; released/slashed only by verifier attestations |
| **Canonical job states** | `REGISTERED → ASSIGNED → COMMITTED → VERIFYING → SETTLED / DISPUTED → REFUNDED` |
| **Verification tiers** | 0=hash check, 1=sampled re-execution, 2=multi-provider, 3=full re-execution + challenge |
| **EIP-712 attestations** | Verifiers sign structured data; on-chain signature recovery prevents forgery |
| **Mock-first frontend** | All service calls go through `services/api.ts` and `chain.ts`; swap by `VITE_USE_MOCK=false` |
| **prevrandao verifier selection** | Prototype randomness; VRF planned for future (noted in SPEC §5.3) |

---

## Contributing

1. Read `docs/SPEC.md` before writing any code.
2. Read your own task file in `docs/tasks/`.
3. Work only in your folder. Shared changes go through a PR approved by all members.
4. Branch names: `feat/contracts-*`, `feat/backend-*`, `feat/agents-*`, `feat/integration-*`.
5. Never push directly to `main`. Never commit `.env` files or private keys.
6. If a name, function, or field is not in `SPEC.md`, add it to `SPEC.md` by PR first.

---

## Open Questions

See [`docs/SPEC.md §14`](docs/SPEC.md#14-open-questions) for the full list.
Resolve as a group; update SPEC.md by PR.
