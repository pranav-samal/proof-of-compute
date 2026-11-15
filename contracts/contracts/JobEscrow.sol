// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./VerificationPolicy.sol";

interface IProviderRegistryEscrow {
    function freeStake(address provider) external view returns (uint256);
    function lockStake(address provider, uint256 amount) external;
    function unlockStake(address provider, uint256 amount) external;
    function slash(address provider, uint256 amount, address recipient) external;
    function slashBond(address verifier, uint256 amount) external;
    function recordOutcome(address provider, uint8 outcome) external;
    function verifierCount() external view returns (uint256);
    function verifierAt(uint256 index) external view returns (address);
    function isEligibleVerifier(address v) external view returns (bool);
    function verifierBond(address verifier) external view returns (uint256);
}

contract JobEscrow is Ownable, EIP712 {
    uint8 private constant REGISTERED = 0;
    uint8 private constant ASSIGNED = 1;
    uint8 private constant COMMITTED = 2;
    uint8 private constant VERIFYING = 3;
    uint8 private constant SETTLED = 4;
    uint8 private constant DISPUTED = 5;
    uint8 private constant REFUNDED = 6;

    uint8 private constant NONE = 0;
    uint8 private constant ACCEPTED = 1;
    uint8 private constant REJECTED = 2;
    uint8 private constant INCONCLUSIVE = 3;
    uint8 private constant PASS = 0;
    uint8 private constant FAIL = 1;
    uint8 private constant VERDICT_INCONCLUSIVE = 2;

    bytes32 private constant ATTESTATION_TYPEHASH = keccak256(
        "Attestation(uint256 jobId,bytes32 policyHash,bytes32 resultHash,uint8 verdict,bytes32 evidenceHash)"
    );

    struct JobRecord {
        address requester;
        address provider;
        string specCid;
        bytes32 profileHash;
        uint8 reproClass;
        uint8 assurance;
        uint64 deadline;
        uint256 payment;
        uint8 state;
        bytes32 policyHash;
        bytes32 resultHash;
        bytes32 checkpointRoot;
        string resultCid;
        uint64 commitBlock;
        uint8 outcome;
        uint64 verifyDeadline;
    }

    struct ReceiptRecord {
        uint256 jobId;
        string specCid;
        bytes32 policyHash;
        address provider;
        address requester;
        bytes32 resultHash;
        bytes32 attestationRoot;
        uint8 tier;
        uint8 outcome;
        uint64 settledAt;
    }

    struct AttestationRecord {
        address verifier;
        uint8 verdict;
        bytes32 evidenceHash;
    }

    IProviderRegistryEscrow private immutable providerRegistry;
    VerificationPolicy private immutable verificationPolicy;
    uint256 private nextJobId = 1;
    mapping(uint256 => JobRecord) private jobs;
    mapping(uint256 => VerificationPolicy.Policy) private policies;
    mapping(uint256 => ReceiptRecord) private receipts;
    mapping(uint256 => AttestationRecord[]) private attestations;
    mapping(uint256 => address[]) private selected;
    mapping(uint256 => mapping(address => bool)) private selectedForJob;
    mapping(uint256 => mapping(address => bool)) private hasAttested;
    mapping(uint256 => uint64) private quorumReachedAt;
    mapping(uint256 => uint8) private passVotes;
    mapping(uint256 => uint8) private failVotes;

    event JobRegistered(uint256 indexed jobId, address indexed requester, string specCid, bytes32 profileHash, uint256 payment);
    event ProviderAssigned(uint256 indexed jobId, address indexed provider);
    event PolicyRecorded(uint256 indexed jobId, bytes32 policyHash, uint8 tier, uint16 samplingBps, uint256 collateral, uint32 challengeWindow);
    event ResultCommitted(uint256 indexed jobId, bytes32 resultHash, bytes32 checkpointRoot, string resultCid);
    event VerifiersSelected(uint256 indexed jobId, address[] verifiers, uint64 verifyDeadline);
    event AttestationSubmitted(uint256 indexed jobId, address indexed verifier, uint8 verdict, bytes32 evidenceHash);
    event JobSettled(uint256 indexed jobId, uint8 outcome);
    event JobDisputed(uint256 indexed jobId, address challenger);
    event DisputeResolved(uint256 indexed jobId, uint8 outcome);
    event TimeoutClaimed(uint256 indexed jobId, address claimedBy);
    event ReceiptIssued(uint256 indexed jobId, bytes32 policyHash, bytes32 resultHash, bytes32 attestationRoot, uint8 tier, uint8 outcome, uint64 settledAt);

    constructor(address providerRegistry_, address verificationPolicy_)
        Ownable(msg.sender)
        EIP712("ProofOfCompute", "1")
    {
        require(providerRegistry_ != address(0) && verificationPolicy_ != address(0), "JobEscrow: zero dependency");
        providerRegistry = IProviderRegistryEscrow(providerRegistry_);
        verificationPolicy = VerificationPolicy(verificationPolicy_);
    }

    function registerJob(string calldata specCid, bytes32 profileHash, uint8 reproClass, uint8 assurance, uint64 deadline)
        external payable returns (uint256 jobId)
    {
        require(msg.value > 0, "JobEscrow: payment required");
        jobId = nextJobId++;
        jobs[jobId] = JobRecord({
            requester: msg.sender,
            provider: address(0),
            specCid: specCid,
            profileHash: profileHash,
            reproClass: reproClass,
            assurance: assurance,
            deadline: deadline,
            payment: msg.value,
            state: REGISTERED,
            policyHash: bytes32(0),
            resultHash: bytes32(0),
            checkpointRoot: bytes32(0),
            resultCid: "",
            commitBlock: 0,
            outcome: NONE,
            verifyDeadline: 0
        });
        emit JobRegistered(jobId, msg.sender, specCid, profileHash, msg.value);
    }

    function assignProvider(uint256 jobId, address provider) external {
        JobRecord storage job = jobs[jobId];
        require(job.state == REGISTERED, "JobEscrow: already assigned");
        require(msg.sender == job.requester, "JobEscrow: not requester");
        VerificationPolicy.Policy memory policy = verificationPolicy.derivePolicy(job.payment, provider, job.reproClass, job.assurance);
        require(providerRegistry.freeStake(provider) >= policy.collateral, "ProviderRegistry: insufficient free stake");
        providerRegistry.lockStake(provider, policy.collateral);
        bytes32 policyHash = keccak256(abi.encode(policy));
        policies[jobId] = policy;
        job.provider = provider;
        job.policyHash = policyHash;
        job.state = ASSIGNED;
        emit PolicyRecorded(jobId, policyHash, policy.tier, policy.samplingBps, policy.collateral, policy.challengeWindow);
        emit ProviderAssigned(jobId, provider);
    }

    function commitResult(uint256 jobId, bytes32 resultHash, bytes32 checkpointRoot, string calldata resultCid) external {
        JobRecord storage job = jobs[jobId];
        require(job.state == ASSIGNED, "JobEscrow: invalid state");
        require(msg.sender == job.provider, "JobEscrow: not provider");
        require(block.timestamp < job.deadline, "JobEscrow: deadline passed");
        job.resultHash = resultHash;
        job.checkpointRoot = checkpointRoot;
        job.resultCid = resultCid;
        job.commitBlock = uint64(block.number);
        job.state = COMMITTED;
        emit ResultCommitted(jobId, resultHash, checkpointRoot, resultCid);
    }

    function selectVerifiers(uint256 jobId) external {
        JobRecord storage job = jobs[jobId];
        require(job.state == COMMITTED, "JobEscrow: invalid state");
        require(block.number > uint256(job.commitBlock) + 1, "JobEscrow: too early");

        uint256 total = providerRegistry.verifierCount();
        address[] memory candidates = new address[](total);
        uint256 candidateCount;
        for (uint256 i; i < total; ++i) {
            address verifier = providerRegistry.verifierAt(i);
            if (verifier != job.provider && verifier != job.requester && providerRegistry.isEligibleVerifier(verifier)) {
                candidates[candidateCount++] = verifier;
            }
        }
        uint8 required = policies[jobId].verifierCount;
        require(candidateCount >= required, "JobEscrow: not enough verifiers");

        uint256 seed = uint256(keccak256(abi.encode(block.prevrandao, blockhash(uint256(job.commitBlock) + 1), jobId)));
        for (uint256 i; i < required; ++i) {
            uint256 j = i + (uint256(keccak256(abi.encode(seed, i))) % (candidateCount - i));
            (candidates[i], candidates[j]) = (candidates[j], candidates[i]);
            address verifier = candidates[i];
            selected[jobId].push(verifier);
            selectedForJob[jobId][verifier] = true;
        }
        job.state = VERIFYING;
        job.verifyDeadline = job.deadline;
        emit VerifiersSelected(jobId, selected[jobId], job.verifyDeadline);
    }

    function submitAttestation(uint256 jobId, uint8 verdict, bytes32 evidenceHash, bytes calldata signature) external {
        JobRecord storage job = jobs[jobId];
        require(job.state == VERIFYING, "JobEscrow: invalid state");
        require(block.timestamp <= job.verifyDeadline, "JobEscrow: verification deadline passed");
        require(verdict <= VERDICT_INCONCLUSIVE, "JobEscrow: invalid verdict");
        bytes32 structHash = keccak256(abi.encode(ATTESTATION_TYPEHASH, jobId, job.policyHash, job.resultHash, verdict, evidenceHash));
        address verifier = ECDSA.recover(_hashTypedDataV4(structHash), signature);
        require(selectedForJob[jobId][verifier], "JobEscrow: not selected verifier");
        require(!hasAttested[jobId][verifier], "JobEscrow: already attested");
        hasAttested[jobId][verifier] = true;
        attestations[jobId].push(AttestationRecord(verifier, verdict, evidenceHash));
        if (verdict == PASS) passVotes[jobId] += 1;
        if (verdict == FAIL) failVotes[jobId] += 1;
        VerificationPolicy.Policy memory policy = policies[jobId];
        uint8 failQuorum = policy.verifierCount - policy.quorum + 1;
        if (quorumReachedAt[jobId] == 0 && (passVotes[jobId] >= policy.quorum || failVotes[jobId] >= failQuorum)) {
            quorumReachedAt[jobId] = uint64(block.timestamp);
        }
        emit AttestationSubmitted(jobId, verifier, verdict, evidenceHash);
    }

    function settle(uint256 jobId) external {
        JobRecord storage job = jobs[jobId];
        require(job.state == VERIFYING, "JobEscrow: invalid state");
        VerificationPolicy.Policy memory policy = policies[jobId];
        uint8 failQuorum = policy.verifierCount - policy.quorum + 1;
        bool acceptedQuorum = passVotes[jobId] >= policy.quorum;
        bool rejectedQuorum = failVotes[jobId] >= failQuorum;
        bool deadlinePassed = block.timestamp > job.verifyDeadline;
        require(acceptedQuorum || rejectedQuorum || deadlinePassed, "JobEscrow: cannot settle yet");

        if (acceptedQuorum || rejectedQuorum) {
            if (policy.challengeWindow > 0 && quorumReachedAt[jobId] != 0) {
                require(block.timestamp >= uint256(quorumReachedAt[jobId]) + policy.challengeWindow, "JobEscrow: challenge window active");
            }
        }

        if (acceptedQuorum) {
            _settleOutcome(jobId, ACCEPTED);
        } else if (rejectedQuorum) {
            _settleOutcome(jobId, REJECTED);
        } else {
            job.outcome = INCONCLUSIVE;
            job.state = DISPUTED;
            providerRegistry.recordOutcome(job.provider, INCONCLUSIVE);
            emit JobDisputed(jobId, msg.sender);
        }
    }

    function challenge(uint256 jobId) external {
        JobRecord storage job = jobs[jobId];
        VerificationPolicy.Policy memory policy = policies[jobId];
        require(msg.sender == job.requester, "JobEscrow: not requester");
        require(job.state == VERIFYING && policy.challengeWindow > 0 && quorumReachedAt[jobId] != 0, "JobEscrow: challenge unavailable");
        require(block.timestamp < uint256(quorumReachedAt[jobId]) + policy.challengeWindow, "JobEscrow: challenge window passed");
        job.state = DISPUTED;
        providerRegistry.recordOutcome(job.provider, INCONCLUSIVE);
        emit JobDisputed(jobId, msg.sender);
    }

    function claimTimeout(uint256 jobId) external {
        JobRecord storage job = jobs[jobId];
        if (job.state == ASSIGNED) {
            require(block.timestamp > job.deadline, "JobEscrow: deadline not passed");
            providerRegistry.unlockStake(job.provider, policies[jobId].collateral);
            job.state = REFUNDED;
            job.outcome = REJECTED;
            _send(job.requester, job.payment);
        } else {
            require(job.state == VERIFYING && block.timestamp > job.verifyDeadline, "JobEscrow: verification deadline not passed");
            uint8 failQuorum = policies[jobId].verifierCount - policies[jobId].quorum + 1;
            require(passVotes[jobId] < policies[jobId].quorum && failVotes[jobId] < failQuorum, "JobEscrow: quorum reached");
            job.outcome = INCONCLUSIVE;
            job.state = DISPUTED;
            providerRegistry.recordOutcome(job.provider, INCONCLUSIVE);
            emit JobDisputed(jobId, msg.sender);
        }
        emit TimeoutClaimed(jobId, msg.sender);
    }

    function resolveDispute(uint256 jobId, uint8 outcome) external onlyOwner {
        JobRecord storage job = jobs[jobId];
        require(job.state == DISPUTED, "JobEscrow: not disputed");
        require(outcome == ACCEPTED || outcome == REJECTED, "JobEscrow: invalid resolution");
        _settleOutcome(jobId, outcome);
        emit DisputeResolved(jobId, outcome);
    }

    function getJob(uint256 jobId) external view returns (JobRecord memory) { return jobs[jobId]; }
    function getPolicy(uint256 jobId) external view returns (VerificationPolicy.Policy memory) { return policies[jobId]; }
    function getReceipt(uint256 jobId) external view returns (ReceiptRecord memory) { return receipts[jobId]; }
    function getAttestation(uint256 jobId, uint256 index) external view returns (address verifier, uint8 verdict, bytes32 evidenceHash) {
        AttestationRecord storage record = attestations[jobId][index];
        return (record.verifier, record.verdict, record.evidenceHash);
    }
    function selectedVerifiers(uint256 jobId) external view returns (address[] memory) { return selected[jobId]; }

    function _settleOutcome(uint256 jobId, uint8 outcome) private {
        JobRecord storage job = jobs[jobId];
        VerificationPolicy.Policy memory policy = policies[jobId];
        // Change state before external transfers so a recipient cannot re-enter settlement.
        job.outcome = outcome;
        job.state = SETTLED;
        if (outcome == ACCEPTED) {
            _settleAccepted(jobId);
        } else {
            _settleRejected(jobId);
        }
        _slashWrongVerdicts(jobId, outcome);
        providerRegistry.recordOutcome(job.provider, outcome);
        bytes32 root = _attestationRoot(jobId);
        uint64 settledAt = uint64(block.timestamp);
        receipts[jobId] = ReceiptRecord(jobId, job.specCid, job.policyHash, job.provider, job.requester, job.resultHash, root, policy.tier, outcome, settledAt);
        emit JobSettled(jobId, outcome);
        emit ReceiptIssued(jobId, job.policyHash, job.resultHash, root, policy.tier, outcome, settledAt);
    }

    function _settleAccepted(uint256 jobId) private {
        JobRecord storage job = jobs[jobId];
        uint256 fee = Math.mulDiv(job.payment, verificationPolicy.verifierFeesBps(), 10_000);
        providerRegistry.unlockStake(job.provider, policies[jobId].collateral);
        _send(job.provider, job.payment - fee);
        _payVerdictVoters(jobId, PASS, fee);
    }

    function _settleRejected(uint256 jobId) private {
        JobRecord storage job = jobs[jobId];
        uint256 collateral = policies[jobId].collateral;
        uint256 slashed = Math.mulDiv(collateral, verificationPolicy.slashBps(), 10_000);
        _distributeCollateralSlash(jobId, slashed);
        uint256 fee = Math.mulDiv(job.payment, verificationPolicy.verifierFeesBps(), 10_000);
        uint256 remaining = collateral - slashed;
        if (fee > remaining) fee = remaining;
        if (fee > 0) {
            if (failVotes[jobId] == 0) providerRegistry.slash(job.provider, fee, job.requester);
            else _payVerdictVotersFromStake(jobId, FAIL, fee);
        }
        if (remaining > fee) providerRegistry.unlockStake(job.provider, remaining - fee);
        _send(job.requester, job.payment);
    }

    function _distributeCollateralSlash(uint256 jobId, uint256 slashed) private {
        JobRecord storage job = jobs[jobId];
        uint256 verifierShare = slashed / 2;
        uint256 requesterShare = slashed - verifierShare;
        if (failVotes[jobId] == 0) {
            providerRegistry.slash(job.provider, slashed, job.requester);
            return;
        }
        _slashToFailVoters(jobId, verifierShare);
        providerRegistry.slash(job.provider, requesterShare, job.requester);
    }

    function _slashToFailVoters(uint256 jobId, uint256 amount) private {
        JobRecord storage job = jobs[jobId];
        uint256 perVoter = amount / failVotes[jobId];
        uint256 paid;
        for (uint256 i; i < attestations[jobId].length; ++i) {
            AttestationRecord storage record = attestations[jobId][i];
            if (record.verdict == FAIL) {
                uint256 reward = perVoter;
                if (paid + reward + perVoter > amount) reward = amount - paid;
                if (reward > 0) providerRegistry.slash(job.provider, reward, record.verifier);
                paid += reward;
            }
        }
        if (amount > paid) providerRegistry.slash(job.provider, amount - paid, job.requester);
    }

    function _payVerdictVoters(uint256 jobId, uint8 verdict, uint256 amount) private {
        uint256 voterCount = verdict == PASS ? passVotes[jobId] : failVotes[jobId];
        if (amount == 0) return;
        if (voterCount == 0) {
            _send(jobs[jobId].requester, amount);
            return;
        }
        uint256 perVoter = amount / voterCount;
        uint256 paid;
        for (uint256 i; i < attestations[jobId].length; ++i) {
            AttestationRecord storage record = attestations[jobId][i];
            if (record.verdict == verdict) {
                uint256 reward = perVoter;
                _send(record.verifier, reward);
                paid += reward;
            }
        }
        if (paid < amount) _send(jobs[jobId].requester, amount - paid);
    }

    function _payVerdictVotersFromStake(uint256 jobId, uint8 verdict, uint256 amount) private {
        uint256 voterCount = verdict == PASS ? passVotes[jobId] : failVotes[jobId];
        uint256 perVoter = voterCount == 0 ? 0 : amount / voterCount;
        uint256 paid;
        for (uint256 i; i < attestations[jobId].length; ++i) {
            AttestationRecord storage record = attestations[jobId][i];
            if (record.verdict == verdict) {
                uint256 reward = perVoter;
                if (paid + reward + perVoter > amount) reward = amount - paid;
                providerRegistry.slash(jobs[jobId].provider, reward, record.verifier);
                paid += reward;
            }
        }
        if (paid < amount) providerRegistry.slash(jobs[jobId].provider, amount - paid, jobs[jobId].requester);
    }

    function _slashWrongVerdicts(uint256 jobId, uint8 outcome) private {
        uint256 count = attestations[jobId].length;
        for (uint256 i; i < count; ++i) {
            AttestationRecord storage record = attestations[jobId][i];
            bool matched = outcome == ACCEPTED ? record.verdict == PASS : record.verdict == FAIL;
            if (!matched) {
                uint256 bond = providerRegistry.verifierBond(record.verifier);
                uint256 slashedBond = Math.mulDiv(bond, verificationPolicy.verifierSlashBps(), 10_000);
                if (slashedBond > 0) providerRegistry.slashBond(record.verifier, slashedBond);
            }
        }
    }

    function _attestationRoot(uint256 jobId) private view returns (bytes32 root) {
        bytes memory hashes;
        for (uint256 i; i < attestations[jobId].length; ++i) {
            AttestationRecord storage record = attestations[jobId][i];
            bytes32 structHash = keccak256(abi.encode(
                ATTESTATION_TYPEHASH, jobId, jobs[jobId].policyHash, jobs[jobId].resultHash, record.verdict, record.evidenceHash
            ));
            hashes = bytes.concat(hashes, abi.encodePacked(_hashTypedDataV4(structHash)));
        }
        return keccak256(hashes);
    }

    function _send(address recipient, uint256 amount) private {
        (bool success,) = recipient.call{value: amount}("");
        require(success, "JobEscrow: payment transfer failed");
    }
}
