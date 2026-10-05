// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/// @dev Test/local only. Anyone can deliberately write malformed rounds.
/// This mock removes all RPC and live Chainlink dependencies from unit tests.
contract MockV3Aggregator is AggregatorV3Interface {
    uint8 public immutable override decimals;
    string public constant override description = "Mock ETH / USD";
    uint256 public constant override version = 4;

    struct Round {
        int256 answer;
        uint256 startedAt;
        uint256 updatedAt;
        uint80 answeredInRound;
    }

    uint80 private s_roundId;
    mapping(uint80 => Round) private s_rounds;
    bool private s_shouldRevert;

    error MockOracle__Unavailable();
    error MockOracle__NoData();

    constructor(uint8 decimals_, int256 initialAnswer) {
        decimals = decimals_;
        updateAnswer(initialAnswer);
    }

    function updateAnswer(int256 answer) public {
        ++s_roundId;
        s_rounds[s_roundId] = Round(answer, block.timestamp, block.timestamp, s_roundId);
    }

    function setRoundData(uint80 roundId, int256 answer, uint256 updatedAt, uint80 answeredInRound) external {
        s_roundId = roundId;
        s_rounds[roundId] = Round(answer, updatedAt, updatedAt, answeredInRound);
    }

    function setShouldRevert(bool shouldRevert) external {
        s_shouldRevert = shouldRevert;
    }

    function latestRoundData() external view override returns (uint80, int256, uint256, uint256, uint80) {
        if (s_shouldRevert) revert MockOracle__Unavailable();
        Round memory round = s_rounds[s_roundId];
        return (s_roundId, round.answer, round.startedAt, round.updatedAt, round.answeredInRound);
    }

    function getRoundData(uint80 roundId) external view override returns (uint80, int256, uint256, uint256, uint80) {
        Round memory round = s_rounds[roundId];
        if (round.updatedAt == 0) revert MockOracle__NoData();
        return (roundId, round.answer, round.startedAt, round.updatedAt, round.answeredInRound);
    }
}
