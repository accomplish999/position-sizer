import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { main } from "../src/cli";
import { feeBreakeven, hedgeRatio, impermanentLoss, sizeLp } from "../src/defi";
import { sizePerp, type PerpInput } from "../src/perp";

function load(name: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), "examples", name), "utf8")) as unknown;
}

test("example files match the documented results", () => {
  const long = sizePerp(load("perp-long.json") as PerpInput);
  assert.ok(Math.abs(long.feeAdjustedRisk - 100) < 1e-9);
  assert.equal(long.liquidation.beforeStop, false);
  assert.ok(Math.abs(long.qtyBase - 100 / 5.0975) < 1e-9);

  const short = sizePerp(load("perp-short.json") as PerpInput);
  assert.equal(short.qtyBase, 10);
  assert.equal(short.liquidation.beforeStop, false);

  const warned = sizePerp(load("perp-liq-before-stop.json") as PerpInput);
  assert.equal(warned.liquidation.beforeStop, true);
  assert.ok(warned.warnings.some((warning) => warning.code === "LIQUIDATION_BEFORE_STOP"));

  const v2 = impermanentLoss(load("defi-constant-product.json") as Parameters<typeof impermanentLoss>[0]);
  assert.ok(Math.abs(v2.ilFraction + 0.2) < 1e-12);

  const v3 = impermanentLoss(load("defi-concentrated.json") as Parameters<typeof impermanentLoss>[0]);
  assert.ok(Math.abs(v3.ilFraction + 1 / 21) < 1e-12);

  const sized = sizeLp(load("defi-size.json") as Parameters<typeof sizeLp>[0]);
  assert.ok(Math.abs(sized.deployQuote - 200) < 1e-9);

  const br = feeBreakeven(load("defi-breakeven.json") as Parameters<typeof feeBreakeven>[0]);
  assert.equal(br.covers, false);

  const hedge = hedgeRatio(load("defi-hedge.json") as Parameters<typeof hedgeRatio>[0]);
  assert.ok(Math.abs(hedge.hedgeRatio - 0.5) < 1e-12);
});

test("the CLI reads an example file and stdin", () => {
  const fromFile = main(["perp", "--file", "examples/perp-long.json", "--json"]);
  assert.equal(fromFile.code, 0);
  const parsed = JSON.parse(fromFile.stdout) as { ok: boolean; result: { feeAdjustedRisk: number } };
  assert.equal(parsed.ok, true);
  assert.ok(Math.abs(parsed.result.feeAdjustedRisk - 100) < 1e-9);

  const { spawnSync } = require("node:child_process") as typeof import("node:child_process");
  const input = readFileSync(path.join(process.cwd(), "examples", "perp-liq-before-stop.json"), "utf8");
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", "src/cli.ts", "perp", "--file", "-", "--json", "--strict"],
    { input, encoding: "utf8" },
  );
  assert.equal(child.status, 3);
  const body = JSON.parse(child.stdout) as { ok: boolean; warnings: Array<{ code: string }> };
  assert.equal(body.ok, true);
  assert.ok(body.warnings.some((warning) => warning.code === "LIQUIDATION_BEFORE_STOP"));
});
