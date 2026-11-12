/**
 * risk.ts — Pure functions for verification policy computation.
 * No side effects. No imports from data/ or services/.
 */
import type {
  ReproducibilityClass,
  VerificationPolicy,
  VerificationTier,
  WorkloadType,
} from '../types';

// ─── Score factors ─────────────────────────────────────────────────────────

const WORKLOAD_RISK: Record<WorkloadType, number> = {
  training:         0.35,
  inference:        0.15,
  'image-processing': 0.20,
  'general-compute':  0.25,
};

const REPRO_RISK: Record<ReproducibilityClass, number> = {
  D: 0.05,  // deterministic — cheapest to verify
  T: 0.25,  // tolerance-bound
  N: 0.50,  // non-deterministic — hardest to verify
};

const ASSURANCE_RISK: Record<string, number> = {
  low:     0.00,
  medium:  0.10,
  high:    0.20,
  maximum: 0.35,
};

/** Compute a risk score in [0, 1] from workload + reproducibility + assurance. */
export function computeRiskScore(
  workloadType: WorkloadType,
  reproClass: ReproducibilityClass,
  assuranceLevel: 'low' | 'medium' | 'high' | 'maximum',
  budgetUsd: number,
): number {
  const base =
    WORKLOAD_RISK[workloadType] +
    REPRO_RISK[reproClass] +
    ASSURANCE_RISK[assuranceLevel];
  // Higher budgets add slight risk (more valuable to cheat)
  const budgetFactor = Math.min(budgetUsd / 2000, 0.10);
  return Math.min(base + budgetFactor, 1.0);
}

/** Map risk score → verification tier. */
export function riskToTier(riskScore: number): VerificationTier {
  if (riskScore < 0.20) return 0;
  if (riskScore < 0.45) return 1;
  if (riskScore < 0.70) return 2;
  return 3;
}

/** Sampling percentage used in Tier 1 sampled re-execution. */
export function tierToSamplingPct(tier: VerificationTier): number {
  switch (tier) {
    case 0: return 0;
    case 1: return 10;
    case 2: return 50;  // 50% — multiple providers cross-check
    case 3: return 100;
  }
}

/** Required provider collateral in ETH (illustrative formula). */
export function computeCollateral(budgetUsd: number, tier: VerificationTier): number {
  const multipliers: Record<VerificationTier, number> = { 0: 0.5, 1: 1.0, 2: 1.5, 3: 2.0 };
  // Rough ETH equivalent: budget / 2000 (illustrative ETH price)
  return parseFloat(((budgetUsd / 2000) * multipliers[tier]).toFixed(4));
}

/** Challenge window in seconds for Tier 3. */
export function computeChallengeWindow(tier: VerificationTier): number {
  switch (tier) {
    case 0: return 0;
    case 1: return 3600;    // 1 hour
    case 2: return 14400;   // 4 hours
    case 3: return 86400;   // 24 hours
  }
}

/** Derive assurance level from tier. */
export function tierToAssurance(tier: VerificationTier): 'low' | 'medium' | 'high' | 'maximum' {
  switch (tier) {
    case 0: return 'low';
    case 1: return 'medium';
    case 2: return 'high';
    case 3: return 'maximum';
  }
}

/** Full policy computation — the single entry point pages should use. */
export function computePolicy(
  workloadType: WorkloadType,
  reproClass: ReproducibilityClass,
  assuranceLevel: 'low' | 'medium' | 'high' | 'maximum',
  budgetUsd: number,
): VerificationPolicy {
  const riskScore    = computeRiskScore(workloadType, reproClass, assuranceLevel, budgetUsd);
  const tier         = riskToTier(riskScore);
  const samplingPct  = tierToSamplingPct(tier);
  const collateral   = computeCollateral(budgetUsd, tier);
  const challengeWin = computeChallengeWindow(tier);

  return {
    riskScore,
    tier,
    samplingPct,
    requiredCollateralEth: collateral,
    challengeWindowSecs: challengeWin,
    reproducibilityClass: reproClass,
    assuranceLevel: tierToAssurance(tier),
  };
}

/** Human-readable tier label. */
export const TIER_LABELS: Record<VerificationTier, string> = {
  0: 'Tier 0 — Hash & Rule Check',
  1: 'Tier 1 — Sampled Re-execution',
  2: 'Tier 2 — Redundant Multi-Provider',
  3: 'Tier 3 — Full Re-execution + Challenge',
};

/** Human-readable repro class label. */
export const REPRO_LABELS: Record<ReproducibilityClass, string> = {
  D: 'Deterministic (D)',
  T: 'Tolerance-Bound (T)',
  N: 'Non-Deterministic (N)',
};

/** Simulation: cost vs detection for different policies at a given cheatingProb. */
export function simulationDataPoints(): import('../types').SimDataPoint[] {
  const points = [];
  for (let i = 0; i <= 20; i++) {
    const cheatingProb = i / 20;
    // Always re-execute: cost = 2× job cost (constant), detection = ~1
    const alwaysReExecuteCost = 2.0;
    // Fixed 10% sampling: cost = 1.1× job cost, detection ≈ sampling fraction × cheating prob
    const fixedSamplingCost = 1.10;
    // Risk-adaptive: cost scales with risk (cheating prob drives tier selection)
    const riskScore = cheatingProb * 0.9 + 0.05;
    const tier = riskToTier(riskScore);
    const samplingFraction = tierToSamplingPct(tier) / 100;
    const riskAdaptiveCost = 1 + samplingFraction;
    // Detection rates
    const detectionRate = samplingFraction > 0 ? 1 - Math.pow(1 - cheatingProb, Math.ceil(samplingFraction * 10)) : 0;

    points.push({
      cheatingProb,
      alwaysReExecuteCost,
      fixedSamplingCost,
      riskAdaptiveCost,
      detectionRate,
    });
  }
  return points;
}
