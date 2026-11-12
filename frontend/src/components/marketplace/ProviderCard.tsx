import React from 'react';
import { Star, MapPin, Cpu, MemoryStick, CheckCircle2, HardDrive } from 'lucide-react';
import type { Provider } from '../../types';
import { StatusBadge } from '../ui/StatusBadge';
import { SpecBadge } from '../ui/SpecBadge';
import { Button } from '../ui/Button';
import { formatUsd } from '../../lib/utils';
import { cn } from '../../lib/utils';

interface ProviderCardProps {
  provider: Provider;
  onViewDetails: (provider: Provider) => void;
  onSelectProvider: (provider: Provider) => void;
  className?: string;
}

export function ProviderCard({ provider, onViewDetails, onSelectProvider, className }: ProviderCardProps) {
  const isAvailable = provider.availability === 'available';

  return (
    <div className={cn(
      'bg-white border border-gray-200/80 rounded-2xl shadow-card',
      'hover:shadow-card-md hover:border-gray-300/80 transition-all duration-300 flex flex-col group',
      className,
    )}>
      {/* Header */}
      <div className="p-5 pb-4 border-b border-gray-100">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-brand-900 truncate">{provider.name}</h3>
              {provider.verifiedProvider && (
                <CheckCircle2
                  className="w-3.5 h-3.5 text-accent-500 flex-shrink-0"
                  aria-label="Verified provider"
                />
              )}
            </div>
            <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
              <MapPin className="w-3 h-3" />
              <span>{provider.location}</span>
            </div>
          </div>
          <StatusBadge status={provider.availability} showDot />
        </div>

        {/* Rating */}
        <div className="flex items-center gap-1.5 mt-2.5">
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star
                key={s}
                className={cn(
                  'w-3 h-3',
                  s <= Math.round(provider.rating)
                    ? 'fill-amber-400 text-amber-400'
                    : 'text-gray-200 fill-gray-200',
                )}
              />
            ))}
          </div>
          <span className="text-xs font-semibold text-brand-900">{provider.rating.toFixed(1)}</span>
          <span className="text-xs text-gray-400">({provider.reviewCount})</span>
        </div>
      </div>

      {/* Specs */}
      <div className="p-5 pb-4 flex-1 space-y-3">
        {/* GPU */}
        <div className="flex items-start gap-2">
          <Cpu className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-brand-900 leading-tight">{provider.gpu.model}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              ×{provider.gpu.count} · {provider.gpu.architecture} · {provider.gpu.cudaCores.toLocaleString()} CUDA
            </p>
          </div>
        </div>

        {/* Memory */}
        <div className="flex items-center gap-2">
          <MemoryStick className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <span className="text-xs text-gray-600">
            <span className="font-semibold text-brand-800">{provider.gpu.vramGb} GB</span> VRAM ·{' '}
            <span className="font-semibold text-brand-800">{provider.ramGb} GB</span> RAM
          </span>
        </div>

        {/* Storage */}
        <div className="flex items-center gap-2">
          <HardDrive className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <span className="text-xs text-gray-600">
            <span className="font-semibold text-brand-800">{provider.storageGb} GB</span> storage
          </span>
        </div>

        {/* Chain stats */}
        <div className="flex items-center gap-3 pt-1 text-xs text-gray-500 flex-wrap">
          <span title="Staked ETH">⛓ {provider.stakeEth} ETH</span>
          <span className={cn('font-bold', provider.reputation >= 90 ? 'text-emerald-600' : provider.reputation >= 70 ? 'text-amber-600' : 'text-red-600')}
            title="Reputation score">Rep {provider.reputation}</span>
          {provider.slashCount > 0 && (
            <span className="text-red-500 font-semibold" title="Slash count">⚠ {provider.slashCount} slash</span>
          )}
        </div>

        {/* Frameworks */}
        <div className="flex flex-wrap gap-1 pt-1">
          {provider.frameworks.slice(0, 4).map((fw) => (
            <SpecBadge key={fw}>{fw}</SpecBadge>
          ))}
          {provider.frameworks.length > 4 && (
            <SpecBadge>+{provider.frameworks.length - 4}</SpecBadge>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/40 rounded-b-2xl flex items-center justify-between gap-3">
        <div>
          <p className="text-lg font-bold text-brand-950">
            {formatUsd(provider.pricePerHour)}
            <span className="text-xs font-normal text-gray-400 ml-1">/ GPU-hr</span>
          </p>
          <p className="text-xs text-gray-400">{provider.completedJobs.toLocaleString()} jobs · {provider.uptimePercent}% uptime</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => onViewDetails(provider)}>
            Details
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={!isAvailable}
            onClick={() => onSelectProvider(provider)}
          >
            Select
          </Button>
        </div>
      </div>
    </div>
  );
}
