import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronRight, ChevronLeft, CheckCircle2, AlertCircle,
  Cpu, DollarSign, ShieldCheck, FileText, Info, Lock,
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { FormField, Input, Select, Textarea } from '../components/ui/FormField';
import { SpecBadge } from '../components/ui/SpecBadge';
import { DemoBadge } from '../components/ui/DemoBadge';
import { WORKLOAD_TYPES, VRAM_OPTIONS, RAM_OPTIONS } from '../data/constants';
import { WORKLOAD_LABELS } from '../data/constants';
import { FRAMEWORK_OPTIONS } from '../data/providers';
import { formatUsd, cn } from '../lib/utils';
import { computePolicy, TIER_LABELS, REPRO_LABELS } from '../lib/risk';
import { chain } from '../services/chain';
import { api } from '../services/api';
import type { WorkloadType, ReproducibilityClass, VerificationPolicy } from '../types';
import { useWallet } from '../context/WalletContext';

// ─── Form state ────────────────────────────────────────────────────────────

interface FormValues {
  title: string;
  workloadType: WorkloadType;
  gpuModel: string;
  minVramGb: number;
  minRamGb: number;
  frameworks: string[];
  budgetUsd: number;
  deadline: string;
  reproducibilityClass: ReproducibilityClass;
  assuranceLevel: 'low' | 'medium' | 'high' | 'maximum';
  description: string;
  providerId: string;
}

type FormErrors = Partial<Record<keyof FormValues, string>>;

const DEFAULTS: FormValues = {
  title: '',
  workloadType: 'inference',
  gpuModel: '',
  minVramGb: 16,
  minRamGb: 32,
  frameworks: [],
  budgetUsd: 20,
  deadline: '',
  reproducibilityClass: 'D',
  assuranceLevel: 'medium',
  description: '',
  providerId: '',
};

// ─── Validation ────────────────────────────────────────────────────────────

function validate(values: FormValues, step: number): FormErrors {
  const errors: FormErrors = {};
  if (step === 0) {
    if (!values.title.trim()) errors.title = 'Job title is required.';
    if (values.title.trim().length > 100) errors.title = 'Title must be 100 characters or fewer.';
    if (!values.description.trim()) errors.description = 'Please describe your workload.';
  }
  if (step === 2) {
    if (values.budgetUsd <= 0) errors.budgetUsd = 'Budget must be greater than $0.';
    if (values.budgetUsd > 10000) errors.budgetUsd = 'Budget cannot exceed $10,000 in this demo.';
  }
  return errors;
}

// ─── Steps ─────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 0, label: 'Workload', icon: FileText },
  { id: 1, label: 'Resources', icon: Cpu },
  { id: 2, label: 'Budget', icon: DollarSign },
  { id: 3, label: 'Risk & Verify', icon: ShieldCheck },
  { id: 4, label: 'Review', icon: CheckCircle2 },
];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-8 overflow-x-auto pb-2">
      {STEPS.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all',
                done ? 'bg-accent-500 border-accent-500 text-white' :
                  active ? 'bg-white border-accent-500 text-accent-600' :
                    'bg-white border-gray-200 text-gray-400',
              )}>
                {done ? <CheckCircle2 className="w-4 h-4" /> : <step.icon className="w-3.5 h-3.5" />}
              </div>
              <span className={cn(
                'text-xs font-medium whitespace-nowrap',
                active ? 'text-brand-900' : done ? 'text-gray-600' : 'text-gray-400',
              )}>{step.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn(
                'flex-1 h-px min-w-[16px] mx-2 mb-5',
                i < current ? 'bg-accent-400' : 'bg-gray-200',
              )} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Step 0: Workload ──────────────────────────────────────────────────────

function StepWorkload({ values, errors, onChange }: {
  values: FormValues; errors: FormErrors; onChange: (v: Partial<FormValues>) => void;
}) {
  return (
    <div className="space-y-5">
      <FormField label="Job Title" htmlFor="title" error={errors.title} required>
        <Input id="title" placeholder="e.g. LLaMA-3 Fine-Tuning — Instruction Dataset v2"
          value={values.title} onChange={(e) => onChange({ title: e.target.value })}
          error={!!errors.title} maxLength={100} />
        <p className="text-xs text-gray-400 mt-1">{values.title.length}/100</p>
      </FormField>

      <FormField label="Workload Type" required>
        <div className="grid sm:grid-cols-2 gap-3 mt-1">
          {WORKLOAD_TYPES.map((wt) => (
            <label key={wt.value} className={cn(
              'flex items-start gap-3 p-3 rounded-2xl border-2 cursor-pointer transition-all',
              values.workloadType === wt.value
                ? 'border-accent-500 bg-accent-50/30' : 'border-gray-200 hover:border-gray-300 bg-white',
            )}>
              <input type="radio" name="workloadType" value={wt.value}
                checked={values.workloadType === wt.value}
                onChange={() => onChange({ workloadType: wt.value as WorkloadType })}
                className="mt-0.5 accent-accent-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-brand-900">{wt.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{wt.description}</p>
              </div>
            </label>
          ))}
        </div>
      </FormField>

      <FormField label="Job Description" htmlFor="description" error={errors.description} required
        hint="Describe the computation, dataset size, model, and any special requirements.">
        <Textarea id="description"
          placeholder="e.g. Fine-tuning LLaMA-3 70B on a 50k-sample instruction dataset…"
          value={values.description} onChange={(e) => onChange({ description: e.target.value })}
          error={!!errors.description} rows={4} />
      </FormField>
    </div>
  );
}

// ─── Step 1: Resources ─────────────────────────────────────────────────────

function StepResources({ values, onChange }: {
  values: FormValues; errors: FormErrors; onChange: (v: Partial<FormValues>) => void;
}) {
  function toggleFramework(fw: string) {
    const has = values.frameworks.includes(fw);
    onChange({ frameworks: has ? values.frameworks.filter((f) => f !== fw) : [...values.frameworks, fw] });
  }
  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-5">
        <FormField label="Preferred GPU Model" htmlFor="gpuModel" hint="Leave blank to accept any compatible GPU.">
          <Select id="gpuModel" value={values.gpuModel} onChange={(e) => onChange({ gpuModel: e.target.value })}>
            <option value="">Any compatible GPU</option>
            {['NVIDIA H100 SXM5', 'NVIDIA H100 PCIe', 'NVIDIA A100 80GB', 'NVIDIA A100 40GB', 'NVIDIA A10G', 'NVIDIA RTX 4090', 'NVIDIA RTX 4080', 'NVIDIA RTX 3090'].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Minimum VRAM" htmlFor="minVramGb" required>
          <Select id="minVramGb" value={values.minVramGb} onChange={(e) => onChange({ minVramGb: Number(e.target.value) })}>
            {VRAM_OPTIONS.map((v) => <option key={v} value={v}>{v === 0 ? 'No minimum' : `${v} GB`}</option>)}
          </Select>
        </FormField>
        <FormField label="Minimum System RAM" htmlFor="minRamGb" required>
          <Select id="minRamGb" value={values.minRamGb} onChange={(e) => onChange({ minRamGb: Number(e.target.value) })}>
            {RAM_OPTIONS.map((v) => <option key={v} value={v}>{v} GB</option>)}
          </Select>
        </FormField>
        <FormField label="Preferred Provider (optional)" htmlFor="providerId" hint="Pre-selected from marketplace, or choose manually.">
          <Select id="providerId" value={values.providerId} onChange={(e) => onChange({ providerId: e.target.value })}>
            <option value="">Auto-match a provider</option>
          </Select>
        </FormField>
      </div>
      <FormField label="Required Frameworks" hint="Select all that apply.">
        <div className="flex flex-wrap gap-2 mt-1">
          {FRAMEWORK_OPTIONS.map((fw) => {
            const selected = values.frameworks.includes(fw);
            return (
              <button key={fw} type="button" onClick={() => toggleFramework(fw)}
                className={cn('px-3 py-1.5 rounded-pill text-xs font-semibold border transition-all',
                  selected ? 'bg-accent-500 border-accent-500 text-white'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300')}>
                {fw}
              </button>
            );
          })}
        </div>
      </FormField>
    </div>
  );
}

// ─── Step 2: Budget ────────────────────────────────────────────────────────

function StepBudget({ values, errors, onChange }: {
  values: FormValues; errors: FormErrors; onChange: (v: Partial<FormValues>) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-5">
        <FormField label="Total Budget (USD)" htmlFor="budgetUsd" error={errors.budgetUsd} required
          hint="Maximum you're willing to spend for this job.">
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <Input id="budgetUsd" type="number" min={1} max={10000} step={1}
              value={values.budgetUsd} onChange={(e) => onChange({ budgetUsd: Number(e.target.value) })}
              error={!!errors.budgetUsd} className="pl-7" />
          </div>
        </FormField>
        <FormField label="Deadline (optional)" htmlFor="deadline" hint="Leave blank for no deadline.">
          <Input id="deadline" type="date" value={values.deadline}
            onChange={(e) => onChange({ deadline: e.target.value })}
            min={new Date().toISOString().split('T')[0]} />
        </FormField>
      </div>
      <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-indigo-800">
          Budget determines the escrow amount locked on submission. The required collateral for
          the provider is computed from your budget and the verification tier (next step).
        </p>
      </div>
    </div>
  );
}

// ─── Step 3: Risk & Verification ──────────────────────────────────────────

const REPRO_DESCRIPTIONS: Record<ReproducibilityClass, string> = {
  D: 'The job produces bit-for-bit identical output given the same inputs and seed. Cheapest to verify.',
  T: 'Output may vary within a defined tolerance (e.g. floating-point rounding). Requires tolerance-bound comparison.',
  N: 'Output is inherently non-deterministic (e.g. image generation). Hash-only verification; semantic correctness not provable.',
};

const ASSURANCE_DESCRIPTIONS: Record<string, string> = {
  low: 'Tier 0 — Hash recorded only. Trust-based with minimal overhead.',
  medium: 'Tier 1 — 10% of tasks sampled and re-executed by a verifier node.',
  high: 'Tier 2 — Multiple providers run the job; results cross-checked.',
  maximum: 'Tier 3 — Full re-execution by independent verifier + 24 h challenge window.',
};

function RiskMeter({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = score < 0.3 ? 'bg-emerald-500' : score < 0.6 ? 'bg-amber-500' : 'bg-red-500';
  const label = score < 0.3 ? 'Low' : score < 0.6 ? 'Medium' : 'High';
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs font-semibold text-brand-900">
        <span>Risk Score</span>
        <span className={cn(score < 0.3 ? 'text-emerald-600' : score < 0.6 ? 'text-amber-600' : 'text-red-600')}>
          {pct}% — {label}
        </span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-500', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StepRisk({ values, onChange }: {
  values: FormValues; onChange: (v: Partial<FormValues>) => void;
}) {
  const policy = useMemo<VerificationPolicy>(
    () => computePolicy(values.workloadType, values.reproducibilityClass, values.assuranceLevel, values.budgetUsd),
    [values.workloadType, values.reproducibilityClass, values.assuranceLevel, values.budgetUsd],
  );

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500">
        The verification policy is computed from reproducibility class, assurance level, workload
        type, and budget. It is locked on-chain before the provider starts.
      </p>

      {/* Reproducibility class */}
      <FormField label="Reproducibility Class" required>
        <div className="space-y-2 mt-1">
          {(['D', 'T', 'N'] as ReproducibilityClass[]).map((cls) => (
            <label key={cls} className={cn(
              'flex items-start gap-3 p-3 rounded-2xl border-2 cursor-pointer transition-all',
              values.reproducibilityClass === cls
                ? 'border-accent-500 bg-accent-50/30' : 'border-gray-200 hover:border-gray-300 bg-white',
            )}>
              <input type="radio" name="reproClass" value={cls}
                checked={values.reproducibilityClass === cls}
                onChange={() => onChange({ reproducibilityClass: cls })}
                className="mt-0.5 accent-accent-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-brand-900">{REPRO_LABELS[cls]}</p>
                <p className="text-xs text-gray-500 mt-0.5">{REPRO_DESCRIPTIONS[cls]}</p>
              </div>
            </label>
          ))}
        </div>
      </FormField>

      {/* Assurance level */}
      <FormField label="Assurance Level" required>
        <div className="space-y-2 mt-1">
          {(['low', 'medium', 'high', 'maximum'] as const).map((lvl) => (
            <label key={lvl} className={cn(
              'flex items-start gap-3 p-3 rounded-2xl border-2 cursor-pointer transition-all',
              values.assuranceLevel === lvl
                ? 'border-accent-500 bg-accent-50/30' : 'border-gray-200 hover:border-gray-300 bg-white',
            )}>
              <input type="radio" name="assurance" value={lvl}
                checked={values.assuranceLevel === lvl}
                onChange={() => onChange({ assuranceLevel: lvl })}
                className="mt-0.5 accent-accent-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-brand-900 capitalize">{lvl}</p>
                <p className="text-xs text-gray-500 mt-0.5">{ASSURANCE_DESCRIPTIONS[lvl]}</p>
              </div>
            </label>
          ))}
        </div>
      </FormField>

      {/* Computed policy */}
      <div className="p-4 rounded-2xl bg-gray-50/80 border border-gray-200/70 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Computed Policy</p>
          <DemoBadge label="Computed locally" />
        </div>
        <RiskMeter score={policy.riskScore} />
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
          {[
            { label: 'Tier', value: TIER_LABELS[policy.tier] },
            { label: 'Sampling', value: policy.samplingPct > 0 ? `${policy.samplingPct}%` : 'None' },
            { label: 'Required Collateral', value: `${policy.requiredCollateralEth} ETH` },
            { label: 'Challenge Window', value: policy.challengeWindowSecs > 0 ? `${policy.challengeWindowSecs / 3600}h` : 'None' },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-gray-400">{label}</p>
              <p className="font-bold text-brand-900">{value}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 italic">
          This policy is computed locally. It will be hashed and recorded on-chain at submission when a contract is configured.
        </p>
      </div>
    </div>
  );
}

// ─── Step 4: Review ────────────────────────────────────────────────────────

function ReviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-gray-100 last:border-0 gap-4">
      <span className="text-sm text-gray-500 flex-shrink-0">{label}</span>
      <span className="text-sm font-semibold text-brand-900 text-right">{value}</span>
    </div>
  );
}

function StepReview({ values }: { values: FormValues }) {
  const policy = useMemo<VerificationPolicy>(
    () => computePolicy(values.workloadType, values.reproducibilityClass, values.assuranceLevel, values.budgetUsd),
    [values.workloadType, values.reproducibilityClass, values.assuranceLevel, values.budgetUsd],
  );
  const contractReady = chain.isContractConfigured();

  return (
    <div className="space-y-5">
      <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-2.5">
        <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-amber-800">
          <strong>Demo only.</strong> This form does not execute a real job, transfer funds, or interact with any blockchain. All values are illustrative.
        </p>
      </div>

      <div className="bg-white/70 border border-gray-200/70 rounded-2xl backdrop-blur-sm p-5">
        <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Workload</p>
        <ReviewRow label="Title" value={values.title || '—'} />
        <ReviewRow label="Type" value={WORKLOAD_LABELS[values.workloadType]} />
        <ReviewRow label="Description" value={<span className="max-w-xs text-right line-clamp-2">{values.description || '—'}</span>} />
      </div>

      <div className="bg-white/70 border border-gray-200/70 rounded-2xl backdrop-blur-sm p-5">
        <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Hardware</p>
        <ReviewRow label="GPU" value={values.gpuModel || 'Any compatible'} />
        <ReviewRow label="Min VRAM" value={values.minVramGb > 0 ? `${values.minVramGb} GB` : 'No minimum'} />
        <ReviewRow label="Min RAM" value={`${values.minRamGb} GB`} />
        {values.frameworks.length > 0 && (
          <ReviewRow label="Frameworks" value={
            <div className="flex flex-wrap gap-1 justify-end">
              {values.frameworks.map((f) => <SpecBadge key={f}>{f}</SpecBadge>)}
            </div>
          } />
        )}
      </div>

      <div className="bg-white/70 border border-gray-200/70 rounded-2xl backdrop-blur-sm p-5">
        <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Risk & Verification</p>
        <ReviewRow label="Reproducibility" value={REPRO_LABELS[values.reproducibilityClass]} />
        <ReviewRow label="Assurance" value={<span className="capitalize">{values.assuranceLevel}</span>} />
        <ReviewRow label="Risk Score" value={`${Math.round(policy.riskScore * 100)}%`} />
        <ReviewRow label="Tier" value={TIER_LABELS[policy.tier]} />
        <ReviewRow label="Sampling" value={policy.samplingPct > 0 ? `${policy.samplingPct}%` : 'None'} />
        <ReviewRow label="Budget" value={formatUsd(values.budgetUsd)} />
        <ReviewRow label="Locks in escrow" value={
          <span className="flex items-center gap-1.5">
            <Lock className="w-3 h-3" />
            {policy.requiredCollateralEth} ETH collateral
          </span>
        } />
      </div>

      {/* Sign button */}
      <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200/70">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-bold text-brand-900">Sign & Submit On-Chain</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {contractReady
                ? 'Contract is configured. Signing will lock escrow and record the policy hash.'
                : 'No contract configured yet. Connect a contract address to enable on-chain submission.'}
            </p>
          </div>
          <button
            disabled
            title={contractReady ? undefined : 'Contract not yet configured — TODO'}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-pill text-sm font-bold bg-brand-900/20 text-brand-500 cursor-not-allowed border border-brand-200"
          >
            <Lock className="w-4 h-4" />
            Sign Transaction
            {!contractReady && <span className="text-xs font-normal">(TODO)</span>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export function SubmitJobPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<FormValues>({
    ...DEFAULTS,
    providerId: (location.state as { providerId?: string })?.providerId ?? '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const state = location.state as { providerId?: string } | null;
    if (state?.providerId) setValues((v) => ({ ...v, providerId: state.providerId! }));
  }, [location.state]);

  function update(partial: Partial<FormValues>) {
    setValues((v) => ({ ...v, ...partial }));
    const cleared = { ...errors };
    (Object.keys(partial) as (keyof FormValues)[]).forEach((k) => delete cleared[k]);
    setErrors(cleared);
  }

  async function handleNext() {
    const stepErrors = validate(values, step);
    if (Object.keys(stepErrors).length > 0) { setErrors(stepErrors); return; }
    setErrors({});
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      // Register via service adapter (mock)
      await api.registerJob({
        workloadType: values.workloadType,
        gpuModel: values.gpuModel,
        minVramGb: values.minVramGb,
        minRamGb: values.minRamGb,
        frameworks: values.frameworks,
        budgetUsd: values.budgetUsd,
        deadline: values.deadline || undefined,
        reproducibilityClass: values.reproducibilityClass,
        assuranceLevel: values.assuranceLevel,
        description: values.description,
        policy: computePolicy(values.workloadType, values.reproducibilityClass, values.assuranceLevel, values.budgetUsd),
      });
      setSubmitted(true);
    }
  }

  function handleBack() { setErrors({}); setStep((s) => Math.max(0, s - 1)); }

  if (submitted) {
    return (
      <div>
        <PageHeader title="Submit a Job" breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Submit Job' }]} />
        <div className="max-w-2xl mx-auto bg-white/70 border border-gray-200/70 rounded-3xl shadow-card p-10 text-center backdrop-blur-sm">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center mx-auto mb-5">
            <Lock className="w-7 h-7 text-indigo-600" />
          </div>
          <h2 className="text-xl font-black text-brand-950 mb-2">Job Configuration Registered</h2>
          <p className="text-sm text-gray-500 max-w-sm mx-auto mb-2">
            Your job has been registered in the mock service (state: <strong>REGISTERED</strong>).
          </p>
          <p className="text-xs text-gray-400 italic mb-2">
            No escrow was locked and no on-chain transaction was sent. The sign-transaction button is
            disabled until a contract is configured.
          </p>
          <DemoBadge className="mb-8" label="Mock registration only — no real transaction" />
          <div className="flex flex-wrap gap-3 justify-center">
            <Button variant="primary" onClick={() => navigate('/dashboard')}>View Dashboard</Button>
            <Button variant="secondary" onClick={() => { setSubmitted(false); setStep(0); setValues({ ...DEFAULTS }); }}>
              Submit Another Job
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Submit a Job"
        subtitle="Configure a compute job, set verification policy, and prepare for on-chain registration."
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Submit Job' }]}
      />
      <div className="max-w-2xl mx-auto">
        <StepIndicator current={step} />
        <div className="bg-white/70 border border-gray-200/70 rounded-3xl shadow-card backdrop-blur-sm p-6 sm:p-8">
          {step === 0 && <StepWorkload values={values} errors={errors} onChange={update} />}
          {step === 1 && <StepResources values={values} errors={errors} onChange={update} />}
          {step === 2 && <StepBudget values={values} errors={errors} onChange={update} />}
          {step === 3 && <StepRisk values={values} onChange={update} />}
          {step === 4 && <StepReview values={values} />}

          <div className="flex items-center justify-between mt-8 pt-5 border-t border-gray-100">
            <Button variant="ghost" size="md" onClick={handleBack} disabled={step === 0}>
              <ChevronLeft className="w-4 h-4" /> Back
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Step {step + 1} of {STEPS.length}</span>
              <Button variant="primary" size="md" onClick={handleNext}>
                {step === STEPS.length - 1 ? 'Save Configuration' : 'Continue'}
                {step < STEPS.length - 1 && <ChevronRight className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
