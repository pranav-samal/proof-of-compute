/**
 * api.ts — Typed interface for all data operations.
 * When VITE_USE_MOCK=true (or unset), the mock implementation is used.
 * Replace mockApi with a real HTTP client when a backend exists.
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
   * Returns the new job id.
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
  { id: 'ver-001', address: '0xABCD…1234', bondEth: 2.5,  assignedTasks: 14, completedTasks: 13, slashCount: 0 },
  { id: 'ver-002', address: '0xDEAD…BEEF', bondEth: 1.0,  assignedTasks: 7,  completedTasks: 6,  slashCount: 1 },
  { id: 'ver-003', address: '0xFEED…CAFE', bondEth: 5.0,  assignedTasks: 31, completedTasks: 31, slashCount: 0 },
];

// Map legacy statuses to canonical chain states
function mapStatus(raw: string): OnChainJobStatus {
  const map: Record<string, OnChainJobStatus> = {
    draft:     'REGISTERED',
    queued:    'ASSIGNED',
    running:   'COMMITTED',
    completed: 'SETTLED',
    failed:    'DISPUTED',
    cancelled: 'REFUNDED',
    // already canonical
    REGISTERED: 'REGISTERED',
    ASSIGNED:   'ASSIGNED',
    COMMITTED:  'COMMITTED',
    VERIFYING:  'VERIFYING',
    SETTLED:    'SETTLED',
    DISPUTED:   'DISPUTED',
    REFUNDED:   'REFUNDED',
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
    // TODO: call real API endpoint when backend is available
    return `job-${Date.now()}`;
  },
};

// ─── Export selected adapter ──────────────────────────────────────────────

const useMock = import.meta.env.VITE_USE_MOCK !== 'false';
export const api: ApiService = useMock ? mockApi : ((() => { throw new Error('Real API not configured'); })());
