// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDT is ERC20 {
    uint8 private immutable _decimals;

    constructor(uint8 decimals_, uint256 initialSupply) ERC20("Mock USDT", "mUSDT") {
        _decimals = decimals_;
        _mint(msg.sender, initialSupply);
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }
}
