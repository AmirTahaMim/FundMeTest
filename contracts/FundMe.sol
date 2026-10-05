// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title FundMe — ETH donations with a $2 USD minimum
/// @notice Contributions are gifts to the immutable owner, not refundable deposits.
contract FundMe is ReentrancyGuard {
    error FundMe__NotOwner();
    error FundMe__InvalidPriceFeed();
    error FundMe__InvalidMaxPriceAge();
    error FundMe__UnsupportedDecimals(uint8 decimals);
    error FundMe__InvalidPrice();
    error FundMe__InvalidRoundData();
    error FundMe__StalePrice(uint256 updatedAt, uint256 currentTime);
    error FundMe__MinimumContributionNotMet(uint256 usdValue);
    error FundMe__NothingToWithdraw();
    error FundMe__TransferFailed();
    error FundMe__UnknownCall();

    event Funded(address indexed funder, uint256 amount, uint256 usdValue);
    event Withdrawn(address indexed owner, uint256 amount);

    // USD uses 18 decimal places, so two dollars is 2 * 10^18 units.
    uint256 public constant MINIMUM_USD = 2e18;
    address public immutable i_owner;
    uint256 public immutable maxPriceAge;
    uint8 public immutable feedDecimals;
    AggregatorV3Interface private immutable i_priceFeed;
    uint256 private immutable i_priceScale;

    // These are lifetime records, deliberately preserved across withdrawals.
    // No withdrawal loop: an unbounded funder list cannot block withdrawal.
    mapping(address => uint256) public addressToAmountFunded;
    address[] public funders;

    constructor(address priceFeed, uint256 maximumPriceAge) {
        if (priceFeed == address(0) || priceFeed.code.length == 0) {
            revert FundMe__InvalidPriceFeed();
        }
        if (maximumPriceAge == 0) revert FundMe__InvalidMaxPriceAge();
        i_priceFeed = AggregatorV3Interface(priceFeed);
        uint8 decimals = i_priceFeed.decimals();
        // Supporting 0..18 decimals permits exact normalization without discarding
        // oracle precision. Higher precision feeds are explicitly unsupported.
        if (decimals > 18) revert FundMe__UnsupportedDecimals(decimals);
        feedDecimals = decimals;
        i_priceScale = 10 ** (18 - decimals);
        maxPriceAge = maximumPriceAge;
        i_owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != i_owner) revert FundMe__NotOwner();
        _;
    }

    /// @return ETH/USD price in USD units with 18 decimals, e.g. $2000 => 2000e18.
    function getPrice() public view returns (uint256) {
        (uint80 roundId, int256 answer, , uint256 updatedAt, uint80 answeredInRound) =
            i_priceFeed.latestRoundData();
        if (answer <= 0) revert FundMe__InvalidPrice();
        // answeredInRound is deprecated on modern feeds but rejecting an older
        // answered round also protects this consumer when used with legacy feeds.
        if (roundId == 0 || answeredInRound < roundId || updatedAt == 0 || updatedAt > block.timestamp) {
            revert FundMe__InvalidRoundData();
        }
        if (block.timestamp - updatedAt > maxPriceAge) {
            revert FundMe__StalePrice(updatedAt, block.timestamp);
        }
        uint256 price = uint256(answer);
        if (price > type(uint256).max / i_priceScale) revert FundMe__InvalidPrice();
        return price * i_priceScale;
    }

    /// @notice Converts wei to USD with 18 decimals, rounding down.
    function getConversionRate(uint256 ethAmount) public view returns (uint256) {
        // wei * (USD/ETH * 1e18) / (wei/ETH) = USD * 1e18.
        // mulDiv uses a full-width intermediate product to avoid premature overflow.
        return Math.mulDiv(ethAmount, getPrice(), 1e18);
    }

    /// @notice Smallest integer wei amount accepted at the current oracle price.
    function getMinimumContributionWei() external view returns (uint256) {
        // Round UP: when $2 is not an integer number of wei, rounding down is short.
        return Math.mulDiv(MINIMUM_USD, 1e18, getPrice(), Math.Rounding.Ceil);
    }

    function fund() public payable nonReentrant {
        uint256 usdValue = getConversionRate(msg.value);
        if (usdValue < MINIMUM_USD) revert FundMe__MinimumContributionNotMet(usdValue);
        if (addressToAmountFunded[msg.sender] == 0) funders.push(msg.sender);
        addressToAmountFunded[msg.sender] += msg.value;
        emit Funded(msg.sender, msg.value, usdValue);
    }

    /// @notice Sends the entire balance to the owner; lifetime records are unchanged.
    function withdraw() public onlyOwner nonReentrant {
        uint256 amount = address(this).balance;
        if (amount == 0) revert FundMe__NothingToWithdraw();
        // The guard is active before the external call. Failed transfers revert
        // the entire transaction. No balance accounting must be cleared here.
        (bool success, ) = payable(i_owner).call{value: amount}("");
        if (!success) revert FundMe__TransferFailed();
        emit Withdrawn(i_owner, amount);
    }

    function getPriceFeed() external view returns (address) {
        return address(i_priceFeed);
    }

    function getVersion() external view returns (uint256) {
        return i_priceFeed.version();
    }

    function getFunderCount() external view returns (uint256) {
        return funders.length;
    }

    /// @notice Plain ETH transfers receive the same price and minimum checks.
    receive() external payable {
        fund();
    }

    /// @notice Reject unknown function selectors to catch mistaken integrations.
    fallback() external payable {
        revert FundMe__UnknownCall();
    }
}
