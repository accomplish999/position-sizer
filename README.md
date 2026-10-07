# position-sizer

Size the loss before you size the trade.

Fees go into the denominator. If liquidation sits before the stop, the stop does not cap the loss. The same release prices a liquidity position: a constant-product pool, one concentrated range, a deposit that fits a quote budget, the fee APR that would cover that loss, and the short that flats base at one price.

The hosted calculator is <https://accompli.sh/position-sizer/>.

![Perps tab. Account 10000, risk 1 percent, long from 100, stop 95, leverage cap 10. Funding 0.0001 per 8 hours for 24 hours. Targets 110 at 50 percent and 120 at 50 percent. Size 19.5027 base. Breakeven 100.13. Blended 2.90 R. Copy link sits by the tabs.](docs/images/calc-perps.png)

This is arithmetic. It is not a signal, and it is not advice. Past results do not predict future results.

## Contents

- [Thesis](#thesis)
- [Why size from the stop](#why-size-from-the-stop)
- [Market mechanics](#market-mechanics)
- [Exact rules](#exact-rules)
- [Data and method](#data-and-method)
- [Worked results](#worked-results)
- [Historical checks](#historical-checks)
- [Limitations](#limitations)
- [Failure modes](#failure-modes)
- [When not to use it](#when-not-to-use-it)
- [Risk and size](#risk-and-size)
- [CLI](#cli)
- [Library](#library)
- [Web page](#web-page)
- [FAQ](#faq)

The formula writeups, with the same identities, are [docs/PERPS.md](docs/PERPS.md) and [docs/DEFI.md](docs/DEFI.md). Flags are in [docs/CLI.md](docs/CLI.md). The shorter FAQ is [docs/FAQ.md](docs/FAQ.md).

## Thesis

A risk percent that ignores the stop is not a size. On a linear perpetual, the quote you lose if the stop fills is the price gap, plus the fee to get in, plus the fee to get out at the stop, plus the funding you typed for the hold. Quantity is the risk budget divided by that unit loss, then cut if the leverage cap cannot open that much. Version 0.2.0 is that arithmetic, plus partial closes and a funding hold.

The second calculator is a liquidity position. Constant product is the 50/50 pool. Concentrated is one range, liquidity L between two prices, valued with square-root prices in the sense of the Uniswap v3 paper. It is not a list of ticks, and it is not a share of someone else's fee tier. Impermanent loss is pool value over the marked value of the tokens you deposited, minus 1. That fraction does not shrink when you deposit less. The quote gap does. The size uses the gap.

There is no holdout, no Sharpe, and no claim that a trade is a good idea. The blocks below are the CLI text from the example files and from the same commands the tests lock. Text output rounds. The tests check the exact expressions. The hosted page tracks main. If you are reading an old copy of this file, re-run the CLI in the tree you have before you trust a rounded line.

A venue with margin brackets, a second position, or its own liquidation formula will not match this map. The tests check the identity in this repository, not a screenshot from a specific exchange.

## Why size from the stop

The budget is a pile of quote. The stop is the price where you have decided that pile is gone, if the order fills there. The size is whatever quantity makes that true after fees.

Skip the fees and a 1 percent risk becomes something larger. On the worked long the price gap is 5 points and the unit loss is 5.0975. A budget of 100 quote divided by 5 is 20 base. Divided by 5.0975 it prints as 19.61746. The fee-adjusted loss of that smaller size is 100, which was the budget.

The leverage cap is a second limit, not a substitute for the stop. Effective leverage on that long is 0.1961746 against a cap of 10. The cap is not the risk. The stop distance, the fees, and the account are.

A stop the venue will never reach is not a stop. Distance is stop minus liquidation for a long, and liquidation minus stop for a short. Positive means the stop is hit first. Negative means liquidation is first. The order can still be resting. It does not cap the loss if the venue closes the position on the way there.

## Market mechanics

On a linear contract, quantity is in base and money is in quote. One position. The model treats the mark as the price. Equity is the backing wallet plus unrealized pnl. The position is treated as liquidated when equity equals maintenance margin on the mark notional, plus the taker fee to close.

Bankruptcy is the price where equity would be zero if maintenance and that close fee were both zero. Liquidation should sit on the safer side of bankruptcy: higher than bankruptcy for a long, lower for a short. The no-fee examples in the tests check that order.

Isolated backs the position with initial margin at the leverage cap. Cross, in this model, backs it with the whole account and assumes this is the only position. Same size, same fees. The liquidation prices can differ by a lot. A 1,000 notional short with 10,000 of account behind it has to travel much further than the same short isolated at 5x. That gap is why both prices are printed.

Slippage is not in the model. The stop is assumed to fill at the stop price. Live stops often do not.

In a constant-product pool the product of the two reserves stays constant. Half the deposit is quote and half is base at entry. After a move, value is the deposit times the square root of the price ratio. Holding the original tokens is worth half the deposit times one plus the ratio. The pool lags that hold on the way up and on the way down. A 4x move and a move to 0.25x are the same impermanent loss, minus 20 percent, and they are not the same drawdown versus the cash you deposited. On the rally the pool is up. On the selloff it is worth half the deposit.

A concentrated range holds both assets only between the lower and upper price. At or below the lower price it is entirely base. At or above the upper price it is entirely quote. A very wide range approaches the constant-product loss. The test uses a range from price / 1,000,000 to price times 1,000,000 and expects the 1.5x impermanent loss to agree within 3e-5. A tight range loses more than the full-range pool on the same move. That comparison is a direction in the tests, not a second published table.

The formulas are derived in this repository and checked against those checkpoints. They are not a paste of a blog table. The pool shapes follow the constant-product identity and the square-root-price identity used for a single concentrated range. This tool does not model a fee tier's share of swaps, tick spacing, or hooks. Those papers are named in [docs/DEFI.md](docs/DEFI.md).

A perp hedge of the base inventory flats the slope at the price you run. It does not cancel the curve. The pool bends the wrong way relative to holding. You are short gamma. A static hedge is stale as soon as the price moves. Rebalancing has its own cost, and this tool does not subtract it. Funding on that short is a separate problem. Size the short in the perp calculator if you want margin and liquidation for it.

## Exact rules

Percent mode: 1 means 1 percent of the account. It does not mean 0.01. A percent above 100 is rejected. Fixed mode is a quote amount. A fixed budget larger than the account is allowed, and it raises a note. The leverage cap still limits the size.

### Risk budget

```text
risk budget = account * (percent / 100)
```

Fixed mode: the risk budget is the number you passed, in quote.

### Unit loss

Per one base unit, the quote loss at the stop is the price gap plus the entry fee, the exit fee at the stop, and funding.

```text
unit loss = |entry - stop|
          + entry fee rate * entry
          + exit fee rate * stop
          + funding rate * entry

quantity from risk = risk budget / unit loss
```

The entry fee rate is the taker or maker rate you assigned to the entry. The exit fee rate is the one you assigned to the stop. Both default to the taker rate. Funding is a signed fraction of entry notional over the hold you expect. Positive means you pay. Negative means you receive. Pass that fraction as `fundingRate`, or pass `fundingPer8h` with `holdHours`. The second form multiplies the 8 hour rate by `holdHours / 8`. A positive 8 hour rate means longs pay and shorts receive, so the signed cost flips with the side. Do not pass both forms. A funding credit reduces the fee-adjusted risk. A funding payment increases it.

If unit loss is not positive, fees and funding turned the stop into a credit. The calculator stops. There is nothing to size. When the risk quantity is the one you get, the fee-adjusted loss at the stop equals the budget.

### The leverage cap

Opening the position has to fit in the account. If the entry fee is paid from the account, which is the default:

```text
max quantity = account / ((1 / leverage cap + entry fee rate) * entry)
quantity = min(quantity from risk, max quantity)
```

If the entry fee is paid somewhere else, drop the entry fee rate from that sum. If the cap wins, `bindingConstraint` is `leverage_cap` and the fee-adjusted loss is smaller than the budget. The size is not stretched to make the budget true. The note says the cap cut the size.

If the wallet fraction below is not positive, the entry fee eats the initial margin. The calculator refuses the input. Lower the cap, or lower the fee.

### Margin and effective leverage

```text
notional = quantity * entry
margin    = notional / leverage cap
effective leverage = notional / account
```

Margin here is initial margin at the cap. It is not a suggestion to post more. Effective leverage is how hard the whole account is working. It can sit well below the cap. That is normal for a small risk and a wide stop. On a linear contract, quote size and notional are the same number.

### Liquidation estimate

Isolated wallet, per unit of notional, when the entry fee comes out of that wallet:

```text
wallet fraction = 1 / leverage cap - entry fee rate
```

Long, isolated:

```text
liquidation = entry * (1 - wallet fraction) / (1 - maintenance margin rate - taker fee)
```

Short, isolated:

```text
liquidation = entry * (1 + wallet fraction) / (1 + maintenance margin rate + taker fee)
```

A non-positive long result is reported as 0. The price cannot liquidate the position.

Cross uses the whole account as the wallet, minus the entry fee when that fee comes out of the account.

```text
long:  liquidation = (quantity * entry - wallet) / (quantity * (1 - maintenance margin rate - taker fee))
short: liquidation = (quantity * entry + wallet) / (quantity * (1 + maintenance margin rate + taker fee))
```

A non-positive long result is reported as 0.

The selected margin mode picks which price is `liquidation`. Both prices are always returned: `liquidationAtCap` and `liquidationIfAccountBacksIt`. When the position already uses the whole account as margin, the two prices match. The tests check that.

Bankruptcy ignores maintenance margin and the close fee.

```text
long:  entry - wallet / quantity
short: entry + wallet / quantity
```

A long bankruptcy at or below zero is reported as 0. The close fee in the liquidation identity is the taker rate, even if you marked the stop as maker. The model treats the venue's close as a taker fill.

### Liquidation before the stop

```text
long distance  = stop - liquidation
short distance = liquidation - stop
```

Positive means the stop is hit first. Negative means liquidation is first.

A loud warning fires when the selected liquidation is on the wrong side of the stop. If you are on isolated margin and the full-account price is also on the wrong side, a second loud warning fires. Posting the rest of the account does not save that trade.

| Code                                  | Severity | When                                                            |
| ------------------------------------- | -------- | --------------------------------------------------------------- |
| `LIQUIDATION_BEFORE_STOP`             | loud     | The selected liquidation is on the wrong side of the stop.      |
| `FULL_ACCOUNT_STILL_LIQUIDATES_FIRST` | loud     | Isolated, and the full-account price is also on the wrong side. |
| `LEVERAGE_CAP_BINDS`                  | note     | Size was cut. Fee-adjusted risk is below the budget.            |
| `RISK_BUDGET_ABOVE_ACCOUNT`           | note     | The fixed risk budget is larger than the account.               |
| `TARGETS_LEAVE_A_REST`                | note     | Partial closes add up to less than 100 percent.                 |

`--strict` turns a loud warning into exit code 3. The body is still printed. Exit 0 does not mean the stop is safe. Read `stop hits first`.

### Fees funding and R

```text
price risk        = quantity * |entry - stop|
entry fee         = entry fee rate * notional
exit fee at stop  = exit fee rate * quantity * stop
funding           = funding rate * notional
fee-adjusted risk = price risk + entry fee + exit fee at stop + funding
```

For a target price T, net pnl is the price pnl minus the entry fee, the exit fee at T, and funding.

```text
long price pnl  = quantity * (T - entry)
short price pnl = quantity * (entry - T)
exit fee at T   = exit fee rate * quantity * T
net pnl         = price pnl - entry fee - exit fee at T - funding
R               = net pnl / fee-adjusted risk
```

The fee-adjusted risk in that ratio is the loss of the position you actually sized. If the leverage cap cut the size, R is measured against that smaller loss, not against the original budget.

At the stop, R is -1. That is checked in the tests, including with fees and funding. The price-only R ignores fees:

```text
long:  (target - entry) / (entry - stop)
short: (entry - target) / (stop - entry)
```

The calculator also solves the net-pnl equation for price at R = -1, 1, 2, and 3, unless you pass your own list. R = -1 comes back as the stop. On a long, with per-price sensitivity `quantity * (1 - exit fee rate)`, the price at a chosen net is `(net + quantity * entry * (1 + entry fee rate + funding rate))` divided by that sensitivity. Net zero is the breakeven price. Fees and funding push it off the entry.

A target can close part of the size. `110:50` closes 50 percent at 110. Each row's R divides that slice's net by the fee-adjusted loss of the slice, so it matches a full exit at the same price. Blended net is the sum of the slices. Blended R divides that sum by the fee-adjusted loss of the closed size. On full risk, the same sum is divided by the loss of the whole position. Close percents have to be above 0 and at most 100, and they cannot add past 100. A bare price is still a full-size scenario, and those rows are not blended. Do not mix the two. If the percents add to less than 100, the rest stays open and is left out of the blend.

### Constant product IL

Deposit V at price P0. Ratio r = P / P0.

```text
quote0 = V / 2
base0  = V / (2 * P0)
value  = V * sqrt(r)
hold   = (V / 2) * (1 + r)
IL     = value / hold - 1 = 2 * sqrt(r) / (1 + r) - 1
```

IL is 0 when r is 1. It is negative when the price moves. The same move up and the inverse move down produce the same IL. A 4x move and a move to 0.25x are both exactly -0.20.

The gap versus holding, in quote, is hold minus value. That gap is not 20 percent of the deposit. On a 4x move the hold is worth 2.5 deposits and the pool is worth 2 deposits. IL versus the hold is 20 percent. The gap is 0.5 quote per 1 quote you deposited.

Drawdown versus the deposit is deposit minus value. On a 4x move the pool is up, so drawdown is negative. On a move to 0.25x the pool is worth half the deposit, so drawdown is half.

| Price ratio | Expression                  | Often quoted as    |
| ----------- | --------------------------- | ------------------ |
| 1.25        | `2 * sqrt(1.25) / 2.25 - 1` | about 0.6 percent  |
| 1.50        | `2 * sqrt(1.5) / 2.5 - 1`   | about 2.0 percent  |
| 2           | `2 * sqrt(2) / 3 - 1`       | about 5.7 percent  |
| 3           | `2 * sqrt(3) / 4 - 1`       | about 13.4 percent |
| 4           | `-0.2` exactly              | 20 percent         |
| 5           | `2 * sqrt(5) / 6 - 1`       | about 25.5 percent |

The tests allow 0.05 percentage points against that rounded column, and they check the exact expression on its own.

Solving IL = -m for the ratio, with m between 0 and 1:

```text
s = 1 / (1 - m) ± sqrt(1 / (1 - m)^2 - 1)
ratio = s^2
```

The two roots are reciprocals. For m = 0.2 they are 4 and 0.25. Loss never quite reaches 100 percent, so m = 1 is rejected.

### Concentrated range IL

Let `sa = sqrt(lower)`, `sb = sqrt(upper)`, `sp = sqrt(price)`.

In range, lower < price < upper:

```text
base  = L * (1 / sp - 1 / sb)
quote = L * (sp - sa)
```

At or below the lower price the position is entirely base:

```text
base  = L * (1 / sa - 1 / sb)
quote = 0
```

At or above the upper price it is entirely quote:

```text
base  = 0
quote = L * (sb - sa)
```

The two formulas meet at the boundaries. Value is always quote plus base times price.

Given a deposit at a price, L is the deposit divided by the value of one unit of liquidity at that price.

```text
in range:          2 * sp - sa - price / sb
at or below lower: (1 / sa - 1 / sb) * price
at or above upper: sb - sa
```

IL uses the same definition as the constant-product case: value now, divided by the marked value of the entry tokens, minus 1. The entry tokens are whatever the range held at the entry price, including a one-sided position if you entered outside the range.

The worked range is a 1,000 quote deposit at price 100, bounds 81 and 121. The square roots are 9, 10, and 11.

```text
value per L at entry = 2 * 10 - 9 - 100 / 11 = 21 / 11
L = 1000 * 11 / 21 = 11000 / 21
base at entry  = 100 / 21
quote at entry = 11000 / 21
```

At the upper price, 121, the position is entirely quote. Value is 22000/21. The held tokens would be worth 1,100. IL is -1/21. At the lower price, 81, value is 6000/7 and IL is -11/191. The tests use the fractions. The text view rounds them.

### LP sizing against a loss budget

IL as a fraction of the hold does not shrink when you deposit less. The quote gap does.

```text
loss fraction = (gap at the scenario) / (one quote deposited)
deploy        = min(capital, max loss quote / loss fraction)
```

Kind `il` uses hold value minus pool value. Kind `drawdown` uses the deposit minus pool value, and that gap is zero when the pool is above the deposit.

On the 4x constant-product scenario the IL fraction is -0.2, and the loss fraction used for sizing is 0.5, because the gap is half a quote per quote deposited. A 10,000 capital with a 1 percent IL budget (100 quote) deploys 200, not 500. Deploying 500 would leave a 250 quote gap, which is more than the 100 you allowed.

If the scenario has no loss of the kind you asked for, the full capital is deployable and `scenarioHasNoLoss` is true. A 4x rally has no drawdown versus the deposit. The tool says so instead of inventing a size.

You can also ask where the loss reaches a magnitude. Constant product uses the closed form above. Concentrated ranges are searched outward from the entry on a log grid, then refined.

### Fee APR breakeven

This is a scenario comparison, not a path. No compounding. Fees in a real pool depend on volume, not on the calendar. An APR here is an average you are willing to type, not a quote from a pool.

```text
breakeven APR = loss fraction / (horizon days / 365) / in-range fraction
```

The in-range fraction is the share of the horizon you assume fees are earned. It defaults to 1, which is generous for a tight range. Pass 0 and there is no finite APR that covers the loss, because nothing is earned. The printed APR is `none`.

If you also pass a fee APR, income over the horizon is `fee APR * (days / 365) * in-range fraction`. Net is that income minus the loss fraction. `covers` is true when net is at least zero.

Pass the size of the loss, not a signed IL number. `--loss 20%` is a loss fraction of 0.2.

### Hedge ratio

For both curves, the base exposure at a price is the base inventory at that price. A perp hedge of the delta is a short of that many base units.

```text
hedge notional = base inventory * price
hedge ratio    = hedge notional / pool value
```

Constant product: the ratio is 1/2 at every price. The tests check 25, 100, and 400 from an entry of 100. It is 0.5 at each. At entry, with a 1,000 deposit at price 100, you short 5 base. Notional 500. After a 4x move you would short 2.5 base, still half the current value. The first hedge is stale.

Concentrated, same 81 to 121 range, 1,000 deposit, at the entry price: base inventory is 100/21, hedge ratio is 10/21. The range is symmetric in square-root price, which leaves a bit more quote than base notional. At the upper bound the hedge is 0. You hold quote. At the lower bound the ratio is 1. You hold base.

The short offsets the slope. It does not cancel the curve. Run the helper again at the new price if you want the delta flat again.

## Data and method

This repository does not score a trading rule. There is no candle file, no walk-forward, no holdout, and no multiple-testing correction, because there is no search over signals. The method is the identity in the source, locked by tests, and printed by the CLI from the objects in [examples/](examples/).

Release 0.2.0. The version string in `package.json` and in `src/version.ts` is 0.2.0. `npx tsx src/cli.ts --version` prints `0.2.0`. The blocks in [Worked results](#worked-results) are that CLI's full print. [Historical checks](#historical-checks) quote the same printer, cut down to the size, the funding, the breakeven, and the closes.

Text mode rounds. A magnitude of at least 1,000 keeps 4 digits after the decimal, a magnitude of at least 1 keeps 6, and a smaller magnitude keeps 8, then trailing zeros drop. JSON keeps the full double. Do not retype a rounded line into another tool and expect the tests to match.

Exit codes:

| Code | Meaning                                                                       |
| ---- | ----------------------------------------------------------------------------- |
| 0    | A result, and no loud warning, or a loud warning when `--strict` was not set. |
| 1    | Bad input, unknown command, or invalid JSON.                                  |
| 3    | A result that includes a loud warning, and `--strict` was set.                |

The liquidation-before-stop example exits 0 without `--strict` and exits 3 with it. The JSON, or the text, is still printed.

Success JSON:

```json
{
  "ok": true,
  "tool": "perp",
  "warnings": [],
  "result": {}
}
```

`tool` is `perp`, `defi.il`, `defi.size`, `defi.breakeven`, `defi.hedge`, or `defi.bounds`. Warning objects have `code`, `severity` (`loud` or `note`), and `message`.

Failure JSON:

```json
{
  "ok": false,
  "error": { "code": "STOP_ON_WRONG_SIDE", "message": "A long stop has to sit below the entry." }
}
```

Text mode writes errors to stderr as `CODE: message`. JSON mode writes every object to stdout.

## Worked results

These blocks are the CLI text. Inputs are the JSON files, except where a command is written out. Nothing here is a profit on a market.

### Perp long with fees

[examples/perp-long.json](examples/perp-long.json). Account 10,000. Risk 1 percent, so the budget is 100 quote. Entry 100, stop 95, long. Leverage cap 10. Taker fee 5 basis points on the way in and on the stop. Maintenance margin 0.5 percent. No funding. Maker is 2 basis points in the file and is unused, because both sides are taker.

```text
unit loss = 5 + 0.0005 * 100 + 0.0005 * 95 = 5.0975
quantity = 100 / 5.0975
```

Isolated liquidation with the entry fee taken from margin:

```text
100 * (1 - 0.1 + 0.0005) / (1 - 0.005 - 0.0005) = 90.548014...
```

```bash
npx tsx src/cli.ts perp --file examples/perp-long.json
```

```text
side                        long
margin mode                 isolated
position size (base)        19.61746
position size (quote)       1961.746
notional                    1961.746
margin needed               196.174595
effective leverage          0.1961746
leverage cap                10
entry                       100
stop                        95
liquidation                 90.548014
liquidation vs stop         4.451986
stop hits first             yes
liquidation at cap          90.548014
liquidation, full account   0
bankruptcy                  90.05
binding constraint          risk
risk budget                 100
fee-adjusted risk           100
price risk                  98.087298
entry fee                   0.98087298
exit fee at stop            0.93182933
funding                     0
breakeven                   100.10005

targets
  110   1.941148 R   net 194.114762   price-only 2 R
  120   3.901913 R   net 390.19127   price-only 4 R

R to price
  -1 R   price 95
  1 R   price 105.2001
  2 R   price 110.30015
  3 R   price 115.4002
```

The price-only column still says 2 R at 110. After fees it is 1.941148 R. Breakeven, a full close at zero net, is 100.10005. The 2 R price, net of fees, is 110.30015, not 110. Fee-adjusted risk equals the budget of 100. The three fee lines are the rounded split of that sum. The full account cannot liquidate this long: notional prints as 1961.746 against a 10,000 account, so that price is reported as 0. Bankruptcy at 90.05 sits below liquidation at 90.548014, which is the right order for a long.

The CLI block above keeps the longer print. The page shot under it is the same entry and stop with a funding hold and two partial closes, so the size is not the 19.61746 from the zero-funding run.

![Same prices on the page, with a funding hold and two partial closes. Liquidation still prints 90.55, under the stop. The target rows show the close percent, the R, and the net, then the blend.](docs/images/calc-perps.png)

### Chart of the fee long

Entry 100. Stop 95. Liquidation 90.548014. The stop sits 4.451986 above liquidation, so the stop is the first of the two prices. Bankruptcy is 90.05, on the safer side of liquidation. The size is 19.61746 base, notional 1961.746, margin 196.174595.

<!-- docs/images/tv-perp-long.png -->

### Perp short with no fees

[examples/perp-short.json](examples/perp-short.json). Risk is a fixed 100 quote. Entry 100, stop 110, leverage cap 5, maintenance margin 0.005, no fees, no funding.

```text
100 * (1 + 1/5) / 1.005 = 119.402985...
```

```bash
npx tsx src/cli.ts perp --file examples/perp-short.json
```

```text
side                        short
margin mode                 isolated
position size (base)        10
position size (quote)       1000
notional                    1000
margin needed               200
effective leverage          0.1
leverage cap                5
entry                       100
stop                        110
liquidation                 119.402985
liquidation vs stop         9.402985
stop hits first             yes
liquidation at cap          119.402985
liquidation, full account   1094.5274
bankruptcy                  120
binding constraint          risk
risk budget                 100
fee-adjusted risk           100
price risk                  100
entry fee                   0
exit fee at stop            0
funding                     0
breakeven                   100

targets
  90   1 R   net 100   price-only 1 R

R to price
  -1 R   price 110
  1 R   price 90
  2 R   price 80
  3 R   price 70
```

Quantity is 10 because the unit loss is the 10 point gap and the budget is 100. Isolated liquidation is 119.402985. The stop at 110 is first. Distance is 9.402985. Bankruptcy is 120, past liquidation, which is the right order for a short. The full-account liquidation is 1094.5274. Cross puts the whole 10,000 behind 1,000 of notional. Isolated at 5x does not.

### Liquidation before the stop worked

[examples/perp-liq-before-stop.json](examples/perp-liq-before-stop.json). Entry 100, stop 90, leverage cap 20, maintenance margin 0.005, no fees. Risk 1 percent of 10,000.

```text
100 * (1 - 1/20) / 0.995 = 95.477387...
```

```bash
npx tsx src/cli.ts perp --file examples/perp-liq-before-stop.json
```

```text
WARNING: Liquidation sits before the stop. At this leverage cap the position is liquidated while the stop is still open. The stop does not cap the loss.

side                        long
margin mode                 isolated
position size (base)        10
position size (quote)       1000
notional                    1000
margin needed               50
effective leverage          0.1
leverage cap                20
entry                       100
stop                        90
liquidation                 95.477387
liquidation vs stop         -5.477387
stop hits first             no
liquidation at cap          95.477387
liquidation, full account   0
bankruptcy                  95
binding constraint          risk
risk budget                 100
fee-adjusted risk           100
price risk                  100
entry fee                   0
exit fee at stop            0
funding                     0
breakeven                   100

targets
  110   1 R   net 100   price-only 1 R

R to price
  -1 R   price 90
  1 R   price 110
  2 R   price 120
  3 R   price 130
```

The stop is 90. Liquidation is 95.477387. Distance is -5.477387. Bankruptcy is 95, just below liquidation. The full-account price is 0, so posting the rest of this 10,000 account would move liquidation off the stop. The selected mode is isolated, and the warning is about that mode. The same command with `--strict` prints the same text and exits 3. Without it, the exit is 0 and the warning is still there. The R column still treats the stop as -1 R. That R is the loss if the stop fills. It is not the loss if the venue closes you at 95.477387.

### Chart of liquidation before the stop

Entry 100. Stop 90. Liquidation 95.477387, between the entry and the stop. Distance -5.477387. Margin at the 20x cap is 50. The loss if the stop filled would be the budget of 100. The model closes the position on the way there.

<!-- docs/images/tv-perp-liq-before-stop.png -->

### Constant product from 100 to 400

[examples/defi-constant-product.json](examples/defi-constant-product.json). Deposit 1,000 at 100. Price now 400.

```bash
npx tsx src/cli.ts defi il --file examples/defi-constant-product.json
```

```text
model                       constant-product
price entry                 100
price now                   400
price ratio                 4
deposit                     1000
value now                   2000
hold value                  2500
IL fraction                 -0.2
divergence (quote)          500
drawdown vs deposit         -1000
base now                    2.5
quote now                   1000
```

The pool is up versus the deposit. It is down versus holding the original coins. Both statements are true. Drawdown versus the deposit is negative because the value rose. The same IL of -0.2 on a move from 100 to 25, checked in the tests on a 1,000 deposit, is a pool worth 500 and a drawdown of 500. That path is a cash loss. The 4x path is not.

### Concentrated range from 81 to 121

[examples/defi-concentrated.json](examples/defi-concentrated.json). Deposit 1,000 at 100, range 81 to 121, price now 121. Exact IL is -1/21. Exact value is 22000/21.

```bash
npx tsx src/cli.ts defi il --file examples/defi-concentrated.json
```

```text
model                       concentrated
price entry                 100
price now                   121
price ratio                 1.21
deposit                     1000
value now                   1047.619
hold value                  1100
IL fraction                 -0.04761905
divergence (quote)          52.380952
drawdown vs deposit         -47.619048
base now                    0
quote now                   1047.619
in range                    yes
```

The same range marked at the lower price:

```bash
npx tsx src/cli.ts defi il --model concentrated --entry 100 --price 81 --deposit 1000 --lower 81 --upper 121
```

```text
model                       concentrated
price entry                 100
price now                   81
price ratio                 0.81
deposit                     1000
value now                   857.142857
hold value                  909.52381
IL fraction                 -0.05759162
divergence (quote)          52.380952
drawdown vs deposit         142.857143
base now                    10.582011
quote now                   0
in range                    yes
```

857.142857 is 6000/7. The IL fraction -0.05759162 is the text view of -11/191. Hold value 909.52381 is the text view of 19100/21. Drawdown versus the deposit is positive here. At the upper price it was negative. The divergence versus the hold is 52.380952 in both printed cases. The boundary prices still report `in range` as `yes`.

The hosted page marks that range at the upper price. IL versus holding prints as minus 4.76 percent.

![DeFi tab, one range. Entry 100, lower 81, upper 121, price now 121, deposit 1000. The position is all quote and IL versus holding is minus 4.76 percent. Copy link sits by the tabs.](docs/images/calc-defi.png)

### Chart of the range

Deposit 1,000 at 100. Lower bound 81. Upper bound 121. Square roots 9, 10, and 11. At 121 the position is all quote, value 1047.619, IL -0.04761905. At 81 it is all base, value 857.142857, IL -0.05759162.

<!-- docs/images/tv-lp-range.png -->

### Deposit size

[examples/defi-size.json](examples/defi-size.json). Capital 10,000. Max loss 1 percent, so 100 quote. Kind `il`. Constant product from 100 to 400.

```bash
npx tsx src/cli.ts defi size --file examples/defi-size.json
```

```text
model                       constant-product
loss kind                   il
capital                     10000
max loss                    100
loss fraction               0.5
deploy                      200
scenario loss               100
left undeployed             9800
binding constraint          loss
```

IL versus holding is 20 percent. The quote gap per quote deposited is 0.5, because the hold grew to 2.5x while the pool grew to 2x. A 100 quote budget therefore deploys 200. 9,800 stays out of the pool.

Drawdown sizing on the selloff, the case the tests lock: capital 10,000, fixed max loss 500, constant product from 100 to 25.

```bash
npx tsx src/cli.ts defi size --model constant-product --capital 10000 --kind drawdown --entry 100 --price 25 --max-loss 500
```

```text
model                       constant-product
loss kind                   drawdown
capital                     10000
max loss                    500
loss fraction               0.5
deploy                      1000
scenario loss               500
left undeployed             9000
binding constraint          loss
```

The pool on that path is worth half the deposit, so the gap per quote is 0.5 and 500 of loss budget deploys 1,000.

The opposite question, drawdown on the 4x rally with a 5 percent max loss:

```bash
npx tsx src/cli.ts defi size --model constant-product --capital 10000 --kind drawdown --entry 100 --price 400 --max-loss-percent 5
```

```text
Note: that scenario does not produce this kind of loss. The full capital stays deployable.

model                       constant-product
loss kind                   drawdown
capital                     10000
max loss                    500
loss fraction               0
deploy                      10000
scenario loss               0
left undeployed             0
binding constraint          none
```

Max loss on that run is 500, because 5 percent of 10,000 is 500, and none of it is used. The pool is up versus the deposit. There is no drawdown to size against.

### Fee breakeven worked

[examples/defi-breakeven.json](examples/defi-breakeven.json). Loss fraction 0.2, horizon 30 days, in range half the time, fee APR 0.5.

```bash
npx tsx src/cli.ts defi breakeven --file examples/defi-breakeven.json
```

```text
loss fraction               0.2
horizon days                30
in range fraction           0.5
breakeven over horizon      0.2
breakeven fee APR           4.866667
fee APR                     0.5
fee income fraction         0.02054795
net fraction                -0.17945205
fees cover the loss         no
```

4.866667 is 0.2 / (30/365) / 0.5. A 50 percent fee APR, earned for 30/365 of a year and then cut in half because the range is only active half the time, covers about 2 percent of capital. The loss you typed was 20 percent. Fees do not cover it. Net fraction is -0.17945205.

The same 0.2 loss over 365 days, in range the whole time:

```bash
npx tsx src/cli.ts defi breakeven --loss 20% --days 365 --in-range 100%
```

```text
loss fraction               0.2
horizon days                365
in range fraction           1
breakeven over horizon      0.2
breakeven fee APR           0.2
```

That is the identity with a one-year horizon and an in-range fraction of 1. No fee APR was passed, so the coverage lines are absent. Change the days and the answer changes.

An in-range fraction of 0 on the 30-day case:

```bash
npx tsx src/cli.ts defi breakeven --loss 20% --days 30 --in-range 0
```

```text
loss fraction               0.2
horizon days                30
in range fraction           0
breakeven over horizon      0.2
breakeven fee APR           none
```

There is no finite rate that covers a loss when nothing is earned.

### Hedge worked

[examples/defi-hedge.json](examples/defi-hedge.json). Constant product, 1,000 deposit, price 100, which is also the entry.

```bash
npx tsx src/cli.ts defi hedge --file examples/defi-hedge.json
```

```text
model                       constant-product
price                       100
base in pool                5
quote in pool               500
lp value                    1000
hedge side                  short
hedge size (base)           5
hedge notional              500
hedge ratio                 0.5

A short of that base size offsets delta at this price. It does not cancel the curved loss.
```

You short 5 base. Notional 500. After a 4x move the same deposit holds 2.5 base, still half the current value. The first hedge is the wrong size.

Concentrated, same 1,000 deposit, range 81 to 121, at the entry price:

```bash
npx tsx src/cli.ts defi hedge --model concentrated --entry 100 --price 100 --deposit 1000 --lower 81 --upper 121
```

```text
model                       concentrated
price                       100
base in pool                4.761905
quote in pool               523.809524
lp value                    1000
hedge side                  short
hedge size (base)           4.761905
hedge notional              476.190476
hedge ratio                 0.47619048
in range                    yes

A short of that base size offsets delta at this price. It does not cancel the curved loss.
```

Those are the text view of 100/21 base, 11000/21 quote, 10000/21 notional, and ratio 10/21.

At 121 the hedge size is 0 and the ratio is 0:

```bash
npx tsx src/cli.ts defi hedge --model concentrated --entry 100 --price 121 --deposit 1000 --lower 81 --upper 121
```

```text
model                       concentrated
price                       121
base in pool                0
quote in pool               1047.619
lp value                    1047.619
hedge side                  short
hedge size (base)           0
hedge notional              0
hedge ratio                 0
in range                    yes

A short of that base size offsets delta at this price. It does not cancel the curved loss.
```

At 81 the ratio is 1. You hold base. Notional equals the pool value.

```bash
npx tsx src/cli.ts defi hedge --model concentrated --entry 100 --price 81 --deposit 1000 --lower 81 --upper 121
```

```text
model                       concentrated
price                       81
base in pool                10.582011
quote in pool               0
lp value                    857.142857
hedge side                  short
hedge size (base)           10.582011
hedge notional              857.142857
hedge ratio                 1
in range                    yes

A short of that base size offsets delta at this price. It does not cancel the curved loss.
```

The last line of every hedge print says the short does not cancel the curved loss.

### Where the loss reaches a magnitude

```bash
npx tsx src/cli.ts defi bounds --model constant-product --entry 100 --kind il --magnitude 20%
```

```text
price down                  25
price up                    400
```

A 20 percent IL on a constant-product pool is a 4x move in either direction from an entry of 100. The closed form is exact. The tests check those prices within 1e-6.

The search is what concentrated ranges use. On the 81 to 121 range, magnitude 1/21 passed as the double 0.047619047619047616:

```bash
npx tsx src/cli.ts defi bounds --model concentrated --entry 100 --kind il --magnitude 0.047619047619047616 --lower 81 --upper 121
```

```text
price down                  82.572779
price up                    121
```

The test checks the up price against 121 within 1e-4, then checks that the loss at the returned up price matches 1/21 within 1e-6. The down price is the search result. There is no closed form for it in the docs.

## Historical checks

Three perp sizings and one concentrated range, on published OKX prints. The account, the 1 percent risk, the leverage cap of 10, and zero fees are inputs for this note. They are not a live account. OKX charges a fee that depends on the account tier, and this run does not pick a tier. Maintenance margin is 0.004, the tier-1 `mmr` from `position-tiers` for these families, read on 2026-10-07. That call is not a September archive.

Candles are `1Dutc` from `https://www.okx.com/api/v5/market/history-candles`. Funding is `realizedRate` from `https://www.okx.com/api/v5/public/funding-rate-history`. Contract value is `ctVal` from `https://www.okx.com/api/v5/public/instruments`. The tool sizes base. OKX orders are in contracts. Divide base by `ctVal`. The tool does not round to lot size.

Each perp enters at the 2026-09-03 00:00 UTC open. The stop is the prior day's low, already printed. The two targets are the 2026-09-03 close and the 2026-09-03 high, half the size at each. Both prices printed on that daily candle. A daily candle does not say which came first, so this is not a fill sequence. The funding input is the settlement at 2026-09-03 00:00 UTC, held flat for 24 hours, which is three periods. The next three settlements, 08:00, 16:00, and the following 00:00, are listed after the output. They are not what the flat rate assumed.

### BTC-USDT-SWAP, 2026-09-03

Candle `1788393600000`: open 77303.7, high 82279.9, low 76926, close 81228.7. Prior candle `1788307200000`: low 76204.5. Funding at the open: 0.0000583196496528. `ctVal` 0.01.

```text
side                        long
margin mode                 isolated
position size (base)        0.08986947
position size (quote)       6947.2423
notional                    6947.2423
margin needed               694.724229
effective leverage          0.69472423
leverage cap                10
entry                       77303.7
stop                        76204.5
liquidation                 69852.741
liquidation vs stop         6351.759
stop hits first             yes
funding                     1.215482
funding per 8h              0.00005832
hold hours                  24
breakeven                   77317.225

targets
  81228.7   close 50%   3.515222 R   net 175.761087   price-only 3.570779 R
  82279.9   close 50%   4.45993 R   net 222.996479   price-only 4.527111 R

blended
  close 100%   3.987576 R   net 398.757566   on full risk 3.987576 R
```

The printed 8 hour rate is the CLI rounding of 0.0000583196496528. Base 0.08986947 is 8.986947 contracts at `ctVal` 0.01. The day's low was 76926, above the stop at 76204.5. Liquidation at 69852.741 was not in that day's range.

The next three settlements were 0.0000457850394567, 0.0000383236146165, and 0.0000418741079605. They sum to 0.0001259827620337. The flat input was 0.0001749589489584. On this notional the flat estimate is 0.340249 quote more than those three charges.

### ETH-USDT-SWAP, 2026-09-03

Candle `1788393600000`: open 2390.96, high 2530.5, low 2368.73, close 2506.23. Prior candle low 2355.56. Funding at the open: 0.0001. `ctVal` 0.1.

```text
side                        long
position size (base)        2.768757
position size (quote)       6619.9876
notional                    6619.9876
margin needed               661.998764
entry                       2390.96
stop                        2355.56
liquidation                 2160.506
liquidation vs stop         195.053976
stop hits first             yes
funding                     1.985996
funding per 8h              0.0001
hold hours                  24
breakeven                   2391.6773

targets
  2506.23   close 50%   3.171686 R   net 158.584321   price-only 3.256215 R
  2530.5   close 50%   3.843664 R   net 192.183189   price-only 3.941808 R

blended
  close 100%   3.507675 R   net 350.767511   on full risk 3.507675 R
```

Base 2.768757 is 27.68757 contracts at `ctVal` 0.1. The day's low was 2368.73, above the stop. The next three settlements were 0.0000386701308021, 0.000037410071876, and 0.0001. They sum to 0.0001760802026781. The flat input was 0.0003. On this notional the flat estimate is 0.820348 quote more than those three charges.

### SOL-USDT-SWAP, 2026-09-03

Candle `1788393600000`: open 100.38, high 105.89, low 99.09, close 103.87. Prior candle low 97.31. Funding at the open: 0.0000131256086078. `ctVal` 1.

```text
side                        long
position size (base)        32.531405
position size (quote)       3265.5025
notional                    3265.5025
margin needed               326.550248
entry                       100.38
stop                        97.31
liquidation                 90.704819
liquidation vs stop         6.605181
stop hits first             yes
funding                     0.12858512
funding per 8h              0.00001313
hold hours                  24
breakeven                   100.383953

targets
  103.87   close 50%   1.13406 R   net 56.70301   price-only 1.136808 R
  105.89   close 50%   1.791195 R   net 89.55973   price-only 1.794788 R

blended
  close 100%   1.462627 R   net 146.26274   on full risk 1.462627 R
```

The printed 8 hour rate rounds 0.0000131256086078. Base 32.531405 is the same number of contracts at `ctVal` 1. The day's low was 99.09, above the stop. The next three settlements were 0.00000993789702, 0.0000300980923523, and 0.0000650156840406. They sum to 0.0001050516734129. The flat input was 0.0000393768258234. On this notional the flat estimate is 0.214461 quote less than those three charges. The rate rose after the open. A flat hold did not see that.

### ETH concentrated range, 2026-08-29 to 2026-09-07

This is the Uniswap v3 concentrated model in this repo, not an on-chain position. The prices are OKX ETH-USDT-SWAP daily fields.

Entry is the 2026-08-29 close, candle `1787961600000`, close 2456.4. The lower bound is the window's lowest low, 2355.56 on 2026-09-02. The upper bound is the window's highest high, 2548.37 on 2026-09-04. Price now is the 2026-09-07 close, candle `1788739200000`, close 2488.99. Deposit 10,000 quote is an input for the note.

```text
model                       concentrated
price entry                 2456.4
price now                   2488.99
price ratio                 1.013267
deposit                     10000
value now                   10050.8043
hold value                  10062.0275
IL fraction                 -0.0011154
divergence (quote)          11.223203
drawdown vs deposit         -50.804329
base now                    1.21678
quote now                   7022.2523
in range                    yes
```

The pool stayed inside the range on these daily extremes, because the bounds are the min low and the max high of the window. Value now is 10050.8043 against a 10,000 deposit, so drawdown vs deposit prints negative. Holding the starting coins would have been worth 10062.0275. The pool lags that hold by 11.223203 quote. IL fraction is -0.0011154.

## Limitations

If a venue's published liquidation formula disagrees with the equity identity, believe the venue for that venue.

What the perp model leaves out:

- Inverse contracts. Quantity and money are not in the same units as this model.
- A second position, or a cross wallet already short something else.
- Margin brackets that change with notional. One maintenance rate is the whole schedule.
- The insurance fund, auto-deleveraging, and a partial liquidation.
- Slippage. The stop fills at the stop price in this model.
- A funding path. You type one rate for the whole hold.
- Extra margin added after entry. Isolated liquidation assumes the venue leverage is the cap and you do not add margin. Adding margin pushes liquidation away. The full-account figure is the other extreme, not a forecast of what you will actually post.
- Fees charged in a third asset, rebates, and VIP tiers. A negative fee is rejected. If you are paid to make, set that fee to 0 and accept a slightly smaller size.

What the pool model leaves out:

- Weighted pools, stableswap, or more than two assets.
- A fee tier's share of swaps, concentrated tick spacing, or hooks.
- The gas and the price impact of entering, exiting, and rebalancing.
- Divergence from a hold of a different inventory than the one you actually deposited.
- A funding path on the hedge perp. Size that perp in the other calculator if you want margin and liquidation for the short.
- Any claim that fees will arrive on schedule. The breakeven figure is the APR that would match the loss you already computed. It is not a forecast.

The tool will not place an order. It will not store a fill. It will not tell you the trade is a good idea.

## Failure modes

- Treating exit 0 as a safe stop. The 20x example exits 0 unless you pass `--strict`, and liquidation is at 95.477387 with the stop at 90.
- Sizing on the price gap, then paying taker in and taker out. On the long example the gap is 5 and the unit loss is 5.0975. The printed quantity is 19.61746, not 20.
- Passing 0.01 in percent mode and expecting 1 percent. 0.01 means one hundredth of a percent. On the CLI, `--risk 1%` or `--risk-percent 1`. A bare `--risk 1` is 1 quote.
- Reading the 20 percent IL as the sizing fraction. The 4x example deploys 200, not 500, because the gap is 0.5 quote per quote deposited.
- Using drawdown and IL as the same budget. The 4x path has IL and no drawdown versus the deposit. The path to 25 has both, and the cash loss is the drawdown.
- Believing the hedge removed the loss. The ratio goes stale. At the top of the concentrated range the hedge is zero because you hold quote. One price earlier it was not.
- Reading 4.866667 as a pool you can find. It is the APR that would match a 20 percent gap in 30 days with fees earned half the time. A 50 percent APR on that same input does not cover it.
- Trusting one maintenance rate when the venue steps the rate up with notional. The real liquidation can sit closer than this model.
- Adding this output to a signal and calling the sum an edge. This calculator does not take a candle.

## When not to use it

- Inverse contracts.
- A book that already has another position in the same cross wallet.
- To decide that a trade is worth taking. There is no forecast in the output.
- To rank a yield, or to treat a typed fee APR as volume that will arrive.
- When you need the venue's liquidation price for live margin. Use the venue's number. Use this one to see the shape.

## Risk and size

The risk budget is the input. The position is the output. On the published long, 1 percent of 10,000 is 100 quote, the fee-adjusted loss is 100, and the binding constraint is `risk`. Effective leverage is 0.1961746 against a cap of 10.

When the cap binds, the fee-adjusted loss is below the budget on purpose. A note says so. Do not add size back to spend the rest of the budget. The account cannot open it at that leverage.

Liquidation distance is part of the risk. A stop beyond liquidation is a number in a file. The 20x example is the clean case: margin needed is 50, the loss at the stop would be 100, and the venue is modeled as closing the position 5.477387 points before that stop. Lower the cap until liquidation moves past the stop, or widen the stop until it sits beyond liquidation, or post more margin. The full-account price is the second extreme. It is not a promise that you will post it.

You can lose more than the fee-adjusted risk. That figure assumes the stop fills at the stop, that funding matches the single rate you typed, and that you are not liquidated first. Miss any one of those and the loss is a different number.

For a pool, name the scenario and the kind of loss before you name the deposit. A 1 percent IL budget on the 4x constant-product path deploys 200 of 10,000. The other 9,800 is the risk decision.

## CLI

Node 20 or newer. From a clone:

```bash
npm install
npm test
npx tsx src/cli.ts perp \
  --account 10000 \
  --risk 1% \
  --entry 100 \
  --stop 95 \
  --side long \
  --leverage 10 \
  --taker 0.0005 \
  --maker 0.0002 \
  --mmr 0.005 \
  --target 110
```

`--risk 1%` is one percent of the account. A bare `--risk 250` is 250 quote units.

```text
position-sizer perp [flags]
position-sizer defi il [flags]
position-sizer defi size [flags]
position-sizer defi breakeven [flags]
position-sizer defi hedge [flags]
position-sizer defi bounds [flags]
```

After `npm run build`, `npx position-sizer` runs `dist/src/cli.js` inside this package. `npx tsx src/cli.ts` runs the TypeScript without that build.

Shared flags: `--json`, `--strict`, `--file path` (and `--file -` for stdin), `--help`, `--version`. When a file is set, input flags besides `--json` and `--strict` are ignored.

JSON for a script:

```bash
npx tsx src/cli.ts perp --file examples/perp-long.json --json
npx tsx src/cli.ts defi il --file examples/defi-constant-product.json --json
```

A bare fee, maintenance rate, funding rate, or loss is a fraction. A trailing `%` divides by 100, so `--mmr 0.5%` and `--mmr 0.005` match. `--target` and `--r` can be repeated. `--target 110:50%` closes half at 110. `--funding-8h` with `--hold-hours` replaces `--funding`.

Perp flags: `--account`, `--risk` or `--risk-percent` or `--risk-fixed`, `--entry`, `--stop`, `--side long|short`, `--leverage`, `--taker`, `--maker`, `--mmr`, `--entry-liquidity taker|maker`, `--exit-liquidity taker|maker`, `--funding` or `--funding-8h` with `--hold-hours`, `--margin isolated|cross`, `--entry-fee-from-margin true|false`, `--target`, `--r`.

`defi il` and `defi hedge`: `--model constant-product|concentrated`, `--entry`, `--price`, `--deposit`, and `--lower` plus `--upper` when the model is concentrated.

`defi size`: those, plus `--capital`, `--kind il|drawdown`, and one of `--max-loss-percent` or `--max-loss`. The scenario price is `--price`.

`defi breakeven`: `--loss`, `--days`, optional `--fee-apr`, optional `--in-range`.

`defi bounds`: `--model`, `--entry`, `--kind il|drawdown`, `--magnitude`, and the range flags for a concentrated model.

The full flag list is [docs/CLI.md](docs/CLI.md). The printed text for the example files is also copied in [docs/EXAMPLES.md](docs/EXAMPLES.md).

## Library

The package is not on the npm registry. Clone it, or depend on the git tag `v0.2.0`. The import below resolves after `npm run build`. Tests import the TypeScript directly.

```ts
import { sizePerp, impermanentLoss, sizeLp, feeBreakeven, hedgeRatio } from "position-sizer";

const perp = sizePerp({
  accountSize: 10000,
  risk: { mode: "percent", value: 1 },
  entry: 100,
  stop: 95,
  side: "long",
  leverageCap: 10,
  takerFee: 0.0005,
  makerFee: 0.0002,
  maintenanceMarginRate: 0.005,
  targets: [110, 120],
});
```

`{ mode: "percent", value: 1 }` means 1 percent. It does not mean 0.01.

Also exported: `constantProductIl`, `priceRatiosForIl`, `lossBounds`, `concentratedAmounts`, `liquidityForDeposit`, and the liquidation helpers `isolatedLiquidationPrice`, `crossLiquidationPrice`, and `bankruptcyPrice`. Types come from the same module. `InputError` carries a `code`.

`constantProductIl(4)` is exactly -0.2. `priceRatiosForIl(0.2)` returns the ratios 4 and 0.25.

## Web page

The same functions run in the browser. Nothing you type is sent anywhere.

Hosted copy: <https://accompli.sh/position-sizer/>.

Locally, `npm run build:web` writes `web/position-sizer.js`. Open [web/index.html](web/index.html) after that. The page needs JavaScript. The CLI does not.

Two tabs. Perps is selected on load and already calculated. The fields are the fee long: account 10,000, risk mode percent, risk 1, side long, entry 100, stop 95, leverage cap 10, isolated, taker 0.0005, maker 0.0002, funding per 8h at 0, hold 8 hours, maintenance margin 0.005, targets `110, 120`, entry fee taken from the backing wallet. `Example: 1% long` restores that and recalculates. `Example: liq before stop` loads the 20x case (stop 90, cap 20, fees 0, funding 0, target 110) and recalculates. A loud warning shows in the same view as the size.

`Copy link` writes every field of the open tool into the URL hash and copies that URL. A hash is not sent with the page request. Opening the link restores the fields and calculates. `110:50, 120:50` is two partial closes. The result lists R and net for each, then the blend. Funding per 8h times hold hours over 8 is the funding in that net, and in the breakeven price.

![Perps inputs moving from full exits at 110 and 120, to 50 percent closes at those prices, then to a funding rate of 0.0001 per 8 hours over 24 hours. Funding, breakeven, and the blended R update in the same view.](docs/images/calc-demo.gif)

DeFi has four tools: IL, Size, Breakeven, Hedge.

- IL starts as constant product, entry 100, price 400, deposit 1,000. `Example: 4x` is that case. `Example: 81 to 121` switches to the concentrated range. Lower and upper appear only for the concentrated model.
- Size starts at capital 10,000, kind IL, max loss 1 percent, entry 100, scenario 400. The hint on that form is the 0.5 versus 0.2 distinction.
- Breakeven fields are percents, not fractions. Loss 20, horizon 30 days, fee APR 50, in range 50. That is the same case as `--loss 20% --days 30 --fee-apr 50% --in-range 50%` on the CLI. `Example: 30 days` loads it.
- Hedge starts at constant product, entry 100, price 100, deposit 1,000. `Example: half the value` is that short of 5 base.

On the perp and size forms, 1 in a percent field means 1 percent. On the breakeven form, 20 means 20 percent. Fees and the maintenance rate on the perp form are fractions: 0.0005 is 5 basis points, 0.005 is 0.5 percent.

## FAQ

### Why is the size smaller than account times risk divided by the stop distance

Fees and funding sit inside the unit loss. On the worked long, 100 / 5 would be 20 base. 100 / 5.0975 prints as 19.61746. The fee-adjusted loss is then 100, which was the budget.

### I passed 0.01 and got a tiny position

In percent mode, 1 means 1 percent. 0.01 means one hundredth of a percent. On the CLI, write `--risk 1%` or `--risk-percent 1`.

### The liquidation is above my long stop

The stop is still an order. It does not cap the loss if the position is liquidated on the way down. Widen the stop until it sits beyond liquidation, lower the leverage cap so liquidation moves away, or post more margin. The full-account price is the last of those, as an extreme, not as a forecast of what you will post.

### Does this match my exchange

Not as a claim. The liquidation price is the equity identity in [docs/PERPS.md](docs/PERPS.md): wallet plus pnl equals maintenance on the mark, plus the taker fee to close. Exchanges add brackets, other positions, and their own fee treatment. If their number disagrees, use theirs for live margin and use this one to see the shape.

### What is the difference between isolated and cross here

Isolated backs the position with initial margin at the cap. Cross backs it with the whole account, and assumes this is the only position. The short example is the clean one: isolated 119.402985, full account 1094.5274, because 10,000 quote is standing behind 1,000 of notional.

### The 4x IL says 20 percent but sizing used 0.5

Both. 20 percent is the pool versus holding the coins. 0.5 is the quote gap per quote you deposited, because the hold grew to 2.5x while the pool grew to 2x. A budget is a pile of quote, so the size uses the gap. That is why 100 quote of IL budget deploys 200.

### Does the hedge remove impermanent loss

No. It flats the base delta at the price you ran. Move the price and the hedge is the wrong size. The last line of the hedge output says this on purpose.

### The breakeven APR looks absurd

On that input it is. A 20 percent gap over 30 days, in range half the time, needs a fee APR of 4.866667. Over a year, in range the whole time, the same gap needs 0.2. Those are different questions. Change `--days` and look again.

### Can I lose more than the fee-adjusted risk

Yes. Slippage past the stop is not in the model. Neither is a liquidation that arrives first, or a funding path that is not the single rate you typed.

### Is this financial advice

No. The numbers are this model applied to the inputs you type. Past results do not predict future results.

## License

[MIT](LICENSE). Copyright 2026 position-sizer contributors.
