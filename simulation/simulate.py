#!/usr/bin/env python3
"""
Proof-of-Compute simulation: compute verification cost vs cheating detection rate.

For each cheating probability step from 0.0 to 1.0:
- Simulate nJobs jobs under three policies: always-reexecute, fixed-10pct-sampling, risk-adaptive
- Use the risk formula from SPEC.md §4 with weights from config.json
- Output JSON matching SimDataPoint type in frontend/src/types/index.ts
- Write to simulation/output/simulation_results.json and copy to frontend/public/simulation.json
"""
import json
import math
import numpy as np
from pathlib import Path


def load_config(config_path=None):
    """Load configuration from JSON."""
    if config_path is None:
        # Try multiple paths: from script dir, from repo root, from cwd
        script_dir = Path(__file__).parent
        candidates = [
            script_dir / "config.json",
            script_dir.parent / "simulation" / "config.json",
            Path("config.json"),
            Path("simulation") / "config.json",
        ]
        for candidate in candidates:
            if candidate.exists():
                config_path = candidate
                break
        if config_path is None:
            raise FileNotFoundError("config.json not found in any expected location")
    else:
        config_path = Path(config_path)
    
    with open(config_path) as f:
        return json.load(f)


def derive_tier(risk_bps: int) -> int:
    """Map risk score (basis points 0-10000) to tier 0-3 per SPEC §4.2."""
    if risk_bps < 2500:
        return 0
    elif risk_bps < 5000:
        return 1
    elif risk_bps < 7500:
        return 2
    else:
        return 3


def compute_risk_bps(
    payment_wei: float,
    provider_stake_wei: float,
    reputation_bps: int,
    disputes_slashes: int,
    repro_class: int,
    assurance_level: int,
    weights: list,
) -> int:
    """
    Compute risk score in basis points per SPEC §4.1.

    Inputs:
      payment_wei: job payment in wei (as float for computation)
      provider_stake_wei: provider total stake in wei
      reputation_bps: provider reputation 0-10000
      disputes_slashes: count of disputes + slashes
      repro_class: 0=D, 1=T, 2=N
      assurance_level: 0-3
      weights: [w1, w2, w3, w4, w5] in bps (must sum to 10000)

    Returns:
      risk_bps: 0-10000
    """
    # Compute components
    v = min(1.0, payment_wei / provider_stake_wei) if provider_stake_wei > 0 else 1.0
    rep = reputation_bps / 10000.0
    dh = min(1.0, (disputes_slashes + 1) / 10.0)  # +1 to avoid division by zero
    c = {0: 0.0, 1: 0.5, 2: 1.0}.get(repro_class, 0.0)
    a = assurance_level / 3.0

    # Weighted sum
    sum_weights = sum(weights)
    if sum_weights == 0:
        sum_weights = 10000
    
    risk_score = (
        weights[0] * v +
        weights[1] * (1 - rep) +
        weights[2] * dh +
        weights[3] * c +
        weights[4] * a
    ) / sum_weights

    # Clamp to [0, 1] and convert to bps
    risk_score = max(0.0, min(1.0, risk_score))
    return int(risk_score * 10000)


def compute_sampling_bps(payment_wei: float, provider_stake_wei: float, k: int) -> int:
    """
    Compute sampling probability in basis points per SPEC §4.3.
    samplingBps = min(10000, K × payment × 10000 / providerStake)
    """
    if provider_stake_wei <= 0:
        return 10000
    sampling_bps = k * payment_wei * 10000 / provider_stake_wei
    return int(min(10000, sampling_bps))


def simulate_jobs(
    n_jobs: int,
    cheating_prob: float,
    config: dict,
    policy_name: str,
) -> tuple:
    """
    Simulate n_jobs under a given policy.

    Returns:
      (avg_verifier_cost, detection_rate, false_positive_rate)
    """
    payment_wei = config["paymentEth"] * 1e18
    stake_wei = config["stakeEth"] * 1e18
    k = config["K"]
    weights = config["weights"]

    total_cost = 0.0
    detected_cheaters = 0
    caught_cheating = 0

    np.random.seed(42)  # deterministic

    for job_idx in range(n_jobs):
        # Is this job a cheater? (job output is wrong)
        is_cheating = np.random.random() < cheating_prob

        # Policy 1: always-reexecute
        if policy_name == "always-reexecute":
            # Verifier always re-executes the entire job
            verifier_cost = 2.0  # 2× the job cost
            if is_cheating:
                # Always detected (full re-execution catches cheating)
                detected_cheaters += 1
                caught_cheating += 1
            total_cost += verifier_cost

        # Policy 2: fixed-10pct-sampling
        elif policy_name == "fixed-10pct-sampling":
            # Verifier samples 10% of the job (fixed)
            sampling_pct = 10
            verifier_cost = 1.0 + (sampling_pct / 100.0)  # 1.0 + 0.1 = 1.1
            
            # Detection: if cheating job is sampled, it's caught
            if is_cheating:
                if np.random.random() < (sampling_pct / 100.0):
                    detected_cheaters += 1
                    caught_cheating += 1
            total_cost += verifier_cost

        # Policy 3: risk-adaptive
        elif policy_name == "risk-adaptive":
            # Compute per-job risk and tier
            reputation_bps = 9700 if np.random.random() > 0.1 else 5000
            disputes_slashes = 0 if np.random.random() > 0.05 else 1
            repro_class = 0  # D (deterministic for simplicity)
            assurance_level = 1  # medium

            risk_bps = compute_risk_bps(
                payment_wei, stake_wei, reputation_bps, disputes_slashes,
                repro_class, assurance_level, weights,
            )
            tier = derive_tier(risk_bps)
            sampling_bps = compute_sampling_bps(payment_wei, stake_wei, k)
            sampling_pct = sampling_bps / 100.0

            # Verifier cost: base 1.0 + sampling contribution
            verifier_cost = 1.0 + (sampling_pct / 100.0)

            # Detection: if cheating and sampled, caught
            if is_cheating:
                if np.random.random() < (sampling_pct / 100.0):
                    detected_cheaters += 1
                    caught_cheating += 1

            total_cost += verifier_cost

    avg_verifier_cost = total_cost / n_jobs if n_jobs > 0 else 1.0
    detection_rate = (caught_cheating / n_jobs) if n_jobs > 0 else 0.0
    false_positive_rate = 0.0  # simplified

    return avg_verifier_cost, detection_rate, false_positive_rate


def main():
    config = load_config()
    n_jobs = config["nJobs"]
    steps = config["cheatingProbSteps"]
    payment_eth = config["paymentEth"]

    results = []

    for step in range(steps):
        cheating_prob = step / (steps - 1) if steps > 1 else 0.0

        # Simulate under three policies
        always_reexec_cost, _, _ = simulate_jobs(n_jobs, cheating_prob, config, "always-reexecute")
        fixed_sampling_cost, _, _ = simulate_jobs(n_jobs, cheating_prob, config, "fixed-10pct-sampling")
        risk_adaptive_cost, detection_rate, false_positive_rate = simulate_jobs(
            n_jobs, cheating_prob, config, "risk-adaptive"
        )

        result = {
            "cheatingProb": round(cheating_prob, 4),
            "alwaysReExecuteCost": round(always_reexec_cost, 4),
            "fixedSamplingCost": round(fixed_sampling_cost, 4),
            "riskAdaptiveCost": round(risk_adaptive_cost, 4),
            "detectionRate": round(detection_rate, 4),
            "falsePositiveRate": round(false_positive_rate, 4),
        }
        results.append(result)
        print(f"Step {step + 1}/{steps}: cheatingProb={cheating_prob:.2%} "
              f"always={always_reexec_cost:.3f} fixed={fixed_sampling_cost:.3f} "
              f"adaptive={risk_adaptive_cost:.3f} detection={detection_rate:.2%}")

    # Write to simulation/output/simulation_results.json
    # Try to find the repo root
    script_dir = Path(__file__).parent
    repo_root = script_dir.parent
    
    output_dir = repo_root / "simulation" / "output"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_file = output_dir / "simulation_results.json"
    with open(output_file, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\n✓ Wrote {output_file}")

    # Copy to frontend/public/simulation.json
    public_dir = repo_root / "frontend" / "public"
    public_dir.mkdir(parents=True, exist_ok=True)
    public_file = public_dir / "simulation.json"
    with open(public_file, "w") as f:
        json.dump(results, f, indent=2)
    print(f"✓ Copied to {public_file}")


if __name__ == "__main__":
    main()
