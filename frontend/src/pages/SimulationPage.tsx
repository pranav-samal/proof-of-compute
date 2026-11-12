import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import { BarChart2, Info } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { DemoBadge } from '../components/ui/DemoBadge';
import { Card, CardHeader } from '../components/ui/Card';
import { simulationDataPoints } from '../lib/risk';

export function SimulationPage() {
  const data = useMemo(() => simulationDataPoints(), []);

  // Format for recharts
  const chartData = data.map((d) => ({
    cheat: `${Math.round(d.cheatingProb * 100)}%`,
    'Always Re-Execute': parseFloat(d.alwaysReExecuteCost.toFixed(3)),
    'Fixed 10% Sampling': parseFloat(d.fixedSamplingCost.toFixed(3)),
    'Risk-Adaptive': parseFloat(d.riskAdaptiveCost.toFixed(3)),
    'Detection Rate': parseFloat((d.detectionRate * 100).toFixed(1)),
  }));

  return (
    <div>
      <PageHeader
        title="Simulation"
        subtitle="Verification cost vs cheating detection rate across three policies."
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Simulation' }]}
        actions={<DemoBadge label="Computed locally — not real network data" />}
      />

      <div className="mb-5 flex items-start gap-2 p-4 rounded-2xl bg-indigo-50 border border-indigo-200">
        <Info className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-indigo-800">
          <p className="font-bold mb-1">How to read this chart</p>
          <p>The x-axis is the simulated probability that a provider is cheating (0 = never, 100% = always).
            The y-axis is the normalized verification cost (1.0 = one job execution cost).
            Three policies are compared:
          </p>
          <ul className="list-disc list-inside mt-1 space-y-0.5 text-sm">
            <li><strong>Always Re-Execute</strong>: every job is fully re-run. Cost = 2×. Detection ≈ 100%.</li>
            <li><strong>Fixed 10% Sampling</strong>: 10% of tasks sampled randomly. Cost = 1.1×. Detection scales with cheating rate.</li>
            <li><strong>Risk-Adaptive</strong>: sampling rate and tier are determined by the computed risk score. Cost varies; detection is proportional.</li>
          </ul>
        </div>
      </div>

      {/* Cost chart */}
      <Card padding="lg" className="mb-5">
        <CardHeader title="Verification Cost vs Cheating Probability"
          subtitle="Normalized cost (1.0 = one job execution cost)" />
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="cheat" label={{ value: 'Cheating Probability', position: 'insideBottom', offset: -5, fontSize: 12 }}
              tick={{ fontSize: 11 }} />
            <YAxis label={{ value: 'Norm. Cost', angle: -90, position: 'insideLeft', fontSize: 12 }}
              tick={{ fontSize: 11 }} domain={[0.9, 2.2]} />
            <Tooltip formatter={(v: unknown) => typeof v === 'number' ? v.toFixed(3) : String(v)} />
            <Legend verticalAlign="top" />
            <Line type="monotone" dataKey="Always Re-Execute" stroke="#ef4444" strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="Fixed 10% Sampling" stroke="#3b82f6" strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="Risk-Adaptive" stroke="#f97316" strokeWidth={2.5} dot={false} strokeDasharray="6 2" />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {/* Detection chart */}
      <Card padding="lg" className="mb-5">
        <CardHeader title="Detection Rate (Risk-Adaptive Policy)"
          subtitle="Fraction of cheating providers detected under risk-adaptive sampling" />
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="cheat" label={{ value: 'Cheating Probability', position: 'insideBottom', offset: -5, fontSize: 12 }}
              tick={{ fontSize: 11 }} />
            <YAxis label={{ value: 'Detection (%)', angle: -90, position: 'insideLeft', fontSize: 12 }}
              tick={{ fontSize: 11 }} domain={[0, 100]} />
            <Tooltip formatter={(v: unknown) => typeof v === 'number' ? `${v.toFixed(1)}%` : String(v)} />
            <Bar dataKey="Detection Rate" fill="#f97316" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Key insight */}
      <div className="grid sm:grid-cols-3 gap-4">
        {[
          {
            title: 'Always Re-Execute',
            cost: '2.0×',
            detection: '~100%',
            note: 'Maximum assurance, maximum cost. Suitable for high-value or regulated jobs.',
            color: 'border-red-200 bg-red-50',
            textColor: 'text-red-700',
          },
          {
            title: 'Fixed 10% Sampling',
            cost: '1.1×',
            detection: 'Scales with p(cheat)',
            note: 'Low overhead. Detection weakens when cheating is rare (provider can get lucky).',
            color: 'border-blue-200 bg-blue-50',
            textColor: 'text-blue-700',
          },
          {
            title: 'Risk-Adaptive',
            cost: 'Varies (1.0–2.0×)',
            detection: 'Risk-calibrated',
            note: 'Cost tracks actual risk. High-risk jobs pay for stronger verification; low-risk jobs save cost.',
            color: 'border-accent-200 bg-accent-50',
            textColor: 'text-accent-700',
          },
        ].map((p) => (
          <div key={p.title} className={`border rounded-2xl p-4 ${p.color}`}>
            <p className={`text-sm font-bold mb-2 ${p.textColor}`}>{p.title}</p>
            <div className="space-y-1 mb-2">
              <p className="text-xs text-gray-600">Cost: <strong>{p.cost}</strong></p>
              <p className="text-xs text-gray-600">Detection: <strong>{p.detection}</strong></p>
            </div>
            <p className="text-xs text-gray-500">{p.note}</p>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-gray-400 italic text-center">
        All data computed locally by <code>src/lib/risk.ts → simulationDataPoints()</code>. Not real network measurements.
      </p>
    </div>
  );
}
