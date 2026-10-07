import assert from "node:assert/strict";
import { constantProductIl } from "../src/defi";
import { sizePerp } from "../src/perp";

const sized = sizePerp({
  accountSize: 10_000,
  risk: { mode: "percent", value: 1 },
  entry: 100,
  stop: 95,
  side: "long",
  leverageCap: 10,
  takerFee: 0,
  makerFee: 0,
  maintenanceMarginRate: 0.004,
});
assert.equal(sized.qtyBase, 20);
assert.equal(sized.notional, 2000);
assert.equal(sized.liquidation.beforeStop, false);

const il = constantProductIl(4);
assert.ok(Math.abs(il + 0.2) < 1e-12);

const warned = sizePerp({
  accountSize: 10_000,
  risk: { mode: "fixed", value: 100 },
  entry: 100,
  stop: 90,
  side: "long",
  leverageCap: 20,
  takerFee: 0,
  makerFee: 0,
  maintenanceMarginRate: 0.005,
});
assert.equal(warned.liquidation.beforeStop, true);
assert.ok(warned.warnings.some((warning) => warning.code === "LIQUIDATION_BEFORE_STOP"));

console.log("smoke ok");
