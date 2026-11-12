import React from 'react';
import {
  CheckCircle2, MapPin, Star, Cpu, MemoryStick, HardDrive,
  TrendingUp, ArrowRight,
} from 'lucide-react';
import type { Provider } from '../../types';
import { Modal } from '../ui/Modal';
import { StatusBadge } from '../ui/StatusBadge';
import { SpecBadge } from '../ui/SpecBadge';
import { Button } from '../ui/Button';
import { formatUsd, formatDate } from '../../lib/utils';

interface ProviderDetailModalProps {
  provider: Provider | null;
  open: boolean;
  onClose: () => void;
  onSelect: (provider: Provider) => void;
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-semibold text-brand-900">{value}</span>
    </div>
  );
}

export function ProviderDetailModal({ provider, open, onClose, onSelect }: ProviderDetailModalProps) {
  if (!provider) return null;

  const isAvailable = provider.availability === 'available';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={provider.name}
      subtitle={provider.location}
      width="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button
            variant="primary"
            disabled={!isAvailable}
            onClick={() => { onSelect(provider); onClose(); }}
          >
            Configure Job with Provider
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </>
      }
    >
      {/* Summary bar */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={provider.availability} showDot />
          {provider.verifiedProvider && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-pill text-xs font-semibold bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200">
              <CheckCircle2 className="w-3 h-3" />
              Verified
            </span>
          )}
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-brand-950">{formatUsd(provider.pricePerHour)}</p>
          <p className="text-xs text-gray-400">per GPU-hour</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        {/* GPU specs */}
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">GPU Specification</p>
          <div className="bg-gray-50/70 rounded-2xl p-4 border border-gray-200/60 space-y-1.5">
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="w-4 h-4 text-accent-500" />
              <span className="text-sm font-bold text-brand-900">{provider.gpu.model}</span>
            </div>
            <StatRow label="Count" value={`×${provider.gpu.count}`} />
            <StatRow label="VRAM" value={`${provider.gpu.vramGb} GB`} />
            <StatRow label="Architecture" value={provider.gpu.architecture} />
            <StatRow label="CUDA Cores" value={provider.gpu.cudaCores.toLocaleString()} />
          </div>
        </div>

        {/* System specs */}
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">System</p>
          <div className="bg-gray-50/70 rounded-2xl p-4 border border-gray-200/60 space-y-1.5">
            <div className="flex items-center gap-2 mb-2">
              <MemoryStick className="w-4 h-4 text-teal-600" />
              <span className="text-sm font-bold text-brand-900">Memory &amp; Storage</span>
            </div>
            <StatRow label="System RAM" value={`${provider.ramGb} GB`} />
            <StatRow label="Storage" value={`${provider.storageGb} GB`} />
            <StatRow label="Uptime" value={`${provider.uptimePercent}%`} />
            <div className="flex items-center gap-2 pt-1.5 border-t border-gray-100 mt-1">
              <MapPin className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-sm text-gray-600">{provider.location}</span>
            </div>
          </div>
        </div>

        {/* Chain stats */}
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">On-Chain</p>
          <div className="bg-gray-50/70 rounded-2xl p-4 border border-gray-200/60 space-y-1.5">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-bold text-brand-900">Stake &amp; Reputation</span>
            </div>
            <StatRow label="Total Stake" value={`${provider.stakeEth} ETH`} />
            <StatRow label="Locked Stake" value={`${provider.lockedStakeEth} ETH`} />
            <StatRow label="Free Stake" value={`${(provider.stakeEth - provider.lockedStakeEth).toFixed(2)} ETH`} />
            <StatRow label="Reputation" value={
              <span className={provider.reputation >= 90 ? 'text-emerald-600' : provider.reputation >= 70 ? 'text-amber-600' : 'text-red-600'}>
                {provider.reputation}/100
              </span>
            } />
            <StatRow label="Slash Count" value={
              <span className={provider.slashCount > 0 ? 'text-red-600' : 'text-gray-500'}>{provider.slashCount}</span>
            } />
            <StatRow label="Verified Jobs" value={provider.verifiedJobsCount.toLocaleString()} />
          </div>
        </div>

        {/* Track record */}
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Track Record</p>
          <div className="bg-gray-50/70 rounded-2xl p-4 border border-gray-200/60 space-y-1.5">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-bold text-brand-900">Performance</span>
            </div>
            <StatRow label="Completed Jobs" value={provider.completedJobs.toLocaleString()} />
            <StatRow
              label="Rating"
              value={
                <span className="flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  {provider.rating.toFixed(1)}
                  <span className="text-gray-400 font-normal">({provider.reviewCount})</span>
                </span>
              }
            />
            <StatRow label="Member Since" value={formatDate(provider.joinedDate)} />
          </div>
        </div>

        {/* Frameworks + Tags */}
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Frameworks</p>
          <div className="bg-gray-50/70 rounded-2xl p-4 border border-gray-200/60">
            <div className="flex flex-wrap gap-1.5">
              {provider.frameworks.map((fw) => (
                <SpecBadge key={fw}>{fw}</SpecBadge>
              ))}
            </div>
          </div>

          {provider.tags.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {provider.tags.map((tag) => (
                  <span key={tag} className="px-2.5 py-0.5 rounded-pill text-xs font-semibold bg-indigo-50 text-indigo-700">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <p className="mt-5 text-xs text-gray-400 italic border-t border-gray-100 pt-4">
        Provider data is illustrative. Actual availability, performance, and pricing are determined at job submission time.
      </p>
    </Modal>
  );
}
