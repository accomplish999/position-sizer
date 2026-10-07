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

/** A price, or a price plus the percent of the original size to close there. */
export interface TargetInput {
  price: number;
  /** 50 means half the original size. Omit for a full-size scenario. */
  closePercent?: number;
}

export type TargetSpec = number | TargetInput;

export interface TargetResult {
  price: number;
  /**
   * Percent of the original size closed here.
   * Null when the target is a full-size scenario, not a partial close.
   */
  closePercent: number | null;
  netPnl: number;
  /** Net of this close divided by the fee-adjusted loss of the size it closes. */
  rMultiple: number;
  /** Price move divided by the stop distance. Fees ignored. */
  priceOnlyR: number;
}

export interface BlendedResult {
  /** Sum of the close percents. At most 100. */
  closePercent: number;
  netPnl: number;
  /** Closed P&L divided by the fee-adjusted loss of the closed size. */
  rMultiple: number;
  /** Closed P&L divided by the fee-adjusted loss of the whole position. */
  rOnFullRisk: number;
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
   * Do not pass this together with fundingPer8h.
   */
  fundingRate?: number;
  /**
   * Market funding rate for one 8 hour period, as a fraction of notional.
   * Positive means longs pay shorts. Pair it with holdHours.
   */
  fundingPer8h?: number;
  /** Expected hold, in hours. The cost is fundingPer8h times holdHours / 8. */
  holdHours?: number;
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
  /**
   * Bare prices are full-size scenarios. Objects with closePercent are partial closes.
   * Do not mix the two in one list.
   */
  targets?: TargetSpec[];
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
  /** Market rate per 8 hours. Null when you passed a flat fundingRate instead. */
  fundingPer8h: number | null;
  /** Hold used with fundingPer8h. Null when you passed a flat fundingRate. */
  holdHours: number | null;
  /** Full-close price where net P&L is zero after fees and funding. */
  breakevenPrice: number;
  entryFeeRate: number;
  exitFeeRate: number;
  /** Signed fraction of entry notional you pay over the hold. Positive means you pay. */
  fundingRate: number;
  maintenanceMarginRate: number;
  closeFeeRate: number;
  entryFeeFromMargin: boolean;
  targets: TargetResult[];
  /** Set when the targets are partial closes. Null for full-size scenarios. */
  blended: BlendedResult | null;
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

interface ResolvedFunding {
  /** Signed fraction of entry notional you pay. Positive means you pay. */
  fundingRate: number;
  fundingPer8h: number | null;
  holdHours: number | null;
}

function resolveFunding(input: PerpInput, side: Side): ResolvedFunding {
  const hasFlat = input.fundingRate !== undefined;
  const hasSchedule = input.fundingPer8h !== undefined || input.holdHours !== undefined;
  if (hasFlat && hasSchedule) {
    throw new InputError("FUNDING_RATE", "Pass fundingRate, or fundingPer8h with holdHours. Not both.");
  }
  if (hasSchedule) {
    if (input.fundingPer8h === undefined || input.holdHours === undefined) {
      throw new InputError("FUNDING_RATE", "Funding per 8h and hold hours are a pair.");
    }
    const fundingPer8h = reqFinite("fundingPer8h", input.fundingPer8h);
    const holdHours = reqFinite("holdHours", input.holdHours);
    if (!(holdHours > 0)) {
      throw new InputError("FUNDING_RATE", "Hold hours must be above 0.");
    }
    if (fundingPer8h <= -1 || fundingPer8h >= 1) {
      throw new InputError(
        "FUNDING_RATE",
        "Funding per 8h must sit strictly between -1 and 1. It is a fraction of notional.",
      );
    }
    const periods = holdHours / 8;
    const market = fundingPer8h * periods;
    const fundingRate = side === "long" ? market : -market;
    if (fundingRate <= -1 || fundingRate >= 1) {
      throw new InputError(
        "FUNDING_RATE",
        "Funding over the hold must sit strictly between -1 and 1. Shorten the hold or the 8h rate.",
      );
    }
    return { fundingRate, fundingPer8h, holdHours };
  }
  const fundingRate = input.fundingRate === undefined ? 0 : reqFinite("fundingRate", input.fundingRate);
  if (fundingRate <= -1 || fundingRate >= 1) {
    throw new InputError(
      "FUNDING_RATE",
      "Funding rate must sit strictly between -1 and 1. It is a fraction of entry notional.",
    );
  }
  return { fundingRate, fundingPer8h: null, holdHours: null };
}

interface NormalizedTarget {
  price: number;
  closePercent: number | null;
}

function normalizeTargets(raw: TargetSpec[] | undefined): NormalizedTarget[] {
  if (raw === undefined || raw.length === 0) return [];
  const parsed = raw.map((item) => {
    if (typeof item === "number") {
      return { price: reqPositive("target", item), closePercent: null };
    }
    if (item === null || typeof item !== "object") {
      throw new InputError("TARGET", "A target is a price, or a price and a close percent.");
    }
    const price = reqPositive("target", item.price);
    if (item.closePercent === undefined) return { price, closePercent: null };
    const closePercent = reqFinite("closePercent", item.closePercent);
    if (!(closePercent > 0) || closePercent > 100) {
      throw new InputError("TARGET_SHARE", "A close percent has to be above 0 and at most 100.");
    }
    return { price, closePercent };
  });
  const partial = parsed.some((target) => target.closePercent !== null);
  const scenario = parsed.some((target) => target.closePercent === null);
  if (partial && scenario) {
    throw new InputError("TARGET_SHARE", "Give every target a close percent, or give none. Do not mix the two.");
  }
  if (partial) {
    const sum = parsed.reduce((total, target) => total + (target.closePercent ?? 0), 0);
    if (sum > 100 + 1e-9) {
      throw new InputError("TARGET_SHARE", "Close percents add up to more than 100.");
    }
  }
  return parsed;
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

  const funding = resolveFunding(input, side);
  const fundingRate = funding.fundingRate;

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

  const specs = normalizeTargets(input.targets);
  const partial = specs.some((target) => target.closePercent !== null);
  const targets: TargetResult[] = specs.map((spec) => {
    const fraction = spec.closePercent === null ? 1 : spec.closePercent / 100;
    const netPnl = netAt({
      side,
      qty: qty * fraction,
      entry,
      price: spec.price,
      entryFeeRate,
      exitFeeRate,
      fundingRate,
    });
    const sliceRisk = feeAdjustedRisk * fraction;
    const rMultiple = sliceRisk === 0 ? 0 : netPnl / sliceRisk;
    const priceOnlyR = side === "long" ? (spec.price - entry) / priceGap : (entry - spec.price) / priceGap;
    return { price: spec.price, closePercent: spec.closePercent, netPnl, rMultiple, priceOnlyR };
  });
  let blended: BlendedResult | null = null;
  if (partial) {
    const closePercent = targets.reduce((total, target) => total + (target.closePercent ?? 0), 0);
    const netPnl = targets.reduce((total, target) => total + target.netPnl, 0);
    const closedRisk = feeAdjustedRisk * (closePercent / 100);
    blended = {
      closePercent,
      netPnl,
      rMultiple: closedRisk === 0 ? 0 : netPnl / closedRisk,
      rOnFullRisk: feeAdjustedRisk === 0 ? 0 : netPnl / feeAdjustedRisk,
    };
  }
  const breakevenPrice = priceForNet({
    side,
    qty,
    entry,
    entryFeeRate,
    exitFeeRate,
    fundingRate,
    net: 0,
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
  if (blended !== null && blended.closePercent < 100 - 1e-9) {
    warnings.push({
      code: "TARGETS_LEAVE_A_REST",
      severity: "note",
      message: "The targets close part of the size. The rest stays open and is not in the blended result.",
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
    fundingPer8h: funding.fundingPer8h,
    holdHours: funding.holdHours,
    breakevenPrice,
    entryFeeRate,
    exitFeeRate,
    fundingRate,
    maintenanceMarginRate,
    closeFeeRate,
    entryFeeFromMargin,
    targets,
    blended,
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
