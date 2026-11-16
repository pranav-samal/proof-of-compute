import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  DollarSign, ShieldCheck, Hash,
  AlertCircle, FileText, Info, ExternalLink, CheckCircle2,
  XCircle, HelpCircle, Lock, UserCheck, RefreshCw,
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Timeline } from '../components/ui/Timeline';
import { EmptyState } from '../components/ui/EmptyState';
import { SpecBadge } from '../components/ui/SpecBadge';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { api } from '../services/api';
import { chain } from '../services/chain';
import { useWallet } from '../context/WalletContext';
import { WORKLOAD_LABELS } from '../data/constants';
import { TIER_LABELS, REPRO_LABELS } from '../lib/risk';
import { formatUsd, formatDate, formatDateTime, cn } from '../lib/utils';
import type { Job, Attestation, VerificationTier } from '../types';

type TabId = 'overview' | 'policy' | 'commitment' | 'attestations' | 'settlement';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: FileText },
  { id: 'policy', label: 'Policy Record', icon: Lock },
  { id: 'commitment', label: 'Commitment', icon: Hash },
  { id: 'attestations', label: 'Attestations', icon: ShieldCheck },
  { id: 'settlement', label: 'Settlement', icon: DollarSign },
];

// Explorer link — copy to clipboard on localhost (no explorer), link on testnet
const EXPLORER_BASE = import.meta.env.VITE_EXPLORER_BASE ?? '';

function TxLink({ txHash }: { txHash?: string }) {
  if (!txHash) return null;
  const short = txHash.slice(0, 10) + '…';
  if (!EXPLORER_BASE) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-gray-500 font-mono cursor-pointer hover:text-brand-700"
        title={`Click to copy: ${txHash}`}
        onClick={() => navigator.clipboard.writeText(txHash)}
      >
        {short} 📋
      </span>
    );
  }
  return (
    <a href={`${EXPLORER_BASE}${txHash}`} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-accent-600 hover:text-accent-700 font-mono">
      {short}
      <ExternalLink className="w-3 h-3" />
    </a>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-gray-100 last:border-0 gap-4">
      <span className="text-sm text-gray-500 flex-shrink-0">{label}</span>
      <span className="text-sm font-semibold text-brand-900 text-right">{value}</span>
    </div>
  );
}

// ─── Policy tab ───────────────────────────────────────────────────────────

function PolicyTab({ job }: { job: Job }) {
  const policy = job.config.policy;
  const policyHash = job.receipt?.policyHash;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 p-3.5 rounded-2xl bg-indigo-50 border border-indigo-200">
        <Info className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-indigo-800">
          The verification policy is locked on-chain at <strong>assignProvider</strong> and cannot change after.
        </p>
      </div>

      <div className="bg-gray-50/70 rounded-2xl border border-gray-200/70 p-5 space-y-2">
        <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">
          {policyHash ? 'On-Chain Policy' : 'Locally Computed Estimate'}
        </p>
        {policy ? (
          <>
            <InfoRow label="Tier" value={TIER_LABELS[policy.tier as VerificationTier]} />
            <InfoRow label="Risk Score" value={`${Math.round(policy.riskScore * 100)}%`} />
            <InfoRow label="Reproducibility" value={REPRO_LABELS[job.config.reproducibilityClass]} />
            <InfoRow label="Sampling" value={policy.samplingPct > 0 ? `${policy.samplingPct}%` : 'None'} />
            <InfoRow label="Collateral" value={`${policy.requiredCollateralEth} ETH`} />
            <InfoRow label="Challenge Window" value={policy.challengeWindowSecs > 0 ? `${policy.challengeWindowSecs / 3600}h` : 'None'} />
            {policyHash && (
              <InfoRow label="Policy Hash" value={
                <span className="font-mono text-xs text-gray-600 break-all">{policyHash}</span>
              } />
            )}
          </>
        ) : (
          <p className="text-sm text-gray-500">Policy not yet computed.</p>
        )}
      </div>
    </div>
  );
}

// ─── Commitment tab ───────────────────────────────────────────────────────

function CommitmentTab({ job }: { job: Job }) {
  const hasCommitment = ['COMMITTED', 'VERIFYING', 'SETTLED', 'DISPUTED'].includes(job.status);
  const resultHash = job.receipt?.resultHash;
  const commitEvent = job.timeline.find((e) => e.label === 'COMMITTED');

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 p-3.5 rounded-2xl bg-indigo-50 border border-indigo-200">
        <Info className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-indigo-800">
          The provider submits a SHA-256 hash of their result artifacts. This binds the provider to a specific result before verifiers inspect the output.
        </p>
      </div>

      {hasCommitment && resultHash ? (
        <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200/70 space-y-3">
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Result Hash (on-chain)</p>
          <div className="flex items-start gap-2">
            <Hash className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
            <code className="text-xs font-mono text-brand-800 break-all">{resultHash}</code>
          </div>
          {commitEvent?.txHash && (
            <div className="flex items-center gap-2 text-xs text-gray-500 pt-2 border-t border-gray-100">
              <span>Commit tx:</span><TxLink txHash={commitEvent.txHash} />
            </div>
          )}
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
            A matching hash proves the output was not altered in transit. It does <strong>not</strong> prove the computation was performed correctly.
          </p>
        </div>
      ) : (
        <EmptyState icon={<Hash className="w-5 h-5" />}
          title={hasCommitment ? 'Result hash not indexed yet' : 'No commitment yet'}
          description={`Current state: ${job.status}. Provider commits a result hash when execution is complete.`}
          size="sm" />
      )}
    </div>
  );
}

// ─── Attestations tab ─────────────────────────────────────────────────────

const VERDICT_ICON: Record<string, React.ReactNode> = {
  pass: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
  fail: <XCircle className="w-4 h-4 text-red-500" />,
  inconclusive: <HelpCircle className="w-4 h-4 text-amber-500" />,
};

function AttestationsTab({ job }: { job: Job }) {
  const attestations = job.receipt?.attestations ?? [];
  const quorum = job.receipt?.quorumRequired ?? 2;
  const passCount = attestations.filter((a) => a.verdict === 'pass').length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">Verifier nodes independently assess the result. Quorum must be reached before settlement.</p>
        {attestations.length > 0 && (
          <span className={cn('text-xs font-bold', passCount >= quorum ? 'text-emerald-600' : 'text-amber-600')}>
            {passCount}/{quorum} quorum
          </span>
        )}
      </div>

      {attestations.length > 0 ? (
        <div className="space-y-3">
          {attestations.map((att: Attestation, i: number) => (
            <div key={i} className="flex items-start gap-3 p-4 rounded-2xl bg-gray-50/70 border border-gray-200/70">
              <div className="mt-0.5">{VERDICT_ICON[att.verdict]}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono text-brand-900">{att.verifierId}</span>
                  <span className={cn('px-2 py-0.5 rounded-pill text-xs font-bold',
                    att.verdict === 'pass' ? 'bg-emerald-50 text-emerald-700' :
                      att.verdict === 'fail' ? 'bg-red-50 text-red-700' :
                        'bg-amber-50 text-amber-700')}>
                    {att.verdict}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(att.timestamp)}</p>
                {att.txHash && <div className="mt-1"><TxLink txHash={att.txHash} /></div>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={<ShieldCheck className="w-5 h-5" />}
          title="No attestations yet"
          description={job.status === 'VERIFYING'
            ? `Waiting for verifier attestations (0/${quorum}).`
            : 'Attestations appear after selectVerifiers is called.'}
          size="sm" />
      )}
    </div>
  );
}

// ─── Settlement tab ───────────────────────────────────────────────────────

function SettlementTab({ job }: { job: Job }) {
  const settlement = job.receipt?.settlement;

  return (
    <div className="space-y-5">
      {settlement ? (
        <div className="p-5 rounded-2xl bg-gray-50/70 border border-gray-200/70 space-y-3">
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Settlement Outcome</p>
          <div className="flex items-center gap-3">
            <span className={cn('px-3 py-1 rounded-pill text-sm font-bold',
              settlement.status === 'released' ? 'bg-emerald-50 text-emerald-700' :
                settlement.status === 'slashed' ? 'bg-red-50 text-red-700' :
                  settlement.status === 'refunded' ? 'bg-amber-50 text-amber-700' :
                    'bg-gray-100 text-gray-600')}>
              {settlement.status.toUpperCase()}
            </span>
            <span className="text-lg font-black text-brand-950">{settlement.amountEth} ETH</span>
          </div>
          <p className="text-sm text-gray-600">{settlement.note}</p>
          {settlement.txHash && (
            <div className="flex items-center gap-2 text-xs text-gray-500 pt-2 border-t border-gray-100">
              <span>Settlement tx:</span><TxLink txHash={settlement.txHash} />
            </div>
          )}
        </div>
      ) : (
        <EmptyState icon={<DollarSign className="w-5 h-5" />}
          title="Settlement pending"
          description="Settlement occurs after verifiers reach quorum."
          size="md" />
      )}
    </div>
  );
}

// ─── Assign Provider panel ────────────────────────────────────────────────

function AssignProviderPanel({
  job, onAssigned,
}: { job: Job; onAssigned: () => void }) {
  const { address, connected } = useWallet();
  const [providers, setProviders] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [txResult, setTxResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // Load available providers
    api.listProviders().then((ps) =>
      setProviders(ps.map((p) => ({ id: p.id, name: p.name || p.id })))
    );
  }, []);

  const isRequester = address?.toLowerCase() === job.config.description?.toLowerCase() ||
    job.status === 'REGISTERED';  // any wallet can assign in demo

  async function handleAssign() {
    if (!selected) { setErr('Select a provider first.'); return; }
    setErr(null);
    setAssigning(true);
    try {
      const tx = await chain.assignProvider(job.id, selected);
      setTxResult(tx);
      setTimeout(onAssigned, 2000); // refresh job after 2 s
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Transaction failed');
    } finally {
      setAssigning(false);
    }
  }

  if (!chain.isContractConfigured()) return null;
  if (job.status !== 'REGISTERED') return null;

  return (
    <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200 space-y-3">
      <div className="flex items-center gap-2">
        <UserCheck className="w-4 h-4 text-indigo-600" />
        <p className="text-sm font-bold text-indigo-900">Assign a Provider</p>
      </div>
      <p className="text-xs text-indigo-700">
        Call <code>assignProvider</code> on-chain to lock provider collateral and record the
        verification policy. The provider agent will then pick up the job.
      </p>
      <div className="flex gap-2">
        <select
          className="input text-sm flex-1"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundPosition: 'right 10px center', backgroundRepeat: 'no-repeat', paddingRight: '2rem' }}
        >
          <option value="">Choose provider…</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <Button
          variant="primary"
          size="sm"
          loading={assigning}
          disabled={!connected || !selected || assigning}
          onClick={handleAssign}
        >
          <UserCheck className="w-3.5 h-3.5" />
          Assign
        </Button>
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      {txResult && <p className="text-xs text-emerald-700 font-mono break-all">Tx: {txResult}</p>}
    </div>
  );
}

// ─── Job list ─────────────────────────────────────────────────────────────

function JobList({ jobs }: { jobs: Job[] }) {
  if (jobs.length === 0) return (
    <EmptyState
      title="No jobs yet"
      description="Submit a job to see it here. Connect your wallet first."
      size="md"
    />
  );
  return (
    <div className="space-y-3">
      {jobs.map((job) => (
        <Link key={job.id} to={`/jobs/${job.id}`}
          className="block bg-white/70 border border-gray-200/70 rounded-2xl p-5 shadow-card hover:shadow-card-md hover:border-gray-300/70 transition-all backdrop-blur-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-brand-900 truncate">{job.title}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                ID {job.id} · {WORKLOAD_LABELS[job.config.workloadType]} · {formatDate(job.createdAt)}
              </p>
            </div>
            <StatusBadge status={job.status} showDot />
          </div>
        </Link>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

const POLL_STATES = new Set(['REGISTERED', 'ASSIGNED', 'COMMITTED', 'VERIFYING']);
const POLL_INTERVAL = 5000;

export function JobDetailsPage() {
  const { jobId } = useParams<{ jobId?: string }>();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchJob = useCallback(async (id: string, quiet = false) => {
    if (!quiet) setLoading(true);
    else setSyncing(true);
    const j = await api.getJob(id).catch(() => null);
    setJob(j);
    if (!quiet) setLoading(false);
    else setSyncing(false);
    return j;
  }, []);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    const js = await api.listJobs().catch(() => []);
    setJobs(js);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (jobId) {
      fetchJob(jobId);
    } else {
      fetchJobs();
    }
  }, [jobId, fetchJob, fetchJobs]);

  // Poll while job is in a non-terminal state
  useEffect(() => {
    if (!jobId || !job) return;
    if (!POLL_STATES.has(job.status)) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = setInterval(() => { void fetchJob(jobId, true); }, POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [jobId, job?.status, fetchJob]);

  if (!jobId) {
    return (
      <div>
        <PageHeader
          title="Job Details"
          subtitle="Jobs for connected wallet — requester and provider."
          breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Jobs' }]}
          actions={
            <Button variant="ghost" size="sm" onClick={fetchJobs}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          }
        />
        {loading
          ? <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
          : <JobList jobs={jobs} />
        }
      </div>
    );
  }

  if (loading) return <div className="py-20 text-center text-sm text-gray-400">Loading…</div>;

  if (!job) return (
    <div>
      <PageHeader title="Job Not Found"
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Jobs', href: '/jobs' }, { label: jobId }]} />
      <EmptyState
        title="Job not found"
        description={`No job with ID "${jobId}" found. The indexer may still be syncing — wait a few seconds and refresh.`}
        action={<Button variant="secondary" size="sm" onClick={() => fetchJob(jobId)}>Retry</Button>}
      />
    </div>
  );

  return (
    <div>
      <PageHeader
        title={job.title}
        subtitle={`ID ${job.id} · ${WORKLOAD_LABELS[job.config.workloadType]}`}
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Jobs', href: '/jobs' }, { label: `#${job.id}` }]}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={job.status} showDot />
            {syncing && <RefreshCw className="w-3.5 h-3.5 text-gray-400 animate-spin" />}
            <Button variant="ghost" size="sm" onClick={() => fetchJob(jobId, false)}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
            <Link to={`/receipt/${job.id}`}
              className="text-xs font-semibold text-accent-600 hover:text-accent-700 flex items-center gap-1">
              View Receipt <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        }
      />

      {/* Assign provider panel — only shown while REGISTERED */}
      {job.status === 'REGISTERED' && (
        <div className="mb-5">
          <AssignProviderPanel job={job} onAssigned={() => fetchJob(jobId, false)} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100/80 rounded-2xl p-1 mb-6 overflow-x-auto">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap flex-1 justify-center',
              activeTab === tab.id ? 'bg-white text-brand-900 shadow-card' : 'text-gray-500 hover:text-gray-700',
            )}>
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Main content */}
        <div className="lg:col-span-2">
          <Card padding="lg">
            {activeTab === 'overview' && (
              <div className="space-y-3">
                <InfoRow label="Job ID" value={<span className="font-mono">{job.id}</span>} />
                <InfoRow label="Workload" value={WORKLOAD_LABELS[job.config.workloadType]} />
                <InfoRow label="Reproducibility" value={REPRO_LABELS[job.config.reproducibilityClass]} />
                <InfoRow label="Assurance" value={<span className="capitalize">{job.config.assuranceLevel}</span>} />
                <InfoRow label="Budget" value={formatUsd(job.config.budgetUsd)} />
                <InfoRow label="Provider" value={job.providerId
                  ? <span className="font-mono text-xs">{job.providerId.slice(0, 10)}…</span>
                  : <span className="text-gray-400">Not yet assigned</span>
                } />
                {job.config.description && (
                  <div className="pt-3 border-t border-gray-100">
                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Description</p>
                    <p className="text-sm text-gray-700 leading-relaxed">{job.config.description}</p>
                  </div>
                )}
              </div>
            )}
            {activeTab === 'policy' && <PolicyTab job={job} />}
            {activeTab === 'commitment' && <CommitmentTab job={job} />}
            {activeTab === 'attestations' && <AttestationsTab job={job} />}
            {activeTab === 'settlement' && <SettlementTab job={job} />}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <Card padding="md">
            <CardHeader title="Lifecycle" subtitle="State transitions" />
            <Timeline events={job.timeline.map((e) => ({
              ...e,
              detail: e.txHash ? `${e.detail ?? ''} · tx: ${e.txHash.slice(0, 10)}…` : e.detail,
            }))} />
          </Card>

          <Card padding="md">
            <CardHeader title="Payment" />
            <div className="space-y-2">
              <InfoRow label="Budget" value={formatUsd(job.config.budgetUsd)} />
              <InfoRow label="Actual" value={job.actualCostUsd
                ? formatUsd(job.actualCostUsd)
                : <span className="text-gray-400">Pending settlement</span>
              } />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
