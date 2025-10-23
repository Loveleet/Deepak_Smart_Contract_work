// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title GAIN USDT Distributor
 * @notice Implements the 12-slot peer-to-peer plan described in the project deck.
 *
 * DISTRIBUTION
 *  - 70% Upline (1st & 3rd directs spill to sponsor's upline, others stay with sponsor)
 *  - 12% Direct (sponsor)
 *  - 15% Royalty (levels 5..11: 5%,4%,2%,1%,1%,1%,1%)
 *  - 3%  Creator (creatorWallet)
 *  - Leftovers from unfilled royalty slots go to flashWallet
 *
 * LIFECYCLE
 *  1) USDT.approve(contract, amount)
 *  2) contract.registerApproval()
 *  3) wait at least one block
 *  4) contract.slotBuy(slotId, sponsor)
 *
 * The contract is intentionally immutable: there is no pause switch, no upgrade hook,
 * and no custodial withdrawal path in order to match the decentralization guarantees
 * laid out in the plan document.
 */

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract GAINUSDTDistributor is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ===== CONSTANTS =====
    uint256 public constant BPS = 10_000;
    uint16 public constant UPLINE_BPS = 7_000; // 70%
    uint16 public constant DIRECT_BPS = 1_200; // 12%
    uint16 public constant CREATOR_BPS = 300; // 3%
    uint8 public constant MAX_SLOT = 12;

    // ===== TOKEN CONFIG =====
    IERC20 public immutable USDT;
    uint8 public immutable tokenDecimals;

    // ===== DISTRIBUTION WALLETS =====
    address public immutable creatorWallet;
    address public immutable flashWallet;

    // Royalty basis points for indexes 5..11 (others unused)
    uint16[12] public ROYALTY_BP;

    // Slot price table (index 0 unused, indexes 1..12 valid)
    uint256[] public SLOT_PRICE;

    // ===== REFERRAL DATA =====
    mapping(address => address) public referrerOf;
    mapping(address => address[]) internal childrenOf;
    mapping(address => uint8) public userSlot;
    mapping(address => mapping(uint8 => uint16)) public qualifiedDirects;
    mapping(address => mapping(address => uint8)) private directMaxSlot; // sponsor => direct => max slot achieved

    // ===== ALLOWANCE SNAPSHOT =====
    struct ApprovalRec {
        uint256 allowance;
        uint256 blockNum;
    }
    mapping(address => ApprovalRec) public registeredAllowance;

    // ===== EVENTS =====
    event ApprovalRegistered(address indexed user, uint256 allowance, uint256 blockNum);
    event SlotPurchased(address indexed buyer, address indexed sponsor, uint8 slotId, uint256 amount);
    event RoyaltyPaid(address indexed recipient, uint8 level, uint256 amount);

    // ===== ERRORS =====
    error InvalidSponsor();
    error SlotOutOfBounds();
    error AllowanceTooLow();
    error MustWaitNextBlock();
    error InsufficientBalance();

    // ===== CONSTRUCTOR =====
    constructor(address _usdt, uint8 _decimals, address _creator, address _flash) {
        require(_usdt != address(0), "USDT zero");
        require(_creator != address(0), "creator zero");
        require(_flash != address(0), "flash zero");

        USDT = IERC20(_usdt);
        tokenDecimals = _decimals;
        creatorWallet = _creator;
        flashWallet = _flash;

        // Royalty tiers per plan (indexes 5..11)
        ROYALTY_BP[5] = 500; // 5%
        ROYALTY_BP[6] = 400; // 4%
        ROYALTY_BP[7] = 200; // 2%
        ROYALTY_BP[8] = 100; // 1%
        ROYALTY_BP[9] = 100; // 1%
        ROYALTY_BP[10] = 100; // 1%
        ROYALTY_BP[11] = 100; // 1%

        // Slot ladder: 20, 25, then doubling from slot 3 onward up to slot 12
        uint256 base = 10 ** _decimals;
        SLOT_PRICE.push(0); // index 0 unused
        SLOT_PRICE.push(20 * base);
        SLOT_PRICE.push(25 * base);
        SLOT_PRICE.push(50 * base);
        SLOT_PRICE.push(100 * base);
        SLOT_PRICE.push(200 * base);
        SLOT_PRICE.push(400 * base);
        SLOT_PRICE.push(800 * base);
        SLOT_PRICE.push(1600 * base);
        SLOT_PRICE.push(3200 * base);
        SLOT_PRICE.push(6400 * base);
        SLOT_PRICE.push(12800 * base);
        SLOT_PRICE.push(25600 * base);
    }

    // ===== FLASH-PROOF STEP =====
    function registerApproval() external {
        uint256 allow = USDT.allowance(msg.sender, address(this));
        if (allow == 0) revert AllowanceTooLow();
        registeredAllowance[msg.sender] = ApprovalRec(allow, block.number);
        emit ApprovalRegistered(msg.sender, allow, block.number);
    }

    // ===== CORE PURCHASE =====
    function slotBuy(uint8 slotId, address sponsor) external nonReentrant {
        if (slotId == 0 || slotId > MAX_SLOT) revert SlotOutOfBounds();
        if (sponsor == address(0)) revert InvalidSponsor();

        address buyer = msg.sender;
        uint256 price = SLOT_PRICE[slotId];

        ApprovalRec memory rec = registeredAllowance[buyer];
        if (rec.allowance < price) revert AllowanceTooLow();
        if (rec.blockNum >= block.number) revert MustWaitNextBlock();

        if (USDT.balanceOf(buyer) < price) revert InsufficientBalance();

        USDT.safeTransferFrom(buyer, address(this), price);

        _registerReferral(buyer, sponsor, slotId);

        uint256 uplineAmt = (price * UPLINE_BPS) / BPS;
        uint256 directAmt = (price * DIRECT_BPS) / BPS;
        uint256 creatorAmt = (price * CREATOR_BPS) / BPS;

        USDT.safeTransfer(sponsor, directAmt);
        USDT.safeTransfer(creatorWallet, creatorAmt);

        address upline = _resolveUplineRecipient(sponsor);
        if (upline != address(0)) {
            USDT.safeTransfer(upline, uplineAmt);
        } else {
            USDT.safeTransfer(flashWallet, uplineAmt);
        }

        uint256 royaltyPaid = _payRoyalty(sponsor, price);
        uint256 expectedRoyalty = (price * 1500) / BPS;
        uint256 leftovers = expectedRoyalty - royaltyPaid;
        if (leftovers > 0) {
            USDT.safeTransfer(flashWallet, leftovers);
        }

        emit SlotPurchased(buyer, sponsor, slotId, price);
    }

    // ===== INTERNAL HELPERS =====
    function _registerReferral(address buyer, address sponsor, uint8 slotId) internal {
        address currentReferrer = referrerOf[buyer];
        if (currentReferrer == address(0)) {
            referrerOf[buyer] = sponsor;
            childrenOf[sponsor].push(buyer);
        } else if (currentReferrer != sponsor) {
            revert InvalidSponsor();
        }

        if (slotId > userSlot[buyer]) {
            userSlot[buyer] = slotId;
        }

        if (referrerOf[buyer] == sponsor) {
            uint8 previous = directMaxSlot[sponsor][buyer];
            if (slotId > previous) {
                for (uint8 level = previous + 1; level <= slotId; level++) {
                    qualifiedDirects[sponsor][level] += 1;
                }
                directMaxSlot[sponsor][buyer] = slotId;
            }
        }
    }

    function _resolveUplineRecipient(address sponsor) internal view returns (address) {
        uint256 pos = childrenOf[sponsor].length;
        if (pos == 1 || pos == 3) {
            return referrerOf[sponsor];
        }
        return sponsor;
    }

    function _payRoyalty(address sponsor, uint256 price) internal returns (uint256 total) {
        for (uint8 level = 5; level <= 11; level++) {
            uint16 bp = ROYALTY_BP[level];
            if (bp == 0) continue;

            uint256 share = (price * bp) / BPS;
            address walker = sponsor;
            address beneficiary = address(0);

            while (walker != address(0)) {
                if (userSlot[walker] >= level && qualifiedDirects[walker][level] >= 4) {
                    beneficiary = walker;
                    break;
                }
                walker = referrerOf[walker];
            }

            if (beneficiary != address(0)) {
                USDT.safeTransfer(beneficiary, share);
                total += share;
                emit RoyaltyPaid(beneficiary, level, share);
            }
        }

        return total;
    }
}
