import React, { useState, useEffect } from 'react';
import {
  Server, Cpu, MemoryStick, MapPin, Star, CheckCircle2,
  TrendingUp, DollarSign, AlertCircle, Info, Activity,
  Briefcase, Hash, ArrowDownToLine, ArrowUpFromLine, Lock,
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { MetricCard } from '../components/ui/MetricCard';
import { StatusBadge } from '../components/ui/StatusBadge';
import { SpecBadge } from '../components/ui/SpecBadge';
import { DemoBadge } from '../components/ui/DemoBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { Card, CardHeader, CardSection } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { FormField, Input } from '../components/ui/FormField';
import { api } from '../services/api';
import { chain } from '../services/chain';
import { WORKLOAD_LABELS } from '../data/constants';
import { formatUsd, formatDate, cn } from '../lib/utils';
import type { Provider, Job } from '../types';
import { useWallet } from '../context/WalletContext';

const DEMO_PROVIDER_ID = 'prov-001';

type TabId = 'profile' | 'jobs' | 'stake' | 'commit' | 'performance' | 'earnings';

const TABS: { id: TabId; label: string }[] = [
  { id: 'profile', label: 'Profile & Hardware' },
  { id: 'jobs', label: 'Assigned Jobs' },
  { id: 'stake', label: 'Stake' },
  { id: 'commit', label: 'Commit Result' },
  { id: 'performance', label: 'Performance' },
  { id: 'earnings', label: 'Earnings' },
];

// ─── Profile tab ───────────────────────────────────────────────────────────

function ProfileTab({ p }: { p: Provider }) {
  return (
    <div className="space-y-5">
      <Card padding="lg">
        <CardHeader title="Provider Identity" />
        <div className="grid sm:grid-cols-2 gap-5">
          <div className="space-y-3">
            {[
              { label: 'Provider Name', value: <span className="flex items-center gap-2">{p.name}{p.verifiedProvider && <CheckCircle2 className="w-4 h-4 text-accent-500" />}</span> },
              { label: 'Location', value: <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-gray-400" />{p.location}</span> },
              { label: 'Member Since', value: formatDate(p.joinedDate) },
              { label: 'Status', value: <StatusBadge status={p.availability} showDot /> },
            ].map(({ label, value }) => (
              <div key={label}><p className="text-xs text-gray-400">{label}</p><div className="text-sm font-semibold text-brand-900 mt-0.5">{value}</div></div>
            ))}
          </div>
          <div className="space-y-3">
            {[
              { label: 'Rating', value: <span className="flex items-center gap-1.5"><Star className="w-4 h-4 fill-amber-400 text-amber-400" />{p.rating.toFixed(1)} ({p.reviewCount} reviews)</span> },
              { label: 'Reputation', value: <span className={cn('font-black', p.reputation >= 90 ? 'text-emerald-600' : p.reputation >= 70 ? 'text-amber-600' : 'text-red-600')}>{p.reputation}/100</span> },
              { label: 'Slash Count', value: <span className={p.slashCount > 0 ? 'text-red-600 font-bold' : 'text-gray-500'}>{p.slashCount}</span> },
              { label: 'Verified Jobs', value: p.verifiedJobsCount.toLocaleString() },
            ].map(({ label, value }) => (
              <div key={label}><p className="text-xs text-gray-400">{label}</p><div className="text-sm font-semibold text-brand-900 mt-0.5">{value}</div></div>
            ))}
          </div>
        </div>
        <CardSection label="Tags">
          <div className="flex flex-wrap gap-1.5">{p.tags.map((t) => <span key={t} className="px-2.5 py-0.5 rounded-pill text-xs font-semibold bg-indigo-50 text-indigo-700">{t}</span>)}</div>
        </CardSection>
      </Card>

      <Card padding="lg">
        <CardHeader title="Hardware" subtitle={`${p.gpu.count}× ${p.gpu.model}`} />
        <div className="grid sm:grid-cols-2 gap-5">
          <div className="bg-gray-50/70 rounded-2xl p-4 border border-gray-200/60 space-y-2">
            <div className="flex items-center gap-2 mb-2"><Cpu className="w-4 h-4 text-accent-500" /><span className="text-sm font-bold text-brand-900">GPU</span></div>
            {[['Model', p.gpu.model], ['Count', `×${p.gpu.count}`], ['VRAM', `${p.gpu.vramGb} GB`], ['Architecture', p.gpu.architecture], ['CUDA Cores', p.gpu.cudaCores.toLocaleString()]].map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-gray-200 pb-1.5 last:border-0"><span className="text-xs text-gray-500">{k}</span><span className="text-xs font-semibold text-brand-900">{v}</span></div>
            ))}
          </div>
          <div className="bg-gray-50/70 rounded-2xl p-4 border border-gray-200/60 space-y-2">
            <div className="flex items-center gap-2 mb-2"><MemoryStick className="w-4 h-4 text-teal-600" /><span className="text-sm font-bold text-brand-900">System</span></div>
            {[['RAM', `${p.ramGb} GB`], ['Storage', `${p.storageGb} GB`], ['Uptime', `${p.uptimePercent}%`], ['Price', `${formatUsd(p.pricePerHour)}/hr`]].map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-gray-200 pb-1.5 last:border-0"><span className="text-xs text-gray-500">{k}</span><span className="text-xs font-semibold text-brand-900">{v}</span></div>
            ))}
          </div>
        </div>
        <CardSection label="Frameworks">
          <div className="flex flex-wrap gap-1.5">{p.frameworks.map((fw) => <SpecBadge key={fw}>{fw}</SpecBadge>)}</div>
        </CardSection>
      </Card>
    </div>
  );
}

// ─── Jobs tab ──────────────────────────────────────────────────────────────

function JobsTab({ jobs }: { jobs: Job[] }) {
  const assigned = jobs.filter((j) => j.providerId === DEMO_PROVIDER_ID);
  return (
    <div className="space-y-4">
      <DemoBadge label="Illustrative assigned jobs" />
      {assigned.length === 0 ? (
        <EmptyState icon={<Briefcase className="w-5 h-5" />} title="No assigned jobs" size="md" />
      ) : assigned.map((job) => (
        <Card key={job.id} padding="md">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-brand-900">{job.title}</p>
              <p className="text-xs text-gray-400 mt-0.5">{job.id} · {WORKLOAD_LABELS[job.config.workloadType]} · {formatDate(job.createdAt)}</p>
            </div>
            <StatusBadge status={job.status} showDot />
          </div>
          <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
            <span>{job.config.gpuModel || 'Any GPU'}</span>
            <span>{job.config.minVramGb} GB VRAM</span>
            <span className="font-semibold text-brand-800">{formatUsd(job.config.budgetUsd)} budget</span>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ─── Stake tab ─────────────────────────────────────────────────────────────

function StakeTab({ p }: { p: Provider }) {
  const { connected } = useWallet();
  const [depositAmt, setDepositAmt] = useState('');
  const [withdrawAmt, setWithdrawAmt] = useState('');
  const [txResult, setTxResult] = useState<string | null>(null);
  const contractReady = chain.isContractConfigured();
  const freeStake = p.stakeEth - p.lockedStakeEth;

  async function handleDeposit() {
    const amt = parseFloat(depositAmt);
    if (isNaN(amt) || amt <= 0) return;
    const tx = await chain.depositStake(amt);
    setTxResult(`Deposit tx (mock): ${tx}`);
  }
  async function handleWithdraw() {
    const amt = parseFloat(withdrawAmt);
    if (isNaN(amt) || amt <= 0 || amt > freeStake) return;
    const tx = await chain.withdrawStake(amt);
    setTxResult(`Withdraw tx (mock): ${tx}`);
  }

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Stake', value: `${p.stakeEth} ETH`, sub: 'All staked ETH' },
          { label: 'Locked', value: `${p.lockedStakeEth} ETH`, sub: 'In active jobs' },
          { label: 'Free Stake', value: `${freeStake.toFixed(2)} ETH`, sub: 'Available to withdraw' },
        ].map(({ label, value, sub }) => (
          <div key={label} className="bg-white/70 border border-gray-200/70 rounded-2xl p-4 shadow-card text-center">
            <p className="text-xl font-black text-brand-950">{value}</p>
            <p className="text-sm font-semibold text-brand-800 mt-0.5">{label}</p>
            <p className="text-xs text-gray-400 italic mt-0.5">{sub}</p>
            <DemoBadge className="mx-auto mt-2 flex" />
          </div>
        ))}
      </div>

      {!contractReady && (
        <div className="flex items-start gap-2 p-3.5 rounded-2xl bg-amber-50 border border-amber-200">
          <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5" />
          <p className="text-sm text-amber-800">
            <strong>Contract not configured.</strong> Deposit and withdraw buttons are disabled.
            Connect a contract address to enable on-chain staking. (TODO)
          </p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-5">
        <Card padding="md">
          <CardHeader title="Deposit Stake" subtitle="Lock ETH as provider collateral" />
          <div className="space-y-3">
            <FormField label="Amount (ETH)" htmlFor="deposit">
              <Input id="deposit" type="number" min={0.01} step={0.01} placeholder="0.00"
                value={depositAmt} onChange={(e) => setDepositAmt(e.target.value)} />
            </FormField>
            <Button variant="primary" disabled={!contractReady || !connected}
              onClick={handleDeposit} className="w-full justify-center">
              <ArrowDownToLine className="w-4 h-4" />
              Deposit {!contractReady && <span className="text-xs">(TODO)</span>}
            </Button>
          </div>
        </Card>

        <Card padding="md">
          <CardHeader title="Withdraw Stake" subtitle={`Max: ${freeStake.toFixed(2)} ETH (free)`} />
          <div className="space-y-3">
            <FormField label="Amount (ETH)" htmlFor="withdraw">
              <Input id="withdraw" type="number" min={0.01} step={0.01} max={freeStake}
                placeholder="0.00" value={withdrawAmt} onChange={(e) => setWithdrawAmt(e.target.value)} />
            </FormField>
            <Button variant="secondary" disabled={!contractReady || !connected}
              onClick={handleWithdraw} className="w-full justify-center">
              <ArrowUpFromLine className="w-4 h-4" />
              Withdraw {!contractReady && <span className="text-xs">(TODO)</span>}
            </Button>
          </div>
        </Card>
      </div>

      {txResult && (
        <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-xs font-mono text-indigo-800">
          {txResult} <DemoBadge className="ml-2 inline-flex" label="Mock tx" />
        </div>
      )}
    </div>
  );
}

// ─── Commit result tab ─────────────────────────────────────────────────────

function CommitTab({ jobs }: { jobs: Job[] }) {
  const { connected } = useWallet();
  const contractReady = chain.isContractConfigured();
  const committable = jobs.filter((j) => j.providerId === DEMO_PROVIDER_ID && j.status === 'ASSIGNED');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [resultHash, setResultHash] = useState('');
  const [txResult, setTxResult] = useState<string | null>(null);

  async function handleCommit() {
    if (!selectedJobId || !resultHash.trim()) return;
    const tx = await chain.commitResult(selectedJobId, resultHash.trim());
    setTxResult(`Commit tx (mock): ${tx}`);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 p-3.5 rounded-2xl bg-indigo-50 border border-indigo-200">
        <Info className="w-4 h-4 text-indigo-600 mt-0.5" />
        <p className="text-sm text-indigo-800">
          After completing a job, compute a SHA-256 hash of your result artifacts and submit it
          here. This binds you to a specific result before verifiers inspect the output.
        </p>
      </div>

      {!contractReady && (
        <div className="flex items-start gap-2 p-3.5 rounded-2xl bg-amber-50 border border-amber-200">
          <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5" />
          <p className="text-sm text-amber-800">Contract not configured — commit is disabled. (TODO)</p>
        </div>
      )}

      <Card padding="md">
        <CardHeader title="Submit Result Commitment" />
        <div className="space-y-4">
          <FormField label="Job ID" htmlFor="commitJobId">
            <select className="input text-sm" value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundPosition: 'right 12px center', backgroundRepeat: 'no-repeat', paddingRight: '2rem' }}>
              <option value="">Select a job in ASSIGNED state</option>
              {committable.map((j) => <option key={j.id} value={j.id}>{j.id} — {j.title}</option>)}
            </select>
          </FormField>

          <FormField label="Result Hash (SHA-256)" htmlFor="resultHash"
            hint="Compute: sha256sum result.tar.gz or equivalent.">
            <Input id="resultHash" placeholder="0x or plain hex hash of result artifacts"
              value={resultHash} onChange={(e) => setResultHash(e.target.value)} className="font-mono text-xs" />
          </FormField>

          <Button variant="primary" disabled={!contractReady || !connected || !selectedJobId || !resultHash.trim()}
            onClick={handleCommit} className="w-full justify-center">
            <Hash className="w-4 h-4" />
            Commit Result Hash {!contractReady && <span className="text-xs">(TODO)</span>}
          </Button>
        </div>
      </Card>

      {txResult && (
        <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-xs font-mono text-indigo-800">
          {txResult} <DemoBadge className="ml-2 inline-flex" label="Mock tx" />
        </div>
      )}
    </div>
  );
}

// ─── Performance / Earnings (unchanged stubs) ─────────────────────────────

function PerformanceTab({ p }: { p: Provider }) {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 p-4 rounded-2xl bg-indigo-50 border border-indigo-200">
        <Info className="w-4 h-4 text-indigo-600 mt-0.5" />
        <p className="text-sm text-indigo-800">Live performance metrics require a running provider node and telemetry pipeline.</p>
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        {['GPU Utilization', 'Memory Bandwidth', 'Avg Job Latency'].map((m) => (
          <div key={m} className="bg-white/70 border border-gray-200/70 rounded-2xl p-4 shadow-card text-center">
            <p className="text-2xl font-bold text-gray-300">—</p>
            <p className="text-sm font-semibold text-gray-600 mt-1">{m}</p>
            <p className="text-xs text-gray-400 italic mt-0.5">Requires live node</p>
          </div>
        ))}
      </div>
      <Card padding="lg">
        <CardHeader title="Historical Summary" subtitle="From provider registration data" />
        {[['Completed Jobs', p.completedJobs.toLocaleString()], ['Verified Jobs', p.verifiedJobsCount.toLocaleString()], ['Average Rating', `${p.rating.toFixed(1)} / 5.0`], ['Uptime', `${p.uptimePercent}%`], ['Slash Count', p.slashCount.toString()]].map(([k, v]) => (
          <div key={k} className="flex justify-between py-2 border-b border-gray-100 last:border-0">
            <span className="text-sm text-gray-500">{k}</span>
            <span className="text-sm font-semibold text-brand-900">{v}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

function EarningsTab() {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 p-4 rounded-2xl bg-amber-50 border border-amber-200">
        <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5" />
        <p className="text-sm text-amber-800">
          <strong>Earnings not yet implemented.</strong> Payment history and withdrawal require smart contract integration.
        </p>
      </div>
      <EmptyState icon={<DollarSign className="w-5 h-5" />} title="Payment history unavailable"
        description="Transaction records and settlement receipts will appear here when the payment layer is implemented." size="md" />
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export function ProviderConsolePage() {
  const [provider, setProvider] = useState<Provider | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('profile');

  useEffect(() => {
    api.getProvider(DEMO_PROVIDER_ID).then(setProvider);
    api.listJobs().then(setJobs);
  }, []);

  if (!provider) return <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>;

  return (
    <div>
      <PageHeader title="Provider Console" subtitle="Manage your hardware profile, stake, and job commitments."
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Provider Console' }]}
        actions={<StatusBadge status={provider.availability} showDot />} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard title="Reputation" value={`${provider.reputation}/100`} icon={<TrendingUp className="w-5 h-5" />} accent="green" />
        <MetricCard title="Total Stake" value={`${provider.stakeEth} ETH`} icon={<Lock className="w-5 h-5" />} accent="blue" />
        <MetricCard title="Slash Count" value={provider.slashCount} icon={<AlertCircle className="w-5 h-5" />} accent="amber" />
        <MetricCard title="Verified Jobs" value={provider.verifiedJobsCount.toLocaleString()} icon={<CheckCircle2 className="w-5 h-5" />} accent="teal" />
      </div>

      <div className="flex gap-1 bg-gray-100/80 rounded-2xl p-1 mb-6 overflow-x-auto">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={cn('px-3 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap flex-1',
              activeTab === tab.id ? 'bg-white text-brand-900 shadow-card' : 'text-gray-500 hover:text-gray-700')}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'profile' && <ProfileTab p={provider} />}
      {activeTab === 'jobs' && <JobsTab jobs={jobs} />}
      {activeTab === 'stake' && <StakeTab p={provider} />}
      {activeTab === 'commit' && <CommitTab jobs={jobs} />}
      {activeTab === 'performance' && <PerformanceTab p={provider} />}
      {activeTab === 'earnings' && <EarningsTab />}
    </div>
  );
}
