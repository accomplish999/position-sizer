#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { InputError, isInputError } from "./errors";
import {
  feeBreakeven,
  hedgeRatio,
  impermanentLoss,
  lossBounds,
  sizeLp,
  type FeeBreakevenInput,
  type HedgeInput,
  type IlInput,
  type LossBoundInput,
  type LossKind,
  type PoolModel,
  type SizeLpInput,
} from "./defi";
import { formatBounds, formatBreakeven, formatHedge, formatIl, formatPerp, formatSize } from "./format";
import { parseFraction } from "./numbers";
import { sizePerp, type Liquidity, type MarginMode, type PerpInput, type Side } from "./perp";
import { VERSION } from "./version";

interface Flags {
  json: boolean;
  strict: boolean;
  file?: string;
  positionals: string[];
  map: Map<string, string[]>;
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function parseArgv(argv: string[]): Flags {
  const map = new Map<string, string[]>();
  const positionals: string[] = [];
  let json = false;
  let strict = false;
  let file: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === undefined) continue;
    if (token === "--json") {
      json = true;
      continue;
    }
    if (token === "--strict") {
      strict = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      positionals.push("help");
      continue;
    }
    if (token === "--version" || token === "-v") {
      positionals.push("version");
      continue;
    }
    if (token === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (token.startsWith("--")) {
      const body = token.slice(2);
      const eq = body.indexOf("=");
      let key: string;
      let value: string | undefined;
      if (eq >= 0) {
        key = body.slice(0, eq);
        value = body.slice(eq + 1);
      } else {
        key = body;
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          value = next;
          i++;
        }
      }
      if (key === "file") {
        file = value ?? "";
        continue;
      }
      const list = map.get(key) ?? [];
      if (value !== undefined) list.push(value);
      else list.push("true");
      map.set(key, list);
      continue;
    }
    positionals.push(token);
  }
  return { json, strict, file, positionals, map };
}

function flag(flags: Flags, key: string): string | undefined {
  const list = flags.map.get(key);
  if (!list || list.length === 0) return undefined;
  return list[list.length - 1];
}

function flagList(flags: Flags, key: string): string[] {
  return flags.map.get(key) ?? [];
}

function requireFlag(flags: Flags, key: string): string {
  const value = flag(flags, key);
  if (value === undefined) {
    throw new InputError("MISSING", `Missing --${key}.`);
  }
  return value;
}

function readInput(file: string | undefined): unknown {
  if (file === undefined) return undefined;
  if (file === "") {
    throw new InputError("MISSING", "Missing a path after --file. Use --file - to read stdin.");
  }
  const raw = file === "-" ? readFileSync(0, "utf8") : readFileSync(file, "utf8");
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new InputError("INVALID_JSON", "The input file is not valid JSON.");
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new InputError("INVALID_INPUT", `${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function numField(obj: Record<string, unknown>, key: string, fallback?: number): number {
  const value = obj[key];
  if (value === undefined) {
    if (fallback !== undefined) return fallback;
    throw new InputError("MISSING", `Missing ${key}.`);
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InputError("NOT_FINITE", `${key} must be a finite number.`);
  }
  return value;
}

function strField(obj: Record<string, unknown>, key: string, fallback?: string): string {
  const value = obj[key];
  if (value === undefined) {
    if (fallback !== undefined) return fallback;
    throw new InputError("MISSING", `Missing ${key}.`);
  }
  if (typeof value !== "string") {
    throw new InputError("INVALID_INPUT", `${key} must be a string.`);
  }
  return value;
}

function boolField(obj: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = obj[key];
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    throw new InputError("INVALID_INPUT", `${key} must be true or false.`);
  }
  return value;
}

function numberList(value: unknown, key: string): number[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new InputError("INVALID_INPUT", `${key} must be an array of numbers.`);
  }
  return value.map((item, index) => {
    if (typeof item !== "number" || !Number.isFinite(item)) {
      throw new InputError("NOT_FINITE", `${key}[${index}] must be a finite number.`);
    }
    return item;
  });
}

function parseRisk(raw: string): PerpInput["risk"] {
  const text = raw.trim();
  if (text.endsWith("%")) {
    const value = Number(text.slice(0, -1).trim());
    if (!Number.isFinite(value)) {
      throw new InputError("NOT_FINITE", "Risk percent must be a finite number.");
    }
    return { mode: "percent", value };
  }
  const value = Number(text);
  if (!Number.isFinite(value)) {
    throw new InputError("NOT_FINITE", "Fixed risk must be a finite number.");
  }
  return { mode: "fixed", value };
}

function liquidityOf(raw: string | undefined, label: string): Liquidity | undefined {
  if (raw === undefined) return undefined;
  if (raw !== "taker" && raw !== "maker") {
    throw new InputError("LIQUIDITY", `${label} must be taker or maker.`);
  }
  return raw;
}

function sideOf(raw: string): Side {
  if (raw !== "long" && raw !== "short") {
    throw new InputError("SIDE", 'Side must be "long" or "short".');
  }
  return raw;
}

function marginModeOf(raw: string | undefined): MarginMode | undefined {
  if (raw === undefined) return undefined;
  if (raw !== "isolated" && raw !== "cross") {
    throw new InputError("MARGIN_MODE", 'Margin mode must be "isolated" or "cross".');
  }
  return raw;
}

function modelOf(raw: string): PoolModel {
  if (raw !== "constant-product" && raw !== "concentrated") {
    throw new InputError("MODEL", 'Model must be "constant-product" or "concentrated".');
  }
  return raw;
}

function lossKindOf(raw: string): LossKind {
  if (raw !== "il" && raw !== "drawdown") {
    throw new InputError("LOSS_KIND", 'Loss kind must be "il" or "drawdown".');
  }
  return raw;
}

function perpFromJson(value: unknown): PerpInput {
  const obj = asRecord(value, "Perp input");
  const riskObj = asRecord(obj.risk, "risk");
  const mode = strField(riskObj, "mode");
  if (mode !== "percent" && mode !== "fixed") {
    throw new InputError("RISK_MODE", 'Risk mode must be "percent" or "fixed".');
  }
  const targets = numberList(obj.targets, "targets");
  const rMultiples = numberList(obj.rMultiples, "rMultiples");
  const input: PerpInput = {
    accountSize: numField(obj, "accountSize"),
    risk: { mode, value: numField(riskObj, "value") },
    entry: numField(obj, "entry"),
    stop: numField(obj, "stop"),
    side: sideOf(strField(obj, "side")),
    leverageCap: numField(obj, "leverageCap"),
    takerFee: numField(obj, "takerFee"),
    makerFee: numField(obj, "makerFee"),
    maintenanceMarginRate: numField(obj, "maintenanceMarginRate"),
  };
  if (obj.entryLiquidity !== undefined)
    input.entryLiquidity = liquidityOf(strField(obj, "entryLiquidity"), "entryLiquidity");
  if (obj.exitLiquidity !== undefined)
    input.exitLiquidity = liquidityOf(strField(obj, "exitLiquidity"), "exitLiquidity");
  if (obj.fundingRate !== undefined) input.fundingRate = numField(obj, "fundingRate");
  if (obj.marginMode !== undefined) input.marginMode = marginModeOf(strField(obj, "marginMode"));
  if (obj.entryFeeFromMargin !== undefined) input.entryFeeFromMargin = boolField(obj, "entryFeeFromMargin", true);
  if (targets !== undefined) input.targets = targets;
  if (rMultiples !== undefined) input.rMultiples = rMultiples;
  return input;
}

function perpFromFlags(flags: Flags): PerpInput {
  const riskRaw = flag(flags, "risk");
  const riskPercent = flag(flags, "risk-percent");
  const riskFixed = flag(flags, "risk-fixed");
  let risk: PerpInput["risk"];
  const set = [riskRaw, riskPercent, riskFixed].filter((item) => item !== undefined).length;
  if (set !== 1) {
    throw new InputError("RISK_MODE", "Pass one of --risk, --risk-percent, or --risk-fixed.");
  }
  if (riskPercent !== undefined) risk = { mode: "percent", value: Number(riskPercent) };
  else if (riskFixed !== undefined) risk = { mode: "fixed", value: Number(riskFixed) };
  else risk = parseRisk(riskRaw ?? "");
  if (risk.mode === "percent" && !Number.isFinite(risk.value)) {
    throw new InputError("NOT_FINITE", "Risk percent must be a finite number.");
  }
  const targets = flagList(flags, "target").map((item) => Number(item));
  const rMultiples = flagList(flags, "r").map((item) => Number(item));
  const input: PerpInput = {
    accountSize: Number(requireFlag(flags, "account")),
    risk,
    entry: Number(requireFlag(flags, "entry")),
    stop: Number(requireFlag(flags, "stop")),
    side: sideOf(requireFlag(flags, "side")),
    leverageCap: Number(requireFlag(flags, "leverage")),
    takerFee: parseFraction("taker", requireFlag(flags, "taker")),
    makerFee: parseFraction("maker", requireFlag(flags, "maker")),
    maintenanceMarginRate: parseFraction("mmr", requireFlag(flags, "mmr")),
  };
  const entryLiquidity = liquidityOf(flag(flags, "entry-liquidity"), "entry liquidity");
  const exitLiquidity = liquidityOf(flag(flags, "exit-liquidity"), "exit liquidity");
  if (entryLiquidity) input.entryLiquidity = entryLiquidity;
  if (exitLiquidity) input.exitLiquidity = exitLiquidity;
  const funding = flag(flags, "funding");
  if (funding !== undefined) input.fundingRate = parseFraction("funding", funding);
  const marginMode = marginModeOf(flag(flags, "margin"));
  if (marginMode) input.marginMode = marginMode;
  const feeFrom = flag(flags, "entry-fee-from-margin");
  if (feeFrom !== undefined) input.entryFeeFromMargin = feeFrom !== "false";
  if (targets.length > 0) input.targets = targets;
  if (rMultiples.length > 0) input.rMultiples = rMultiples;
  return input;
}

function ilFromJson(value: unknown): IlInput {
  const obj = asRecord(value, "IL input");
  const input: IlInput = {
    model: modelOf(strField(obj, "model")),
    priceEntry: numField(obj, "priceEntry"),
    priceNow: numField(obj, "priceNow"),
    depositQuote: numField(obj, "depositQuote"),
  };
  if (obj.priceLower !== undefined) input.priceLower = numField(obj, "priceLower");
  if (obj.priceUpper !== undefined) input.priceUpper = numField(obj, "priceUpper");
  return input;
}

function ilFromFlags(flags: Flags): IlInput {
  const input: IlInput = {
    model: modelOf(requireFlag(flags, "model")),
    priceEntry: Number(requireFlag(flags, "entry")),
    priceNow: Number(requireFlag(flags, "price")),
    depositQuote: Number(requireFlag(flags, "deposit")),
  };
  const lower = flag(flags, "lower");
  const upper = flag(flags, "upper");
  if (lower !== undefined) input.priceLower = Number(lower);
  if (upper !== undefined) input.priceUpper = Number(upper);
  return input;
}

function sizeFromJson(value: unknown): SizeLpInput {
  const obj = asRecord(value, "Size input");
  const maxLoss = asRecord(obj.maxLoss, "maxLoss");
  const mode = strField(maxLoss, "mode");
  if (mode !== "percent" && mode !== "fixed") {
    throw new InputError("LOSS_MODE", 'Max loss mode must be "percent" or "fixed".');
  }
  const input: SizeLpInput = {
    model: modelOf(strField(obj, "model")),
    capital: numField(obj, "capital"),
    maxLoss: { mode, value: numField(maxLoss, "value") },
    kind: lossKindOf(strField(obj, "kind")),
    priceEntry: numField(obj, "priceEntry"),
    priceScenario: numField(obj, "priceScenario"),
  };
  if (obj.priceLower !== undefined) input.priceLower = numField(obj, "priceLower");
  if (obj.priceUpper !== undefined) input.priceUpper = numField(obj, "priceUpper");
  return input;
}

function sizeFromFlags(flags: Flags): SizeLpInput {
  const percent = flag(flags, "max-loss-percent");
  const fixed = flag(flags, "max-loss");
  if ((percent === undefined) === (fixed === undefined)) {
    throw new InputError("LOSS_MODE", "Pass one of --max-loss-percent or --max-loss.");
  }
  const input: SizeLpInput = {
    model: modelOf(requireFlag(flags, "model")),
    capital: Number(requireFlag(flags, "capital")),
    maxLoss:
      percent !== undefined ? { mode: "percent", value: Number(percent) } : { mode: "fixed", value: Number(fixed) },
    kind: lossKindOf(requireFlag(flags, "kind")),
    priceEntry: Number(requireFlag(flags, "entry")),
    priceScenario: Number(requireFlag(flags, "price")),
  };
  const lower = flag(flags, "lower");
  const upper = flag(flags, "upper");
  if (lower !== undefined) input.priceLower = Number(lower);
  if (upper !== undefined) input.priceUpper = Number(upper);
  return input;
}

function breakevenFromJson(value: unknown): FeeBreakevenInput {
  const obj = asRecord(value, "Breakeven input");
  const input: FeeBreakevenInput = {
    lossFraction: numField(obj, "lossFraction"),
    horizonDays: numField(obj, "horizonDays"),
  };
  if (obj.feeApr !== undefined) input.feeApr = numField(obj, "feeApr");
  if (obj.inRangeFraction !== undefined) input.inRangeFraction = numField(obj, "inRangeFraction");
  return input;
}

function breakevenFromFlags(flags: Flags): FeeBreakevenInput {
  const input: FeeBreakevenInput = {
    lossFraction: parseFraction("loss", requireFlag(flags, "loss")),
    horizonDays: Number(requireFlag(flags, "days")),
  };
  const apr = flag(flags, "fee-apr");
  if (apr !== undefined) input.feeApr = parseFraction("fee-apr", apr);
  const inRange = flag(flags, "in-range");
  if (inRange !== undefined) input.inRangeFraction = parseFraction("in-range", inRange);
  return input;
}

function hedgeFromJson(value: unknown): HedgeInput {
  const obj = asRecord(value, "Hedge input");
  const input: HedgeInput = {
    model: modelOf(strField(obj, "model")),
    priceEntry: numField(obj, "priceEntry"),
    price: numField(obj, "price"),
    depositQuote: numField(obj, "depositQuote"),
  };
  if (obj.priceLower !== undefined) input.priceLower = numField(obj, "priceLower");
  if (obj.priceUpper !== undefined) input.priceUpper = numField(obj, "priceUpper");
  return input;
}

function hedgeFromFlags(flags: Flags): HedgeInput {
  const input: HedgeInput = {
    model: modelOf(requireFlag(flags, "model")),
    priceEntry: Number(requireFlag(flags, "entry")),
    price: Number(requireFlag(flags, "price")),
    depositQuote: Number(requireFlag(flags, "deposit")),
  };
  const lower = flag(flags, "lower");
  const upper = flag(flags, "upper");
  if (lower !== undefined) input.priceLower = Number(lower);
  if (upper !== undefined) input.priceUpper = Number(upper);
  return input;
}

function boundsFromJson(value: unknown): LossBoundInput {
  const obj = asRecord(value, "Bounds input");
  const input: LossBoundInput = {
    model: modelOf(strField(obj, "model")),
    priceEntry: numField(obj, "priceEntry"),
    kind: lossKindOf(strField(obj, "kind")),
    magnitude: numField(obj, "magnitude"),
  };
  if (obj.depositQuote !== undefined) input.depositQuote = numField(obj, "depositQuote");
  if (obj.priceLower !== undefined) input.priceLower = numField(obj, "priceLower");
  if (obj.priceUpper !== undefined) input.priceUpper = numField(obj, "priceUpper");
  return input;
}

function boundsFromFlags(flags: Flags): LossBoundInput {
  const input: LossBoundInput = {
    model: modelOf(requireFlag(flags, "model")),
    priceEntry: Number(requireFlag(flags, "entry")),
    kind: lossKindOf(requireFlag(flags, "kind")),
    magnitude: parseFraction("magnitude", requireFlag(flags, "magnitude")),
  };
  const lower = flag(flags, "lower");
  const upper = flag(flags, "upper");
  if (lower !== undefined) input.priceLower = Number(lower);
  if (upper !== undefined) input.priceUpper = Number(upper);
  return input;
}

const HELP = `position-sizer ${VERSION}

Size a perp, or size a liquidity position. The numbers follow the formulas in docs/PERPS.md and docs/DEFI.md.

This is not financial advice. Past results do not predict future results.

Usage
  position-sizer perp [flags]
  position-sizer defi il [flags]
  position-sizer defi size [flags]
  position-sizer defi breakeven [flags]
  position-sizer defi hedge [flags]
  position-sizer defi bounds [flags]

Add --json for one JSON object on stdout. Add --strict to exit 3 when a loud warning is present.
Add --file path to read the input object. --file - reads stdin.

Perp flags
  --account <quote>
  --risk <1% or fixed quote> | --risk-percent <1 means 1%> | --risk-fixed <quote>
  --entry <price> --stop <price> --side long|short
  --leverage <cap>
  --taker <fraction or %> --maker <fraction or %>
  --mmr <fraction or %>
  --entry-liquidity taker|maker   default taker
  --exit-liquidity taker|maker    default taker
  --funding <fraction>            positive means you pay
  --margin isolated|cross         default isolated
  --entry-fee-from-margin true|false
  --target <price>                repeatable
  --r <multiple>                  repeatable

Defi flags
  il         --model constant-product|concentrated --entry --price --deposit [--lower --upper]
  size       --model --capital --kind il|drawdown --entry --price
             --max-loss-percent <1 means 1%> | --max-loss <quote>
             [--lower --upper]
  breakeven  --loss <fraction or %> --days <n> [--fee-apr <fraction or %>] [--in-range <fraction or %>]
  hedge      --model --entry --price --deposit [--lower --upper]
  bounds     --model --entry --kind il|drawdown --magnitude <fraction or %> [--lower --upper]

Exit codes
  0  result, no loud warning
  1  bad input
  3  result, and --strict saw a loud warning
`;

function emit(flags: Flags, payload: unknown, text: string, loud: boolean): RunResult {
  const stdout = flags.json ? `${JSON.stringify(payload, null, 2)}\n` : `${text}\n`;
  if (flags.strict && loud) return { code: 3, stdout, stderr: "" };
  return { code: 0, stdout, stderr: "" };
}

function hasLoud(warnings: { severity: string }[]): boolean {
  return warnings.some((warning) => warning.severity === "loud");
}

export function main(argv: string[]): RunResult {
  try {
    const flags = parseArgv(argv);
    const [command, sub] = flags.positionals;
    if (command === "version") {
      return { code: 0, stdout: `${VERSION}\n`, stderr: "" };
    }
    if (command === undefined || command === "help") {
      return { code: 0, stdout: HELP, stderr: "" };
    }
    const fileValue = readInput(flags.file);
    if (command === "perp") {
      if (flags.positionals.length > 1) {
        throw new InputError("USAGE", "Unexpected extra arguments. See position-sizer help.");
      }
      const input = fileValue !== undefined ? perpFromJson(fileValue) : perpFromFlags(flags);
      const result = sizePerp(input);
      return emit(
        flags,
        { ok: true, tool: "perp", warnings: result.warnings, result },
        formatPerp(result),
        hasLoud(result.warnings),
      );
    }
    if (command === "defi") {
      if (sub === "il") {
        const input = fileValue !== undefined ? ilFromJson(fileValue) : ilFromFlags(flags);
        const result = impermanentLoss(input);
        return emit(flags, { ok: true, tool: "defi.il", warnings: [], result }, formatIl(result), false);
      }
      if (sub === "size") {
        const input = fileValue !== undefined ? sizeFromJson(fileValue) : sizeFromFlags(flags);
        const result = sizeLp(input);
        return emit(flags, { ok: true, tool: "defi.size", warnings: [], result }, formatSize(result), false);
      }
      if (sub === "breakeven") {
        const input = fileValue !== undefined ? breakevenFromJson(fileValue) : breakevenFromFlags(flags);
        const result = feeBreakeven(input);
        return emit(flags, { ok: true, tool: "defi.breakeven", warnings: [], result }, formatBreakeven(result), false);
      }
      if (sub === "hedge") {
        const input = fileValue !== undefined ? hedgeFromJson(fileValue) : hedgeFromFlags(flags);
        const result = hedgeRatio(input);
        return emit(flags, { ok: true, tool: "defi.hedge", warnings: [], result }, formatHedge(result), false);
      }
      if (sub === "bounds") {
        const input = fileValue !== undefined ? boundsFromJson(fileValue) : boundsFromFlags(flags);
        const result = lossBounds(input);
        return emit(flags, { ok: true, tool: "defi.bounds", warnings: [], result }, formatBounds(result), false);
      }
      throw new InputError("USAGE", "Defi commands: il, size, breakeven, hedge, bounds.");
    }
    throw new InputError("USAGE", `Unknown command "${command}". See position-sizer help.`);
  } catch (err) {
    if (isInputError(err)) {
      const flags = parseArgv(argv);
      if (flags.json) {
        const stdout = `${JSON.stringify({ ok: false, error: { code: err.code, message: err.message } }, null, 2)}\n`;
        return { code: 1, stdout, stderr: "" };
      }
      return { code: 1, stdout: "", stderr: `${err.code}: ${err.message}\n` };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { code: 1, stdout: "", stderr: `UNEXPECTED: ${message}\n` };
  }
}

if (require.main === module) {
  const { code, stdout, stderr } = main(process.argv.slice(2));
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  process.exitCode = code;
}
