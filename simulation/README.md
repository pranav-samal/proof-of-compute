# /simulation — Policy Comparison Simulator

This folder contains the standalone policy simulator and its output data.

## What goes here

| File / folder | Purpose |
|---|---|
| `simulator.ts` (or `.py`) | Runs the three policy comparison scenarios and writes results to `output/` |
| `output/simulation_results.json` | Output consumed by the frontend `/simulation` page |
| `output/README.md` | Explains what each field in the JSON means |
| `config.json` | Tunable simulation parameters (job count, cheating probability range, stake levels, etc.) |

## Three policies compared

| Policy | Description |
|---|---|
| **Always re-execute** | Every job is fully re-run by a verifier. Cost = 2× job cost. Detection ≈ 100%. |
| **Fixed 10% sampling** | 10% of tasks are sampled randomly. Cost = 1.1×. Detection scales with cheating rate. |
| **Risk-adaptive** | Sampling rate and tier are set by the computed risk score. Cost varies; detection is proportional to tier. |

## Output JSON format

```json
[
  {
    "cheatingProb": 0.0,
    "alwaysReExecuteCost": 2.0,
    "fixedSamplingCost": 1.1,
    "riskAdaptiveCost": 1.0,
    "detectionRate": 0.0
  }
]
```

## Run (once simulator exists)

```bash
npm install          # or: pip install -r requirements.txt
npm run simulate     # writes output/simulation_results.json
```

## Notes

- The frontend currently generates these numbers on the fly in `src/lib/risk.ts → simulationDataPoints()`.
- Replace that with a fetch from `output/simulation_results.json` (placed in `frontend/public/`) once the real simulator produces it.
- Label all output clearly as **simulation data**, not real network measurements.
