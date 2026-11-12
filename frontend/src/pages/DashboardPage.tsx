import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3, CheckCircle2, Clock, DollarSign,
  TrendingUp, ArrowRight, Briefcase,
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { MetricCard } from '../components/ui/MetricCard';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { DemoBadge } from '../components/ui/DemoBadge';
import { api } from '../services/api';
import { WORKLOAD_LABELS } from '../data/constants';
import { formatUsd, formatDate } from '../lib/utils';
import type { Job, DashboardMetrics } from '../types';
import { cn } from '../lib/utils';

// ─── Spending chart (pure CSS bar chart) ──────────────────────────────────

const SPEND_DATA = [
  { label: 'Oct 1', value: 112.00 },
  { label: 'Oct 5', value: 17.80 },
  { label: 'Oct 10', value: 0 },
  { label: 'Oct 11', value: 0 },
];
const MAX_SPEND = Math.max(...SPEND_DATA.map((d) => d.value), 1);

function SpendChart() {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Job Spend</h3>
          <p className="text-xs text-gray-400 italic">Illustrative data — not real transactions.</p>
        </div>
        <span className="text-xs font-medium text-gray-500">October 2026</span>
      </div>
      <div className="flex items-end gap-3 h-32">
        {SPEND_DATA.map((d) => (
          <div key={d.label} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-xs font-medium text-brand-800">
              {d.value > 0 ? formatUsd(d.value, 0) : ''}
            </span>
            <div
              className="w-full rounded-t-md bg-accent-200 hover:bg-accent-400 transition-colors cursor-default"
              style={{ height: `${Math.max((d.value / MAX_SPEND) * 100, d.value > 0 ? 4 : 1)}%` }}
              title={`${d.label}: ${formatUsd(d.value)}`}
            />
            <span className="text-xs text-gray-400">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Jobs table ────────────────────────────────────────────────────────────

function JobsTable({ jobs }: { jobs: Job[] }) {
  return (
    <div className="bg-white/70 border border-gray-200/70 rounded-2xl shadow-card overflow-hidden backdrop-blur-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-brand-900">Recent Jobs</h3>
          <DemoBadge />
        </div>
        <Link to="/jobs" className="text-xs font-medium text-accent-600 hover:text-brand-800 flex items-center gap-1">
          View all <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/70">
              <th className="table-th">Job</th>
              <th className="table-th">Type</th>
              <th className="table-th">Budget</th>
              <th className="table-th">Status</th>
              <th className="table-th">Date</th>
              <th className="table-th" />
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="table-tr">
                <td className="table-td">
                  <div className="max-w-[200px]">
                    <p className="text-sm font-bold text-brand-900 truncate">{job.title}</p>
                    <p className="text-xs text-gray-400">{job.id}</p>
                  </div>
                </td>
                <td className="table-td text-xs text-gray-600">{WORKLOAD_LABELS[job.config.workloadType]}</td>
                <td className="table-td font-semibold text-brand-900">
                  {job.actualCostUsd ? formatUsd(job.actualCostUsd)
                    : job.estimatedCostUsd ? <span className="text-gray-400">~{formatUsd(job.estimatedCostUsd)}</span>
                      : '—'}
                </td>
                <td className="table-td"><StatusBadge status={job.status} showDot /></td>
                <td className="table-td text-xs text-gray-500">{formatDate(job.createdAt)}</td>
                <td className="table-td">
                  <Link to={`/jobs/${job.id}`} className="text-xs font-semibold text-accent-600 hover:text-brand-800">
                    Details
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Workload breakdown ────────────────────────────────────────────────────

function WorkloadBreakdown({ jobs }: { jobs: Job[] }) {
  const counts: Record<string, number> = {};
  jobs.forEach((j) => {
    counts[j.config.workloadType] = (counts[j.config.workloadType] ?? 0) + 1;
  });

  const items = Object.entries(counts).map(([type, count]) => ({
    label: WORKLOAD_LABELS[type],
    count,
    pct: Math.round((count / Math.max(jobs.length, 1)) * 100),
  }));

  const colors = ['bg-accent-500', 'bg-teal-500', 'bg-purple-500', 'bg-amber-500'];

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-card p-5">
      <h3 className="text-base font-semibold text-gray-900 mb-4">Workload Mix</h3>
      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={item.label}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-gray-600">{item.label}</span>
              <span className="text-xs font-medium text-gray-700">{item.count} job{item.count !== 1 ? 's' : ''}</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', colors[i % colors.length])}
                style={{ width: `${item.pct}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);

  useEffect(() => {
    api.listJobs().then(setJobs);
    api.getDashboardMetrics().then(setMetrics);
  }, []);

  const m = metrics ?? { totalJobs: 0, activeJobs: 0, completedJobs: 0, totalSpendUsd: 0, successRate: 0 };

  return (
    <div>
      <PageHeader
        title="Requester Dashboard"
        subtitle="An overview of your compute jobs, spending, and outcomes."
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Dashboard' }]}
        actions={
          <Link to="/submit-job">
            <Button variant="primary" size="sm">
              New Job
            </Button>
          </Link>
        }
      />

      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-5 inline-block italic">
        Illustrative dashboard data — not real job records or payments.
      </p>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          title="Total Jobs"
          value={m.totalJobs}
          icon={<Briefcase className="w-5 h-5" />}
          accent="blue"
          subtitle="All time"
        />
        <MetricCard
          title="Active Jobs"
          value={m.activeJobs}
          icon={<Clock className="w-5 h-5" />}
          accent="amber"
          subtitle="In queue or running"
        />
        <MetricCard
          title="Completed"
          value={m.completedJobs}
          icon={<CheckCircle2 className="w-5 h-5" />}
          accent="green"
          trend={{ value: '100%', direction: 'up', label: 'success rate' }}
        />
        <MetricCard
          title="Total Spend"
          value={formatUsd(m.totalSpendUsd)}
          icon={<DollarSign className="w-5 h-5" />}
          accent="purple"
          subtitle="Illustrative total"
        />
      </div>

      {/* Charts row */}
      <div className="grid lg:grid-cols-3 gap-5 mb-6">
        <div className="lg:col-span-2">
          <SpendChart />
        </div>
        <WorkloadBreakdown jobs={jobs} />
      </div>

      {/* Jobs table */}
      <JobsTable jobs={jobs} />
    </div>
  );
}


