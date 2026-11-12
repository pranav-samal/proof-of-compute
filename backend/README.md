# /backend — API, IPFS Pinning, Event Indexer

This folder contains the off-chain server for Proof-of-Compute.

## What goes here

| File / folder | Purpose |
|---|---|
| `src/api/` | REST API routes matching `docs/SPEC.md`: providers, jobs, job detail, receipts, spec validation |
| `src/indexer/` | On-chain event listener — indexes contract events into the database (jobs, providers, attestations, receipts) |
| `src/ipfs/` | IPFS helpers: pin job specs and results (Pinata or local node), return CID, fetch and verify by CID |
| `src/db/` | Database schema and migrations (SQLite for dev, Postgres for production) |
| `src/matching/` | Provider matching and ranking: hardware compatibility, cost, availability, latency, reputation |
| `prisma/` or `migrations/` | DB migration files |
| `Dockerfile` | Container definition |

## Endpoints (defined in SPEC.md)

- `GET  /providers` — list providers with filters
- `GET  /providers/:id` — provider detail
- `POST /jobs` — register a new job spec (pins to IPFS, returns CID)
- `GET  /jobs` — list jobs
- `GET  /jobs/:id` — job detail with on-chain state
- `GET  /receipts/:jobId` — job receipt (verifies IPFS hash against chain)

## Setup (once backend exists)

```bash
npm install
cp .env.example .env   # fill in values
npm run dev
```

## Notes

- Never assign a provider here. The final assignment is a real on-chain transaction.
- Always verify on read that the IPFS CID content matches the on-chain hash.
- See `docs/SPEC.md` for field names and event definitions.
- Consumes `contracts/deployments/<network>.json` for contract address and ABI.
