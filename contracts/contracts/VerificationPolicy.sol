// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

interface IProviderPolicyData {
    function totalStake(address provider) external view returns (uint256);
    function reputationBps(address provider) external view returns (uint16);
    function riskHistory(address provider) external view returns (uint32 disputeCount, uint32 slashCount);
}

contract VerificationPolicy is Ownable {
    struct Policy {
        uint8 tier;
        uint16 samplingBps;
        uint8 verifierCount;
        uint8 quorum;
        uint256 collateral;
        uint32 challengeWindow;
    }

    uint16 private w1 = 3_000;
    uint16 private w2 = 2_000;
    uint16 private w3 = 1_500;
    uint16 private w4 = 1_500;
    uint16 private w5 = 2_000;
    uint16 private k = 2;
    uint32 private tier3ChallengeWindow = 3_600;
    uint16 private _verifierFeesBps = 200;
    uint16 private _slashBps = 5_000;
    uint16 private _verifierSlashBps = 1_000;
    IProviderPolicyData private immutable providerRegistry;

    constructor(address providerRegistry_) Ownable(msg.sender) {
        require(providerRegistry_ != address(0), "VerificationPolicy: zero registry");
        providerRegistry = IProviderPolicyData(providerRegistry_);
    }

    function verifierFeesBps() external view returns (uint16) { return _verifierFeesBps; }
    function slashBps() external view returns (uint16) { return _slashBps; }
    function verifierSlashBps() external view returns (uint16) { return _verifierSlashBps; }

    function computeRisk(uint256 payment, address provider, uint8 reproClass, uint8 assurance)
        public view returns (uint16 riskBps)
    {
        require(reproClass <= 2, "VerificationPolicy: invalid repro class");
        require(assurance <= 3, "VerificationPolicy: invalid assurance");

        uint256 stake = providerRegistry.totalStake(provider);
        uint256 coverageBps = stake == 0 || payment >= stake ? 10_000 : Math.mulDiv(payment, 10_000, stake);
        uint256 reputationRisk = 10_000 - providerRegistry.reputationBps(provider);
        (uint32 disputes, uint32 slashes) = providerRegistry.riskHistory(provider);
        uint256 history = uint256(disputes) + uint256(slashes);
        uint256 disputeHistoryBps = history >= 10 ? 10_000 : history * 1_000;
        uint256 reproducibilityBps = reproClass == 0 ? 0 : reproClass == 1 ? 5_000 : 10_000;
        uint256 assuranceBps = uint256(assurance) * 10_000 / 3;

        uint256 weightedRisk = uint256(w1) * coverageBps
            + uint256(w2) * reputationRisk
            + uint256(w3) * disputeHistoryBps
            + uint256(w4) * reproducibilityBps
            + uint256(w5) * assuranceBps;
        return uint16(weightedRisk / 10_000);
    }

    function derivePolicy(uint256 payment, address provider, uint8 reproClass, uint8 assurance)
        external view returns (Policy memory policy)
    {
        uint16 riskBps = computeRisk(payment, provider, reproClass, assurance);
        if (riskBps < 2_500) {
            policy.tier = 0; policy.verifierCount = 1; policy.quorum = 1;
        } else if (riskBps < 5_000) {
            policy.tier = 1; policy.verifierCount = 3; policy.quorum = 2;
        } else if (riskBps < 7_500) {
            policy.tier = 2; policy.verifierCount = 5; policy.quorum = 3;
        } else {
            policy.tier = 3; policy.verifierCount = 5; policy.quorum = 4;
            policy.challengeWindow = tier3ChallengeWindow;
        }
        uint256 stake = providerRegistry.totalStake(provider);
        policy.samplingBps = stake == 0
            ? 10_000
            : uint16(Math.min(10_000, Math.mulDiv(payment, uint256(k) * 10_000, stake)));
        policy.collateral = Math.mulDiv(payment, 5_000 + riskBps, 10_000);
    }

    function setWeights(uint16 w1_, uint16 w2_, uint16 w3_, uint16 w4_, uint16 w5_) external onlyOwner {
        require(uint256(w1_) + w2_ + w3_ + w4_ + w5_ == 10_000, "VerificationPolicy: weights must sum to 10000");
        w1 = w1_; w2 = w2_; w3 = w3_; w4 = w4_; w5 = w5_;
    }

    function setK(uint16 k_) external onlyOwner { k = k_; }
    function setChallengeWindow(uint32 seconds_) external onlyOwner { tier3ChallengeWindow = seconds_; }
    function setVerifierFeesBps(uint16 bps) external onlyOwner {
        require(bps <= 10_000, "VerificationPolicy: invalid verifier fee");
        _verifierFeesBps = bps;
    }
    function setSlashBps(uint16 bps) external onlyOwner {
        require(bps <= 10_000, "VerificationPolicy: invalid slash rate");
        _slashBps = bps;
    }
    function setVerifierSlashBps(uint16 bps) external onlyOwner {
        require(bps <= 10_000, "VerificationPolicy: invalid verifier slash rate");
        _verifierSlashBps = bps;
    }
}
