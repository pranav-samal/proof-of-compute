import React from 'react';
import { Link } from 'react-router-dom';
import {
  Cpu, ArrowRight, ShieldCheck, Zap, Globe, BarChart3,
  CheckCircle2, Search, Send, Lock, ChevronRight,
  Users, Server, GitMerge,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { MOCK_PROVIDERS } from '../data/providers';
import { formatUsd } from '../lib/utils';

// ─── Hero — Sarvam-style: sparse, powerful, two-column ────────────────────

function Hero() {
  return (
    <section className="mb-10">
      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-10 lg:gap-14 items-center">
        {/* Left: text stack */}
        <div className="max-w-xl">
          {/* Eyebrow badge */}
          <div className="flex items-center gap-2 mb-5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-pill bg-indigo-50 text-indigo-700 text-xs font-bold uppercase tracking-widest ring-1 ring-indigo-200">
              Prototype · Mid-Semester Demo
            </span>
          </div>

          {/* Headline — tight tracking like Sarvam */}
          <h1 className="text-4xl sm:text-5xl font-black text-brand-950 leading-[1.05] tracking-tight">
            Decentralized GPU<br />
            Computing,{' '}
            <span className="text-accent-500">Verified</span>
            <br />On-Chain
          </h1>

          <p className="mt-5 text-base text-gray-500 leading-relaxed max-w-md">
            Proof-of-Compute connects compute requesters with GPU providers in a
            transparent, trustless marketplace — without a central intermediary.
          </p>

          {/* CTAs — pill-shaped, Sarvam-style */}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/marketplace">
              <button className="inline-flex items-center gap-2 px-5 py-3 rounded-pill bg-accent-500 text-white text-sm font-bold hover:bg-accent-600 transition-all duration-200 shadow-accent">
                Browse Marketplace
                <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
            <Link to="/submit-job">
              <button className="inline-flex items-center gap-2 px-5 py-3 rounded-pill bg-white/80 text-brand-900 text-sm font-semibold border border-gray-200 hover:bg-white hover:border-gray-300 transition-all duration-200 backdrop-blur-sm">
                Submit a Job
              </button>
            </Link>
          </div>

          {/* Trust signals */}
          <div className="mt-7 flex flex-wrap items-center gap-5 text-sm text-gray-400">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              No central intermediary
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              Transparent settlement
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              Cryptographic verification
            </span>
          </div>
        </div>

        {/* Right: pillar cards — Sarvam's "platform pillars" strip */}
        <div className="bg-white/80 backdrop-blur-sm border border-gray-200/80 rounded-3xl p-5 shadow-card-lg space-y-3">
          {[
            {
              eyebrow: 'Resource Matching',
              title: 'Find the right GPU instantly',
              body: 'Filter by model, VRAM, price, and framework. The marketplace matches your workload requirements to available hardware.',
              color: 'bg-indigo-50 text-indigo-600',
            },
            {
              eyebrow: 'Execution Verification',
              title: 'Proof, not just trust',
              body: 'Choose from output hashing, zero-knowledge proofs, or TEE attestation. Verification method is set per-job.',
              color: 'bg-accent-50 text-accent-600',
            },
            {
              eyebrow: 'Transparent Settlement',
              title: 'On-chain cost records',
              body: 'All cost calculations and payment flows are recorded on-chain, giving both parties a full audit trail.',
              color: 'bg-emerald-50 text-emerald-600',
            },
          ].map((p) => (
            <div
              key={p.title}
              className="p-4 rounded-2xl border border-gray-100/80 bg-gray-50/50 hover:bg-white hover:border-gray-200 hover:shadow-card transition-all duration-300 cursor-default"
            >
              <p className={`text-[10px] font-black uppercase tracking-widest mb-1.5 px-2 py-0.5 rounded-pill inline-block ${p.color}`}>
                {p.eyebrow}
              </p>
              <h3 className="text-sm font-bold text-brand-900 mb-1">{p.title}</h3>
              <p className="text-xs text-gray-500 leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Stats bar ─────────────────────────────────────────────────────────────

function StatsBar() {
  const stats = [
    { label: 'Compute Providers', value: '8+', note: 'illustrative' },
    { label: 'GPU Models Supported', value: '9', note: 'illustrative' },
    { label: 'Verification Methods', value: '4', note: 'zkp, hash, tee, none' },
    { label: 'Avg. Price (GPU-hr)', value: '$1.72', note: 'illustrative avg.' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
      {stats.map((s) => (
        <div key={s.label} className="bg-white/70 border border-gray-200/70 rounded-2xl p-5 text-center shadow-card backdrop-blur-sm">
          <p className="text-3xl font-black text-brand-950 tracking-tight">{s.value}</p>
          <p className="text-sm font-semibold text-brand-800 mt-1">{s.label}</p>
          <p className="text-xs text-gray-400 mt-0.5 italic">{s.note}</p>
        </div>
      ))}
    </div>
  );
}

// ─── How it works ──────────────────────────────────────────────────────────

function HowItWorks() {
  const steps = [
    { icon: Search, color: 'bg-indigo-50 text-indigo-600', title: 'Browse & Filter', body: 'Requesters browse GPU providers, filtering by model, VRAM, price, and framework support.', role: 'Requester' },
    { icon: Send, color: 'bg-accent-50 text-accent-600', title: 'Submit a Job', body: 'Configure workload type, required hardware, budget, and verification preference.', role: 'Requester' },
    { icon: Cpu, color: 'bg-teal-50 text-teal-600', title: 'Execute on Provider', body: "The provider's node runs the compute job. Resources are reserved for the job's duration.", role: 'Provider' },
    { icon: ShieldCheck, color: 'bg-purple-50 text-purple-600', title: 'Verify the Result', body: 'Output is verified via the selected method — output hash, ZK proof, or TEE attestation.', role: 'Both' },
    { icon: BarChart3, color: 'bg-emerald-50 text-emerald-600', title: 'Transparent Settlement', body: 'Cost is calculated by actual resource usage. Settlement details are recorded on-chain.', role: 'Both' },
  ];

  return (
    <section className="mb-10">
      <div className="mb-6">
        <p className="text-xs font-black text-accent-500 uppercase tracking-widest mb-1">Workflow</p>
        <h2 className="text-2xl font-black text-brand-950 tracking-tight">How It Works</h2>
        <p className="mt-1.5 text-sm text-gray-500">A five-step lifecycle from submission to settlement.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {steps.map((step, i) => (
          <div key={step.title} className="bg-white/70 border border-gray-200/70 rounded-2xl p-4 shadow-card backdrop-blur-sm hover:shadow-card-md hover:border-gray-300/70 transition-all duration-300">
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${step.color}`}>
                <step.icon className="w-4 h-4" />
              </div>
              <span className="text-xs font-black text-gray-300">{String(i + 1).padStart(2, '0')}</span>
            </div>
            <h3 className="text-sm font-bold text-brand-900 mb-1">{step.title}</h3>
            <p className="text-xs text-gray-500 leading-relaxed">{step.body}</p>
            <span className="mt-3 inline-block text-[10px] font-black uppercase tracking-widest text-accent-600 bg-accent-50 px-2 py-0.5 rounded-pill">
              {step.role}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Features ──────────────────────────────────────────────────────────────

function Features() {
  const features = [
    { icon: Globe, title: 'Decentralized Resource Matching', body: 'No central scheduler. Providers register capabilities; requesters specify requirements. Smart contract logic matches supply and demand.' },
    { icon: ShieldCheck, title: 'Pluggable Verification', body: 'Choose the right trade-off per job: no verification for trusted runs, output hashing for tamper detection, ZK proofs for cryptographic assurance, or TEE attestation.' },
    { icon: Lock, title: 'Transparent Settlement', body: 'All cost calculations and payment flows are stored on-chain, giving both parties an auditable history of every computation.' },
    { icon: Zap, title: 'Broad Hardware Support', body: 'From budget RTX 3090 nodes to datacenter-grade H100 clusters — the marketplace accommodates a wide range of GPU hardware.' },
    { icon: Users, title: 'Dual-Role Design', body: 'Designed symmetrically for requesters and providers. Each role has a dedicated console with relevant metrics, history, and tools.' },
    { icon: GitMerge, title: 'API-Ready Architecture', body: 'The frontend data layer is cleanly separated from UI components, making it straightforward to wire in a real API or smart contract.' },
  ];

  return (
    <section className="mb-10">
      <div className="mb-6">
        <p className="text-xs font-black text-accent-500 uppercase tracking-widest mb-1">Platform</p>
        <h2 className="text-2xl font-black text-brand-950 tracking-tight">Platform Capabilities</h2>
        <p className="mt-1.5 text-sm text-gray-500">Core design principles behind Proof-of-Compute.</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map((f) => (
          <div key={f.title} className="bg-white/70 border border-gray-200/70 rounded-2xl p-5 shadow-card backdrop-blur-sm hover:shadow-card-md hover:border-gray-300/70 transition-all duration-300">
            <div className="w-9 h-9 rounded-xl bg-gray-100/80 flex items-center justify-center text-brand-700 mb-3.5 border border-gray-200/60">
              <f.icon className="w-4.5 h-4.5" />
            </div>
            <h3 className="text-sm font-bold text-brand-900 mb-1.5">{f.title}</h3>
            <p className="text-xs text-gray-500 leading-relaxed">{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Provider preview — "India builds with Sarvam" equivalent ─────────────

function ProviderPreview() {
  const preview = MOCK_PROVIDERS.filter((p) => p.availability === 'available').slice(0, 3);

  return (
    <section className="mb-10">
      <div className="flex items-end justify-between mb-6">
        <div>
          <p className="text-xs font-black text-accent-500 uppercase tracking-widest mb-1">Marketplace</p>
          <h2 className="text-2xl font-black text-brand-950 tracking-tight">Available Providers</h2>
          <p className="mt-1 text-sm text-gray-400 italic">Illustrative data — not live availability.</p>
        </div>
        <Link to="/marketplace" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-900 transition-colors">
          View all <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {preview.map((p) => (
          <div key={p.id} className="bg-white/70 border border-gray-200/70 rounded-2xl p-5 shadow-card backdrop-blur-sm hover:shadow-card-md hover:border-gray-300/70 transition-all duration-300">
            <div className="flex items-start justify-between mb-2.5">
              <div>
                <p className="text-sm font-bold text-brand-900">{p.name}</p>
                <p className="text-xs text-gray-400">{p.location}</p>
              </div>
              <span className="px-2.5 py-0.5 rounded-pill text-xs font-bold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                Available
              </span>
            </div>
            <p className="text-xs font-semibold text-brand-700 mb-3">{p.gpu.model} · {p.gpu.vramGb} GB VRAM</p>
            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
              <span className="text-lg font-black text-brand-950">
                {formatUsd(p.pricePerHour)}
                <span className="text-xs font-normal text-gray-400 ml-1">/ GPU-hr</span>
              </span>
              <Link to="/marketplace">
                <button className="text-xs font-bold text-accent-600 hover:text-accent-700 flex items-center gap-0.5 transition-colors">
                  Details <ArrowRight className="w-3 h-3" />
                </button>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Architecture — 4-layer diagram ────────────────────────────────────────

function Architecture() {
  const layers = [
    { icon: Users, color: 'bg-indigo-50 border-indigo-200/80 text-indigo-700', title: 'Client Layer', items: ['Requester Dashboard', 'Provider Console', 'Marketplace UI', 'Job Submission Form'] },
    { icon: Server, color: 'bg-accent-50 border-accent-200/80 text-accent-700', title: 'Coordination Layer', items: ['Provider Registry', 'Job Scheduler', 'Verification Oracle', 'Settlement Engine'] },
    { icon: Lock, color: 'bg-purple-50 border-purple-200/80 text-purple-700', title: 'On-Chain Layer', items: ['Smart Contracts', 'Payment Escrow', 'Reputation Records', 'Proof Storage'] },
    { icon: Cpu, color: 'bg-teal-50 border-teal-200/80 text-teal-700', title: 'Compute Layer', items: ['GPU Provider Nodes', 'CUDA / Framework Runtimes', 'TEE Enclaves (optional)', 'Output Hashing'] },
  ];

  return (
    <section className="mb-10">
      <div className="mb-6">
        <p className="text-xs font-black text-accent-500 uppercase tracking-widest mb-1">Architecture</p>
        <h2 className="text-2xl font-black text-brand-950 tracking-tight">System Architecture</h2>
        <p className="mt-1.5 text-sm text-gray-500">Four logical layers — this UI covers the Client Layer.</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {layers.map((layer, i) => (
          <div key={layer.title} className={`border rounded-2xl p-5 ${layer.color}`}>
            <div className="flex items-center gap-2 mb-3">
              <layer.icon className="w-4 h-4" />
              <span className="text-xs font-black uppercase tracking-widest opacity-60">{String(i + 1).padStart(2, '0')}</span>
            </div>
            <h3 className="text-sm font-bold mb-2">{layer.title}</h3>
            <ul className="space-y-1">
              {layer.items.map((item) => (
                <li key={item} className="text-xs opacity-75 flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-current flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-gray-400 italic">
        Coordination, on-chain, and compute layers are planned for future milestones. This release covers the Client Layer only.
      </p>
    </section>
  );
}

// ─── CTA — Sarvam-style dark banner ────────────────────────────────────────

function CTA() {
  return (
    <section className="bg-brand-950 rounded-3xl px-8 py-10 sm:px-12 sm:py-14 text-center">
      <p className="text-xs font-black text-accent-400 uppercase tracking-widest mb-2">Get started</p>
      <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-3">
        Ready to explore?
      </h2>
      <p className="text-gray-400 text-sm mb-8 max-w-md mx-auto leading-relaxed">
        Browse the marketplace, configure a compute job, or explore how verification works — all in this demonstration build.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link to="/marketplace">
          <button className="inline-flex items-center gap-2 px-6 py-3 rounded-pill bg-accent-500 text-white text-sm font-bold hover:bg-accent-600 transition-all duration-200 shadow-accent">
            Browse Marketplace
            <ArrowRight className="w-4 h-4" />
          </button>
        </Link>
        <Link to="/submit-job">
          <button className="inline-flex items-center gap-2 px-6 py-3 rounded-pill text-sm font-semibold text-white border border-white/20 hover:bg-white/10 transition-all duration-200">
            Submit a Job
          </button>
        </Link>
      </div>
    </section>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export function LandingPage() {
  return (
    <div>
      <Hero />
      <StatsBar />
      <HowItWorks />
      <Features />
      <ProviderPreview />
      <Architecture />
      <CTA />
    </div>
  );
}
