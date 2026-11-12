import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  Receipt, Hash, CheckCircle2, XCircle, HelpCircle,
  AlertCircle, ExternalLink, Info, Search,
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { DemoBadge } from '../components/ui/DemoBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { Card, CardHeader } from '../components/ui/Card';
import { Input } from '../components/ui/FormField';
import { Button } from '../components/ui/Button';
import { api } from '../services/api';
import { WORKLOAD_LABELS } from '../data/constants';
import { formatDateTime } from '../lib/utils';
import { cn } from '../lib/utils';
import type { Job, JobReceipt, Attestation } from '../types';

const EXPLORER_BASE = 'https://sepolia.etherscan.io/tx/';

function TxLink({ txHash }: { txHash?: string }) {
  if (!txHash) return null;
  return (
    <a href={`${EXPLORER_BASE}${txHash}`} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-accent-600 hover:text-accent-700 font-mono">
      {txHash.slice(0, 14)}…
      <ExternalLink className="w-3 h-3" />
    </a>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2 border-b border-gray-100 last:border-0 gap-4">
      <span className="text-sm text-gray-500 flex-shrink-0">{label}</span>
      <span className="text-sm font-semibold text-brand-900 text-right">{value}</span>
    </div>
  );
}

const VERDICT_ICON: Record<string, React.ReactNode> = {
  pass:         <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
  fail:         <XCircle className="w-4 h-4 text-red-500" />,
  inconclusive: <HelpCircle className="w-4 h-4 text-amber-500" />,
};

// ─── Hash match panel ──────────────────────────────────────────────────────

function HashMatchPanel({ recordedHash }: { recordedHash: string }) {
  const [inputHash, setInputHash] = useState('');
  const [result, setResult] = useState<'match' | 'mismatch' | null>(null);

  function check() {
    if (!inputHash.trim()) return;
    setResult(inputHash.trim().toLowerCase() === recordedHash.toLowerCase() ? 'match' : 'mismatch');
  }

  return (
    <Card padding="md">
      <CardHeader title="Hash Match Check"
        subtitle="Paste your locally-computed result hash to compare against the recorded value." />
      <div className="space-y-3">
        <div className="p-3 rounded-xl bg-gray-50 border border-gray-200/70">
          <p className="text-xs text-gray-400 mb-1">Recorded result hash</p>
          <code className="text-xs font-mono text-brand-800 break-all">{recordedHash}</code>
        </div>
        <div className="flex gap-2">
          <Input placeholder="Paste your hash here…" value={inputHash}
            onChange={(e) => { setInputHash(e.target.value); setResult(null); }} className="flex-1 text-xs font-mono" />
          <Button variant="secondary" size="sm" onClick={check}>
            <Search className="w-3.5 h-3.5" /> Check
          </Button>
        </div>
        {result === 'match' && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <div>
              <p className="text-sm font-bold text-emerald-800">Hashes match</p>
              <p className="text-xs text-emerald-700 mt-0.5">
                The output you have was not altered in transit. This does <strong>not</strong> prove the
                computation was performed correctly — only that the data is intact.
              </p>
            </div>
          </div>
        )}
        {result === 'mismatch' && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200">
            <XCircle className="w-4 h-4 text-red-600" />
            <p className="text-sm font-bold text-red-800">Hashes do not match — output may have been tampered.</p>
          </div>
        )}
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
          <p className="text-xs font-bold text-amber-700">Hash ≠ Proof of Correctness</p>
          <p className="text-xs text-amber-700 mt-0.5">
            A matching hash confirms the output was not altered after the provider committed it.
            It does not prove the provider ran the correct computation on the correct inputs.
            Only ZK-proof or TEE attestation provides computational correctness guarantees.
          </p>
        </div>
      </div>
    </Card>
  );
}

// ─── Receipt display ───────────────────────────────────────────────────────

function ReceiptDisplay({ job, receipt }: { job: Job; receipt: JobReceipt }) {
  const receiptUrl = `${window.location.origin}/receipt/${job.id}`;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 p-3 rounded-2xl bg-amber-50 border border-amber-200">
        <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
        <p className="text-sm text-amber-800">
          <strong>Demo data.</strong> All hashes and transaction references are illustrative.
          No real blockchain interaction has occurred.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* QR Code */}
        <div className="lg:col-span-1">
          <Card padding="md">
            <CardHeader title="Receipt QR" subtitle="Scan to verify this job" />
            <div className="flex justify-center py-4">
              <div className="p-3 bg-white rounded-2xl border border-gray-200 shadow-card">
                <QRCodeSVG value={receiptUrl} size={160} level="M"
                  imageSettings={{ src: '', height: 0, width: 0, excavate: false }} />
              </div>
            </div>
            <p className="text-xs text-gray-400 text-center break-all mt-2">{receiptUrl}</p>
            <DemoBadge className="mx-auto mt-3 flex" />
          </Card>
        </div>

        {/* Receipt details */}
        <div className="lg:col-span-2 space-y-5">
          <Card padding="md">
            <div className="flex items-center justify-between mb-3">
              <CardHeader title="Proof-of-Compute Receipt" subtitle={job.id} />
              <DemoBadge />
            </div>
            <InfoRow label="Job Title"       value={job.title} />
            <InfoRow label="Workload"        value={WORKLOAD_LABELS[job.config.workloadType]} />
            <InfoRow label="Status"          value={job.status} />
            <InfoRow label="Issued"          value={receipt.receiptTimestamp ? formatDateTime(receipt.receiptTimestamp) : '—'} />
            <InfoRow label="Receipt Tx"      value={<TxLink txHash={receipt.txHash} />} />
            <InfoRow label="Policy Hash"     value={
              <span className="font-mono text-xs text-brand-800">{receipt.policyHash}</span>
            } />
            <InfoRow label="Result Hash"     value={
              <span className="font-mono text-xs text-brand-800">{receipt.resultHash.slice(0, 20)}…</span>
            } />
          </Card>

          {/* Attestations */}
          <Card padding="md">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-brand-900">
                Attestations ({receipt.attestations.length}/{receipt.quorumRequired} quorum)
              </p>
              <DemoBadge />
            </div>
            {receipt.attestations.map((att: Attestation, i: number) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                {VERDICT_ICON[att.verdict]}
                <div className="flex-1">
                  <span className="text-xs font-mono text-brand-800">{att.verifierId}</span>
                  <span className={cn('ml-2 px-2 py-0.5 rounded-pill text-xs font-bold',
                    att.verdict === 'pass' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>
                    {att.verdict}
                  </span>
                </div>
                <TxLink txHash={att.txHash} />
              </div>
            ))}
          </Card>

          {/* Settlement */}
          {receipt.settlement && (
            <Card padding="md">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold text-brand-900">Settlement</p>
                <DemoBadge />
              </div>
              <InfoRow label="Outcome" value={
                <span className={cn('px-2.5 py-0.5 rounded-pill text-xs font-bold',
                  receipt.settlement.status === 'released' ? 'bg-emerald-50 text-emerald-700' :
                  receipt.settlement.status === 'slashed'  ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700')}>
                  {receipt.settlement.status.toUpperCase()}
                </span>
              } />
              <InfoRow label="Amount"  value={`${receipt.settlement.amountEth} ETH`} />
              <InfoRow label="Note"    value={receipt.settlement.note} />
              <InfoRow label="Tx"      value={<TxLink txHash={receipt.settlement.txHash} />} />
            </Card>
          )}
        </div>
      </div>

      {/* Hash match panel */}
      <HashMatchPanel recordedHash={receipt.resultHash} />
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export function ReceiptPage() {
  const { jobId: paramJobId } = useParams<{ jobId?: string }>();
  const navigate = useNavigate();
  const [inputId, setInputId]   = useState(paramJobId ?? '');
  const [job, setJob]           = useState<Job | null>(null);
  const [receipt, setReceipt]   = useState<JobReceipt | null>(null);
  const [loading, setLoading]   = useState(false);
  const [notFound, setNotFound] = useState(false);

  async function lookup(id: string) {
    if (!id.trim()) return;
    setLoading(true);
    setNotFound(false);
    setJob(null);
    setReceipt(null);
    const [j, r] = await Promise.all([api.getJob(id.trim()), api.getReceipt(id.trim())]);
    setJob(j);
    setReceipt(r);
    setNotFound(!j || !r);
    setLoading(false);
    // Update URL
    navigate(`/receipt/${id.trim()}`, { replace: true });
  }

  // Auto-lookup if URL has jobId
  useEffect(() => {
    if (paramJobId) lookup(paramJobId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramJobId]);

  return (
    <div>
      <PageHeader
        title="Job Receipt"
        subtitle="Enter a job ID to view its on-chain Proof-of-Compute receipt."
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Receipt' }]}
      />

      {/* ID input */}
      <div className="max-w-xl mb-6">
        <div className="flex gap-2">
          <Input
            placeholder="e.g. job-2401"
            value={inputId}
            onChange={(e) => setInputId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && lookup(inputId)}
          />
          <Button variant="primary" onClick={() => lookup(inputId)} loading={loading}>
            <Search className="w-4 h-4" />
            Lookup
          </Button>
        </div>
        <p className="text-xs text-gray-400 mt-1.5">Try: job-2401 or job-2402</p>
      </div>

      {loading && <p className="text-sm text-gray-400 py-8 text-center">Looking up receipt…</p>}

      {notFound && !loading && (
        <EmptyState
          icon={<Receipt className="w-5 h-5" />}
          title="Receipt not available"
          description="No settled receipt found for this job ID. Only SETTLED or DISPUTED jobs have receipts."
          size="md"
        />
      )}

      {job && receipt && !loading && (
        <ReceiptDisplay job={job} receipt={receipt} />
      )}
    </div>
  );
}
