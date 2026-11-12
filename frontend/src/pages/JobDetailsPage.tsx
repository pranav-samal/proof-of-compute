import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Cpu, DollarSign, ShieldCheck, Terminal, Hash,
  AlertCircle, FileText, Info, ExternalLink, CheckCircle2,
  XCircle, HelpCircle, Lock,
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Timeline } from '../components/ui/Timeline';
import { EmptyState } from '../components/ui/EmptyState';
import { SpecBadge } from '../components/ui/SpecBadge';
import { DemoBadge } from '../components/ui/DemoBadge';
import { Card, CardHeader } from '../components/ui/Card';
import { api } from '../services/api';
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

// Explorer base — TODO: replace with real block explorer when network is configured
const EXPLORER_BASE = 'https://sepolia.etherscan.io/tx/';

function TxLink({ txHash }: { txHash?: string }) {
  if (!txHash) return null;
  return (
    <a href={`${EXPLORER_BASE}${txHash}`} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-accent-600 hover:text-accent-700 font-mono">
      {txHash.slice(0, 10)}…
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

// ─── Policy record tab ─────────────────────────────────────────────────────

function PolicyTab({ job }: { job: Job }) {
  const policy = job.config.policy;
  const receipt = job.receipt;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 p-3.5 rounded-2xl bg-indigo-50 border border-indigo-200">
        <Info className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-indigo-800">
          The verification policy is computed from risk inputs <strong>before</strong> the provider
          starts execution. Its hash is recorded on-chain so neither party can alter it after submission.
        </p>
      </div>

      {policy ? (
        <div className="bg-gray-50/70 rounded-2xl border border-gray-200/70 p-5 space-y-2">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Policy Parameters</p>
            <DemoBadge label="Computed locally" />
          </div>
          <InfoRow label="Tier" value={TIER_LABELS[policy.tier as VerificationTier]} />
          <InfoRow label="Risk Score" value={`${Math.round(policy.riskScore * 100)}%`} />
          <InfoRow label="Reproducibility" value={REPRO_LABELS[job.config.reproducibilityClass]} />
          <InfoRow label="Sampling" value={policy.samplingPct > 0 ? `${policy.samplingPct}%` : 'None'} />
          <InfoRow label="Required Collateral" value={`${policy.requiredCollateralEth} ETH`} />
          <InfoRow label="Challenge Window" value={policy.challengeWindowSecs > 0 ? `${policy.challengeWindowSecs / 3600}h` : 'None'} />
          {receipt?.policyHash && (
            <InfoRow label="On-Chain Hash" value={
              <span className="font-mono text-xs text-gray-600">{receipt.policyHash}</span>
            } />
          )}
        </div>
      ) : (
        <EmptyState icon={<Lock className="w-5 h-5" />} title="Policy not yet recorded"
          description="Policy will be computed and locked when the job transitions to REGISTERED."
          note="No on-chain data available yet." size="sm" />
      )}

      {receipt?.txHash && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>Receipt tx:</span><TxLink txHash={receipt.txHash} />
        </div>
      )}
    </div>
  );
}

// ─── Commitment tab ────────────────────────────────────────────────────────

function CommitmentTab({ job }: { job: Job }) {
  const commitEvent = job.timeline.find((e) => e.label === 'COMMITTED');
  const hasCommitment = job.status === 'COMMITTED' || job.status === 'VERIFYING' ||
    job.status === 'SETTLED' || job.status === 'DISPUTED';
  const resultHash = job.receipt?.resultHash;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 p-3.5 rounded-2xl bg-indigo-50 border border-indigo-200">
        <Info className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-indigo-800">
          The provider submits a SHA-256 hash of their result artifacts before the verifier
          can inspect the output. This binds the provider to a specific result.
        </p>
      </div>

      {hasCommitment && resultHash ? (
        <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200/70 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Result Hash</p>
            <DemoBadge />
          </div>
          <div className="flex items-start gap-2">
            <Hash className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
            <code className="text-xs font-mono text-brand-800 break-all">{resultHash}</code>
          </div>
          {commitEvent?.txHash && (
            <div className="flex items-center gap-2 text-xs text-gray-500 pt-2 border-t border-gray-100">
              <span>Commit tx:</span><TxLink txHash={commitEvent.txHash} />
            </div>
          )}
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
            <p className="text-xs text-amber-700 font-medium">Important</p>
            <p className="text-xs text-amber-700 mt-0.5">
              A result hash proves the output has not been altered in transit. It does
              <strong> not</strong> prove the computation was performed correctly.
            </p>
          </div>
        </div>
      ) : (
        <EmptyState icon={<Hash className="w-5 h-5" />} title="No commitment yet"
          description={`The provider will commit a result hash when the job reaches COMMITTED state. Current state: ${job.status}.`}
          note="No on-chain data available." size="sm" />
      )}
    </div>
  );
}

// ─── Attestations tab ──────────────────────────────────────────────────────

const VERDICT_ICON: Record<string, React.ReactNode> = {
  pass: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
  fail: <XCircle className="w-4 h-4 text-red-500" />,
  inconclusive: <HelpCircle className="w-4 h-4 text-amber-500" />,
};

function AttestationsTab({ job }: { job: Job }) {
  const receipt = job.receipt;
  const attestations = receipt?.attestations ?? [];
  const quorum = receipt?.quorumRequired ?? 2;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          Verifier nodes independently assess the result. Quorum must be reached before settlement.
        </p>
        {receipt && (
          <span className="text-xs font-bold text-brand-900">
            {attestations.filter((a) => a.verdict === 'pass').length}/{quorum} quorum
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
                  <span className="text-sm font-bold text-brand-900 font-mono text-xs">{att.verifierId}</span>
                  <span className={cn('px-2 py-0.5 rounded-pill text-xs font-bold',
                    att.verdict === 'pass' ? 'bg-emerald-50 text-emerald-700' :
                      att.verdict === 'fail' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700')}>
                    {att.verdict}
                  </span>
                  <DemoBadge />
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(att.timestamp)}</p>
                {att.txHash && (
                  <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
                    Tx: <TxLink txHash={att.txHash} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={<ShieldCheck className="w-5 h-5" />}
          title="No attestations yet"
          description="Verifier nodes will submit attestations once the job reaches VERIFYING state."
          note="No real verification has occurred." size="sm" />
      )}

      {job.status === 'VERIFYING' && attestations.length === 0 && (
        <div className="flex items-start gap-2 p-3.5 rounded-2xl bg-amber-50 border border-amber-200">
          <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5" />
          <p className="text-sm text-amber-800">Job is VERIFYING — awaiting verifier attestations ({attestations.length}/{quorum} received).</p>
        </div>
      )}
    </div>
  );
}

// ─── Settlement tab ────────────────────────────────────────────────────────

function SettlementTab({ job }: { job: Job }) {
  const settlement = job.receipt?.settlement;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 p-3.5 rounded-2xl bg-indigo-50 border border-indigo-200">
        <Info className="w-4 h-4 text-indigo-600 mt-0.5" />
        <p className="text-sm text-indigo-800">
          Escrow is released, refunded, held, or slashed only after verifier attestations meet
          quorum. Settlement is recorded on-chain and is final.
        </p>
      </div>

      {settlement ? (
        <div className="p-5 rounded-2xl bg-gray-50/70 border border-gray-200/70 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Settlement Outcome</p>
            <DemoBadge />
          </div>
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
          {settlement.timestamp && (
            <p className="text-xs text-gray-400">{formatDateTime(settlement.timestamp)}</p>
          )}
        </div>
      ) : (
        <EmptyState icon={<DollarSign className="w-5 h-5" />}
          title="Settlement pending"
          description="Settlement occurs after verifiers reach quorum. No on-chain payment data is available."
          note="No real payment has been made." size="md" />
      )}
    </div>
  );
}

// ─── Job list ──────────────────────────────────────────────────────────────

function JobList({ jobs }: { jobs: Job[] }) {
  return (
    <div className="space-y-3">
      {jobs.map((job) => (
        <Link key={job.id} to={`/jobs/${job.id}`}
          className="block bg-white/70 border border-gray-200/70 rounded-2xl p-5 shadow-card hover:shadow-card-md hover:border-gray-300/70 transition-all backdrop-blur-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-brand-900 truncate">{job.title}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {job.id} · {WORKLOAD_LABELS[job.config.workloadType]} · {formatDate(job.createdAt)}
              </p>
            </div>
            <StatusBadge status={job.status} showDot />
          </div>
          {job.estimatedCostUsd && (
            <p className="text-xs text-gray-500 mt-2">Budget: {formatUsd(job.config.budgetUsd)} · Est. {formatUsd(job.estimatedCostUsd)}</p>
          )}
        </Link>
      ))}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export function JobDetailsPage() {
  const { jobId } = useParams<{ jobId?: string }>();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  useEffect(() => {
    if (jobId) {
      api.getJob(jobId).then((j) => { setJob(j); setLoading(false); });
    } else {
      api.listJobs().then((js) => { setJobs(js); setLoading(false); });
    }
  }, [jobId]);

  if (!jobId) {
    return (
      <div>
        <PageHeader title="Job Details" subtitle="Select a job to inspect its lifecycle, policy, and verification records."
          breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Jobs' }]}
          actions={<DemoBadge />} />
        {loading ? <p className="text-sm text-gray-400 py-8 text-center">Loading…</p> : <JobList jobs={jobs} />}
      </div>
    );
  }

  if (loading) return <div className="py-20 text-center text-sm text-gray-400">Loading…</div>;
  if (!job) return (
    <div>
      <PageHeader title="Job Not Found" breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Jobs', href: '/jobs' }, { label: jobId }]} />
      <EmptyState title="Job not found" description={`No job with ID "${jobId}" found.`}
        action={<Link to="/jobs"><button className="btn btn-secondary text-sm">Back to Jobs</button></Link>} />
    </div>
  );

  return (
    <div>
      <PageHeader
        title={job.title}
        subtitle={`${job.id} · ${WORKLOAD_LABELS[job.config.workloadType]}`}
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Jobs', href: '/jobs' }, { label: job.id }]}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={job.status} showDot />
            <Link to={`/receipt/${job.id}`} className="text-xs font-semibold text-accent-600 hover:text-accent-700 flex items-center gap-1">
              View Receipt <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100/80 rounded-2xl p-1 mb-6 overflow-x-auto">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={cn('flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap flex-1 justify-center',
              activeTab === tab.id ? 'bg-white text-brand-900 shadow-card' : 'text-gray-500 hover:text-gray-700')}>
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <Card padding="lg">
            {activeTab === 'overview' && (
              <div className="space-y-5">
                <InfoRow label="Workload Type" value={WORKLOAD_LABELS[job.config.workloadType]} />
                <InfoRow label="GPU Model" value={job.config.gpuModel || 'Any compatible'} />
                <InfoRow label="Min VRAM" value={`${job.config.minVramGb} GB`} />
                <InfoRow label="Budget" value={formatUsd(job.config.budgetUsd)} />
                <InfoRow label="Reproducibility" value={REPRO_LABELS[job.config.reproducibilityClass]} />
                <InfoRow label="Assurance" value={<span className="capitalize">{job.config.assuranceLevel}</span>} />
                {job.config.frameworks.length > 0 && (
                  <InfoRow label="Frameworks" value={
                    <div className="flex flex-wrap gap-1 justify-end">{job.config.frameworks.map((f) => <SpecBadge key={f}>{f}</SpecBadge>)}</div>
                  } />
                )}
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
            <CardHeader title="Lifecycle" subtitle="On-chain state transitions" />
            <Timeline events={job.timeline.map((e) => ({
              ...e,
              detail: e.txHash ? `${e.detail ?? ''} · tx: ${e.txHash.slice(0, 10)}…` : e.detail,
            }))} />
          </Card>

          <Card padding="md">
            <CardHeader title="Cost" />
            <div className="space-y-2">
              <InfoRow label="Budget" value={formatUsd(job.config.budgetUsd)} />
              <InfoRow label="Estimated" value={job.estimatedCostUsd ? formatUsd(job.estimatedCostUsd) : '—'} />
              <InfoRow label="Actual" value={job.actualCostUsd ? formatUsd(job.actualCostUsd) : <span className="text-gray-400">Pending</span>} />
              <p className="text-xs text-gray-400 italic pt-2 border-t border-gray-100">Illustrative. No real payment.</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
