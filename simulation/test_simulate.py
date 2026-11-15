#!/usr/bin/env python3
"""
Test cases for the simulation per SPEC §4 / task §8.

8 test cases:
1. Output has exactly cheatingProbSteps entries
2. alwaysReExecuteCost is constant 2.0 across all entries
3. fixedSamplingCost is constant 1.1 across all entries
4. riskAdaptiveCost is non-decreasing as cheatingProb increases
5. detectionRate is non-decreasing as cheatingProb increases
6. All detectionRate values are in [0, 1]
7. riskAdaptiveCost <= alwaysReExecuteCost for all entries
8. Output JSON is valid and matches the SimDataPoint schema
"""
import json
import pytest
from pathlib import Path
from simulate import main as run_simulation


@pytest.fixture(scope="module")
def simulation_data():
    """Run the simulation once and load the output."""
    run_simulation()
    # Try multiple paths
    script_dir = Path(__file__).parent
    repo_root = script_dir.parent
    candidates = [
        repo_root / "simulation" / "output" / "simulation_results.json",
        Path("simulation/output/simulation_results.json"),
        Path("output/simulation_results.json"),
    ]
    output_file = None
    for candidate in candidates:
        if candidate.exists():
            output_file = candidate
            break
    
    if output_file is None:
        raise FileNotFoundError(f"simulation_results.json not found in any of: {candidates}")
    
    with open(output_file) as f:
        return json.load(f)


def test_exact_steps(simulation_data):
    """Test 1: Output has exactly cheatingProbSteps entries."""
    # Try to load config from various paths
    script_dir = Path(__file__).parent
    repo_root = script_dir.parent
    candidates = [
        repo_root / "simulation" / "config.json",
        Path("simulation/config.json"),
        Path("config.json"),
    ]
    config_file = None
    for candidate in candidates:
        if candidate.exists():
            config_file = candidate
            break
    
    if config_file is None:
        raise FileNotFoundError(f"config.json not found in any of: {candidates}")
    
    with open(config_file) as f:
        config = json.load(f)
    expected_steps = config["cheatingProbSteps"]
    assert len(simulation_data) == expected_steps, \
        f"Expected {expected_steps} entries, got {len(simulation_data)}"


def test_always_reexecute_constant(simulation_data):
    """Test 2: alwaysReExecuteCost is constant 2.0 across all entries."""
    costs = [d["alwaysReExecuteCost"] for d in simulation_data]
    assert all(abs(c - 2.0) < 0.01 for c in costs), \
        f"alwaysReExecuteCost not constant 2.0: {costs}"


def test_fixed_sampling_constant(simulation_data):
    """Test 3: fixedSamplingCost is constant 1.1 across all entries."""
    costs = [d["fixedSamplingCost"] for d in simulation_data]
    assert all(abs(c - 1.1) < 0.01 for c in costs), \
        f"fixedSamplingCost not constant 1.1: {costs}"


def test_risk_adaptive_nondecreasing(simulation_data):
    """Test 4: riskAdaptiveCost is non-decreasing as cheatingProb increases."""
    costs = [d["riskAdaptiveCost"] for d in simulation_data]
    for i in range(1, len(costs)):
        assert costs[i] >= costs[i - 1] - 0.01, \
            f"riskAdaptiveCost decreased at step {i}: {costs[i - 1]} → {costs[i]}"


def test_detection_rate_nondecreasing(simulation_data):
    """Test 5: detectionRate is non-decreasing as cheatingProb increases."""
    rates = [d["detectionRate"] for d in simulation_data]
    for i in range(1, len(rates)):
        assert rates[i] >= rates[i - 1] - 0.01, \
            f"detectionRate decreased at step {i}: {rates[i - 1]} → {rates[i]}"


def test_detection_rate_in_range(simulation_data):
    """Test 6: All detectionRate values are in [0, 1]."""
    rates = [d["detectionRate"] for d in simulation_data]
    assert all(0 <= r <= 1 for r in rates), \
        f"detectionRate out of range [0,1]: {rates}"


def test_adaptive_vs_always(simulation_data):
    """Test 7: riskAdaptiveCost <= alwaysReExecuteCost for all entries."""
    for i, d in enumerate(simulation_data):
        assert d["riskAdaptiveCost"] <= d["alwaysReExecuteCost"] + 0.01, \
            f"Step {i}: riskAdaptiveCost {d['riskAdaptiveCost']} > alwaysReExecuteCost {d['alwaysReExecuteCost']}"


def test_schema_valid(simulation_data):
    """Test 8: Output JSON is valid and matches the SimDataPoint schema."""
    required_fields = [
        "cheatingProb",
        "alwaysReExecuteCost",
        "fixedSamplingCost",
        "riskAdaptiveCost",
        "detectionRate",
    ]
    optional_fields = ["falsePositiveRate"]
    
    for i, d in enumerate(simulation_data):
        # Check required fields
        for field in required_fields:
            assert field in d, f"Step {i}: missing required field '{field}'"
            assert isinstance(d[field], (int, float)), \
                f"Step {i}: field '{field}' is not numeric"
        
        # Check optional fields if present
        if "falsePositiveRate" in d:
            assert isinstance(d["falsePositiveRate"], (int, float)), \
                f"Step {i}: field 'falsePositiveRate' is not numeric"
        
        # Sanity: cheatingProb should be in [0, 1]
        assert 0 <= d["cheatingProb"] <= 1, \
            f"Step {i}: cheatingProb {d['cheatingProb']} not in [0, 1]"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
