import { InputError } from "./errors";
import { reqFinite, reqPositive } from "./numbers";

export type Side = "long" | "short";
export type Liquidity = "taker" | "maker";
export type MarginMode = "isolated" | "cross";
export type RiskMode = "percent" | "fixed";

export interface RiskInput {
  mode: RiskMode;
  /** Percent mode: 1 means 1 percent of the account. Fixed mode: quote currency. */
  value: number;
}

export interface Warning {
  code: string;
  severity: "loud" | "note";
  message: string;
}

export interface TargetResult {
  price: number;
  netPnl: number;
  /** Net result divided by the fee-adjusted loss at the stop. */
  rMultiple: number;
  /** Price move divided by the stop distance. Fees ignored. */
  priceOnlyR: number;
}

export interface RLevelResult {
  r: number;
  price: number;
  netPnl: number;
}

export interface PerpInput {
  accountSize: number;
  risk: RiskInput;
  entry: number;
  stop: number;
  side: Side;
  leverageCap: number;
  /** Fraction of notional. 0.0005 is 5 basis points. */
  takerFee: number;
  makerFee: number;
  entryLiquidity?: Liquidity;
  exitLiquidity?: Liquidity;
  /**
   * Signed fraction of entry notional over the hold you expect.
   * Positive means you pay. Negative means you receive.
   */
  fundingRate?: number;
  /** Fraction of mark notional. 0.005 is 0.5 percent. */
  maintenanceMarginRate: number;
  /**
   * Isolated uses initial margin at the leverage cap.
   * Cross uses the whole account as the wallet.
   */
  marginMode?: MarginMode;
  /**
   * When true, the entry fee is taken from the wallet that backs the position
   * before liquidation is estimated. Default true.
   */
  entryFeeFromMargin?: boolean;
  targets?: number[];
  /** Net R levels to solve for a price. Default 1, 2, 3. The stop is always -1. */
  rMultiples?: number[];
}

export interface LiquidationEstimate {
  price: number;
  /** True when price reaches this liquidation while the stop is still unfilled. */
  beforeStop: boolean;
  /**
   * Price distance from the stop toward safety.
   * Positive means the stop is hit first. Negative means liquidation is first.
   */
  distanceFromStop: number;
}

export interface PerpResult {
  side: Side;
  marginMode: MarginMode;
  qtyBase: number;
  qtyQuote: number;
  notional: number;
  margin: number;
  effectiveLeverage: number;
  leverageCap: number;
  entry: number;
  stop: number;
  /** The estimate for the selected margin mode. */
  liquidation: LiquidationEstimate;
  /** Isolated, with the venue leverage set to the cap and no extra margin added. */
  liquidationAtCap: LiquidationEstimate;
  /** Same position if the whole account backs it. */
  liquidationIfAccountBacksIt: LiquidationEstimate;
  /** Price where equity would hit zero, ignoring maintenance margin and the close fee. */
  bankruptcyPrice: number;
  bindingConstraint: "risk" | "leverage_cap";
  riskBudget: number;
  feeAdjustedRisk: number;
  priceRisk: number;
  entryFee: number;
  exitFeeAtStop: number;
  fundingCost: number;
  entryFeeRate: number;
  exitFeeRate: number;
  fundingRate: number;
  maintenanceMarginRate: number;
  closeFeeRate: number;
  entryFeeFromMargin: boolean;
  targets: TargetResult[];
  rLevels: RLevelResult[];
  warnings: Warning[];
}

function feeRate(name: string, value: number): number {
  const n = reqFinite(name, value);
  if (n < 0 || n >= 1) {
    throw new InputError(
      "FEE_RATE",
      `${name} must be at least 0 and below 1. A bare number is a fraction of notional.`,
    );
  }
  return n;
}

function pickFee(which: Liquidity, taker: number, maker: number): number {
  return which === "taker" ? taker : maker;
}

export function riskBudgetOf(accountSize: number, risk: RiskInput): number {
  if (risk.mode === "percent") {
    const pct = reqFinite("risk.value", risk.value);
    if (!(pct > 0) || pct > 100) {
      throw new InputError(
        "RISK_PERCENT",
        "Risk percent must be greater than 0 and at most 100. 1 means 1 percent of the account, not 0.01.",
      );
    }
    return accountSize * (pct / 100);
  }
  if (risk.mode === "fixed") {
    return reqPositive("risk.value", risk.value);
  }
  throw new InputError("RISK_MODE", 'Risk mode must be "percent" or "fixed".');
}

/**
 * Isolated linear liquidation. Wallet is initial margin at `leverage`, minus the
 * entry fee when that fee is taken from the position wallet.
 * Long equity hits maintenance plus the taker close fee at this price.
 */
export function isolatedLiquidationPrice(input: {
  entry: number;
  leverage: number;
  maintenanceMarginRate: number;
  closeFeeRate: number;
  entryFeeRate: number;
  entryFeeFromMargin: boolean;
  side: Side;
}): number {
  const { entry, leverage, maintenanceMarginRate, closeFeeRate, entryFeeRate, entryFeeFromMargin, side } = input;
  const initial = 1 / leverage;
  const walletPerNotional = entryFeeFromMargin ? initial - entryFeeRate : initial;
  if (!(walletPerNotional > 0)) {
    throw new InputError(
      "ENTRY_FEE_EXCEEDS_MARGIN",
      "The entry fee is at least the initial margin. The position cannot be opened at this leverage.",
    );
  }
  if (side === "long") {
    const denom = 1 - maintenanceMarginRate - closeFeeRate;
    if (!(denom > 0)) {
      throw new InputError("MARGIN_RATE", "Maintenance margin plus the close fee must be below 1.");
    }
    const price = (entry * (1 - walletPerNotional)) / denom;
    return price > 0 ? price : 0;
  }
  const denom = 1 + maintenanceMarginRate + closeFeeRate;
  return (entry * (1 + walletPerNotional)) / denom;
}

export function crossLiquidationPrice(input: {
  entry: number;
  qty: number;
  wallet: number;
  maintenanceMarginRate: number;
  closeFeeRate: number;
  side: Side;
}): number {
  const { entry, qty, wallet, maintenanceMarginRate, closeFeeRate, side } = input;
  if (!(qty > 0)) {
    return side === "long" ? 0 : entry;
  }
  if (side === "long") {
    const denom = 1 - maintenanceMarginRate - closeFeeRate;
    if (!(denom > 0)) {
      throw new InputError("MARGIN_RATE", "Maintenance margin plus the close fee must be below 1.");
    }
    const price = (qty * entry - wallet) / (qty * denom);
    return price > 0 ? price : 0;
  }
  const denom = 1 + maintenanceMarginRate + closeFeeRate;
  return (qty * entry + wallet) / (qty * denom);
}

export function bankruptcyPrice(input: { entry: number; qty: number; wallet: number; side: Side }): number {
  const { entry, qty, wallet, side } = input;
  if (!(qty > 0)) return 0;
  if (side === "long") {
    const price = entry - wallet / qty;
    return price > 0 ? price : 0;
  }
  return entry + wallet / qty;
}

function beforeStop(side: Side, liquidation: number, stop: number): boolean {
  if (side === "long") return liquidation > stop;
  return liquidation < stop;
}

function distanceFromStop(side: Side, liquidation: number, stop: number): number {
  if (side === "long") return stop - liquidation;
  return liquidation - stop;
}

function liquidationEstimate(side: Side, price: number, stop: number): LiquidationEstimate {
  return {
    price,
    beforeStop: beforeStop(side, price, stop),
    distanceFromStop: distanceFromStop(side, price, stop),
  };
}

function netAt(input: {
  side: Side;
  qty: number;
  entry: number;
  price: number;
  entryFeeRate: number;
  exitFeeRate: number;
  fundingRate: number;
}): number {
  const { side, qty, entry, price, entryFeeRate, exitFeeRate, fundingRate } = input;
  const pricePnl = side === "long" ? qty * (price - entry) : qty * (entry - price);
  const entryFee = entryFeeRate * qty * entry;
  const exitFee = exitFeeRate * qty * price;
  const funding = fundingRate * qty * entry;
  return pricePnl - entryFee - exitFee - funding;
}

function priceForNet(input: {
  side: Side;
  qty: number;
  entry: number;
  entryFeeRate: number;
  exitFeeRate: number;
  fundingRate: number;
  net: number;
}): number {
  const { side, qty, entry, entryFeeRate, exitFeeRate, fundingRate, net } = input;
  if (side === "long") {
    const perPrice = qty * (1 - exitFeeRate);
    if (!(perPrice > 0)) {
      throw new InputError("FEE_RATE", "The exit fee leaves no price sensitivity on a long.");
    }
    const fixed = qty * entry * (1 + entryFeeRate + fundingRate);
    return (net + fixed) / perPrice;
  }
  const perPrice = qty * (1 + exitFeeRate);
  const fixed = qty * entry * (1 - entryFeeRate - fundingRate);
  return (fixed - net) / perPrice;
}

export function sizePerp(input: PerpInput): PerpResult {
  const accountSize = reqPositive("accountSize", input.accountSize);
  const entry = reqPositive("entry", input.entry);
  const stop = reqPositive("stop", input.stop);
  const leverageCap = reqPositive("leverageCap", input.leverageCap);
  const side = input.side;
  if (side !== "long" && side !== "short") {
    throw new InputError("SIDE", 'Side must be "long" or "short".');
  }
  if (stop === entry) {
    throw new InputError(
      "ZERO_STOP_DISTANCE",
      "Stop and entry are the same price. There is no distance to size against.",
    );
  }
  if (side === "long" && stop > entry) {
    throw new InputError("STOP_ON_WRONG_SIDE", "A long stop has to sit below the entry.");
  }
  if (side === "short" && stop < entry) {
    throw new InputError("STOP_ON_WRONG_SIDE", "A short stop has to sit above the entry.");
  }

  const takerFee = feeRate("takerFee", input.takerFee);
  const makerFee = feeRate("makerFee", input.makerFee);
  const entryLiquidity = input.entryLiquidity ?? "taker";
  const exitLiquidity = input.exitLiquidity ?? "taker";
  if (entryLiquidity !== "taker" && entryLiquidity !== "maker") {
    throw new InputError("LIQUIDITY", 'Entry liquidity must be "taker" or "maker".');
  }
  if (exitLiquidity !== "taker" && exitLiquidity !== "maker") {
    throw new InputError("LIQUIDITY", 'Exit liquidity must be "taker" or "maker".');
  }
  const entryFeeRate = pickFee(entryLiquidity, takerFee, makerFee);
  const exitFeeRate = pickFee(exitLiquidity, takerFee, makerFee);
  const closeFeeRate = takerFee;

  const fundingRate = input.fundingRate === undefined ? 0 : reqFinite("fundingRate", input.fundingRate);
  if (fundingRate <= -1 || fundingRate >= 1) {
    throw new InputError(
      "FUNDING_RATE",
      "Funding rate must sit strictly between -1 and 1. It is a fraction of entry notional.",
    );
  }

  const maintenanceMarginRate = reqFinite("maintenanceMarginRate", input.maintenanceMarginRate);
  if (maintenanceMarginRate < 0 || maintenanceMarginRate >= 1) {
    throw new InputError("MARGIN_RATE", "Maintenance margin rate must be at least 0 and below 1.");
  }
  if (!(1 - maintenanceMarginRate - closeFeeRate > 0)) {
    throw new InputError("MARGIN_RATE", "Maintenance margin plus the taker close fee must be below 1.");
  }

  const marginMode = input.marginMode ?? "isolated";
  if (marginMode !== "isolated" && marginMode !== "cross") {
    throw new InputError("MARGIN_MODE", 'Margin mode must be "isolated" or "cross".');
  }
  const entryFeeFromMargin = input.entryFeeFromMargin !== false;

  const budget = riskBudgetOf(accountSize, input.risk);
  const priceGap = Math.abs(entry - stop);
  const unitLoss = priceGap + entryFeeRate * entry + exitFeeRate * stop + fundingRate * entry;
  if (!(unitLoss > 0)) {
    throw new InputError(
      "UNIT_LOSS_NOT_POSITIVE",
      "Fees and funding make the stop a credit, not a loss. There is no positive risk to size against.",
    );
  }

  const qtyFromRisk = budget / unitLoss;
  const marginRate = 1 / leverageCap;
  const openCostRate = entryFeeFromMargin ? marginRate + entryFeeRate : marginRate;
  if (!(openCostRate > 0)) {
    throw new InputError("LEVERAGE", "Leverage cap does not leave a positive margin rate.");
  }
  const maxQty = accountSize / (openCostRate * entry);
  const qty = Math.min(qtyFromRisk, maxQty);
  const bindingConstraint = qtyFromRisk > maxQty + 1e-12 ? "leverage_cap" : "risk";

  const notional = qty * entry;
  const margin = notional / leverageCap;
  const entryFee = entryFeeRate * notional;
  const exitFeeAtStop = exitFeeRate * qty * stop;
  const fundingCost = fundingRate * notional;
  const priceRisk = qty * priceGap;
  const feeAdjustedRisk = priceRisk + entryFee + exitFeeAtStop + fundingCost;

  const isolatedWallet = entryFeeFromMargin ? margin - entryFee : margin;
  if (!(isolatedWallet > 0)) {
    throw new InputError(
      "ENTRY_FEE_EXCEEDS_MARGIN",
      "The entry fee is at least the initial margin. Lower the leverage cap or the entry fee.",
    );
  }
  const crossWallet = entryFeeFromMargin ? accountSize - entryFee : accountSize;
  if (!(crossWallet > 0)) {
    throw new InputError("ENTRY_FEE_EXCEEDS_ACCOUNT", "The entry fee is at least the account.");
  }

  const isolatedPrice = isolatedLiquidationPrice({
    entry,
    leverage: leverageCap,
    maintenanceMarginRate,
    closeFeeRate,
    entryFeeRate,
    entryFeeFromMargin,
    side,
  });
  const crossPrice = crossLiquidationPrice({
    entry,
    qty,
    wallet: crossWallet,
    maintenanceMarginRate,
    closeFeeRate,
    side,
  });

  const liquidationAtCap = liquidationEstimate(side, isolatedPrice, stop);
  const liquidationIfAccountBacksIt = liquidationEstimate(side, crossPrice, stop);
  const liquidation = marginMode === "isolated" ? liquidationAtCap : liquidationIfAccountBacksIt;
  const bankruptWallet = marginMode === "isolated" ? isolatedWallet : crossWallet;
  const bankrupt = bankruptcyPrice({ entry, qty, wallet: bankruptWallet, side });

  const targets = (input.targets ?? []).map((price) => {
    const px = reqPositive("target", price);
    const netPnl = netAt({ side, qty, entry, price: px, entryFeeRate, exitFeeRate, fundingRate });
    const rMultiple = feeAdjustedRisk === 0 ? 0 : netPnl / feeAdjustedRisk;
    const priceOnlyR = side === "long" ? (px - entry) / priceGap : (entry - px) / priceGap;
    return { price: px, netPnl, rMultiple, priceOnlyR };
  });

  const rList = input.rMultiples === undefined ? [1, 2, 3] : input.rMultiples;
  const rLevels: RLevelResult[] = [];
  if (qty > 0 && feeAdjustedRisk !== 0) {
    const levels = [-1, ...rList];
    const seen = new Set<number>();
    for (const r of levels) {
      const multiple = reqFinite("rMultiple", r);
      if (seen.has(multiple)) continue;
      seen.add(multiple);
      const net = multiple * feeAdjustedRisk;
      const price = priceForNet({ side, qty, entry, entryFeeRate, exitFeeRate, fundingRate, net });
      rLevels.push({ r: multiple, price, netPnl: net });
    }
  }

  const warnings: Warning[] = [];
  if (liquidation.beforeStop) {
    warnings.push({
      code: "LIQUIDATION_BEFORE_STOP",
      severity: "loud",
      message:
        marginMode === "isolated"
          ? "Liquidation sits before the stop. At this leverage cap the position is liquidated while the stop is still open. The stop does not cap the loss."
          : "Liquidation sits before the stop, even with the whole account backing the position. The stop does not cap the loss.",
    });
  }
  if (marginMode === "isolated" && liquidationIfAccountBacksIt.beforeStop) {
    warnings.push({
      code: "FULL_ACCOUNT_STILL_LIQUIDATES_FIRST",
      severity: "loud",
      message:
        "Posting the rest of the account does not fix it. Liquidation still sits before the stop when the whole account backs the position.",
    });
  }
  if (bindingConstraint === "leverage_cap") {
    warnings.push({
      code: "LEVERAGE_CAP_BINDS",
      severity: "note",
      message: "The leverage cap cut the size. Fee-adjusted risk is below the risk budget.",
    });
  }
  if (budget > accountSize) {
    warnings.push({
      code: "RISK_BUDGET_ABOVE_ACCOUNT",
      severity: "note",
      message: "The risk budget is larger than the account.",
    });
  }

  return {
    side,
    marginMode,
    qtyBase: qty,
    qtyQuote: notional,
    notional,
    margin,
    effectiveLeverage: notional / accountSize,
    leverageCap,
    entry,
    stop,
    liquidation,
    liquidationAtCap,
    liquidationIfAccountBacksIt,
    bankruptcyPrice: bankrupt,
    bindingConstraint,
    riskBudget: budget,
    feeAdjustedRisk,
    priceRisk,
    entryFee,
    exitFeeAtStop,
    fundingCost,
    entryFeeRate,
    exitFeeRate,
    fundingRate,
    maintenanceMarginRate,
    closeFeeRate,
    entryFeeFromMargin,
    targets,
    rLevels,
    warnings,
  };
}

/** Equity at `price` for the wallet this result used. Tests use this to check the liquidation identity. */
export function equityAt(input: { side: Side; qty: number; entry: number; price: number; wallet: number }): number {
  const pricePnl =
    input.side === "long" ? input.qty * (input.price - input.entry) : input.qty * (input.entry - input.price);
  return input.wallet + pricePnl;
}

export function maintenancePlusClose(
  qty: number,
  price: number,
  maintenanceMarginRate: number,
  closeFeeRate: number,
): number {
  return qty * price * (maintenanceMarginRate + closeFeeRate);
}
