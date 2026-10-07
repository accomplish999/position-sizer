import type { FeeBreakevenResult, HedgeResult, IlResult, LossBoundResult, SizeLpResult } from "./defi";
import type { PerpResult, Warning } from "./perp";

export function roundTrip(n: number, digits = 8): string {
  if (!Number.isFinite(n)) return "n/a";
  const abs = Math.abs(n);
  const d = abs === 0 ? 2 : abs >= 1000 ? 4 : abs >= 1 ? 6 : 8;
  const used = Math.min(digits, d);
  const text = n.toFixed(used);
  if (!text.includes(".")) return text;
  return text.replace(/\.?0+$/, "");
}

function line(label: string, value: string): string {
  const pad = label.length >= 28 ? `${label}  ` : label.padEnd(28, " ");
  return `${pad}${value}`;
}

function warningBlock(warnings: Warning[]): string[] {
  if (warnings.length === 0) return [];
  const lines: string[] = [];
  for (const warning of warnings) {
    const tag = warning.severity === "loud" ? "WARNING" : "Note";
    lines.push(`${tag}: ${warning.message}`);
  }
  lines.push("");
  return lines;
}

export function formatPerp(result: PerpResult): string {
  const lines = warningBlock(result.warnings);
  lines.push(line("side", result.side));
  lines.push(line("margin mode", result.marginMode));
  lines.push(line("position size (base)", roundTrip(result.qtyBase)));
  lines.push(line("position size (quote)", roundTrip(result.qtyQuote)));
  lines.push(line("notional", roundTrip(result.notional)));
  lines.push(line("margin needed", roundTrip(result.margin)));
  lines.push(line("effective leverage", roundTrip(result.effectiveLeverage)));
  lines.push(line("leverage cap", roundTrip(result.leverageCap)));
  lines.push(line("entry", roundTrip(result.entry)));
  lines.push(line("stop", roundTrip(result.stop)));
  lines.push(line("liquidation", roundTrip(result.liquidation.price)));
  lines.push(line("liquidation vs stop", roundTrip(result.liquidation.distanceFromStop)));
  lines.push(line("stop hits first", result.liquidation.beforeStop ? "no" : "yes"));
  lines.push(line("liquidation at cap", roundTrip(result.liquidationAtCap.price)));
  lines.push(line("liquidation, full account", roundTrip(result.liquidationIfAccountBacksIt.price)));
  lines.push(line("bankruptcy", roundTrip(result.bankruptcyPrice)));
  lines.push(line("binding constraint", result.bindingConstraint));
  lines.push(line("risk budget", roundTrip(result.riskBudget)));
  lines.push(line("fee-adjusted risk", roundTrip(result.feeAdjustedRisk)));
  lines.push(line("price risk", roundTrip(result.priceRisk)));
  lines.push(line("entry fee", roundTrip(result.entryFee)));
  lines.push(line("exit fee at stop", roundTrip(result.exitFeeAtStop)));
  lines.push(line("funding", roundTrip(result.fundingCost)));
  if (result.targets.length > 0) {
    lines.push("");
    lines.push("targets");
    for (const target of result.targets) {
      lines.push(
        `  ${roundTrip(target.price)}   ${roundTrip(target.rMultiple)} R   net ${roundTrip(target.netPnl)}   price-only ${roundTrip(target.priceOnlyR)} R`,
      );
    }
  }
  if (result.rLevels.length > 0) {
    lines.push("");
    lines.push("R to price");
    for (const level of result.rLevels) {
      lines.push(`  ${roundTrip(level.r)} R   price ${roundTrip(level.price)}`);
    }
  }
  return lines.join("\n");
}

export function formatIl(result: IlResult): string {
  const lines: string[] = [];
  lines.push(line("model", result.model));
  lines.push(line("price entry", roundTrip(result.priceEntry)));
  lines.push(line("price now", roundTrip(result.priceNow)));
  lines.push(line("price ratio", roundTrip(result.priceRatio)));
  lines.push(line("deposit", roundTrip(result.depositQuote)));
  lines.push(line("value now", roundTrip(result.now.value)));
  lines.push(line("hold value", roundTrip(result.holdValue)));
  lines.push(line("IL fraction", roundTrip(result.ilFraction)));
  lines.push(line("divergence (quote)", roundTrip(result.divergenceQuote)));
  lines.push(line("drawdown vs deposit", roundTrip(result.drawdownQuote)));
  lines.push(line("base now", roundTrip(result.now.amounts.base)));
  lines.push(line("quote now", roundTrip(result.now.amounts.quote)));
  if (result.inRange !== null) {
    lines.push(line("in range", result.inRange ? "yes" : "no"));
  }
  return lines.join("\n");
}

export function formatSize(result: SizeLpResult): string {
  const lines: string[] = [];
  if (result.scenarioHasNoLoss) {
    lines.push("Note: that scenario does not produce this kind of loss. The full capital stays deployable.");
    lines.push("");
  }
  lines.push(line("model", result.model));
  lines.push(line("loss kind", result.kind));
  lines.push(line("capital", roundTrip(result.capital)));
  lines.push(line("max loss", roundTrip(result.maxLossQuote)));
  lines.push(line("loss fraction", roundTrip(result.lossFraction)));
  lines.push(line("deploy", roundTrip(result.deployQuote)));
  lines.push(line("scenario loss", roundTrip(result.scenarioLossQuote)));
  lines.push(line("left undeployed", roundTrip(result.unusedQuote)));
  lines.push(line("binding constraint", result.bindingConstraint));
  return lines.join("\n");
}

export function formatBreakeven(result: FeeBreakevenResult): string {
  const lines: string[] = [];
  lines.push(line("loss fraction", roundTrip(result.lossFraction)));
  lines.push(line("horizon days", roundTrip(result.horizonDays)));
  lines.push(line("in range fraction", roundTrip(result.inRangeFraction)));
  lines.push(line("breakeven over horizon", roundTrip(result.breakevenPeriodFraction)));
  lines.push(line("breakeven fee APR", result.breakevenApr === null ? "none" : roundTrip(result.breakevenApr)));
  if (result.feeApr !== null) {
    lines.push(line("fee APR", roundTrip(result.feeApr)));
    lines.push(line("fee income fraction", roundTrip(result.feeIncomeFraction ?? 0)));
    lines.push(line("net fraction", roundTrip(result.netFraction ?? 0)));
    lines.push(line("fees cover the loss", result.covers ? "yes" : "no"));
  }
  return lines.join("\n");
}

export function formatHedge(result: HedgeResult): string {
  const lines: string[] = [];
  lines.push(line("model", result.model));
  lines.push(line("price", roundTrip(result.price)));
  lines.push(line("base in pool", roundTrip(result.amounts.base)));
  lines.push(line("quote in pool", roundTrip(result.amounts.quote)));
  lines.push(line("lp value", roundTrip(result.lpValue)));
  lines.push(line("hedge side", result.side));
  lines.push(line("hedge size (base)", roundTrip(result.hedgeBase)));
  lines.push(line("hedge notional", roundTrip(result.hedgeNotional)));
  lines.push(line("hedge ratio", roundTrip(result.hedgeRatio)));
  if (result.inRange !== null) {
    lines.push(line("in range", result.inRange ? "yes" : "no"));
  }
  lines.push("");
  lines.push("A short of that base size offsets delta at this price. It does not cancel the curved loss.");
  return lines.join("\n");
}

export function formatBounds(result: LossBoundResult): string {
  const lines: string[] = [];
  lines.push(line("price down", result.down === null ? "not reached" : roundTrip(result.down)));
  lines.push(line("price up", result.up === null ? "not reached" : roundTrip(result.up)));
  return lines.join("\n");
}
