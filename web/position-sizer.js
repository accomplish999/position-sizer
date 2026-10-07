"use strict";
var PositionSizer = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/browser.ts
  var browser_exports = {};
  __export(browser_exports, {
    constantProductIl: () => constantProductIl,
    feeBreakeven: () => feeBreakeven,
    hedgeRatio: () => hedgeRatio,
    impermanentLoss: () => impermanentLoss,
    lossBounds: () => lossBounds,
    priceRatiosForIl: () => priceRatiosForIl,
    sizeLp: () => sizeLp,
    sizePerp: () => sizePerp
  });

  // src/errors.ts
  var InputError = class extends Error {
    code;
    constructor(code, message) {
      super(message);
      this.name = "InputError";
      this.code = code;
    }
  };

  // src/numbers.ts
  function reqFinite(name, value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new InputError("NOT_FINITE", `${name} must be a finite number.`);
    }
    return value;
  }
  function reqPositive(name, value) {
    const n = reqFinite(name, value);
    if (!(n > 0)) {
      throw new InputError("NOT_POSITIVE", `${name} must be greater than 0.`);
    }
    return n;
  }

  // src/perp.ts
  function feeRate(name, value) {
    const n = reqFinite(name, value);
    if (n < 0 || n >= 1) {
      throw new InputError(
        "FEE_RATE",
        `${name} must be at least 0 and below 1. A bare number is a fraction of notional.`
      );
    }
    return n;
  }
  function pickFee(which, taker, maker) {
    return which === "taker" ? taker : maker;
  }
  function riskBudgetOf(accountSize, risk) {
    if (risk.mode === "percent") {
      const pct = reqFinite("risk.value", risk.value);
      if (!(pct > 0) || pct > 100) {
        throw new InputError(
          "RISK_PERCENT",
          "Risk percent must be greater than 0 and at most 100. 1 means 1 percent of the account, not 0.01."
        );
      }
      return accountSize * (pct / 100);
    }
    if (risk.mode === "fixed") {
      return reqPositive("risk.value", risk.value);
    }
    throw new InputError("RISK_MODE", 'Risk mode must be "percent" or "fixed".');
  }
  function isolatedLiquidationPrice(input) {
    const { entry, leverage, maintenanceMarginRate, closeFeeRate, entryFeeRate, entryFeeFromMargin, side } = input;
    const initial = 1 / leverage;
    const walletPerNotional = entryFeeFromMargin ? initial - entryFeeRate : initial;
    if (!(walletPerNotional > 0)) {
      throw new InputError(
        "ENTRY_FEE_EXCEEDS_MARGIN",
        "The entry fee is at least the initial margin. The position cannot be opened at this leverage."
      );
    }
    if (side === "long") {
      const denom2 = 1 - maintenanceMarginRate - closeFeeRate;
      if (!(denom2 > 0)) {
        throw new InputError("MARGIN_RATE", "Maintenance margin plus the close fee must be below 1.");
      }
      const price = entry * (1 - walletPerNotional) / denom2;
      return price > 0 ? price : 0;
    }
    const denom = 1 + maintenanceMarginRate + closeFeeRate;
    return entry * (1 + walletPerNotional) / denom;
  }
  function crossLiquidationPrice(input) {
    const { entry, qty, wallet, maintenanceMarginRate, closeFeeRate, side } = input;
    if (!(qty > 0)) {
      return side === "long" ? 0 : entry;
    }
    if (side === "long") {
      const denom2 = 1 - maintenanceMarginRate - closeFeeRate;
      if (!(denom2 > 0)) {
        throw new InputError("MARGIN_RATE", "Maintenance margin plus the close fee must be below 1.");
      }
      const price = (qty * entry - wallet) / (qty * denom2);
      return price > 0 ? price : 0;
    }
    const denom = 1 + maintenanceMarginRate + closeFeeRate;
    return (qty * entry + wallet) / (qty * denom);
  }
  function bankruptcyPrice(input) {
    const { entry, qty, wallet, side } = input;
    if (!(qty > 0)) return 0;
    if (side === "long") {
      const price = entry - wallet / qty;
      return price > 0 ? price : 0;
    }
    return entry + wallet / qty;
  }
  function beforeStop(side, liquidation, stop) {
    if (side === "long") return liquidation > stop;
    return liquidation < stop;
  }
  function distanceFromStop(side, liquidation, stop) {
    if (side === "long") return stop - liquidation;
    return liquidation - stop;
  }
  function liquidationEstimate(side, price, stop) {
    return {
      price,
      beforeStop: beforeStop(side, price, stop),
      distanceFromStop: distanceFromStop(side, price, stop)
    };
  }
  function resolveFunding(input, side) {
    const hasFlat = input.fundingRate !== void 0;
    const hasSchedule = input.fundingPer8h !== void 0 || input.holdHours !== void 0;
    if (hasFlat && hasSchedule) {
      throw new InputError("FUNDING_RATE", "Pass fundingRate, or fundingPer8h with holdHours. Not both.");
    }
    if (hasSchedule) {
      if (input.fundingPer8h === void 0 || input.holdHours === void 0) {
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
          "Funding per 8h must sit strictly between -1 and 1. It is a fraction of notional."
        );
      }
      const periods = holdHours / 8;
      const market = fundingPer8h * periods;
      const fundingRate2 = side === "long" ? market : -market;
      if (fundingRate2 <= -1 || fundingRate2 >= 1) {
        throw new InputError(
          "FUNDING_RATE",
          "Funding over the hold must sit strictly between -1 and 1. Shorten the hold or the 8h rate."
        );
      }
      return { fundingRate: fundingRate2, fundingPer8h, holdHours };
    }
    const fundingRate = input.fundingRate === void 0 ? 0 : reqFinite("fundingRate", input.fundingRate);
    if (fundingRate <= -1 || fundingRate >= 1) {
      throw new InputError(
        "FUNDING_RATE",
        "Funding rate must sit strictly between -1 and 1. It is a fraction of entry notional."
      );
    }
    return { fundingRate, fundingPer8h: null, holdHours: null };
  }
  function normalizeTargets(raw) {
    if (raw === void 0 || raw.length === 0) return [];
    const parsed = raw.map((item) => {
      if (typeof item === "number") {
        return { price: reqPositive("target", item), closePercent: null };
      }
      if (item === null || typeof item !== "object") {
        throw new InputError("TARGET", "A target is a price, or a price and a close percent.");
      }
      const price = reqPositive("target", item.price);
      if (item.closePercent === void 0) return { price, closePercent: null };
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
  function netAt(input) {
    const { side, qty, entry, price, entryFeeRate, exitFeeRate, fundingRate } = input;
    const pricePnl = side === "long" ? qty * (price - entry) : qty * (entry - price);
    const entryFee = entryFeeRate * qty * entry;
    const exitFee = exitFeeRate * qty * price;
    const funding = fundingRate * qty * entry;
    return pricePnl - entryFee - exitFee - funding;
  }
  function priceForNet(input) {
    const { side, qty, entry, entryFeeRate, exitFeeRate, fundingRate, net } = input;
    if (side === "long") {
      const perPrice2 = qty * (1 - exitFeeRate);
      if (!(perPrice2 > 0)) {
        throw new InputError("FEE_RATE", "The exit fee leaves no price sensitivity on a long.");
      }
      const fixed2 = qty * entry * (1 + entryFeeRate + fundingRate);
      return (net + fixed2) / perPrice2;
    }
    const perPrice = qty * (1 + exitFeeRate);
    const fixed = qty * entry * (1 - entryFeeRate - fundingRate);
    return (fixed - net) / perPrice;
  }
  function sizePerp(input) {
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
        "Stop and entry are the same price. There is no distance to size against."
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
        "Fees and funding make the stop a credit, not a loss. There is no positive risk to size against."
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
        "The entry fee is at least the initial margin. Lower the leverage cap or the entry fee."
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
      side
    });
    const crossPrice = crossLiquidationPrice({
      entry,
      qty,
      wallet: crossWallet,
      maintenanceMarginRate,
      closeFeeRate,
      side
    });
    const liquidationAtCap = liquidationEstimate(side, isolatedPrice, stop);
    const liquidationIfAccountBacksIt = liquidationEstimate(side, crossPrice, stop);
    const liquidation = marginMode === "isolated" ? liquidationAtCap : liquidationIfAccountBacksIt;
    const bankruptWallet = marginMode === "isolated" ? isolatedWallet : crossWallet;
    const bankrupt = bankruptcyPrice({ entry, qty, wallet: bankruptWallet, side });
    const specs = normalizeTargets(input.targets);
    const partial = specs.some((target) => target.closePercent !== null);
    const targets = specs.map((spec) => {
      const fraction = spec.closePercent === null ? 1 : spec.closePercent / 100;
      const netPnl = netAt({
        side,
        qty: qty * fraction,
        entry,
        price: spec.price,
        entryFeeRate,
        exitFeeRate,
        fundingRate
      });
      const sliceRisk = feeAdjustedRisk * fraction;
      const rMultiple = sliceRisk === 0 ? 0 : netPnl / sliceRisk;
      const priceOnlyR = side === "long" ? (spec.price - entry) / priceGap : (entry - spec.price) / priceGap;
      return { price: spec.price, closePercent: spec.closePercent, netPnl, rMultiple, priceOnlyR };
    });
    let blended = null;
    if (partial) {
      const closePercent = targets.reduce((total, target) => total + (target.closePercent ?? 0), 0);
      const netPnl = targets.reduce((total, target) => total + target.netPnl, 0);
      const closedRisk = feeAdjustedRisk * (closePercent / 100);
      blended = {
        closePercent,
        netPnl,
        rMultiple: closedRisk === 0 ? 0 : netPnl / closedRisk,
        rOnFullRisk: feeAdjustedRisk === 0 ? 0 : netPnl / feeAdjustedRisk
      };
    }
    const breakevenPrice = priceForNet({
      side,
      qty,
      entry,
      entryFeeRate,
      exitFeeRate,
      fundingRate,
      net: 0
    });
    const rList = input.rMultiples === void 0 ? [1, 2, 3] : input.rMultiples;
    const rLevels = [];
    if (qty > 0 && feeAdjustedRisk !== 0) {
      const levels = [-1, ...rList];
      const seen = /* @__PURE__ */ new Set();
      for (const r of levels) {
        const multiple = reqFinite("rMultiple", r);
        if (seen.has(multiple)) continue;
        seen.add(multiple);
        const net = multiple * feeAdjustedRisk;
        const price = priceForNet({ side, qty, entry, entryFeeRate, exitFeeRate, fundingRate, net });
        rLevels.push({ r: multiple, price, netPnl: net });
      }
    }
    const warnings = [];
    if (liquidation.beforeStop) {
      warnings.push({
        code: "LIQUIDATION_BEFORE_STOP",
        severity: "loud",
        message: marginMode === "isolated" ? "Liquidation sits before the stop. At this leverage cap the position is liquidated while the stop is still open. The stop does not cap the loss." : "Liquidation sits before the stop, even with the whole account backing the position. The stop does not cap the loss."
      });
    }
    if (marginMode === "isolated" && liquidationIfAccountBacksIt.beforeStop) {
      warnings.push({
        code: "FULL_ACCOUNT_STILL_LIQUIDATES_FIRST",
        severity: "loud",
        message: "Posting the rest of the account does not fix it. Liquidation still sits before the stop when the whole account backs the position."
      });
    }
    if (bindingConstraint === "leverage_cap") {
      warnings.push({
        code: "LEVERAGE_CAP_BINDS",
        severity: "note",
        message: "The leverage cap cut the size. Fee-adjusted risk is below the risk budget."
      });
    }
    if (budget > accountSize) {
      warnings.push({
        code: "RISK_BUDGET_ABOVE_ACCOUNT",
        severity: "note",
        message: "The risk budget is larger than the account."
      });
    }
    if (blended !== null && blended.closePercent < 100 - 1e-9) {
      warnings.push({
        code: "TARGETS_LEAVE_A_REST",
        severity: "note",
        message: "The targets close part of the size. The rest stays open and is not in the blended result."
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
      warnings
    };
  }

  // src/defi.ts
  function modelOf(model) {
    if (model !== "constant-product" && model !== "concentrated") {
      throw new InputError("MODEL", 'Model must be "constant-product" or "concentrated".');
    }
    return model;
  }
  function rangeOf(priceLower, priceUpper) {
    const lower = reqPositive("priceLower", priceLower);
    const upper = reqPositive("priceUpper", priceUpper);
    if (!(upper > lower)) {
      throw new InputError("RANGE", "priceUpper must be above priceLower.");
    }
    return { priceLower: lower, priceUpper: upper };
  }
  function constantProductIl(priceRatio) {
    const r = reqPositive("priceRatio", priceRatio);
    return 2 * Math.sqrt(r) / (1 + r) - 1;
  }
  function priceRatiosForIl(magnitude) {
    const m = reqFinite("magnitude", magnitude);
    if (!(m > 0) || m >= 1) {
      throw new InputError(
        "IL_MAGNITUDE",
        "IL magnitude must be greater than 0 and below 1. Loss never quite reaches 100 percent."
      );
    }
    const inv = 1 / (1 - m);
    const root = Math.sqrt(inv * inv - 1);
    const sHigh = inv + root;
    const sLow = inv - root;
    return { up: sHigh * sHigh, down: sLow * sLow };
  }
  function constantProductAmounts(depositQuote, priceEntry, price) {
    const deposit = reqPositive("depositQuote", depositQuote);
    const entry = reqPositive("priceEntry", priceEntry);
    const px = reqPositive("price", price);
    const base0 = deposit / (2 * entry);
    const quote0 = deposit / 2;
    const scale = Math.sqrt(entry / px);
    return {
      base: base0 * scale,
      quote: quote0 / scale
    };
  }
  function concentratedAmounts(liquidity, priceLower, priceUpper, price) {
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
      quote: L * (sp - sa)
    };
  }
  function liquidityForDeposit(depositQuote, price, priceLower, priceUpper) {
    const deposit = reqPositive("depositQuote", depositQuote);
    const px = reqPositive("price", price);
    const { priceLower: lower, priceUpper: upper } = rangeOf(priceLower, priceUpper);
    const sa = Math.sqrt(lower);
    const sb = Math.sqrt(upper);
    let perL;
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
  function snapshotConstant(depositQuote, priceEntry, price) {
    const amounts = constantProductAmounts(depositQuote, priceEntry, price);
    return {
      model: "constant-product",
      price,
      liquidity: Math.sqrt(amounts.base * amounts.quote),
      amounts,
      value: amounts.quote + amounts.base * price
    };
  }
  function snapshotConcentrated(liquidity, priceLower, priceUpper, price) {
    const amounts = concentratedAmounts(liquidity, priceLower, priceUpper, price);
    return {
      model: "concentrated",
      price,
      liquidity,
      amounts,
      value: amounts.quote + amounts.base * price
    };
  }
  function inRange(price, priceLower, priceUpper) {
    return price >= priceLower && price <= priceUpper;
  }
  function impermanentLoss(input) {
    const model = modelOf(input.model);
    const priceEntry = reqPositive("priceEntry", input.priceEntry);
    const priceNow = reqPositive("priceNow", input.priceNow);
    const depositQuote = reqPositive("depositQuote", input.depositQuote);
    if (model === "constant-product") {
      const entry2 = snapshotConstant(depositQuote, priceEntry, priceEntry);
      const now2 = snapshotConstant(depositQuote, priceEntry, priceNow);
      const holdValue2 = entry2.amounts.quote + entry2.amounts.base * priceNow;
      const ilFraction2 = holdValue2 === 0 ? 0 : now2.value / holdValue2 - 1;
      return {
        model,
        priceEntry,
        priceNow,
        priceRatio: priceNow / priceEntry,
        depositQuote,
        liquidity: entry2.liquidity,
        entry: entry2,
        now: now2,
        holdValue: holdValue2,
        ilFraction: ilFraction2,
        divergenceQuote: holdValue2 - now2.value,
        drawdownQuote: depositQuote - now2.value,
        inRange: null
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
      inRange: inRange(priceNow, priceLower, priceUpper)
    };
  }
  function lossQuoteOf(kind, scenario, capital) {
    if (kind === "il") return scenario.divergenceQuote / scenario.depositQuote * capital;
    if (kind === "drawdown") return Math.max(0, scenario.drawdownQuote / scenario.depositQuote) * capital;
    throw new InputError("LOSS_KIND", 'Loss kind must be "il" or "drawdown".');
  }
  function sizeLp(input) {
    const capital = reqPositive("capital", input.capital);
    const scenario = impermanentLoss({
      model: input.model,
      priceEntry: input.priceEntry,
      priceNow: input.priceScenario,
      depositQuote: 1,
      priceLower: input.priceLower,
      priceUpper: input.priceUpper
    });
    let maxLossQuote;
    if (input.maxLoss.mode === "percent") {
      const pct = reqFinite("maxLoss.value", input.maxLoss.value);
      if (!(pct > 0) || pct > 100) {
        throw new InputError(
          "LOSS_PERCENT",
          "Max loss percent must be greater than 0 and at most 100. 1 means 1 percent."
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
        scenario
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
      scenario
    };
  }
  function feeBreakeven(input) {
    const lossFraction = reqFinite("lossFraction", input.lossFraction);
    if (lossFraction < 0) {
      throw new InputError(
        "LOSS_FRACTION",
        "Loss fraction must be at least 0. Pass the size of the loss, not a signed IL number."
      );
    }
    const horizonDays = reqPositive("horizonDays", input.horizonDays);
    const inRangeFraction = input.inRangeFraction === void 0 ? 1 : reqFinite("inRangeFraction", input.inRangeFraction);
    if (inRangeFraction < 0 || inRangeFraction > 1) {
      throw new InputError("IN_RANGE", "In-range fraction must be from 0 to 1.");
    }
    const horizonYears = horizonDays / 365;
    const breakevenPeriodFraction = lossFraction;
    let breakevenApr;
    if (inRangeFraction === 0) {
      breakevenApr = null;
    } else {
      breakevenApr = lossFraction / (horizonYears * inRangeFraction);
    }
    let feeApr = null;
    let feeIncomeFraction = null;
    let netFraction = null;
    let covers = null;
    if (input.feeApr !== void 0) {
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
      covers
    };
  }
  function hedgeRatio(input) {
    const snap = impermanentLoss({
      model: input.model,
      priceEntry: input.priceEntry,
      priceNow: input.price,
      depositQuote: input.depositQuote,
      priceLower: input.priceLower,
      priceUpper: input.priceUpper
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
      inRange: snap.inRange
    };
  }
  function lossFractionAt(input, price) {
    const scenario = impermanentLoss({
      model: input.model,
      priceEntry: input.priceEntry,
      priceNow: price,
      depositQuote: input.depositQuote ?? 1,
      priceLower: input.priceLower,
      priceUpper: input.priceUpper
    });
    if (input.kind === "il") return Math.max(0, -scenario.ilFraction);
    if (input.kind === "drawdown") return Math.max(0, scenario.drawdownQuote / scenario.depositQuote);
    throw new InputError("LOSS_KIND", 'Loss kind must be "il" or "drawdown".');
  }
  function scanCrossing(entry, far, lossAt, target) {
    const steps = 96;
    const goingUp = far > entry;
    const start = Math.log(entry);
    const end = Math.log(far);
    let prevPrice = entry;
    let prevLoss = lossAt(entry);
    if (prevLoss >= target) return entry;
    for (let i = 1; i <= steps; i++) {
      const price = Math.exp(start + (end - start) * i / steps);
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
  function lossBounds(input) {
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
    const lossAt = (price) => lossFractionAt(input, price);
    const down = scanCrossing(entry, entry * 1e-8, lossAt, magnitude);
    const up = scanCrossing(entry, entry * 1e8, lossAt, magnitude);
    return { down, up };
  }
  return __toCommonJS(browser_exports);
})();
