import assert from "node:assert/strict";
import { test } from "node:test";
import { main } from "../src/cli";

test("help and version", () => {
  const help = main(["help"]);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /position-sizer/);
  assert.match(help.stdout, /--json/);
  assert.equal(help.stderr, "");
  const version = main(["--version"]);
  assert.equal(version.code, 0);
  assert.match(version.stdout, /0\.1\.0/);
});

test("perp JSON includes the loud warning and strict exits 3", () => {
  const args = [
    "perp",
    "--account",
    "10000",
    "--risk",
    "1%",
    "--entry",
    "100",
    "--stop",
    "90",
    "--side",
    "long",
    "--leverage",
    "20",
    "--taker",
    "0",
    "--maker",
    "0",
    "--mmr",
    "0.5%",
    "--json",
  ];
  const result = main(args);
  assert.equal(result.code, 0);
  const body = JSON.parse(result.stdout) as {
    ok: boolean;
    tool: string;
    warnings: Array<{ code: string; severity: string }>;
    result: { liquidation: { beforeStop: boolean }; feeAdjustedRisk: number };
  };
  assert.equal(body.ok, true);
  assert.equal(body.tool, "perp");
  assert.equal(body.result.liquidation.beforeStop, true);
  assert.ok(body.warnings.some((warning) => warning.code === "LIQUIDATION_BEFORE_STOP" && warning.severity === "loud"));
  const strict = main([...args, "--strict"]);
  assert.equal(strict.code, 3);
  assert.equal(JSON.parse(strict.stdout).ok, true);
});

test("perp text shows base and quote size", () => {
  const result = main([
    "perp",
    "--account",
    "10000",
    "--risk-percent",
    "1",
    "--entry",
    "100",
    "--stop",
    "95",
    "--side",
    "long",
    "--leverage",
    "10",
    "--taker",
    "0",
    "--maker",
    "0",
    "--mmr",
    "0.004",
    "--target",
    "110",
  ]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /position size \(base\)\s+20/);
  assert.match(result.stdout, /position size \(quote\)\s+2000/);
  assert.match(result.stdout, /110\s+2 R/);
});

test("bad stop is a JSON error with exit 1", () => {
  const result = main([
    "perp",
    "--json",
    "--account",
    "10000",
    "--risk",
    "100",
    "--entry",
    "100",
    "--stop",
    "110",
    "--side",
    "long",
    "--leverage",
    "5",
    "--taker",
    "0",
    "--maker",
    "0",
    "--mmr",
    "0.005",
  ]);
  assert.equal(result.code, 1);
  const body = JSON.parse(result.stdout) as { ok: boolean; error: { code: string } };
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "STOP_ON_WRONG_SIDE");
});

test("defi il JSON for a 4x move", () => {
  const result = main([
    "defi",
    "il",
    "--json",
    "--model",
    "constant-product",
    "--entry",
    "100",
    "--price",
    "400",
    "--deposit",
    "1000",
  ]);
  assert.equal(result.code, 0);
  const body = JSON.parse(result.stdout) as { ok: boolean; result: { ilFraction: number } };
  assert.equal(body.ok, true);
  assert.ok(Math.abs(body.result.ilFraction + 0.2) < 1e-12);
});

test("defi size, breakeven, and hedge", () => {
  const size = main([
    "defi",
    "size",
    "--json",
    "--model",
    "constant-product",
    "--capital",
    "10000",
    "--kind",
    "il",
    "--max-loss-percent",
    "1",
    "--entry",
    "100",
    "--price",
    "400",
  ]);
  assert.equal(size.code, 0);
  const sized = JSON.parse(size.stdout) as { result: { deployQuote: number } };
  assert.ok(Math.abs(sized.result.deployQuote - 200) < 1e-9);

  const br = main(["defi", "breakeven", "--json", "--loss", "20%", "--days", "365", "--fee-apr", "10%"]);
  const breakeven = JSON.parse(br.stdout) as { result: { breakevenApr: number; covers: boolean } };
  assert.ok(Math.abs(breakeven.result.breakevenApr - 0.2) < 1e-12);
  assert.equal(breakeven.result.covers, false);

  const hedge = main([
    "defi",
    "hedge",
    "--json",
    "--model",
    "constant-product",
    "--entry",
    "100",
    "--price",
    "100",
    "--deposit",
    "1000",
  ]);
  const hedged = JSON.parse(hedge.stdout) as { result: { hedgeRatio: number; hedgeBase: number } };
  assert.ok(Math.abs(hedged.result.hedgeRatio - 0.5) < 1e-12);
  assert.ok(Math.abs(hedged.result.hedgeBase - 5) < 1e-12);
});

test("unknown command", () => {
  const result = main(["nope"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /USAGE/);
});
