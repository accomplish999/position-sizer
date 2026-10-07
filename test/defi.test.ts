import assert from "node:assert/strict";
import { test } from "node:test";
import { InputError } from "../src/errors";
import {
  concentratedAmounts,
  constantProductIl,
  feeBreakeven,
  hedgeRatio,
  impermanentLoss,
  liquidityForDeposit,
  lossBounds,
  priceRatiosForIl,
  sizeLp,
} from "../src/defi";

function close(actual: number, expected: number, tol = 1e-9): void {
  const scale = Math.max(1, Math.abs(expected));
  assert.ok(Math.abs(actual - expected) <= tol * scale, `${actual} !== ${expected}`);
}

test("constant product IL matches the known checkpoints", () => {
  close(constantProductIl(1), 0);
  close(constantProductIl(1.25), (2 * Math.sqrt(1.25)) / 2.25 - 1);
  close(constantProductIl(1.25), -0.006192010444537789);
  close(constantProductIl(1.5), (2 * Math.sqrt(1.5)) / 2.5 - 1);
  close(constantProductIl(2), (2 * Math.sqrt(2)) / 3 - 1);
  close(constantProductIl(3), (2 * Math.sqrt(3)) / 4 - 1);
  close(constantProductIl(4), -0.2);
  close(constantProductIl(0.25), -0.2);
  close(constantProductIl(5), (2 * Math.sqrt(5)) / 6 - 1);
  close(constantProductIl(1.25), constantProductIl(1 / 1.25));
});

test("published IL percentages, to the table's rounding", () => {
  const table: Array<[number, number]> = [
    [1.25, 0.6],
    [1.5, 2.0],
    [2, 5.7],
    [3, 13.4],
    [4, 20],
    [5, 25.5],
  ];
  for (const [ratio, percent] of table) {
    const got = -constantProductIl(ratio) * 100;
    assert.ok(Math.abs(got - percent) < 0.05, `${ratio} -> ${got} vs ${percent}`);
  }
});

test("a 4x move on a 1000 deposit lags the hold by 20 percent", () => {
  const result = impermanentLoss({
    model: "constant-product",
    priceEntry: 100,
    priceNow: 400,
    depositQuote: 1000,
  });
  close(result.now.value, 2000);
  close(result.holdValue, 2500);
  close(result.ilFraction, -0.2);
  close(result.divergenceQuote, 500);
  close(result.drawdownQuote, -1000);
  close(result.now.amounts.base, 2.5);
  close(result.now.amounts.quote, 1000);
});

test("down 75 percent is the same IL and a real drawdown versus the deposit", () => {
  const result = impermanentLoss({
    model: "constant-product",
    priceEntry: 100,
    priceNow: 25,
    depositQuote: 1000,
  });
  close(result.ilFraction, -0.2);
  close(result.now.value, 500);
  close(result.drawdownQuote, 500);
});

test("20 percent IL solves to a 4x move and its inverse", () => {
  const ratios = priceRatiosForIl(0.2);
  close(ratios.up, 4);
  close(ratios.down, 0.25);
  close(constantProductIl(ratios.up), -0.2);
  close(constantProductIl(ratios.down), -0.2);
});

test("concentrated amounts at the worked range 81 to 121", () => {
  const deposit = 1000;
  const lower = 81;
  const upper = 121;
  const entry = 100;
  const L = liquidityForDeposit(deposit, entry, lower, upper);
  close(L, 11000 / 21);
  const atEntry = concentratedAmounts(L, lower, upper, entry);
  close(atEntry.base, 100 / 21);
  close(atEntry.quote, 11000 / 21);
  close(atEntry.base * entry + atEntry.quote, deposit);

  const up = impermanentLoss({
    model: "concentrated",
    priceEntry: entry,
    priceNow: upper,
    depositQuote: deposit,
    priceLower: lower,
    priceUpper: upper,
  });
  close(up.now.amounts.base, 0);
  close(up.now.value, 22000 / 21);
  close(up.holdValue, 1100);
  close(up.ilFraction, -1 / 21);
  assert.equal(up.inRange, true);

  const down = impermanentLoss({
    model: "concentrated",
    priceEntry: entry,
    priceNow: lower,
    depositQuote: deposit,
    priceLower: lower,
    priceUpper: upper,
  });
  close(down.now.amounts.quote, 0);
  close(down.now.value, 6000 / 7);
  close(down.holdValue, 19100 / 21);
  close(down.ilFraction, -11 / 191);
  close(down.drawdownQuote, deposit - 6000 / 7);
});

test("a very wide range approaches constant-product IL", () => {
  const ratio = 1.5;
  const v2 = constantProductIl(ratio);
  const v3 = impermanentLoss({
    model: "concentrated",
    priceEntry: 100,
    priceNow: 150,
    depositQuote: 10_000,
    priceLower: 100 / 1_000_000,
    priceUpper: 100 * 1_000_000,
  });
  close(v3.ilFraction, v2, 3e-5);
});

test("a tight range loses more than a full-range pool on the same move", () => {
  const full = impermanentLoss({
    model: "constant-product",
    priceEntry: 100,
    priceNow: 110,
    depositQuote: 1000,
  });
  const tight = impermanentLoss({
    model: "concentrated",
    priceEntry: 100,
    priceNow: 110,
    depositQuote: 1000,
    priceLower: 90,
    priceUpper: 110,
  });
  assert.ok(tight.ilFraction < full.ilFraction);
});

test("outside the range the position is one asset", () => {
  const above = impermanentLoss({
    model: "concentrated",
    priceEntry: 100,
    priceNow: 200,
    depositQuote: 1000,
    priceLower: 81,
    priceUpper: 121,
  });
  close(above.now.amounts.base, 0);
  assert.equal(above.inRange, false);
  const atUpper = impermanentLoss({
    model: "concentrated",
    priceEntry: 100,
    priceNow: 121,
    depositQuote: 1000,
    priceLower: 81,
    priceUpper: 121,
  });
  close(above.now.value, atUpper.now.value);

  const below = impermanentLoss({
    model: "concentrated",
    priceEntry: 100,
    priceNow: 40,
    depositQuote: 1000,
    priceLower: 81,
    priceUpper: 121,
  });
  close(below.now.amounts.quote, 0);
  const atLower = impermanentLoss({
    model: "concentrated",
    priceEntry: 100,
    priceNow: 81,
    depositQuote: 1000,
    priceLower: 81,
    priceUpper: 121,
  });
  close(below.now.amounts.base, atLower.now.amounts.base);
});

test("LP size for a max IL deploys only what the scenario allows", () => {
  const sized = sizeLp({
    model: "constant-product",
    capital: 10_000,
    maxLoss: { mode: "percent", value: 1 },
    kind: "il",
    priceEntry: 100,
    priceScenario: 400,
  });
  close(sized.scenario.ilFraction, -0.2);
  close(sized.lossFraction, 0.5);
  close(sized.maxLossQuote, 100);
  close(sized.deployQuote, 200);
  close(sized.scenarioLossQuote, 100);
  assert.equal(sized.bindingConstraint, "loss");
});

test("drawdown sizing uses the deposit loss, which is larger than IL on a selloff", () => {
  const sized = sizeLp({
    model: "constant-product",
    capital: 10_000,
    maxLoss: { mode: "fixed", value: 500 },
    kind: "drawdown",
    priceEntry: 100,
    priceScenario: 25,
  });
  close(sized.lossFraction, 0.5);
  close(sized.deployQuote, 1000);
  close(sized.scenarioLossQuote, 500);
});

test("a scenario with no drawdown leaves the capital deployable", () => {
  const sized = sizeLp({
    model: "constant-product",
    capital: 10_000,
    maxLoss: { mode: "percent", value: 5 },
    kind: "drawdown",
    priceEntry: 100,
    priceScenario: 400,
  });
  assert.equal(sized.scenarioHasNoLoss, true);
  close(sized.deployQuote, 10_000);
  assert.equal(sized.bindingConstraint, "none");
});

test("fee APR breakeven", () => {
  const year = feeBreakeven({ lossFraction: 0.2, horizonDays: 365 });
  close(year.breakevenApr ?? 0, 0.2);
  const month = feeBreakeven({ lossFraction: 0.2, horizonDays: 30, feeApr: 0.5, inRangeFraction: 0.5 });
  close(month.breakevenApr ?? 0, (0.2 * (365 / 30)) / 0.5);
  close(month.feeIncomeFraction ?? 0, 0.5 * (30 / 365) * 0.5);
  assert.equal(month.covers, (month.netFraction ?? 0) >= 0);
  const none = feeBreakeven({ lossFraction: 0.2, horizonDays: 30, inRangeFraction: 0 });
  assert.equal(none.breakevenApr, null);
});

test("v2 hedge is half the value at every price", () => {
  for (const price of [25, 100, 400]) {
    const hedge = hedgeRatio({
      model: "constant-product",
      priceEntry: 100,
      price,
      depositQuote: 1000,
    });
    close(hedge.hedgeRatio, 0.5);
    close(hedge.hedgeBase * price, hedge.lpValue / 2);
    assert.equal(hedge.side, "short");
  }
});

test("concentrated hedge matches inventory, including the range edges", () => {
  const mid = hedgeRatio({
    model: "concentrated",
    priceEntry: 100,
    price: 100,
    depositQuote: 1000,
    priceLower: 81,
    priceUpper: 121,
  });
  close(mid.hedgeBase, 100 / 21);
  close(mid.hedgeNotional, 10000 / 21);
  close(mid.hedgeRatio, 10 / 21);

  const upper = hedgeRatio({
    model: "concentrated",
    priceEntry: 100,
    price: 121,
    depositQuote: 1000,
    priceLower: 81,
    priceUpper: 121,
  });
  close(upper.hedgeBase, 0);
  close(upper.hedgeRatio, 0);

  const lower = hedgeRatio({
    model: "concentrated",
    priceEntry: 100,
    price: 81,
    depositQuote: 1000,
    priceLower: 81,
    priceUpper: 121,
  });
  close(lower.hedgeRatio, 1);
});

test("loss bounds recover the 4x constant-product move", () => {
  const bounds = lossBounds({
    model: "constant-product",
    priceEntry: 100,
    kind: "il",
    magnitude: 0.2,
  });
  assert.ok(bounds.up);
  assert.ok(bounds.down);
  close(bounds.up, 400, 1e-6);
  close(bounds.down, 25, 1e-6);
});

test("concentrated IL bound agrees with a direct evaluation", () => {
  const bounds = lossBounds({
    model: "concentrated",
    priceEntry: 100,
    priceLower: 81,
    priceUpper: 121,
    kind: "il",
    magnitude: 1 / 21,
  });
  assert.ok(bounds.up);
  close(bounds.up, 121, 1e-4);
  const check = impermanentLoss({
    model: "concentrated",
    priceEntry: 100,
    priceNow: bounds.up,
    depositQuote: 1,
    priceLower: 81,
    priceUpper: 121,
  });
  close(-check.ilFraction, 1 / 21, 1e-6);
});

test("bad pool inputs", () => {
  assert.throws(
    () =>
      impermanentLoss({
        model: "concentrated",
        priceEntry: 100,
        priceNow: 100,
        depositQuote: 1,
        priceLower: 120,
        priceUpper: 80,
      }),
    (err: unknown) => err instanceof InputError && err.code === "RANGE",
  );
  assert.throws(
    () => constantProductIl(0),
    (err: unknown) => err instanceof InputError && err.code === "NOT_POSITIVE",
  );
  assert.throws(
    () => priceRatiosForIl(1),
    (err: unknown) => err instanceof InputError && err.code === "IL_MAGNITUDE",
  );
  assert.throws(
    () => feeBreakeven({ lossFraction: -0.1, horizonDays: 10 }),
    (err: unknown) => err instanceof InputError && err.code === "LOSS_FRACTION",
  );
});
