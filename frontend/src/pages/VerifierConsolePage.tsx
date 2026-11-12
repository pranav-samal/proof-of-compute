import React, { useState, useEffect } from 'react';
import {
  Layers, DollarSign, AlertCircle, Info, CheckCircle2,
  XCircle, HelpCircle, ArrowDownToLine, ArrowUpFromLine,
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { MetricCard } from '../components/ui/MetricCard';
import { DemoBadge } from '../components/ui/DemoBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { FormField, Input } from '../components/ui/FormField';
import { api } from '../services/api';
import { chain } from '../services/chain';
import { cn } from '../lib/utils';
import type { VerifierNode, Attestation } from '../types';
import { useWallet } from '../context/WalletContext';

// Demo: use first verifier as "active" node
const DEMO_VERIFIER_ID = 'ver-001';

type TabId = 'overview' | 'attest' | 'bond';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'attest',   label: 'Submit Attestation' },
  { id: 'bond',     label: 'Bond' },
];

function OverviewTab({ v }: { v: VerifierNode }) {
  return (
    <div className="space-y-5">
      <Card padding="lg">
        <div className="flex items-center justify-between mb-4">
          <CardHeader title="Verifier Identity" />
          <DemoBadge />
        </div>
        {[
          ['Verifier ID',       v.id],
          ['Address',           v.address],
          ['Bond (ETH)',        `${v.bondEth} ETH`],
          ['Assigned Tasks',    v.assignedTasks.toString()],
          ['Completed Tasks',   v.completedTasks.toString()],
          ['Slash Count',       v.slashCount.toString()],
        ].map(([k, val]) => (
          <div key={k} className="flex justify-between py-2 border-b border-gray-100 last:border-0">
            <span className="text-sm text-gray-500">{k}</span>
            <span className="text-sm font-semibold text-brand-900 font-mono">{val}</span>
          </div>
        ))}
      </Card>

      <div className="flex items-start gap-2 p-4 rounded-2xl bg-indigo-50 border border-indigo-200">
        <Info className="w-4 h-4 text-indigo-600 mt-0.5" />
        <p className="text-sm text-indigo-800">
          Verifier nodes bond ETH as collateral. They are assigned jobs matching their
          capabilities and must submit attestations within the challenge window. Incorrect
          attestations (contradicting quorum) result in a slash.
        </p>
      </div>
    </div>
  );
}

function AttestTab({ v }: { v: VerifierNode }) {
  const { connected } = useWallet();
  const contractReady = chain.isContractConfigured();
  const [jobId, setJobId]       = useState('');
  const [verdict, setVerdict]   = useState<Attestation['verdict']>('pass');
  const [txResult, setTxResult] = useState<string | null>(null);

  async function handleSubmit() {
    if (!jobId.trim()) return;
    const tx = await chain.submitAttestation(jobId.trim(), verdict);
    setTxResult(`Attestation tx (mock): ${tx}`);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 p-3.5 rounded-2xl bg-indigo-50 border border-indigo-200">
        <Info className="w-4 h-4 text-indigo-600 mt-0.5" />
        <p className="text-sm text-indigo-800">
          After re-executing the job (or running the sampled portion), submit your verdict.
          Your attestation contributes to or against quorum. Contradicting a valid quorum will slash your bond.
        </p>
      </div>

      {!contractReady && (
        <div className="flex items-start gap-2 p-3.5 rounded-2xl bg-amber-50 border border-amber-200">
          <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5" />
          <p className="text-sm text-amber-800">Contract not configured — attestation submission is disabled. (TODO)</p>
        </div>
      )}

      <Card padding="md">
        <CardHeader title="Submit Attestation" />
        <div className="space-y-4">
          <FormField label="Job ID" htmlFor="attestJobId">
            <Input id="attestJobId" placeholder="e.g. job-2403" value={jobId}
              onChange={(e) => setJobId(e.target.value)} />
          </FormField>

          <FormField label="Verdict" required>
            <div className="flex gap-3 mt-1">
              {(['pass', 'fail', 'inconclusive'] as const).map((v) => {
                const Icon = v === 'pass' ? CheckCircle2 : v === 'fail' ? XCircle : HelpCircle;
                return (
                  <label key={v} className={cn(
                    'flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 cursor-pointer flex-1 transition-all',
                    verdict === v ? 'border-accent-500 bg-accent-50/30' : 'border-gray-200 hover:border-gray-300',
                  )}>
                    <input type="radio" name="verdict" value={v} checked={verdict === v}
                      onChange={() => setVerdict(v)} className="accent-accent-500 sr-only" />
                    <Icon className={cn('w-4 h-4', v === 'pass' ? 'text-emerald-600' : v === 'fail' ? 'text-red-500' : 'text-amber-500')} />
                    <span className="text-sm font-bold text-brand-900 capitalize">{v}</span>
                  </label>
                );
              })}
            </div>
          </FormField>

          <Button variant="primary" disabled={!contractReady || !connected || !jobId.trim()}
            onClick={handleSubmit} className="w-full justify-center">
            Submit Attestation {!contractReady && <span className="text-xs">(TODO)</span>}
          </Button>
        </div>
      </Card>

      {txResult && (
        <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-xs font-mono text-indigo-800 break-all">
          {txResult} <DemoBadge className="ml-2 inline-flex" label="Mock tx" />
        </div>
      )}
    </div>
  );
}

function BondTab({ v }: { v: VerifierNode }) {
  const { connected } = useWallet();
  const contractReady = chain.isContractConfigured();
  const [amt, setAmt] = useState('');
  const [txResult, setTxResult] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-white/70 border border-gray-200/70 rounded-2xl p-4 shadow-card text-center">
          <p className="text-2xl font-black text-brand-950">{v.bondEth} ETH</p>
          <p className="text-sm font-semibold text-brand-800 mt-0.5">Current Bond</p>
          <DemoBadge className="mx-auto mt-2 flex" />
        </div>
        <div className="bg-white/70 border border-gray-200/70 rounded-2xl p-4 shadow-card text-center">
          <p className="text-2xl font-black text-brand-950">{v.slashCount}</p>
          <p className="text-sm font-semibold text-brand-800 mt-0.5">Times Slashed</p>
          <DemoBadge className="mx-auto mt-2 flex" />
        </div>
      </div>

      {!contractReady && (
        <div className="flex items-start gap-2 p-3.5 rounded-2xl bg-amber-50 border border-amber-200">
          <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5" />
          <p className="text-sm text-amber-800">Contract not configured — bond management is disabled. (TODO)</p>
        </div>
      )}

      <Card padding="md">
        <CardHeader title="Manage Bond" />
        <div className="space-y-3">
          <FormField label="Amount (ETH)" htmlFor="bondAmt">
            <Input id="bondAmt" type="number" min={0.01} step={0.01} placeholder="0.00"
              value={amt} onChange={(e) => setAmt(e.target.value)} />
          </FormField>
          <div className="flex gap-3">
            <Button variant="primary" disabled={!contractReady || !connected}
              onClick={async () => { const tx = await chain.depositStake(parseFloat(amt)); setTxResult(`Bond deposit (mock): ${tx}`); }}
              className="flex-1 justify-center">
              <ArrowDownToLine className="w-4 h-4" />
              Deposit Bond
            </Button>
            <Button variant="secondary" disabled={!contractReady || !connected}
              onClick={async () => { const tx = await chain.withdrawStake(parseFloat(amt)); setTxResult(`Bond withdraw (mock): ${tx}`); }}
              className="flex-1 justify-center">
              <ArrowUpFromLine className="w-4 h-4" />
              Withdraw Bond
            </Button>
          </div>
        </div>
      </Card>

      {txResult && (
        <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-xs font-mono text-indigo-800 break-all">
          {txResult} <DemoBadge className="ml-2 inline-flex" label="Mock tx" />
        </div>
      )}
    </div>
  );
}

export function VerifierConsolePage() {
  const [verifiers, setVerifiers] = useState<VerifierNode[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  useEffect(() => { api.listVerifiers().then(setVerifiers); }, []);

  const v = verifiers.find((x) => x.id === DEMO_VERIFIER_ID);

  return (
    <div>
      <PageHeader title="Verifier Console" subtitle="Manage your verifier bond, review assigned tasks, and submit attestations."
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Verifier Console' }]} />

      {v && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <MetricCard title="Bond"             value={`${v.bondEth} ETH`}        icon={<DollarSign className="w-5 h-5" />} accent="blue" />
            <MetricCard title="Assigned Tasks"   value={v.assignedTasks}            icon={<Layers className="w-5 h-5" />}    accent="amber" />
            <MetricCard title="Completed Tasks"  value={v.completedTasks}           icon={<CheckCircle2 className="w-5 h-5" />} accent="green" />
            <MetricCard title="Slash Count"      value={v.slashCount}               icon={<AlertCircle className="w-5 h-5" />} accent="purple" />
          </div>

          <div className="flex gap-1 bg-gray-100/80 rounded-2xl p-1 mb-6">
            {TABS.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={cn('px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap flex-1',
                  activeTab === tab.id ? 'bg-white text-brand-900 shadow-card' : 'text-gray-500 hover:text-gray-700')}>
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'overview' && <OverviewTab v={v} />}
          {activeTab === 'attest'   && <AttestTab v={v} />}
          {activeTab === 'bond'     && <BondTab v={v} />}
        </>
      )}

      {!v && verifiers.length === 0 && (
        <EmptyState icon={<Layers className="w-5 h-5" />} title="Loading verifier data…" size="md" />
      )}
    </div>
  );
}
