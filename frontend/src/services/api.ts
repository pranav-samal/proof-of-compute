/**
 * api.ts — Typed interface for all data operations.
 * When VITE_USE_MOCK=true (or unset), the mock implementation is used.
 * When VITE_USE_MOCK=false, the real HTTP adapter calls the backend at VITE_BACKEND_URL.
 */
import type {
  Job,
  JobConfig,
  Provider,
  DashboardMetrics,
  JobReceipt,
  VerifierNode,
} from '../types';

// ─── Interface ────────────────────────────────────────────────────────────

export interface ApiService {
  /** List all providers visible to the requester. */
  listProviders(): Promise<Provider[]>;

  /** Fetch a single provider by id. */
  getProvider(id: string): Promise<Provider | null>;

  /** List jobs for the current requester session. */
  listJobs(): Promise<Job[]>;

  /** Fetch a single job by id. */
  getJob(id: string): Promise<Job | null>;

  /** Fetch a receipt for a settled/disputed job. */
  getReceipt(jobId: string): Promise<JobReceipt | null>;

  /** Fetch dashboard metrics for the current session. */
  getDashboardMetrics(): Promise<DashboardMetrics>;

  /** List verifier nodes. */
  listVerifiers(): Promise<VerifierNode[]>;

  /**
   * Register a new job (REGISTERED state).
   * Pins spec to IPFS via backend, then calls chain.registerJobOnChain.
   * Returns the new job id string.
   * NOTE: Does NOT submit a chain tx — that is handled by chain.ts.
   */
  registerJob(config: JobConfig): Promise<string>;
}

// ─── Mock implementation ──────────────────────────────────────────────────
// All mock values carry "Demo data" labels in the UI; see DemoBadge component.

import { MOCK_PROVIDERS } from '../data/providers';
import { MOCK_JOBS, MOCK_DASHBOARD_METRICS } from '../data/jobs';
import type { OnChainJobStatus } from '../types';

const MOCK_VERIFIERS: VerifierNode[] = [
  { id: 'ver-001', address: '0xABCD…1234', bondEth: 2.5, assignedTasks: 14, completedTasks: 13, slashCount: 0 },
  { id: 'ver-002', address: '0xDEAD…BEEF', bondEth: 1.0, assignedTasks: 7, completedTasks: 6, slashCount: 1 },
  { id: 'ver-003', address: '0xFEED…CAFE', bondEth: 5.0, assignedTasks: 31, completedTasks: 31, slashCount: 0 },
];

// Map legacy statuses to canonical chain states
function mapStatus(raw: string): OnChainJobStatus {
  const map: Record<string, OnChainJobStatus> = {
    draft: 'REGISTERED',
    queued: 'ASSIGNED',
    running: 'COMMITTED',
    completed: 'SETTLED',
    failed: 'DISPUTED',
    cancelled: 'REFUNDED',
    // already canonical
    REGISTERED: 'REGISTERED',
    ASSIGNED: 'ASSIGNED',
    COMMITTED: 'COMMITTED',
    VERIFYING: 'VERIFYING',
    SETTLED: 'SETTLED',
    DISPUTED: 'DISPUTED',
    REFUNDED: 'REFUNDED',
  };
  return map[raw] ?? 'REGISTERED';
}

const mockApi: ApiService = {
  listProviders: async () => MOCK_PROVIDERS,

  getProvider: async (id) => MOCK_PROVIDERS.find((p) => p.id === id) ?? null,

  listJobs: async () =>
    MOCK_JOBS.map((j) => ({
      ...j,
      config: {
        ...j.config,
        reproducibilityClass: (j.config as { reproducibilityClass?: string }).reproducibilityClass ?? 'D',
        assuranceLevel: (j.config as { assuranceLevel?: string }).assuranceLevel ?? 'medium',
      },
      status: mapStatus(j.status as string),
    } as Job)),

  getJob: async (id) => {
    const j = MOCK_JOBS.find((j) => j.id === id);
    if (!j) return null;
    return {
      ...j,
      config: {
        ...j.config,
        reproducibilityClass: 'D' as const,
        assuranceLevel: 'medium' as const,
      },
      status: mapStatus(j.status as string),
    } as Job;
  },

  getReceipt: async (jobId) => {
    const j = MOCK_JOBS.find((j) => j.id === jobId);
    if (!j) return null;
    if (!['SETTLED', 'DISPUTED', 'completed'].includes(j.status as string)) return null;
    return {
      jobId,
      policyHash: '0xpolicy' + jobId.replace('-', ''),
      resultHash: 'a3f9d2c8e1b47f3a9d2c8e1b47f3a9d2c8e1b47f3a9d2c8e1b47f3a9d2c8e1b4c821',
      attestations: [
        { verifierId: 'ver-001', verdict: 'pass', timestamp: '2026-10-01T16:00:00Z', txHash: '0xattest001' },
        { verifierId: 'ver-003', verdict: 'pass', timestamp: '2026-10-01T16:02:00Z', txHash: '0xattest003' },
      ],
      quorumRequired: 2,
      settlement: {
        status: 'released',
        amountEth: 0.056,
        txHash: '0xsettle001',
        timestamp: '2026-10-01T16:05:00Z',
        note: 'Payment released to provider after quorum attestation.',
      },
      receiptTimestamp: '2026-10-01T16:05:00Z',
      txHash: '0xreceipt001',
    };
  },

  getDashboardMetrics: async () => MOCK_DASHBOARD_METRICS,

  listVerifiers: async () => MOCK_VERIFIERS,

  registerJob: async (_config) => {
    return `job-${Date.now()}`;
  },
};

// ─── Real implementation ──────────────────────────────────────────────────

import { formatEther } from 'ethers';
import type {
  VerificationPolicy,
  VerificationTier,
  JobTimelineEvent,
  Attestation,
  SettlementOutcome,
} from '../types';

const BASE_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3001';

/** wallet address used for requester-scoped queries; may be null if not connected */
function getWalletAddress(): string | null {
  // Pull from sessionStorage where WalletContext stores it, or fall back to null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ethereum = (window as any).ethereum;
    if (!ethereum) return null;
  } catch {
    // not in browser
  }
  return null;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: { message?: string } }).error?.message ??
      `HTTP ${res.status} from ${path}`,
    );
  }
  return res.json() as Promise<T>;
}

// ── Field mapping helpers ────────────────────────────────────────────────

const ASSURANCE_LABELS: Record<number, VerificationPolicy['assuranceLevel']> = {
  0: 'low',
  1: 'medium',
  2: 'high',
  3: 'maximum',
};

// quorumRequired from tier (SPEC §4.4): tier→verifier count [1,3,5,5]; we use quorum [1,2,3,4]
const TIER_QUORUM: Record<number, number> = { 0: 1, 1: 2, 2: 3, 3: 4 };

function mapAssuranceLevel(v: number): VerificationPolicy['assuranceLevel'] {
  return ASSURANCE_LABELS[v] ?? 'low';
}

function mapOutcomeStatus(outcome: string): SettlementOutcome['status'] {
  if (outcome === 'ACCEPTED') return 'released';
  if (outcome === 'REJECTED') return 'slashed';
  if (outcome === 'INCONCLUSIVE') return 'held';
  return 'refunded';
}

// Raw provider shape from backend (§8.2)
interface RawProvider {
  address: string;
  capabilityHash: string;
  stakeWei: string;
  lockedStakeWei: string;
  reputationBps: number;
  slashCount: number;
  verifiedJobCount: number;
  profile: {
    name: string;
    location: string;
    gpu: { model: string; vramGb: number; count: number; architecture: string; cudaCores: number };
    ramGb: number;
    storageGb: number;
    pricePerHour: number;
    frameworks: string[];
    availability: string;
    uptimePercent: number;
    tags: string[];
    joinedDate: string;
  };
  profileCid?: string;
  profileHash?: string;
}

function mapProvider(p: RawProvider): Provider {
  return {
    // SPEC §13 mismatch #1: Provider.id ← address
    id: p.address,
    name: p.profile?.name ?? p.address,
    location: p.profile?.location ?? '',
    countryCode: '',
    gpu: {
      model: p.profile?.gpu?.model ?? '',
      vramGb: p.profile?.gpu?.vramGb ?? 0,
      count: p.profile?.gpu?.count ?? 1,
      architecture: p.profile?.gpu?.architecture ?? '',
      cudaCores: p.profile?.gpu?.cudaCores ?? 0,
    },
    ramGb: p.profile?.ramGb ?? 0,
    storageGb: p.profile?.storageGb ?? 0,
    pricePerHour: p.profile?.pricePerHour ?? 0,
    rating: 0,
    reviewCount: 0,
    completedJobs: p.verifiedJobCount ?? 0,
    availability: (p.profile?.availability as Provider['availability']) ?? 'offline',
    uptimePercent: p.profile?.uptimePercent ?? 0,
    frameworks: p.profile?.frameworks ?? [],
    verifiedProvider: true,
    joinedDate: p.profile?.joinedDate ?? '',
    tags: p.profile?.tags ?? [],
    stakeEth: parseFloat(formatEther(BigInt(p.stakeWei ?? '0'))),
    lockedStakeEth: parseFloat(formatEther(BigInt(p.lockedStakeWei ?? '0'))),
    // SPEC §13 mismatch #2: Provider.reputation ← reputationBps / 100
    reputation: (p.reputationBps ?? 0) / 100,
    slashCount: p.slashCount ?? 0,
    verifiedJobsCount: p.verifiedJobCount ?? 0,
  };
}

// Raw job shape from backend (§8.7)
interface RawJob {
  jobId: string;
  requester: string;
  provider?: string;
  specCid: string;
  profileHash: string;
  reproClass: number;
  assurance: number;
  deadline: number;
  paymentWei: string;
  state: string;
  policyHash?: string;
  resultHash?: string;
  checkpointRoot?: string;
  resultCid?: string;
  outcome?: string;
  createdAt: string;
  updatedAt: string;
}

interface RawTimelineEvent {
  state: string;
  txHash?: string;
  block?: number;
  ts: string;
  detail?: string;
}

function mapJob(j: RawJob, timeline?: RawTimelineEvent[]): Job {
  const mappedTimeline: JobTimelineEvent[] = (timeline ?? []).map((e, idx) => ({
    id: `evt-${idx}`,
    timestamp: e.ts,
    label: e.state,
    detail: e.detail,
    status: 'completed' as const,
    txHash: e.txHash,
  }));

  return {
    // SPEC §13 mismatch #12: Job.id ← jobId.toString()
    id: String(j.jobId),
    title: `Job #${j.jobId}`,
    config: {
      workloadType: 'general-compute',
      gpuModel: '',
      minVramGb: 0,
      minRamGb: 0,
      frameworks: [],
      budgetUsd: parseFloat(formatEther(BigInt(j.paymentWei ?? '0'))),
      reproducibilityClass: (['D', 'T', 'N'] as const)[j.reproClass] ?? 'D',
      // SPEC §13 mismatch #3: assuranceLevel ← uint8 → string
      assuranceLevel: mapAssuranceLevel(j.assurance),
      description: `specCid: ${j.specCid}`,
    },
    providerId: j.provider,
    status: mapStatus(j.state),
    createdAt: j.createdAt,
    updatedAt: j.updatedAt,
    timeline: mappedTimeline,
  };
}

// Raw receipt from backend (§8.10)
interface RawReceipt {
  jobId: string;
  specCid: string;
  policyHash: string;
  provider: string;
  requester: string;
  resultHash: string;
  attestationRoot: string;
  tier: number;
  outcome: string;
  settledAt: string;
  txHash?: string;
}

interface RawAttestation {
  verifier: string;
  verdict: string;
  evidenceHash?: string;
  ts?: string;
  txHash?: string;
}

function mapAttestation(a: RawAttestation): Attestation {
  const verdictMap: Record<string, Attestation['verdict']> = {
    PASS: 'pass', FAIL: 'fail', INCONCLUSIVE: 'inconclusive',
    pass: 'pass', fail: 'fail', inconclusive: 'inconclusive',
  };
  return {
    // SPEC §13 mismatch #8: Attestation.verifierId ← address string directly
    verifierId: a.verifier,
    verdict: verdictMap[a.verdict] ?? 'inconclusive',
    timestamp: a.ts ?? new Date().toISOString(),
    txHash: a.txHash,
  };
}

function mapReceipt(raw: RawReceipt, attestations: RawAttestation[], tier: number): JobReceipt {
  const outcomeStatus = mapOutcomeStatus(raw.outcome);
  const amountEth = 0; // backend doesn't return this directly; display is secondary

  return {
    jobId: String(raw.jobId),
    policyHash: raw.policyHash,
    resultHash: raw.resultHash,
    attestations: attestations.map(mapAttestation),
    // SPEC §13 mismatch #6: quorumRequired derived from policy tier
    quorumRequired: TIER_QUORUM[tier] ?? 1,
    settlement: {
      status: outcomeStatus,
      amountEth,
      txHash: raw.txHash,
      timestamp: raw.settledAt,
      note: `Settlement outcome: ${raw.outcome}`,
    },
    receiptTimestamp: raw.settledAt,
    txHash: raw.txHash,
  };
}

const realApi: ApiService = {
  async listProviders(): Promise<Provider[]> {
    try {
      const data = await apiFetch<{ providers: RawProvider[] }>('/providers');
      if (!data?.providers) return [];
      return data.providers
        .map((p) => {
          try { return mapProvider(p); }
          catch (e) { console.error('[api] mapProvider failed for', p.address, e); return null; }
        })
        .filter((p): p is Provider => p !== null);
    } catch (e) {
      console.error('[api] listProviders failed:', e);
      return [];
    }
  },

  async getProvider(id: string): Promise<Provider | null> {
    try {
      const data = await apiFetch<RawProvider>(`/providers/${id}`);
      return mapProvider(data);
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('404')) return null;
      if (e instanceof Error && e.message.includes('PROVIDER_NOT_FOUND')) return null;
      throw e;
    }
  },

  async listJobs(): Promise<Job[]> {
    const walletAddress = getWalletAddress();
    const qs = walletAddress ? `?requester=${walletAddress}` : '';
    const data = await apiFetch<{ jobs: RawJob[] }>(`/jobs${qs}`);
    return data.jobs.map((j) => mapJob(j));
  },

  async getJob(id: string): Promise<Job | null> {
    try {
      const [jobData, timelineData] = await Promise.all([
        apiFetch<RawJob>(`/jobs/${id}`),
        apiFetch<{ events: RawTimelineEvent[] }>(`/jobs/${id}/timeline`).catch(() => ({ events: [] })),
      ]);
      return mapJob(jobData, timelineData.events);
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('404')) return null;
      if (e instanceof Error && e.message.includes('JOB_NOT_FOUND')) return null;
      throw e;
    }
  },

  async getReceipt(jobId: string): Promise<JobReceipt | null> {
    try {
      const data = await apiFetch<{
        receipt: RawReceipt;
        attestations?: RawAttestation[];
        ipfsVerified?: boolean;
        ipfsMatchesChain?: boolean;
      }>(`/receipts/${jobId}`);
      const tier = data.receipt.tier ?? 0;
      return mapReceipt(data.receipt, data.attestations ?? [], tier);
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('404')) return null;
      if (e instanceof Error && e.message.includes('JOB_NOT_FOUND')) return null;
      throw e;
    }
  },

  async getDashboardMetrics(): Promise<DashboardMetrics> {
    const walletAddress = getWalletAddress() ?? '0x0000000000000000000000000000000000000000';
    const data = await apiFetch<{
      address: string;
      totalJobs: number;
      activeJobs: number;
      completedJobs: number;
      totalSpentWei: string;
      successRate: number;
    }>(`/stats/requester/${walletAddress}`);
    return {
      totalJobs: data.totalJobs,
      activeJobs: data.activeJobs,
      completedJobs: data.completedJobs,
      totalSpendUsd: parseFloat(formatEther(BigInt(data.totalSpentWei ?? '0'))),
      successRate: data.successRate,
    };
  },

  async listVerifiers(): Promise<VerifierNode[]> {
    const data = await apiFetch<{
      verifiers: Array<{
        address: string;
        bondWei: string;
        assignedTasks: number;
        completedTasks: number;
        slashCount: number;
        isEligible: boolean;
      }>;
    }>('/verifiers');
    return data.verifiers.map((v, i) => ({
      id: `ver-${String(i + 1).padStart(3, '0')}`,
      address: v.address,
      bondEth: parseFloat(formatEther(BigInt(v.bondWei ?? '0'))),
      assignedTasks: v.assignedTasks,
      completedTasks: v.completedTasks,
      slashCount: v.slashCount,
    }));
  },

  async registerJob(config: JobConfig): Promise<string> {
    // Map assuranceLevel string → uint8
    const assuranceMap: Record<string, number> = { low: 0, medium: 1, high: 2, maximum: 3 };
    const reproMap: Record<string, number> = { D: 0, T: 1, N: 2 };

    const spec = {
      type: config.workloadType === 'inference' || config.workloadType === 'training'
        ? 'matmul'
        : 'sha-chain',
      params: {
        seed: '0x' + '0'.repeat(64),
        iterations: 1000,
        checkpointEvery: 100,
      },
      image: 'poc-runner:latest',
      resources: {
        cpuCores: 4,
        memoryMb: config.minRamGb * 1024,
        timeLimitSecs: 3600,
      },
    };

    const pinRes = await apiFetch<{ cid: string; profileHash: string }>('/jobs/spec', {
      method: 'POST',
      body: JSON.stringify(spec),
    });

    // Log CID so user can retry if on-chain step fails
    console.info('[registerJob] Pinned spec CID:', pinRes.cid);

    // The chain call is handled by SubmitJobPage after this returns the cid.
    // Return the CID as the job identifier at this stage; SubmitJobPage will
    // call chain.registerJobOnChain with the returned cid.
    return pinRes.cid;
  },
};

// ─── Export selected adapter ──────────────────────────────────────────────

const useMock = import.meta.env.VITE_USE_MOCK !== 'false';
export { realApi };
export const api: ApiService = useMock ? mockApi : realApi;
