// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

contract ProviderRegistry is Ownable {
    uint8 private constant ACCEPTED = 1;
    uint8 private constant REJECTED = 2;
    uint8 private constant INCONCLUSIVE = 3;

    address private immutable escrow;
    mapping(address => uint256) private stakes;
    mapping(address => uint256) private lockedStakes;
    mapping(address => uint256) private bonds;
    mapping(address => bool) private registeredProviders;
    mapping(address => bytes32) private capabilities;
    mapping(address => bool) private registeredVerifiers;
    mapping(address => uint16) private reputations;
    mapping(address => bool) private reputationInitialized;
    mapping(address => uint32) private disputes;
    mapping(address => uint32) private slashes;
    address[] private verifiers;

    event StakeDeposited(address indexed provider, uint256 amount);
    event StakeWithdrawn(address indexed provider, uint256 amount);
    event VerifierRegistered(address indexed verifier, uint256 bond);
    event ProviderSlashed(address indexed provider, uint256 amount, address recipient);
    event VerifierSlashed(address indexed verifier, uint256 amount);
    event ReputationUpdated(address indexed provider, uint16 reputationBps);

    modifier onlyEscrow() {
        require(msg.sender == escrow, "ProviderRegistry: only escrow");
        _;
    }

    constructor(address escrow_) Ownable(msg.sender) {
        require(escrow_ != address(0), "ProviderRegistry: zero escrow");
        escrow = escrow_;
    }

    function registerProvider(bytes32 capabilityHash) external {
        registeredProviders[msg.sender] = true;
        capabilities[msg.sender] = capabilityHash;
        if (!reputationInitialized[msg.sender]) {
            reputations[msg.sender] = 10_000;
            reputationInitialized[msg.sender] = true;
            emit ReputationUpdated(msg.sender, 10_000);
        }
    }

    function depositStake() external payable {
        require(msg.value > 0, "ProviderRegistry: stake required");
        stakes[msg.sender] += msg.value;
        if (!reputationInitialized[msg.sender]) {
            reputations[msg.sender] = 10_000;
            reputationInitialized[msg.sender] = true;
            emit ReputationUpdated(msg.sender, 10_000);
        }
        emit StakeDeposited(msg.sender, msg.value);
    }

    function withdrawStake(uint256 amount) external {
        require(amount <= freeStake(msg.sender), "ProviderRegistry: exceeds free stake");
        require(amount > 0, "ProviderRegistry: amount is zero");
        stakes[msg.sender] -= amount;
        emit StakeWithdrawn(msg.sender, amount);
        (bool success,) = msg.sender.call{value: amount}("");
        require(success, "ProviderRegistry: transfer failed");
    }

    function freeStake(address provider) public view returns (uint256) {
        return stakes[provider] - lockedStakes[provider];
    }

    function totalStake(address provider) external view returns (uint256) {
        return stakes[provider];
    }

    function registerVerifier() external payable {
        require(msg.value > 0, "ProviderRegistry: bond required");
        if (!registeredVerifiers[msg.sender]) {
            registeredVerifiers[msg.sender] = true;
            verifiers.push(msg.sender);
        }
        bonds[msg.sender] += msg.value;
        emit VerifierRegistered(msg.sender, bonds[msg.sender]);
    }

    function withdrawBond(uint256 amount) external {
        require(amount > 0 && amount <= bonds[msg.sender], "ProviderRegistry: invalid bond withdrawal");
        bonds[msg.sender] -= amount;
        (bool success,) = msg.sender.call{value: amount}("");
        require(success, "ProviderRegistry: transfer failed");
    }

    function verifierBond(address verifier) external view returns (uint256) {
        return bonds[verifier];
    }

    function verifierCount() external view returns (uint256) {
        return verifiers.length;
    }

    function verifierAt(uint256 index) external view returns (address) {
        return verifiers[index];
    }

    function isEligibleVerifier(address v) external view returns (bool) {
        return registeredVerifiers[v] && bonds[v] > 0;
    }

    function reputationBps(address provider) external view returns (uint16) {
        return reputationInitialized[provider] ? reputations[provider] : 10_000;
    }

    // Added to the shared ABI so policy derivation can apply SPEC §4.1's Dh term.
    function riskHistory(address provider) external view returns (uint32 disputeCount, uint32 slashCount) {
        return (disputes[provider], slashes[provider]);
    }

    function lockStake(address provider, uint256 amount) external onlyEscrow {
        require(freeStake(provider) >= amount, "ProviderRegistry: insufficient free stake");
        lockedStakes[provider] += amount;
    }

    function unlockStake(address provider, uint256 amount) external onlyEscrow {
        require(amount <= lockedStakes[provider], "ProviderRegistry: exceeds locked stake");
        lockedStakes[provider] -= amount;
    }

    function slash(address provider, uint256 amount, address recipient) external onlyEscrow {
        require(amount <= lockedStakes[provider] && amount <= stakes[provider], "ProviderRegistry: exceeds locked stake");
        lockedStakes[provider] -= amount;
        stakes[provider] -= amount;
        emit ProviderSlashed(provider, amount, recipient);
        (bool success,) = recipient.call{value: amount}("");
        require(success, "ProviderRegistry: slash transfer failed");
    }

    function slashBond(address verifier, uint256 amount) external onlyEscrow {
        require(amount <= bonds[verifier], "ProviderRegistry: exceeds verifier bond");
        bonds[verifier] -= amount;
        emit VerifierSlashed(verifier, amount);
    }

    function recordOutcome(address provider, uint8 outcome) external onlyEscrow {
        uint16 reputation = reputationInitialized[provider] ? reputations[provider] : 10_000;
        if (outcome == REJECTED) {
            reputation = reputation > 500 ? reputation - 500 : 0;
            if (slashes[provider] < type(uint32).max) slashes[provider] += 1;
        } else if (outcome == INCONCLUSIVE && disputes[provider] < type(uint32).max) {
            disputes[provider] += 1;
        } else if (outcome != ACCEPTED && outcome != INCONCLUSIVE) {
            revert("ProviderRegistry: invalid outcome");
        }
        reputations[provider] = reputation;
        reputationInitialized[provider] = true;
        emit ReputationUpdated(provider, reputation);
    }
}
