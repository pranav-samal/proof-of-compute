// ─── Provider ────────────────────────────────────────────────────────────────

export type ProviderAvailability = 'available' | 'busy' | 'offline';

export interface GpuSpec {
  model: string;
  vramGb: number;
  count: number;
  architecture: string;
  cudaCores: number;
}

export interface Provider {
  id: string;
  name: string;
  location: string;
  countryCode: string;
  gpu: GpuSpec;
  ramGb: number;
  storageGb: number;
  pricePerHour: number;
  rating: number;
  reviewCount: number;
  completedJobs: number;
  availability: ProviderAvailability;
  uptimePercent: number;
  frameworks: string[];
  verifiedProvider: boolean;
  joinedDate: string;
  tags: string[];
  // ── New chain fields ──────────────────────────────────────
  stakeEth: number;         // amount currently staked
  lockedStakeEth: number;   // portion locked in active jobs
  reputation: number;       // 0–100 on-chain reputation score
  slashCount: number;       // times slashed
  verifiedJobsCount: number;// on-chain verified job count
}

// ─── Job states (canonical) ───────────────────────────────────────────────

export type OnChainJobStatus =
  | 'REGISTERED'
  | 'ASSIGNED'
  | 'COMMITTED'
  | 'VERIFYING'
  | 'SETTLED'
  | 'DISPUTED'
  | 'REFUNDED';

/** Legacy alias kept for dashboard/ui compat */
export type JobStatus = OnChainJobStatus;

// ─── Reproducibility ─────────────────────────────────────────────────────

export type ReproducibilityClass = 'D' | 'T' | 'N';
// D = deterministic, T = tolerance-bound, N = non-deterministic

// ─── Verification tiers ───────────────────────────────────────────────────

export type VerificationTier = 0 | 1 | 2 | 3;
// 0 = hash + rule check
// 1 = sampled re-execution
// 2 = redundant multi-provider execution
// 3 = full re-execution + challenge window

// ─── Verification policy (computed before job runs) ──────────────────────

export interface VerificationPolicy {
  riskScore: number;        // 0–1
  tier: VerificationTier;
  samplingPct: number;      // 0–100
  requiredCollateralEth: number;
  challengeWindowSecs: number;
  reproducibilityClass: ReproducibilityClass;
  assuranceLevel: 'low' | 'medium' | 'high' | 'maximum';
}

// ─── Verifier attestation ─────────────────────────────────────────────────

export interface Attestation {
  verifierId: string;
  verdict: 'pass' | 'fail' | 'inconclusive';
  timestamp: string;
  txHash?: string;
}

// ─── Settlement outcome ───────────────────────────────────────────────────

export interface SettlementOutcome {
  status: 'released' | 'slashed' | 'refunded' | 'held';
  amountEth: number;
  txHash?: string;
  timestamp?: string;
  note: string;
}

// ─── On-chain receipt ─────────────────────────────────────────────────────

export interface JobReceipt {
  jobId: string;
  policyHash: string;         // hash of VerificationPolicy stored on-chain
  resultHash: string;         // SHA-256 of result artifacts
  attestations: Attestation[];
  quorumRequired: number;
  settlement: SettlementOutcome | null;
  receiptTimestamp?: string;
  txHash?: string;
}

// ─── WorkloadType ─────────────────────────────────────────────────────────

export type WorkloadType =
  | 'inference'
  | 'training'
  | 'image-processing'
  | 'general-compute';

// ─── Job config ───────────────────────────────────────────────────────────

export interface JobConfig {
  workloadType: WorkloadType;
  gpuModel: string;
  minVramGb: number;
  minRamGb: number;
  frameworks: string[];
  budgetUsd: number;
  deadline?: string;
  // ── verification & risk ──────────────────────────────────
  reproducibilityClass: ReproducibilityClass;
  assuranceLevel: 'low' | 'medium' | 'high' | 'maximum';
  policy?: VerificationPolicy; // computed at submit time
  description: string;
}

// ─── Job timeline ─────────────────────────────────────────────────────────

export interface JobTimelineEvent {
  id: string;
  timestamp: string;
  label: string;
  detail?: string;
  status: 'completed' | 'active' | 'pending' | 'error';
  txHash?: string;             // optional on-chain tx link
}

// ─── Job ──────────────────────────────────────────────────────────────────

export interface Job {
  id: string;
  title: string;
  config: JobConfig;
  providerId?: string;
  status: OnChainJobStatus;
  createdAt: string;
  updatedAt: string;
  estimatedCostUsd?: number;
  actualCostUsd?: number;
  timeline: JobTimelineEvent[];
  receipt?: JobReceipt;         // populated when SETTLED or DISPUTED
}

// ─── Dashboard metrics ────────────────────────────────────────────────────

export interface DashboardMetrics {
  totalJobs: number;
  activeJobs: number;
  completedJobs: number;
  totalSpendUsd: number;
  successRate: number;
}

// ─── Marketplace filters ──────────────────────────────────────────────────

export interface MarketplaceFilters {
  gpuModel: string;
  minVramGb: number;
  maxPricePerHour: number;
  availability: ProviderAvailability | 'all';
  minStakeEth: number;
  minReputation: number;
}

export type MarketplaceSortKey =
  | 'price-asc'
  | 'price-desc'
  | 'rating-desc'
  | 'performance-desc'
  | 'jobs-desc'
  | 'reputation-desc'
  | 'stake-desc';

// ─── Wallet ───────────────────────────────────────────────────────────────

export interface WalletState {
  connected: boolean;
  address: string | null;
  network: string | null;
  chainId: number | null;
}

// ─── Verifier (node that attests results) ─────────────────────────────────

export interface VerifierNode {
  id: string;
  address: string;
  bondEth: number;
  assignedTasks: number;
  completedTasks: number;
  slashCount: number;
}

// ─── Simulation data point ────────────────────────────────────────────────

export interface SimDataPoint {
  cheatingProb: number;         // 0–1
  alwaysReExecuteCost: number;  // normalized cost
  fixedSamplingCost: number;
  riskAdaptiveCost: number;
  detectionRate: number;        // fraction detected
}
