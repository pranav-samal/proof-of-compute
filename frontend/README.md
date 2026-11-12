# Proof-of-Compute — Frontend

A decentralized GPU computing marketplace frontend built for the mid-semester blockchain project demo.

## Stack

- **React 18** + **TypeScript** (strict)
- **Vite 5** build tool
- **Tailwind CSS 3** (Sarvam-inspired design system)
- **react-router-dom v6**
- **recharts** — simulation charts
- **qrcode.react** — job receipt QR codes
- **ethers v6** — wallet connection (window.ethereum / MetaMask)

## Run locally

```bash
# 1. Install dependencies
npm install

# 2. Copy env file
cp .env.example .env

# 3. Start development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Build

```bash
npm run build      # TypeScript check + Vite production build
npm run preview    # preview the production build locally
```

## Lint

```bash
npm run lint
```

## Project structure

```
src/
  types/          # All TypeScript types (canonical job states, verification policy, etc.)
  services/
    api.ts        # ApiService interface + mock implementation (VITE_USE_MOCK flag)
    chain.ts      # ChainService interface + mock stubs (TODO: real contract functions)
  lib/
    risk.ts       # Pure functions: risk score, tier, collateral, challenge window, simulation
    utils.ts      # Formatting helpers (cn, formatUsd, formatDate…)
  context/
    WalletContext.tsx   # ethers v6 wallet connection (EIP-1193)
  data/
    providers.ts  # Mock provider data (used only by api.ts mock adapter)
    jobs.ts       # Mock job data (used only by api.ts mock adapter)
    constants.ts  # Status colors, workload labels, verification labels
  components/
    layout/       # AppLayout, Sidebar, Header (with WalletButton)
    ui/           # Shared UI: Button, Card, Badge, StatusBadge, Timeline,
                  #            MetricCard, EmptyState, Modal, FormField,
                  #            PageHeader, DataTable, DemoBadge, WalletButton
    marketplace/  # ProviderCard, ProviderDetailModal
  pages/
    LandingPage.tsx
    MarketplacePage.tsx      # stake/reputation filters, sort by reputation/stake
    SubmitJobPage.tsx        # 5-step wizard + Risk & Verification step
    DashboardPage.tsx
    JobDetailsPage.tsx       # policy, commitment, attestations, settlement tabs
    ProviderConsolePage.tsx  # stake deposit/withdraw, commit result form
    VerifierConsolePage.tsx  # bond, attest, verifier overview
    ReceiptPage.tsx          # QR code, hash-match panel, receipt display
    SimulationPage.tsx       # recharts: cost vs detection for 3 policies
    VerificationPage.tsx     # verification concepts reference
```

## Environment variables

See `.env.example` for all variables. Key ones:

| Variable | Default | Purpose |
|---|---|---|
| `VITE_USE_MOCK` | `true` | Use mock adapters (no backend needed) |
| `VITE_RPC_URL` | unset | EVM RPC endpoint when real chain is configured |
| `VITE_CONTRACT_ADDRESS` | unset | Deployed ProofOfCompute contract address |

## What is real vs mock

| Feature | Status |
|---|---|
| Navigation & all pages | ✅ Fully working |
| Risk score + policy computation | ✅ Real (pure function in `risk.ts`) |
| Wallet connect (MetaMask) | ✅ Real ethers v6 EIP-1193 |
| Provider/job data | 🟡 Mock (illustrative, labelled "Demo data") |
| On-chain registration | 🔴 TODO — sign button disabled until contract configured |
| Escrow / settlement | 🔴 TODO — smart contract not yet deployed |
| Verifier attestations | 🔴 TODO — mock stubs in `chain.ts` |
| Simulation charts | ✅ Real (computed by `risk.ts → simulationDataPoints()`) |
| QR code receipts | ✅ Real rendering, mock underlying data |

## Job states

```
REGISTERED → ASSIGNED → COMMITTED → VERIFYING → SETTLED
                                               ↘ DISPUTED → REFUNDED
```

## Verification tiers

| Tier | Method |
|---|---|
| 0 | Hash + rule check |
| 1 | Sampled re-execution (10%) |
| 2 | Redundant multi-provider execution |
| 3 | Full re-execution + challenge window (24 h) |
