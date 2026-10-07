import { InputError } from "./errors";
import { reqFinite, reqPositive } from "./numbers";

export type PoolModel = "constant-product" | "concentrated";
export type LossKind = "il" | "drawdown";

export interface TokenAmounts {
  base: number;
  quote: number;
}

export interface PoolSnapshot {
  model: PoolModel;
  price: number;
  liquidity: number;
  amounts: TokenAmounts;
  /** Quote value of the position at `price`. */
  value: number;
}

export interface IlResult {
  model: PoolModel;
  priceEntry: number;
  priceNow: number;
  priceRatio: number;
  depositQuote: number;
  liquidity: number;
  entry: PoolSnapshot;
  now: PoolSnapshot;
  /** Quote value of the entry tokens if they had been held, marked at priceNow. */
  holdValue: number;
  /** now.value / holdValue - 1. Zero when price has not moved. Negative when it has. */
  ilFraction: number;
  /** holdValue - now.value. Positive when the pool lags a hold. */
  divergenceQuote: number;
  /** depositQuote - now.value. Positive when the position is below the deposit. */
  drawdownQuote: number;
  inRange: boolean | null;
}

export interface IlInput {
  model: PoolModel;
  priceEntry: number;
  priceNow: number;
  depositQuote: number;
  priceLower?: number;
  priceUpper?: number;
}

export interface SizeLpInput {
  model: PoolModel;
  capital: number;
  /** 1 means 1 percent. Fixed is quote currency. */
  maxLoss: { mode: "percent" | "fixed"; value: number };
  kind: LossKind;
  priceEntry: number;
  priceScenario: number;
  priceLower?: number;
  priceUpper?: number;
}

export interface SizeLpResult {
  model: PoolModel;
  kind: LossKind;
  capital: number;
  maxLossQuote: number;
  /** Loss per 1 quote deposited, at the scenario. 0.05 means five percent. */
  lossFraction: number;
  deployQuote: number;
  scenarioLossQuote: number;
  unusedQuote: number;
  scenarioHasNoLoss: boolean;
  bindingConstraint: "loss" | "capital" | "none";
  scenario: IlResult;
}

export interface FeeBreakevenInput {
  /** Positive fraction of capital that fees must cover. 0.05 is 5 percent. */
  lossFraction: number;
  horizonDays: number;
  /** Expected fee APR as a fraction. 0.2 is 20 percent a year. Omit to only solve the hurdle. */
  feeApr?: number;
  /** Share of the horizon spent in range, earning fees. Default 1. */
  inRangeFraction?: number;
}

export interface FeeBreakevenResult {
  lossFraction: number;
  horizonDays: number;
  horizonYears: number;
  inRangeFraction: number;
  /** Fraction of capital the fees must earn over the horizon, before annualizing. */
  breakevenPeriodFraction: number;
  /** Null when no time is spent in range, so no finite APR covers the loss. */
  breakevenApr: number | null;
  feeApr: number | null;
  feeIncomeFraction: number | null;
  /** Fee income minus the loss fraction. Positive means fees cover the loss on this scenario. */
  netFraction: number | null;
  covers: boolean | null;
}

export interface HedgeInput {
  model: PoolModel;
  priceEntry: number;
  price: number;
  depositQuote: number;
  priceLower?: number;
  priceUpper?: number;
}

export interface HedgeResult {
  model: PoolModel;
  price: number;
  amounts: TokenAmounts;
  lpValue: number;
  /** Base units to short so the perp offsets the pool's base exposure at this price. */
  hedgeBase: number;
  hedgeNotional: number;
  /** Hedge notional divided by lp value. */
  hedgeRatio: number;
  side: "short";
  inRange: boolean | null;
}

export interface LossBoundInput {
  model: PoolModel;
  priceEntry: number;
  kind: LossKind;
  /** Positive fraction. 0.05 means 5 percent. */
  magnitude: number;
  depositQuote?: number;
  priceLower?: number;
  priceUpper?: number;
}

export interface LossBoundResult {
  down: number | null;
  up: number | null;
}

function modelOf(model: PoolModel): PoolModel {
  if (model !== "constant-product" && model !== "concentrated") {
    throw new InputError("MODEL", 'Model must be "constant-product" or "concentrated".');
  }
  return model;
}

function rangeOf(
  priceLower: number | undefined,
  priceUpper: number | undefined,
): { priceLower: number; priceUpper: number } {
  const lower = reqPositive("priceLower", priceLower);
  const upper = reqPositive("priceUpper", priceUpper);
  if (!(upper > lower)) {
    throw new InputError("RANGE", "priceUpper must be above priceLower.");
  }
  return { priceLower: lower, priceUpper: upper };
}

/** 2*sqrt(r)/(1+r) - 1. Zero at r = 1. */
export function constantProductIl(priceRatio: number): number {
  const r = reqPositive("priceRatio", priceRatio);
  return (2 * Math.sqrt(r)) / (1 + r) - 1;
}

/**
 * Price ratios that produce a given impermanent-loss magnitude on a constant-product pool.
 * Magnitude 0.2 returns 4 and 0.25.
 */
export function priceRatiosForIl(magnitude: number): { up: number; down: number } {
  const m = reqFinite("magnitude", magnitude);
  if (!(m > 0) || m >= 1) {
    throw new InputError(
      "IL_MAGNITUDE",
      "IL magnitude must be greater than 0 and below 1. Loss never quite reaches 100 percent.",
    );
  }
  const inv = 1 / (1 - m);
  const root = Math.sqrt(inv * inv - 1);
  const sHigh = inv + root;
  const sLow = inv - root;
  return { up: sHigh * sHigh, down: sLow * sLow };
}

export function constantProductAmounts(depositQuote: number, priceEntry: number, price: number): TokenAmounts {
  const deposit = reqPositive("depositQuote", depositQuote);
  const entry = reqPositive("priceEntry", priceEntry);
  const px = reqPositive("price", price);
  const base0 = deposit / (2 * entry);
  const quote0 = deposit / 2;
  const scale = Math.sqrt(entry / px);
  return {
    base: base0 * scale,
    quote: quote0 / scale,
  };
}

export function concentratedAmounts(
  liquidity: number,
  priceLower: number,
  priceUpper: number,
  price: number,
): TokenAmounts {
  const L = reqFinite("liquidity", liquidity);
  if (L < 0) {
    throw new InputError("LIQUIDITY", "Liquidity must be at least 0.");
  }
  const { priceLower: lower, priceUpper: upper } = rangeOf(priceLower, priceUpper);
  const px = reqPositive("price", price);
  const sa = Math.sqrt(lower);
  const sb = Math.sqrt(upper);
  if (px <= lower) {
    return { base: L * (1 / sa - 1 / sb), quote: 0 };
  }
  if (px >= upper) {
    return { base: 0, quote: L * (sb - sa) };
  }
  const sp = Math.sqrt(px);
  return {
    base: L * (1 / sp - 1 / sb),
    quote: L * (sp - sa),
  };
}

export function liquidityForDeposit(
  depositQuote: number,
  price: number,
  priceLower: number,
  priceUpper: number,
): number {
  const deposit = reqPositive("depositQuote", depositQuote);
  const px = reqPositive("price", price);
  const { priceLower: lower, priceUpper: upper } = rangeOf(priceLower, priceUpper);
  const sa = Math.sqrt(lower);
  const sb = Math.sqrt(upper);
  let perL: number;
  if (px <= lower) {
    perL = (1 / sa - 1 / sb) * px;
  } else if (px >= upper) {
    perL = sb - sa;
  } else {
    const sp = Math.sqrt(px);
    perL = 2 * sp - sa - px / sb;
  }
  if (!(perL > 0)) {
    throw new InputError("RANGE", "That range does not turn a deposit into liquidity at this price.");
  }
  return deposit / perL;
}

function snapshotConstant(depositQuote: number, priceEntry: number, price: number): PoolSnapshot {
  const amounts = constantProductAmounts(depositQuote, priceEntry, price);
  return {
    model: "constant-product",
    price,
    liquidity: Math.sqrt(amounts.base * amounts.quote),
    amounts,
    value: amounts.quote + amounts.base * price,
  };
}

function snapshotConcentrated(liquidity: number, priceLower: number, priceUpper: number, price: number): PoolSnapshot {
  const amounts = concentratedAmounts(liquidity, priceLower, priceUpper, price);
  return {
    model: "concentrated",
    price,
    liquidity,
    amounts,
    value: amounts.quote + amounts.base * price,
  };
}

export function inRange(price: number, priceLower: number, priceUpper: number): boolean {
  return price >= priceLower && price <= priceUpper;
}

export function impermanentLoss(input: IlInput): IlResult {
  const model = modelOf(input.model);
  const priceEntry = reqPositive("priceEntry", input.priceEntry);
  const priceNow = reqPositive("priceNow", input.priceNow);
  const depositQuote = reqPositive("depositQuote", input.depositQuote);

  if (model === "constant-product") {
    const entry = snapshotConstant(depositQuote, priceEntry, priceEntry);
    const now = snapshotConstant(depositQuote, priceEntry, priceNow);
    const holdValue = entry.amounts.quote + entry.amounts.base * priceNow;
    const ilFraction = holdValue === 0 ? 0 : now.value / holdValue - 1;
    return {
      model,
      priceEntry,
      priceNow,
      priceRatio: priceNow / priceEntry,
      depositQuote,
      liquidity: entry.liquidity,
      entry,
      now,
      holdValue,
      ilFraction,
      divergenceQuote: holdValue - now.value,
      drawdownQuote: depositQuote - now.value,
      inRange: null,
    };
  }

  const { priceLower, priceUpper } = rangeOf(input.priceLower, input.priceUpper);
  const liquidity = liquidityForDeposit(depositQuote, priceEntry, priceLower, priceUpper);
  const entry = snapshotConcentrated(liquidity, priceLower, priceUpper, priceEntry);
  const now = snapshotConcentrated(liquidity, priceLower, priceUpper, priceNow);
  const holdValue = entry.amounts.quote + entry.amounts.base * priceNow;
  const ilFraction = holdValue === 0 ? 0 : now.value / holdValue - 1;
  return {
    model,
    priceEntry,
    priceNow,
    priceRatio: priceNow / priceEntry,
    depositQuote,
    liquidity,
    entry,
    now,
    holdValue,
    ilFraction,
    divergenceQuote: holdValue - now.value,
    drawdownQuote: depositQuote - now.value,
    inRange: inRange(priceNow, priceLower, priceUpper),
  };
}

function lossQuoteOf(kind: LossKind, scenario: IlResult, capital: number): number {
  if (kind === "il") return (scenario.divergenceQuote / scenario.depositQuote) * capital;
  if (kind === "drawdown") return Math.max(0, scenario.drawdownQuote / scenario.depositQuote) * capital;
  throw new InputError("LOSS_KIND", 'Loss kind must be "il" or "drawdown".');
}

export function sizeLp(input: SizeLpInput): SizeLpResult {
  const capital = reqPositive("capital", input.capital);
  const scenario = impermanentLoss({
    model: input.model,
    priceEntry: input.priceEntry,
    priceNow: input.priceScenario,
    depositQuote: 1,
    priceLower: input.priceLower,
    priceUpper: input.priceUpper,
  });
  let maxLossQuote: number;
  if (input.maxLoss.mode === "percent") {
    const pct = reqFinite("maxLoss.value", input.maxLoss.value);
    if (!(pct > 0) || pct > 100) {
      throw new InputError(
        "LOSS_PERCENT",
        "Max loss percent must be greater than 0 and at most 100. 1 means 1 percent.",
      );
    }
    maxLossQuote = capital * (pct / 100);
  } else if (input.maxLoss.mode === "fixed") {
    maxLossQuote = reqPositive("maxLoss.value", input.maxLoss.value);
  } else {
    throw new InputError("LOSS_MODE", 'Max loss mode must be "percent" or "fixed".');
  }

  const unit = lossQuoteOf(input.kind, scenario, 1);
  if (!(unit > 0)) {
    return {
      model: scenario.model,
      kind: input.kind,
      capital,
      maxLossQuote,
      lossFraction: 0,
      deployQuote: capital,
      scenarioLossQuote: 0,
      unusedQuote: 0,
      scenarioHasNoLoss: true,
      bindingConstraint: "none",
      scenario,
    };
  }
  const byLoss = maxLossQuote / unit;
  const deployQuote = Math.min(capital, byLoss);
  return {
    model: scenario.model,
    kind: input.kind,
    capital,
    maxLossQuote,
    lossFraction: unit,
    deployQuote,
    scenarioLossQuote: deployQuote * unit,
    unusedQuote: capital - deployQuote,
    scenarioHasNoLoss: false,
    bindingConstraint: byLoss < capital ? "loss" : "capital",
    scenario,
  };
}

export function feeBreakeven(input: FeeBreakevenInput): FeeBreakevenResult {
  const lossFraction = reqFinite("lossFraction", input.lossFraction);
  if (lossFraction < 0) {
    throw new InputError(
      "LOSS_FRACTION",
      "Loss fraction must be at least 0. Pass the size of the loss, not a signed IL number.",
    );
  }
  const horizonDays = reqPositive("horizonDays", input.horizonDays);
  const inRangeFraction = input.inRangeFraction === undefined ? 1 : reqFinite("inRangeFraction", input.inRangeFraction);
  if (inRangeFraction < 0 || inRangeFraction > 1) {
    throw new InputError("IN_RANGE", "In-range fraction must be from 0 to 1.");
  }
  const horizonYears = horizonDays / 365;
  const breakevenPeriodFraction = lossFraction;
  let breakevenApr: number | null;
  if (inRangeFraction === 0) {
    breakevenApr = null;
  } else {
    breakevenApr = lossFraction / (horizonYears * inRangeFraction);
  }
  let feeApr: number | null = null;
  let feeIncomeFraction: number | null = null;
  let netFraction: number | null = null;
  let covers: boolean | null = null;
  if (input.feeApr !== undefined) {
    feeApr = reqFinite("feeApr", input.feeApr);
    if (feeApr < 0) {
      throw new InputError("FEE_APR", "Fee APR must be at least 0. 0.2 means 20 percent a year.");
    }
    feeIncomeFraction = feeApr * horizonYears * inRangeFraction;
    netFraction = feeIncomeFraction - lossFraction;
    covers = netFraction >= 0;
  }
  return {
    lossFraction,
    horizonDays,
    horizonYears,
    inRangeFraction,
    breakevenPeriodFraction,
    breakevenApr,
    feeApr,
    feeIncomeFraction,
    netFraction,
    covers,
  };
}

export function hedgeRatio(input: HedgeInput): HedgeResult {
  const snap = impermanentLoss({
    model: input.model,
    priceEntry: input.priceEntry,
    priceNow: input.price,
    depositQuote: input.depositQuote,
    priceLower: input.priceLower,
    priceUpper: input.priceUpper,
  });
  const hedgeBase = snap.now.amounts.base;
  const hedgeNotional = hedgeBase * snap.priceNow;
  return {
    model: snap.model,
    price: snap.priceNow,
    amounts: snap.now.amounts,
    lpValue: snap.now.value,
    hedgeBase,
    hedgeNotional,
    hedgeRatio: snap.now.value === 0 ? 0 : hedgeNotional / snap.now.value,
    side: "short",
    inRange: snap.inRange,
  };
}

function lossFractionAt(input: LossBoundInput, price: number): number {
  const scenario = impermanentLoss({
    model: input.model,
    priceEntry: input.priceEntry,
    priceNow: price,
    depositQuote: input.depositQuote ?? 1,
    priceLower: input.priceLower,
    priceUpper: input.priceUpper,
  });
  if (input.kind === "il") return Math.max(0, -scenario.ilFraction);
  if (input.kind === "drawdown") return Math.max(0, scenario.drawdownQuote / scenario.depositQuote);
  throw new InputError("LOSS_KIND", 'Loss kind must be "il" or "drawdown".');
}

function scanCrossing(entry: number, far: number, lossAt: (price: number) => number, target: number): number | null {
  const steps = 96;
  const goingUp = far > entry;
  const start = Math.log(entry);
  const end = Math.log(far);
  let prevPrice = entry;
  let prevLoss = lossAt(entry);
  if (prevLoss >= target) return entry;
  for (let i = 1; i <= steps; i++) {
    const price = Math.exp(start + ((end - start) * i) / steps);
    const loss = lossAt(price);
    if (prevLoss < target && loss >= target) {
      let lo = Math.min(prevPrice, price);
      let hi = Math.max(prevPrice, price);
      for (let k = 0; k < 60; k++) {
        const mid = Math.sqrt(lo * hi);
        if (lossAt(mid) >= target) {
          if (goingUp) hi = mid;
          else lo = mid;
        } else if (goingUp) lo = mid;
        else hi = mid;
      }
      return goingUp ? hi : lo;
    }
    prevPrice = price;
    prevLoss = loss;
  }
  return null;
}

export function lossBounds(input: LossBoundInput): LossBoundResult {
  modelOf(input.model);
  const entry = reqPositive("priceEntry", input.priceEntry);
  const magnitude = reqFinite("magnitude", input.magnitude);
  if (!(magnitude > 0)) {
    throw new InputError("LOSS_MAGNITUDE", "Magnitude must be greater than 0.");
  }
  if (input.kind !== "il" && input.kind !== "drawdown") {
    throw new InputError("LOSS_KIND", 'Loss kind must be "il" or "drawdown".');
  }
  if (input.model === "concentrated") {
    rangeOf(input.priceLower, input.priceUpper);
  }
  const lossAt = (price: number) => lossFractionAt(input, price);
  const down = scanCrossing(entry, entry * 1e-8, lossAt, magnitude);
  const up = scanCrossing(entry, entry * 1e8, lossAt, magnitude);
  return { down, up };
}
