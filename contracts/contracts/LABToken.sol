// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/**
 * @title LABToken
 * @notice ERC20-compatible token with extended payout flows for marketplace scenarios.
 * @dev Implements AccessControl for role management, pausability, and reentrancy protections.
 */
contract LABToken is ERC20, ERC20Burnable, ERC20Permit, AccessControl, Pausable, ReentrancyGuard {
    uint16 public constant MAX_FEE_BPS = 1_000; // 10%
    uint16 public constant BPS_DENOMINATOR = 10_000;

    bytes32 public constant FEE_MANAGER_ROLE = keccak256("FEE_MANAGER_ROLE");
    bytes32 public constant FLASH_ROLE = keccak256("FLASH_ROLE");

    enum FeeType {
        SlotBuy,
        DirectCommission,
        RoyaltyTransfer,
        SuperRoyaltyTransfer,
        CreatorTransfer,
        FlashTransfer
    }

    struct FeeConfig {
        uint16 platformFeeBps;
        uint16 creatorFeeBps;
        uint16 royaltyFeeBps;
        uint16 referrerFeeBps;
    }

    struct FeeBreakdown {
        uint256 netAmount;
        uint256 platformFee;
        uint256 creatorFee;
        uint256 royaltyFee;
        uint256 referrerFee;
    }

    mapping(FeeType => FeeConfig) private _fees;

    address public platformWallet;
    address public creatorWallet;
    address public royaltyWallet;

    event SlotBuy(
        address indexed buyer,
        address indexed recipient,
        address indexed referrer,
        uint256 amount,
        uint256 netAmount,
        uint256 platformFee,
        uint256 creatorFee,
        uint256 royaltyFee,
        uint256 referrerFee
    );

    event DirectCommission(
        address indexed operator,
        address indexed seller,
        uint256 amount,
        uint256 netAmount,
        uint256 platformFee,
        uint256 creatorFee
    );

    event RoyaltyPaid(
        address indexed operator,
        address indexed recipient,
        uint256 amount,
        uint256 netAmount,
        uint256 platformFee,
        uint256 royaltyFee
    );

    event SuperRoyaltyPaid(
        address indexed operator,
        address indexed recipient,
        uint256 amount,
        uint256 netAmount,
        uint256 platformFee,
        uint256 royaltyFee,
        address[] payees,
        uint256[] payouts
    );

    event CreatorPaid(
        address indexed operator,
        address indexed recipient,
        uint256 amount,
        uint256 netAmount,
        uint256 platformFee,
        uint256 creatorFee
    );

    event FlashTransfer(
        address indexed operator,
        address indexed to,
        uint256 amount,
        uint256 netAmount,
        uint256 platformFee
    );

    event FeesUpdated(
        FeeType indexed feeType,
        uint16 platformFeeBps,
        uint16 creatorFeeBps,
        uint16 royaltyFeeBps,
        uint16 referrerFeeBps
    );

    event FeeWalletsUpdated(address platformWallet, address creatorWallet, address royaltyWallet);

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 initialSupply_,
        address platformWallet_,
        address creatorWallet_,
        address royaltyWallet_,
        address admin_
    ) ERC20(name_, symbol_) ERC20Permit(name_) {
        require(platformWallet_ != address(0), "Platform wallet is zero");
        require(creatorWallet_ != address(0), "Creator wallet is zero");
        require(royaltyWallet_ != address(0), "Royalty wallet is zero");
        require(admin_ != address(0), "Admin is zero");

        platformWallet = platformWallet_;
        creatorWallet = creatorWallet_;
        royaltyWallet = royaltyWallet_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(FEE_MANAGER_ROLE, admin_);
        _grantRole(FLASH_ROLE, admin_);

        if (initialSupply_ > 0) {
            _mint(admin_, initialSupply_);
        }
    }

    /**
     * @notice Struct getter to satisfy ABI encoding for view consumers.
     */
    function getFees(FeeType feeType) external view returns (FeeConfig memory) {
        return _fees[feeType];
    }

    function setFees(FeeType feeType, FeeConfig calldata config) external onlyRole(FEE_MANAGER_ROLE) {
        _validateFees(config);
        _fees[feeType] = config;
        emit FeesUpdated(
            feeType,
            config.platformFeeBps,
            config.creatorFeeBps,
            config.royaltyFeeBps,
            config.referrerFeeBps
        );
    }

    function setFeeWallets(
        address platformWallet_,
        address creatorWallet_,
        address royaltyWallet_
    ) external onlyRole(FEE_MANAGER_ROLE) {
        require(platformWallet_ != address(0), "Platform wallet is zero");
        require(creatorWallet_ != address(0), "Creator wallet is zero");
        require(royaltyWallet_ != address(0), "Royalty wallet is zero");

        platformWallet = platformWallet_;
        creatorWallet = creatorWallet_;
        royaltyWallet = royaltyWallet_;

        emit FeeWalletsUpdated(platformWallet_, creatorWallet_, royaltyWallet_);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function mint(address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(to != address(0), "Mint to zero");
        _mint(to, amount);
    }

    function burnFrom(address account, uint256 amount) public override onlyRole(DEFAULT_ADMIN_ROLE) {
        _burn(account, amount);
    }

    function slotBuy(
        address recipient,
        uint256 amount,
        address referrer
    ) external nonReentrant whenNotPaused {
        require(recipient != address(0), "Recipient is zero");
        require(amount > 0, "Amount is zero");

        FeeConfig memory config = _fees[FeeType.SlotBuy];

        FeeBreakdown memory breakdown = _applyFees(_msgSender(), amount, config, referrer);

        _transfer(_msgSender(), recipient, breakdown.netAmount);

        emit SlotBuy(
            _msgSender(),
            recipient,
            referrer,
            amount,
            breakdown.netAmount,
            breakdown.platformFee,
            breakdown.creatorFee,
            breakdown.royaltyFee,
            breakdown.referrerFee
        );
    }

    function directCommission(address seller, uint256 amount) external nonReentrant whenNotPaused {
        require(seller != address(0), "Seller is zero");
        require(amount > 0, "Amount is zero");

        FeeConfig memory config = _fees[FeeType.DirectCommission];
        config.referrerFeeBps = 0;

        FeeBreakdown memory breakdown = _applyFees(_msgSender(), amount, config, address(0));

        _transfer(_msgSender(), seller, breakdown.netAmount);

        emit DirectCommission(
            _msgSender(),
            seller,
            amount,
            breakdown.netAmount,
            breakdown.platformFee,
            breakdown.creatorFee
        );
    }

    function royaltyTransfer(address recipient, uint256 amount) external nonReentrant whenNotPaused {
        require(recipient != address(0), "Recipient is zero");
        require(amount > 0, "Amount is zero");

        FeeConfig memory config = _fees[FeeType.RoyaltyTransfer];
        config.referrerFeeBps = 0;
        config.creatorFeeBps = 0;

        FeeBreakdown memory breakdown = _applyFees(_msgSender(), amount, config, address(0));

        _transfer(_msgSender(), recipient, breakdown.netAmount);

        emit RoyaltyPaid(
            _msgSender(),
            recipient,
            amount,
            breakdown.netAmount,
            breakdown.platformFee,
            breakdown.royaltyFee
        );
    }

    function superRoyaltyTransfer(
        address recipient,
        uint256 amount,
        address[] calldata payees,
        uint16[] calldata basisPoints
    ) external nonReentrant whenNotPaused {
        require(recipient != address(0), "Recipient is zero");
        require(amount > 0, "Amount is zero");
        require(payees.length == basisPoints.length, "Mismatched arrays");

        uint256 payeeTotalBps;
        for (uint256 i = 0; i < basisPoints.length; i++) {
            require(payees[i] != address(0), "Payee zero");
            payeeTotalBps += basisPoints[i];
        }
        require(payeeTotalBps <= BPS_DENOMINATOR, "Payee bps overflow");

        FeeConfig memory config = _fees[FeeType.SuperRoyaltyTransfer];
        config.referrerFeeBps = 0;

        FeeBreakdown memory breakdown = _applyFees(_msgSender(), amount, config, address(0));

        require(breakdown.referrerFee == 0, "Referrer not allowed");

        uint256 remaining = breakdown.netAmount;
        uint256[] memory payouts = new uint256[](payees.length);
        for (uint256 i = 0; i < payees.length; i++) {
            uint256 payout = (breakdown.netAmount * basisPoints[i]) / BPS_DENOMINATOR;
            if (payout > 0) {
                _transfer(_msgSender(), payees[i], payout);
                remaining -= payout;
            }
            payouts[i] = payout;
        }

        if (remaining > 0) {
            _transfer(_msgSender(), recipient, remaining);
        }

        emit SuperRoyaltyPaid(
            _msgSender(),
            recipient,
            amount,
            breakdown.netAmount,
            breakdown.platformFee,
            breakdown.royaltyFee,
            payees,
            payouts
        );
    }

    function creatorTransfer(address recipient, uint256 amount) external nonReentrant whenNotPaused {
        require(recipient != address(0), "Recipient is zero");
        require(amount > 0, "Amount is zero");

        FeeConfig memory config = _fees[FeeType.CreatorTransfer];
        config.referrerFeeBps = 0;
        config.royaltyFeeBps = 0;

        FeeBreakdown memory breakdown = _applyFees(_msgSender(), amount, config, address(0));

        _transfer(_msgSender(), recipient, breakdown.netAmount);

        emit CreatorPaid(
            _msgSender(),
            recipient,
            amount,
            breakdown.netAmount,
            breakdown.platformFee,
            breakdown.creatorFee
        );
    }

    function flashTransfer(address to, uint256 amount) external nonReentrant whenNotPaused {
        require(hasRole(FLASH_ROLE, _msgSender()), "Missing flash role");
        require(to != address(0), "Recipient is zero");
        require(amount > 0, "Amount is zero");

        FeeConfig memory config = _fees[FeeType.FlashTransfer];
        config.creatorFeeBps = 0;
        config.royaltyFeeBps = 0;
        config.referrerFeeBps = 0;

        FeeBreakdown memory breakdown = _applyFees(_msgSender(), amount, config, address(0));

        _transfer(_msgSender(), to, breakdown.netAmount);

        emit FlashTransfer(
            _msgSender(),
            to,
            amount,
            breakdown.netAmount,
            breakdown.platformFee
        );
    }

    function _applyFees(
        address sender,
        uint256 amount,
        FeeConfig memory config,
        address referrer
    ) internal returns (FeeBreakdown memory breakdown) {
        _validateFees(config);

        breakdown.platformFee = (amount * config.platformFeeBps) / BPS_DENOMINATOR;
        breakdown.creatorFee = (amount * config.creatorFeeBps) / BPS_DENOMINATOR;
        breakdown.royaltyFee = (amount * config.royaltyFeeBps) / BPS_DENOMINATOR;
        if (referrer != address(0)) {
            breakdown.referrerFee = (amount * config.referrerFeeBps) / BPS_DENOMINATOR;
        }

        uint256 totalFees =
            breakdown.platformFee + breakdown.creatorFee + breakdown.royaltyFee + breakdown.referrerFee;
        require(totalFees <= amount, "Fees exceed amount");

        breakdown.netAmount = amount - totalFees;
        require(breakdown.netAmount > 0, "Net amount zero");

        if (breakdown.platformFee > 0) {
            _transfer(sender, platformWallet, breakdown.platformFee);
        }
        if (breakdown.creatorFee > 0) {
            _transfer(sender, creatorWallet, breakdown.creatorFee);
        }
        if (breakdown.royaltyFee > 0) {
            _transfer(sender, royaltyWallet, breakdown.royaltyFee);
        }
        if (breakdown.referrerFee > 0) {
            _transfer(sender, referrer, breakdown.referrerFee);
        }
    }

    function _validateFees(FeeConfig memory config) internal pure {
        require(config.platformFeeBps <= MAX_FEE_BPS, "Platform fee too high");
        require(config.creatorFeeBps <= MAX_FEE_BPS, "Creator fee too high");
        require(config.royaltyFeeBps <= MAX_FEE_BPS, "Royalty fee too high");
        require(config.referrerFeeBps <= MAX_FEE_BPS, "Referrer fee too high");

        uint256 total = uint256(config.platformFeeBps) +
            uint256(config.creatorFeeBps) +
            uint256(config.royaltyFeeBps) +
            uint256(config.referrerFeeBps);
        require(total <= MAX_FEE_BPS, "Combined fees too high");
    }

    function _update(
        address from,
        address to,
        uint256 value
    ) internal override(ERC20) whenNotPaused {
        super._update(from, to, value);
    }
}
