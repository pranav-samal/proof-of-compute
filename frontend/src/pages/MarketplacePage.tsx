import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, SlidersHorizontal, X, LayoutGrid, List } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { DemoBadge } from '../components/ui/DemoBadge';
import { ProviderCard } from '../components/marketplace/ProviderCard';
import { ProviderDetailModal } from '../components/marketplace/ProviderDetailModal';
import { GPU_MODELS } from '../data/providers';
import { api } from '../services/api';
import type { Provider, ProviderAvailability, MarketplaceSortKey } from '../types';
import { cn } from '../lib/utils';

interface FilterState {
  search: string;
  gpuModel: string;
  minVramGb: number;
  maxPricePerHour: number;
  availability: ProviderAvailability | 'all';
  verifiedOnly: boolean;
  minStakeEth: number;
  minReputation: number;
}

const DEFAULT_FILTERS: FilterState = {
  search: '',
  gpuModel: 'All GPUs',
  minVramGb: 0,
  maxPricePerHour: 10,
  availability: 'all',
  verifiedOnly: false,
  minStakeEth: 0,
  minReputation: 0,
};

const CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`;

// ─── Filter sidebar ────────────────────────────────────────────────────────

function FilterPanel({ filters, onChange, onReset, activeCount }: {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  onReset: () => void;
  activeCount: number;
}) {
  const selStyle = { backgroundImage: CHEVRON, backgroundPosition: 'right 12px center', backgroundRepeat: 'no-repeat', paddingRight: '2rem' };

  return (
    <aside className="bg-white/70 border border-gray-200/70 rounded-2xl shadow-card backdrop-blur-sm p-5 space-y-5 h-fit sticky top-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-brand-900">Filters</h3>
        {activeCount > 0 && (
          <button onClick={onReset} className="flex items-center gap-1 text-xs text-accent-600 hover:text-accent-700 font-semibold">
            <X className="w-3 h-3" /> Reset ({activeCount})
          </button>
        )}
      </div>

      {/* GPU model */}
      <div className="space-y-1.5">
        <label className="text-xs font-black text-gray-400 uppercase tracking-widest">GPU Model</label>
        <select className="input text-sm" value={filters.gpuModel}
          onChange={(e) => onChange({ ...filters, gpuModel: e.target.value })} style={selStyle}>
          {GPU_MODELS.map((g) => <option key={g}>{g}</option>)}
        </select>
      </div>

      {/* Min VRAM */}
      <div className="space-y-1.5">
        <label className="text-xs font-black text-gray-400 uppercase tracking-widest">
          Min VRAM: <span className="text-brand-900 normal-case">{filters.minVramGb} GB</span>
        </label>
        <input type="range" min={0} max={80} step={8} value={filters.minVramGb}
          onChange={(e) => onChange({ ...filters, minVramGb: Number(e.target.value) })}
          className="w-full accent-accent-500 cursor-pointer" />
        <div className="flex justify-between text-xs text-gray-400"><span>0 GB</span><span>80 GB</span></div>
      </div>

      {/* Max price */}
      <div className="space-y-1.5">
        <label className="text-xs font-black text-gray-400 uppercase tracking-widest">
          Max Price: <span className="text-brand-900 normal-case">${filters.maxPricePerHour}/hr</span>
        </label>
        <input type="range" min={0.5} max={10} step={0.5} value={filters.maxPricePerHour}
          onChange={(e) => onChange({ ...filters, maxPricePerHour: Number(e.target.value) })}
          className="w-full accent-accent-500 cursor-pointer" />
        <div className="flex justify-between text-xs text-gray-400"><span>$0.50</span><span>$10</span></div>
      </div>

      {/* Min stake */}
      <div className="space-y-1.5">
        <label className="text-xs font-black text-gray-400 uppercase tracking-widest">
          Min Stake: <span className="text-brand-900 normal-case">{filters.minStakeEth} ETH</span>
        </label>
        <input type="range" min={0} max={15} step={0.5} value={filters.minStakeEth}
          onChange={(e) => onChange({ ...filters, minStakeEth: Number(e.target.value) })}
          className="w-full accent-accent-500 cursor-pointer" />
        <div className="flex justify-between text-xs text-gray-400"><span>0</span><span>15 ETH</span></div>
      </div>

      {/* Min reputation */}
      <div className="space-y-1.5">
        <label className="text-xs font-black text-gray-400 uppercase tracking-widest">
          Min Reputation: <span className="text-brand-900 normal-case">{filters.minReputation}</span>
        </label>
        <input type="range" min={0} max={100} step={5} value={filters.minReputation}
          onChange={(e) => onChange({ ...filters, minReputation: Number(e.target.value) })}
          className="w-full accent-accent-500 cursor-pointer" />
        <div className="flex justify-between text-xs text-gray-400"><span>0</span><span>100</span></div>
      </div>

      {/* Availability */}
      <div className="space-y-1.5">
        <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Availability</label>
        <div className="flex flex-col gap-1.5">
          {(['all', 'available', 'busy'] as const).map((v) => (
            <label key={v} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="availability" value={v}
                checked={filters.availability === v}
                onChange={() => onChange({ ...filters, availability: v })}
                className="accent-accent-500" />
              <span className="text-sm text-brand-800 capitalize">{v === 'all' ? 'All' : v}</span>
            </label>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={filters.verifiedOnly}
          onChange={(e) => onChange({ ...filters, verifiedOnly: e.target.checked })}
          className="accent-accent-500 w-4 h-4 rounded" />
        <span className="text-sm text-brand-800">Verified providers only</span>
      </label>
    </aside>
  );
}

// ─── Sorting ───────────────────────────────────────────────────────────────

const SORT_OPTIONS: { value: MarketplaceSortKey; label: string }[] = [
  { value: 'rating-desc', label: 'Top Rated' },
  { value: 'reputation-desc', label: 'Highest Reputation' },
  { value: 'stake-desc', label: 'Most Staked' },
  { value: 'price-asc', label: 'Price: Low → High' },
  { value: 'price-desc', label: 'Price: High → Low' },
  { value: 'performance-desc', label: 'Most VRAM' },
  { value: 'jobs-desc', label: 'Most Jobs' },
];

function applyFilters(providers: Provider[], f: FilterState, sort: MarketplaceSortKey): Provider[] {
  let r = providers.filter((p) => {
    if (f.search) {
      const q = f.search.toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !p.gpu.model.toLowerCase().includes(q) &&
        !p.location.toLowerCase().includes(q) && !p.tags.some((t) => t.toLowerCase().includes(q))) return false;
    }
    if (f.gpuModel !== 'All GPUs' && p.gpu.model !== f.gpuModel) return false;
    if (p.gpu.vramGb < f.minVramGb) return false;
    if (p.pricePerHour > f.maxPricePerHour) return false;
    if (f.availability !== 'all' && p.availability !== f.availability) return false;
    if (f.verifiedOnly && !p.verifiedProvider) return false;
    if (p.stakeEth < f.minStakeEth) return false;
    if (p.reputation < f.minReputation) return false;
    return true;
  });
  r = [...r].sort((a, b) => {
    switch (sort) {
      case 'price-asc': return a.pricePerHour - b.pricePerHour;
      case 'price-desc': return b.pricePerHour - a.pricePerHour;
      case 'rating-desc': return b.rating - a.rating;
      case 'performance-desc': return b.gpu.vramGb - a.gpu.vramGb;
      case 'jobs-desc': return b.completedJobs - a.completedJobs;
      case 'reputation-desc': return b.reputation - a.reputation;
      case 'stake-desc': return b.stakeEth - a.stakeEth;
      default: return 0;
    }
  });
  return r;
}

function countActive(f: FilterState) {
  let n = 0;
  if (f.gpuModel !== 'All GPUs') n++;
  if (f.minVramGb > 0) n++;
  if (f.maxPricePerHour < 10) n++;
  if (f.availability !== 'all') n++;
  if (f.verifiedOnly) n++;
  if (f.minStakeEth > 0) n++;
  if (f.minReputation > 0) n++;
  return n;
}

// ─── Page ──────────────────────────────────────────────────────────────────

export function MarketplacePage() {
  const navigate = useNavigate();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<MarketplaceSortKey>('reputation-desc');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showFilters, setShowFilters] = useState(false);
  const [detailProvider, setDetail] = useState<Provider | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.listProviders()
      .then((data) => { setProviders(data); setLoading(false); })
      .catch((e) => {
        console.error('[Marketplace] listProviders error:', e);
        setFetchError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
  }, []);

  const results = useMemo(() => applyFilters(providers, filters, sort), [providers, filters, sort]);
  const activeCount = countActive(filters);

  function handleSelect(provider: Provider) { navigate('/submit-job', { state: { providerId: provider.id } }); }
  function handleDetails(provider: Provider) { setDetail(provider); setDetailOpen(true); }

  const sortStyle = { backgroundImage: CHEVRON, backgroundPosition: 'right 8px center', backgroundRepeat: 'no-repeat', paddingRight: '1.75rem' };

  return (
    <div>
      <PageHeader
        title="Compute Marketplace"
        subtitle="Browse GPU providers. Filter by stake, reputation, hardware and price."
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Marketplace' }]}
      />

      {/* Search + sort bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input type="text" placeholder="Search providers, GPU models, locations…"
            value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            className="input pl-10 text-sm" />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowFilters((v) => !v)}
            className={cn('lg:hidden inline-flex items-center gap-1.5 px-3.5 py-2 rounded-pill border text-sm font-semibold transition-all',
              showFilters || activeCount > 0 ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-gray-200 text-brand-800 hover:bg-gray-50')}>
            <SlidersHorizontal className="w-4 h-4" />
            Filters {activeCount > 0 && <span className="bg-accent-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">{activeCount}</span>}
          </button>
          <select value={sort} onChange={(e) => setSort(e.target.value as MarketplaceSortKey)}
            className="input text-sm cursor-pointer" style={sortStyle}>
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <div className="hidden sm:flex border border-gray-200/80 rounded-xl overflow-hidden">
            {(['grid', 'list'] as const).map((m, i) => (
              <button key={m} onClick={() => setViewMode(m)}
                className={cn('px-2.5 py-2 transition-colors', i > 0 && 'border-l border-gray-200',
                  viewMode === m ? 'bg-brand-900 text-white' : 'bg-white text-gray-400 hover:text-brand-700')}>
                {m === 'grid' ? <LayoutGrid className="w-4 h-4" /> : <List className="w-4 h-4" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-5">
        <div className="hidden lg:block w-56 flex-shrink-0">
          <FilterPanel filters={filters} onChange={setFilters} onReset={() => setFilters(DEFAULT_FILTERS)} activeCount={activeCount} />
        </div>
        {showFilters && (
          <div className="lg:hidden w-full mb-4">
            <FilterPanel filters={filters} onChange={setFilters} onReset={() => setFilters(DEFAULT_FILTERS)} activeCount={activeCount} />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">
              <span className="font-bold text-brand-900">{results.length}</span> {results.length === 1 ? 'provider' : 'providers'} found
            </p>
            {activeCount > 0 && (
              <button onClick={() => setFilters(DEFAULT_FILTERS)} className="text-xs text-accent-600 font-semibold flex items-center gap-1">
                <X className="w-3 h-3" /> Clear filters
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex flex-col items-center gap-3 text-gray-400">
                <div className="w-8 h-8 border-2 border-brand-300 border-t-brand-700 rounded-full animate-spin" />
                <p className="text-sm">Loading providers…</p>
              </div>
            </div>
          ) : fetchError ? (
            <div className="p-5 rounded-2xl bg-red-50 border border-red-200 text-sm text-red-700">
              <p className="font-semibold mb-1">Failed to load providers</p>
              <p className="text-xs font-mono">{fetchError}</p>
              <p className="text-xs mt-2 text-red-500">Make sure the backend is running at <code>http://localhost:3001</code></p>
            </div>
          ) : results.length === 0 ? (
            <EmptyState title="No providers match your filters" description="Relax the stake, reputation, VRAM, or price filters."
              action={<Button variant="secondary" size="sm" onClick={() => setFilters(DEFAULT_FILTERS)}>Reset filters</Button>} />
          ) : viewMode === 'grid' ? (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {results.map((p) => <ProviderCard key={p.id} provider={p} onViewDetails={handleDetails} onSelectProvider={handleSelect} />)}
            </div>
          ) : (
            <div className="bg-white/70 border border-gray-200/70 rounded-2xl shadow-card overflow-hidden backdrop-blur-sm">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/70">
                    {['Provider', 'GPU', 'VRAM', 'Price/hr', 'Stake', 'Reputation', 'Slashes', 'Status', ''].map((h) => (
                      <th key={h} className="table-th">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map((p) => (
                    <tr key={p.id} className="table-tr">
                      <td className="table-td"><p className="font-bold text-brand-900 text-sm">{p.name}</p><p className="text-xs text-gray-400">{p.location}</p></td>
                      <td className="table-td text-xs">{p.gpu.model}</td>
                      <td className="table-td font-semibold">{p.gpu.vramGb} GB</td>
                      <td className="table-td font-bold text-brand-950">${p.pricePerHour.toFixed(2)}</td>
                      <td className="table-td text-xs">{p.stakeEth} ETH</td>
                      <td className="table-td">
                        <span className={cn('font-bold text-sm', p.reputation >= 90 ? 'text-emerald-600' : p.reputation >= 70 ? 'text-amber-600' : 'text-red-600')}>
                          {p.reputation}
                        </span>
                      </td>
                      <td className="table-td text-xs">{p.slashCount}</td>
                      <td className="table-td">
                        <span className={cn('px-2.5 py-0.5 rounded-pill text-xs font-bold',
                          p.availability === 'available' ? 'bg-emerald-50 text-emerald-700' :
                            p.availability === 'busy' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500')}>
                          {p.availability}
                        </span>
                      </td>
                      <td className="table-td">
                        <div className="flex gap-2">
                          <button onClick={() => handleDetails(p)} className="text-xs font-semibold text-brand-700 hover:text-brand-900">Details</button>
                          <button disabled={p.availability !== 'available'} onClick={() => handleSelect(p)}
                            className="text-xs font-bold text-white bg-accent-500 hover:bg-accent-600 disabled:opacity-40 disabled:cursor-not-allowed px-2.5 py-1 rounded-pill transition-colors">
                            Select
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <ProviderDetailModal provider={detailProvider} open={detailOpen} onClose={() => setDetailOpen(false)} onSelect={handleSelect} />
    </div>
  );
}
