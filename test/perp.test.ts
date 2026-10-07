import assert from "node:assert/strict";
import { test } from "node:test";
import { InputError } from "../src/errors";
import { equityAt, maintenancePlusClose, sizePerp, type PerpInput, type PerpResult } from "../src/perp";

function close(actual: number, expected: number, tol = 1e-8): void {
  const scale = Math.max(1, Math.abs(expected));
  assert.ok(Math.abs(actual - expected) <= tol * scale, `${actual} !== ${expected}`);
}

function base(overrides: Partial<PerpInput> = {}): PerpInput {
  return {
    accountSize: 10_000,
    risk: { mode: "percent", value: 1 },
    entry: 100,
    stop: 95,
    side: "long",
    leverageCap: 10,
    takerFee: 0,
    makerFee: 0,
    maintenanceMarginRate: 0.004,
    ...overrides,
  };
}

function walletOf(result: PerpResult, account: number, which: "cap" | "account"): number {
  if (which === "cap") {
    return result.entryFeeFromMargin ? result.margin - result.entryFee : result.margin;
  }
  return result.entryFeeFromMargin ? account - result.entryFee : account;
}

function assertLiquidationIdentity(result: PerpResult, account: number): void {
  for (const which of ["cap", "account"] as const) {
    const price = which === "cap" ? result.liquidationAtCap.price : result.liquidationIfAccountBacksIt.price;
    if (price === 0) continue;
    const equity = equityAt({
      side: result.side,
      qty: result.qtyBase,
      entry: result.entry,
      price,
      wallet: walletOf(result, account, which),
    });
    const threshold = maintenancePlusClose(result.qtyBase, price, result.maintenanceMarginRate, result.closeFeeRate);
    close(equity, threshold, 1e-8);
  }
}

test("no fees: size is risk over stop distance", () => {
  const result = sizePerp(base());
  close(result.riskBudget, 100);
  close(result.qtyBase, 20);
  close(result.qtyQuote, 2000);
  close(result.notional, 2000);
  close(result.margin, 200);
  close(result.effectiveLeverage, 0.2);
  close(result.feeAdjustedRisk, 100);
  close(result.priceRisk, 100);
  assert.equal(result.bindingConstraint, "risk");
  assert.equal(result.liquidation.beforeStop, false);
  // 100 * (1 - 0.1) / (1 - 0.004) = 90 / 0.996
  close(result.liquidation.price, 90 / 0.996);
  close(result.bankruptcyPrice, 90);
  assert.ok(result.liquidation.price > result.bankruptcyPrice);
  assertLiquidationIdentity(result, 10_000);
});

test("taker fees on both sides shrink the size so the loss at the stop stays 100", () => {
  const result = sizePerp(
    base({
      takerFee: 0.0005,
      makerFee: 0.0002,
      maintenanceMarginRate: 0.005,
      targets: [110],
    }),
  );
  const unit = 5 + 0.0005 * 100 + 0.0005 * 95;
  close(unit, 5.0975);
  close(result.qtyBase, 100 / unit);
  close(result.feeAdjustedRisk, 100);
  close(result.entryFee + result.exitFeeAtStop + result.priceRisk, 100);
  const stopLevel = result.rLevels.find((level) => level.r === -1);
  assert.ok(stopLevel);
  close(stopLevel.price, 95);
  const target = result.targets[0];
  assert.ok(target);
  close(target.rMultiple, target.netPnl / 100);
  assert.ok(target.rMultiple > 1.9 && target.rMultiple < 2);
  assertLiquidationIdentity(result, 10_000);
});

test("maker entry and taker exit use the two fee rates", () => {
  const result = sizePerp(
    base({
      takerFee: 0.0005,
      makerFee: 0.0002,
      entryLiquidity: "maker",
      exitLiquidity: "taker",
    }),
  );
  const unit = 5 + 0.0002 * 100 + 0.0005 * 95;
  close(result.qtyBase, 100 / unit);
  close(result.entryFeeRate, 0.0002);
  close(result.exitFeeRate, 0.0005);
  close(result.feeAdjustedRisk, 100);
});

test("positive funding is a cost and reduces size", () => {
  const result = sizePerp(base({ fundingRate: 0.0001 }));
  close(result.qtyBase, 100 / 5.01);
  close(result.fundingCost, result.qtyBase * 100 * 0.0001);
  close(result.feeAdjustedRisk, 100);
});

test("a funding credit increases size", () => {
  const paid = sizePerp(base());
  const received = sizePerp(base({ fundingRate: -0.0001 }));
  assert.ok(received.qtyBase > paid.qtyBase);
  close(received.feeAdjustedRisk, 100);
});

test("short mirrors the long distance", () => {
  const result = sizePerp(
    base({
      side: "short",
      stop: 110,
      leverageCap: 5,
      maintenanceMarginRate: 0.005,
      targets: [90],
    }),
  );
  close(result.qtyBase, 10);
  close(result.notional, 1000);
  close(result.margin, 200);
  // 100 * (1 + 0.2) / 1.005
  close(result.liquidation.price, 120 / 1.005);
  close(result.bankruptcyPrice, 120);
  assert.ok(result.liquidation.price < result.bankruptcyPrice);
  assert.equal(result.liquidation.beforeStop, false);
  assert.ok(result.liquidation.distanceFromStop > 0);
  const target = result.targets[0];
  assert.ok(target);
  close(target.priceOnlyR, 1);
  close(target.netPnl, 100);
  close(target.rMultiple, 1);
  assertLiquidationIdentity(result, 10_000);
});

test("liquidation before the stop is a loud warning", () => {
  const result = sizePerp(
    base({
      stop: 90,
      leverageCap: 20,
      maintenanceMarginRate: 0.005,
      risk: { mode: "fixed", value: 50 },
    }),
  );
  close(result.liquidation.price, 95 / 0.995);
  assert.equal(result.liquidation.beforeStop, true);
  assert.ok(result.liquidation.distanceFromStop < 0);
  assert.ok(
    result.warnings.some((warning) => warning.code === "LIQUIDATION_BEFORE_STOP" && warning.severity === "loud"),
  );
  assert.equal(
    result.warnings.some((warning) => warning.code === "FULL_ACCOUNT_STILL_LIQUIDATES_FIRST"),
    false,
  );
});

test("full account still liquidates first when the stop is past that price too", () => {
  const result = sizePerp(
    base({
      accountSize: 1_000,
      risk: { mode: "fixed", value: 1_200 },
      entry: 100,
      stop: 20,
      leverageCap: 20,
      maintenanceMarginRate: 0.005,
      takerFee: 0,
    }),
  );
  assert.equal(result.liquidation.beforeStop, true);
  assert.equal(result.liquidationIfAccountBacksIt.beforeStop, true);
  assert.ok(result.warnings.some((warning) => warning.code === "FULL_ACCOUNT_STILL_LIQUIDATES_FIRST"));
  assertLiquidationIdentity(result, 1_000);
});

test("leverage cap binds and cuts the risk below the budget", () => {
  const result = sizePerp(
    base({
      accountSize: 1_000,
      risk: { mode: "fixed", value: 1_500 },
      entry: 100,
      stop: 99,
      leverageCap: 2,
      maintenanceMarginRate: 0.01,
    }),
  );
  close(result.qtyBase, 20);
  close(result.notional, 2_000);
  close(result.margin, 1_000);
  close(result.effectiveLeverage, 2);
  close(result.feeAdjustedRisk, 20);
  close(result.riskBudget, 1_500);
  assert.equal(result.bindingConstraint, "leverage_cap");
  assert.ok(result.warnings.some((warning) => warning.code === "LEVERAGE_CAP_BINDS"));
  assert.ok(result.warnings.some((warning) => warning.code === "RISK_BUDGET_ABOVE_ACCOUNT"));
  // Isolated and cross match when the position already uses the whole account.
  close(result.liquidationAtCap.price, result.liquidationIfAccountBacksIt.price);
  assertLiquidationIdentity(result, 1_000);
});

test("fixed risk matches the same percent", () => {
  const percent = sizePerp(base({ risk: { mode: "percent", value: 2 } }));
  const fixed = sizePerp(base({ risk: { mode: "fixed", value: 200 } }));
  close(percent.qtyBase, fixed.qtyBase);
  close(percent.feeAdjustedRisk, 200);
});

test("cross liquidation uses the whole account and sits farther away", () => {
  const isolated = sizePerp(base({ marginMode: "isolated", leverageCap: 20, stop: 90, maintenanceMarginRate: 0.005 }));
  const cross = sizePerp(base({ marginMode: "cross", leverageCap: 20, stop: 90, maintenanceMarginRate: 0.005 }));
  assert.ok(cross.liquidation.price < isolated.liquidation.price);
  assert.equal(cross.liquidation.beforeStop, false);
  assert.equal(isolated.liquidation.beforeStop, true);
  close(cross.liquidationAtCap.price, isolated.liquidation.price);
  assertLiquidationIdentity(cross, 10_000);
});

test("entry fee taken from margin pulls liquidation closer", () => {
  const withFee = sizePerp(
    base({
      takerFee: 0.0005,
      maintenanceMarginRate: 0.005,
      leverageCap: 10,
    }),
  );
  const expected = (100 * (1 - 0.1 + 0.0005)) / (1 - 0.005 - 0.0005);
  close(withFee.liquidationAtCap.price, expected);
  assertLiquidationIdentity(withFee, 10_000);
});

test("entry fee left outside the position wallet uses the plain initial margin", () => {
  const result = sizePerp(
    base({
      takerFee: 0.0005,
      maintenanceMarginRate: 0.005,
      entryFeeFromMargin: false,
    }),
  );
  close(result.liquidationAtCap.price, (100 * 0.9) / (1 - 0.005 - 0.0005));
  assertLiquidationIdentity(result, 10_000);
});

test("one times leverage on a long has no liquidation above zero", () => {
  const result = sizePerp(base({ leverageCap: 1, maintenanceMarginRate: 0.005 }));
  close(result.liquidationAtCap.price, 0);
  assert.equal(result.liquidation.beforeStop, false);
});

test("R at the stop is -1 with fees and funding", () => {
  const result = sizePerp(
    base({
      side: "short",
      stop: 110,
      takerFee: 0.0005,
      fundingRate: 0.0002,
      targets: [110, 80],
    }),
  );
  const atStop = result.targets[0];
  assert.ok(atStop);
  close(atStop.rMultiple, -1);
  close(atStop.netPnl, -result.feeAdjustedRisk);
  const level = result.rLevels.find((item) => item.r === -1);
  assert.ok(level);
  close(level.price, 110);
});

test("a grid of inputs keeps the liquidation identity", () => {
  const sides = ["long", "short"] as const;
  const leverages = [2, 5, 10, 25];
  const fees = [0, 0.0004, 0.001];
  const mmrs = [0.0025, 0.005, 0.01];
  for (const side of sides) {
    for (const leverageCap of leverages) {
      for (const takerFee of fees) {
        for (const maintenanceMarginRate of mmrs) {
          const stop = side === "long" ? 80 : 120;
          const result = sizePerp(
            base({
              side,
              stop,
              leverageCap,
              takerFee,
              makerFee: takerFee / 2,
              maintenanceMarginRate,
              fundingRate: 0.0001,
              marginMode: "isolated",
            }),
          );
          assertLiquidationIdentity(result, 10_000);
          assert.ok(result.qtyBase > 0);
          close(result.feeAdjustedRisk, result.riskBudget);
        }
      }
    }
  }
});

test("bad inputs name the problem", () => {
  assert.throws(
    () => sizePerp(base({ stop: 105 })),
    (err: unknown) => err instanceof InputError && err.code === "STOP_ON_WRONG_SIDE",
  );
  assert.throws(
    () => sizePerp(base({ side: "short", stop: 90 })),
    (err: unknown) => err instanceof InputError && err.code === "STOP_ON_WRONG_SIDE",
  );
  assert.throws(
    () => sizePerp(base({ stop: 100 })),
    (err: unknown) => err instanceof InputError && err.code === "ZERO_STOP_DISTANCE",
  );
  assert.throws(
    () => sizePerp(base({ accountSize: 0 })),
    (err: unknown) => err instanceof InputError && err.code === "NOT_POSITIVE",
  );
  assert.throws(
    () => sizePerp(base({ entry: -1 })),
    (err: unknown) => err instanceof InputError && err.code === "NOT_POSITIVE",
  );
  assert.throws(
    () => sizePerp(base({ risk: { mode: "percent", value: 0 } })),
    (err: unknown) => err instanceof InputError && err.code === "RISK_PERCENT",
  );
  const tiny = sizePerp(base({ risk: { mode: "percent", value: 0.01 } }));
  close(tiny.riskBudget, 1);
  assert.throws(
    () => sizePerp(base({ takerFee: 1 })),
    (err: unknown) => err instanceof InputError && err.code === "FEE_RATE",
  );
  assert.throws(
    () => sizePerp(base({ takerFee: -0.0001 })),
    (err: unknown) => err instanceof InputError && err.code === "FEE_RATE",
  );
  assert.throws(
    () => sizePerp(base({ maintenanceMarginRate: 1 })),
    (err: unknown) => err instanceof InputError && err.code === "MARGIN_RATE",
  );
  assert.throws(
    () => sizePerp(base({ fundingRate: -0.9, stop: 99 })),
    (err: unknown) => err instanceof InputError && err.code === "UNIT_LOSS_NOT_POSITIVE",
  );
  assert.throws(
    () => sizePerp(base({ leverageCap: 500, takerFee: 0.01, maintenanceMarginRate: 0.001 })),
    (err: unknown) => err instanceof InputError && err.code === "ENTRY_FEE_EXCEEDS_MARGIN",
  );
});

test("funding per 8h times the hold is the cost, and longs pay when the rate is positive", () => {
  const result = sizePerp(base({ fundingPer8h: 0.0001, holdHours: 24 }));
  close(result.fundingRate, 0.0003);
  close(result.qtyBase, 100 / 5.03);
  close(result.fundingCost, result.qtyBase * 100 * 0.0003);
  close(result.feeAdjustedRisk, 100);
  close(result.breakevenPrice, 100.03);
  assert.equal(result.fundingPer8h, 0.0001);
  assert.equal(result.holdHours, 24);
});

test("a positive 8h rate pays a short", () => {
  const result = sizePerp(base({ side: "short", stop: 110, fundingPer8h: 0.0001, holdHours: 8 }));
  close(result.fundingRate, -0.0001);
  assert.ok(result.fundingCost < 0);
  assert.ok(result.qtyBase > 10);
  close(result.feeAdjustedRisk, 100);
});

test("flat funding and the 8h schedule cannot both be set", () => {
  assert.throws(
    () => sizePerp(base({ fundingRate: 0.0001, fundingPer8h: 0.0001, holdHours: 8 })),
    (err: unknown) => err instanceof InputError && err.code === "FUNDING_RATE",
  );
});

test("partial closes report P&L per target and a blended R", () => {
  const result = sizePerp(
    base({
      targets: [
        { price: 110, closePercent: 50 },
        { price: 120, closePercent: 50 },
      ],
    }),
  );
  close(result.qtyBase, 20);
  const first = result.targets[0];
  const second = result.targets[1];
  assert.ok(first && second && result.blended);
  close(first.netPnl, 100);
  close(first.rMultiple, 2);
  close(second.netPnl, 200);
  close(second.rMultiple, 4);
  close(result.blended.closePercent, 100);
  close(result.blended.netPnl, 300);
  close(result.blended.rMultiple, 3);
  close(result.blended.rOnFullRisk, 3);
  close(result.breakevenPrice, 100);
});

test("a partial that leaves size open blends only the closed slice", () => {
  const result = sizePerp(base({ targets: [{ price: 110, closePercent: 25 }] }));
  assert.ok(result.blended);
  close(result.targets[0]?.netPnl ?? NaN, 50);
  close(result.blended.rMultiple, 2);
  close(result.blended.rOnFullRisk, 0.5);
  assert.ok(result.warnings.some((warning) => warning.code === "TARGETS_LEAVE_A_REST"));
});

test("close percents above 100 are rejected", () => {
  assert.throws(
    () =>
      sizePerp(
        base({
          targets: [
            { price: 110, closePercent: 60 },
            { price: 120, closePercent: 50 },
          ],
        }),
      ),
    (err: unknown) => err instanceof InputError && err.code === "TARGET_SHARE",
  );
  assert.throws(
    () => sizePerp(base({ targets: [110, { price: 120, closePercent: 50 }] })),
    (err: unknown) => err instanceof InputError && err.code === "TARGET_SHARE",
  );
});
