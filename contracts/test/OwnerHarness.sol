// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {FundMe} from "../FundMe.sol";

/// @dev Deploys FundMe as a contract owner to exercise malicious receiver behavior.
contract OwnerHarness {
    FundMe public immutable fundMe;
    bool public rejectPayment;
    bool public attemptReentry;
    bool public reentrySucceeded;
    bytes public reentryError;

    constructor(address feed, uint256 maxAge) {
        fundMe = new FundMe(feed, maxAge);
    }

    function configure(bool reject, bool reenter) external {
        rejectPayment = reject;
        attemptReentry = reenter;
    }

    function withdraw() external {
        fundMe.withdraw();
    }

    receive() external payable {
        require(!rejectPayment, "Test receiver rejects ETH");
        if (attemptReentry) {
            (reentrySucceeded, reentryError) = address(fundMe).call(abi.encodeCall(FundMe.withdraw, ()));
        }
    }
}
