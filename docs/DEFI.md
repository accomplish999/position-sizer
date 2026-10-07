# DeFi

Two pool shapes.

Constant product is the 50/50 pool: the product of the two reserves stays constant. Concentrated is a single range, in the sense of the Uniswap v3 whitepaper: liquidity L between a lower price and an upper price, valued with square-root prices. It is not a list of ticks, and it is not a share of someone else's fee tier.

Prices are the price of the base asset in quote. A deposit is a quote value at the entry price.

References worth reading next to this file:

- Uniswap v2 whitepaper: <https://uniswap.org/whitepaper.pdf>
- Uniswap v3 core: <https://uniswap.org/whitepaper-v3.pdf>

The IL algebra below is derived in this repo and checked against known checkpoints. It is not a paste of a table from a blog.

## Constant product

Start with deposit V at price P0. Half the value is quote, half is base.

```text
quote0 = V / 2
base0  = V / (2 * P0)
```

After the price moves to P, with r = P / P0:

```text
base  = base0 * sqrt(P0 / P)
quote = quote0 * sqrt(P / P0)
value = V * sqrt(r)
```

Hold the original tokens instead, and mark them at P:

```text
hold = (V / 2) * (1 + r)
```

Impermanent loss:

```text
IL = value / hold - 1 = 2 * sqrt(r) / (1 + r) - 1
```

IL is 0 when r is 1. It is negative when the price moves. The same move up and the inverse move down produce the same IL. A 4x move and a move to 0.25x are both -0.20.

The gap versus holding, in quote, is `hold - value`. That gap is not the same thing as "20 percent of the deposit". On a 4x move the hold is worth 2.5 deposits and the pool is worth 2 deposits. IL versus the hold is 20 percent. The gap is 0.5 quote per 1 quote you deposited.

Drawdown versus the deposit is `deposit - value`. On a 4x move the pool is up, so drawdown is negative. On a move to 0.25x the pool is worth half the deposit, so drawdown is half.

### Checkpoints

These are the usual rounded table, and the exact expression the tests use.

| Price ratio | IL                        | Often quoted as    |
| ----------- | ------------------------- | ------------------ |
| 1.25        | 2 * sqrt(1.25) / 2.25 - 1 | about 0.6 percent  |
| 1.50        | 2 * sqrt(1.5) / 2.5 - 1   | about 2.0 percent  |
| 2           | 2 * sqrt(2) / 3 - 1       | about 5.7 percent  |
| 3           | 2 * sqrt(3) / 4 - 1       | about 13.4 percent |
| 4           | -0.2 exactly              | 20 percent         |
| 5           | 2 * sqrt(5) / 6 - 1       | about 25.5 percent |

The tests allow 0.05 percentage points against that rounded column, and they check the exact expression on its own.

Solving IL = -m for the ratio, with m between 0 and 1:

```text
s = 1 / (1 - m) ± sqrt(1 / (1 - m)^2 - 1)
ratio = s^2
```

The two roots are reciprocals. For m = 0.2 they are 4 and 0.25. Loss never quite reaches 100 percent, so m = 1 is rejected.

`examples/defi-constant-product.json` is a 1,000 quote deposit from 100 to 400.

```text
value now            2000
hold value           2500
IL fraction          -0.2
divergence (quote)   500
base now             2.5
quote now            1000
```

## Concentrated range

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

The two formulas meet at the boundaries. The tests check that an out-of-range price and the boundary price hold the same inventory on the exhausted side.

Value is always `quote + base * price`.

Given a deposit at a price, L is the deposit divided by the value of one unit of liquidity at that price.

```text
in range:          2 * sp - sa - price / sb
at or below lower: (1 / sa - 1 / sb) * price
at or above upper: sb - sa
```

IL uses the same definition as the constant-product case: value now, divided by the marked value of the entry tokens, minus 1. The entry tokens are whatever the range held at the entry price, including a one-sided position if you entered outside the range.

A very wide range approaches the constant-product IL. The test uses a range from price/1,000,000 to price*1,000,000 and expects the 1.5x IL to agree within 3e-5. A tight range loses more than the full-range pool on the same move. That test is in the suite too.

### Worked range

Deposit 1,000 quote at price 100, range 81 to 121. The square roots are 9, 10, and 11.

```text
value per L at entry = 2 * 10 - 9 - 100 / 11 = 21 / 11
L = 1000 * 11 / 21 = 11000 / 21
base at entry  = 100 / 21
quote at entry = 11000 / 21
```

At the upper price, 121, the position is entirely quote. Value is 22000/21. The held tokens would be worth 1,100. IL is -1/21.

`examples/defi-concentrated.json` prints the rounded form: value now 1047.619, IL fraction -0.04761905, divergence about 52.38 quote.

At the lower price, 81, value is 6000/7 and IL is -11/191. The tests use the fractions, not the rounded text.

## Sizing to a loss budget

IL as a fraction of the hold does not shrink when you deposit less. The quote gap does.

```text
loss fraction = (gap at the scenario) / (one quote deposited)
deploy        = min(capital, max loss quote / loss fraction)
```

For kind `il`, the gap is hold value minus pool value. For kind `drawdown`, the gap is the deposit minus pool value, and it is zero when the pool is above the deposit.

On the 4x constant-product scenario the IL fraction is -0.2, and the loss fraction used for sizing is 0.5, because the gap is half a quote per quote deposited. A 10,000 capital with a 1 percent IL budget (100 quote) deploys 200, not 500. `examples/defi-size.json` prints that. Deploying 500 would leave a 250 quote gap, which is more than the 100 you allowed.

If the scenario has no loss of the kind you asked for, the full capital is deployable and `scenarioHasNoLoss` is true. A 4x rally has no drawdown versus the deposit. The tool says so instead of inventing a size.

You can also ask where the loss reaches a magnitude. Constant product uses the closed form above. Concentrated ranges are searched outward from the entry on a log grid, then refined. `defi bounds --magnitude 20%` on a constant-product entry of 100 returns 25 and 400.

## Fee APR against that loss

This is a scenario comparison, not a path.

```text
breakeven APR = loss fraction / (horizon days / 365) / in-range fraction
```

The in-range fraction is the share of the horizon you assume fees are earned. It defaults to 1, which is generous for a tight range. Pass 0 and there is no finite APR that covers the loss, because nothing is earned.

If you also pass a fee APR, income over the horizon is `fee APR * (days / 365) * in-range fraction`. Net is that income minus the loss fraction. `covers` is true when net is at least zero.

No compounding. Fees in a real pool depend on volume, not on the calendar. An APR here is an average you are willing to type, not a quote from a pool.

`examples/defi-breakeven.json` asks what 50 percent fee APR does to a 20 percent loss over 30 days, in range half the time.

```text
breakeven fee APR      4.866667
fee income fraction    0.02054795
net fraction           -0.17945205
fees cover the loss    no
```

Read that slowly. Half a year of fees, compressed into a month and then cut in half again because the range is only active half the time, covers about 2 percent. The loss you typed was 20 percent. The hurdle APR is about 487 percent. Most pools do not pay that. The calculator is not going to pretend they do.

## Hedge ratio

For both of these curves, the base exposure at a price is the base inventory at that price. A perp hedge of the delta is a short of that many base units.

```text
hedge notional = base inventory * price
hedge ratio    = hedge notional / pool value
```

Constant product: the ratio is 1/2 at every price. At entry, with a 1,000 deposit at price 100, you short 5 base. Notional 500. `examples/defi-hedge.json` prints that. After a 4x move you would short 2.5 base, still half the current value. The first hedge is stale.

Concentrated, same 81 to 121 range, 1,000 deposit, at the entry price: base inventory is 100/21, hedge ratio is 10/21. Not one half. The range is symmetric in square-root price, which leaves a bit more quote than base notional.

At the upper bound the hedge is 0. You hold quote. At the lower bound the ratio is 1. You hold base.

The short offsets the slope. It does not cancel the curve. The pool's value bends the wrong way relative to holding (you are short gamma). A static hedge drifts as soon as the price moves. Run the helper again at the new price if you want the delta flat again. Rebalancing has its own cost, and this tool does not subtract it.

## What this does not model

- Weighted pools, stableswap, or more than two assets.
- A fee tier's share of swaps, concentrated tick spacing, or hooks.
- The gas and the price impact of entering, exiting, and rebalancing.
- Divergence from a hold of a different inventory than the one you actually deposited.
- A funding path on the hedge perp. Size that perp in the other calculator if you want margin and liquidation for the short.
- Any claim that fees will arrive on schedule. The breakeven figure is the APR that would match the loss you already computed. It is not a forecast.
