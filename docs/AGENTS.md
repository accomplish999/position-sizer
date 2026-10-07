# Agents

Call the CLI. Do not scrape the text table. The text view rounds. JSON keeps the double the tests use.

## Envelope

```json
{
  "ok": true,
  "tool": "perp",
  "warnings": [{ "code": "LIQUIDATION_BEFORE_STOP", "severity": "loud", "message": "..." }],
  "result": {}
}
```

On bad input:

```json
{ "ok": false, "error": { "code": "STOP_ON_WRONG_SIDE", "message": "..." } }
```

| Exit | When                                                                            |
| ---- | ------------------------------------------------------------------------------- |
| 0    | `ok` is true, and either there is no loud warning or `--strict` was not passed. |
| 1    | `ok` is false.                                                                  |
| 3    | `ok` is true, a warning has `severity` `loud`, and `--strict` was passed.       |

Stdout is the whole object, pretty-printed, with a trailing newline. JSON mode does not write the error to stderr.

## Which command

| Question                                                   | Command          |
| ---------------------------------------------------------- | ---------------- |
| How large is the perp, and does the stop beat liquidation? | `perp`           |
| What is IL at this price?                                  | `defi il`        |
| How much of my capital stays inside a loss budget?         | `defi size`      |
| What fee APR covers a loss I already computed?             | `defi breakeven` |
| How large a short offsets the pool's base at this price?   | `defi hedge`     |
| Which prices hit a loss magnitude?                         | `defi bounds`    |

Pipe a JSON object on stdin with `--file -`.

## Fields an agent should actually read

Perp:

- `result.qtyBase`, `result.qtyQuote`, `result.notional`, `result.margin`, `result.effectiveLeverage`
- `result.feeAdjustedRisk`, `result.priceRisk`, `result.entryFee`, `result.exitFeeAtStop`, `result.fundingCost`
- `result.liquidation.beforeStop`, `result.liquidation.price`, `result.liquidation.distanceFromStop`
- `result.liquidationAtCap` and `result.liquidationIfAccountBacksIt` if you need both margin modes
- `result.bindingConstraint`
- `result.targets[].rMultiple`, `result.blended`, `result.breakevenPrice`, and `result.rLevels`
- `warnings`

If `liquidation.beforeStop` is true, say that in the same breath as the size. Do not drop the warning because the exit code was 0.

DeFi IL:

- `result.ilFraction` is signed. Negative means the pool lags a hold.
- `result.divergenceQuote` is the quote gap versus holding.
- `result.drawdownQuote` is deposit minus current value. It can be negative.
- `result.now.amounts` and `result.inRange`

DeFi size:

- `result.deployQuote` is the answer.
- `result.lossFraction` is the quote gap per 1 quote deposited, not the classic IL percent. On a 4x constant-product move those are 0.5 and 0.2. Both are in the result: `lossFraction`, and `scenario.ilFraction`.
- `result.scenarioHasNoLoss` means the scenario does not produce this kind of loss. Deploying the full capital is not a vote of confidence. It means the constraint you picked was idle.

Hedge:

- `result.hedgeBase` is the short size in base, at that price only.
- `result.hedgeRatio` for constant product is 0.5.
- Do not describe the hedge as removing IL.

## Input traps

- `risk.mode = "percent"` and `value: 1` is 1 percent of the account.
- `takerFee: 0.0005` is 5 basis points, not 5 percent.
- `maintenanceMarginRate: 0.005` is 0.5 percent.
- A long stop above the entry is `STOP_ON_WRONG_SIDE`, exit 1.
- `defi breakeven` wants a positive loss fraction. Do not pass a signed IL figure. Pass `-ilFraction`, or pass the loss fraction from `defi size`.

## What not to do

Do not invent a fill, a venue bracket, or a funding rate the user did not pass. Do not round a JSON field and feed it back in as an input. Do not tell the user the trade is attractive. The tool does not know that, and neither does a wrapper around it.
