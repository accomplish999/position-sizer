# Perps

Linear contract. Quantity is in base. Money is in quote. One position. No other positions, and no bracket schedule.

The model below is the one the tests check. A venue can publish a different liquidation formula. If it does, this number is a map, not a photograph.

## Inputs

| Input                   | Meaning                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Account size            | Quote balance that can back the trade.                                                                               |
| Risk                    | Percent of the account, or a fixed quote amount. In percent mode, 1 means 1 percent.                                 |
| Entry, stop, side       | Stop must be below entry for a long and above entry for a short.                                                     |
| Leverage cap            | The highest leverage you will set on the venue.                                                                      |
| Taker fee, maker fee    | Fractions of notional. 0.0005 is 5 basis points. Both default to the taker rate for entry and for the stop exit.     |
| Funding rate            | Optional. A fraction of entry notional over the hold you expect. Positive means you pay. Negative means you receive. |
| Maintenance margin rate | Fraction of mark notional. 0.005 is 0.5 percent.                                                                     |
| Margin mode             | `isolated` or `cross`. Isolated is the default.                                                                      |
| Entry fee from margin   | Default true. The entry fee is taken from the wallet that backs the position before liquidation is estimated.        |

## Risk budget

Percent mode:

```text
risk budget = account * (percent / 100)
```

Fixed mode: the risk budget is the number you passed, in quote.

A percent above 100 is rejected. A fixed budget larger than the account is allowed, and it raises a note. The leverage cap still limits the size.

## Unit loss

Per one base unit, the quote loss at the stop is the price gap plus the entry fee, the exit fee at the stop, and funding.

```text
unit loss = |entry - stop|
          + entry fee rate * entry
          + exit fee rate * stop
          + funding rate * entry
```

The entry fee rate is the taker or maker rate you assigned to the entry. The exit fee rate is the one you assigned to the stop. Funding uses the sign you passed.

If unit loss is not positive, funding and fees turned the stop into a credit. The calculator stops. There is nothing to size.

```text
quantity from risk = risk budget / unit loss
```

When this quantity is the one you get, the fee-adjusted loss at the stop equals the risk budget. That is the point of putting fees in the denominator. Sizing on the price gap alone, and then discovering the fees, is how a 1 percent risk becomes 1.1 percent.

## Leverage cap

Opening the position has to fit in the account.

If the entry fee is paid from the account:

```text
max quantity = account / ((1 / leverage cap + entry fee rate) * entry)
```

If the entry fee is paid from somewhere else, drop the entry fee rate from that sum.

```text
quantity = min(quantity from risk, max quantity)
```

If the cap wins, `bindingConstraint` is `leverage_cap` and the fee-adjusted loss is smaller than the budget. The note says so. The size is not silently stretched to make the budget true.

## Margin and effective leverage

```text
notional = quantity * entry
margin    = notional / leverage cap
effective leverage = notional / account
```

Margin here is the initial margin at the leverage cap. It is not a suggestion to post more. Effective leverage is how hard the whole account is working. It can be well below the cap. That is normal for a small risk and a wide stop.

Quote size and notional are the same number on a linear contract.

## Liquidation

Equity is the backing wallet plus unrealized pnl. The position is treated as liquidated when equity equals maintenance margin on the mark notional, plus the taker fee to close.

Maintenance and the close fee both use the mark price, which this model takes to be the price itself.

Isolated wallet, per unit of notional, when the entry fee comes out of that wallet:

```text
wallet fraction = 1 / leverage cap - entry fee rate
```

If that fraction is not positive, the entry fee eats the initial margin. The calculator refuses the input. Lower the cap, or lower the fee.

Long, isolated:

```text
liquidation = entry * (1 - wallet fraction) / (1 - maintenance margin rate - taker fee)
```

Short, isolated:

```text
liquidation = entry * (1 + wallet fraction) / (1 + maintenance margin rate + taker fee)
```

If the long result is not positive, the price cannot liquidate the position. The reported price is 0.

Cross uses the whole account as the wallet, minus the entry fee when that fee comes out of the account.

```text
long:  liquidation = (quantity * entry - wallet) / (quantity * (1 - maintenance margin rate - taker fee))
short: liquidation = (quantity * entry + wallet) / (quantity * (1 + maintenance margin rate + taker fee))
```

A non-positive long result is reported as 0.

The selected margin mode picks which price is `liquidation`. Both prices are always returned: `liquidationAtCap` and `liquidationIfAccountBacksIt`. When the position already uses the whole account as margin, the two prices match. The tests check that.

Bankruptcy is the price where equity would hit zero if maintenance margin and the close fee were both zero.

```text
long:  entry - wallet / quantity
short: entry + wallet / quantity
```

A long bankruptcy at or below zero is reported as 0. Liquidation should sit on the safer side of bankruptcy: higher than bankruptcy for a long, lower for a short. The no-fee examples in the tests check that order.

### Distance from the stop

```text
long:  distance = stop - liquidation
short: distance = liquidation - stop
```

Positive means the stop is hit first. Negative means liquidation is first.

A long warning fires when the selected liquidation is above the stop. A short warning fires when it is below the stop. Price moving against you reaches the venue before it reaches your order.

If you are on isolated margin and the full-account price is also on the wrong side of the stop, a second loud warning fires. Posting the rest of the account does not save that trade.

## Fees, funding, and the split

```text
price risk        = quantity * |entry - stop|
entry fee         = entry fee rate * notional
exit fee at stop  = exit fee rate * quantity * stop
funding           = funding rate * notional
fee-adjusted risk = price risk + entry fee + exit fee at stop + funding
```

A funding credit reduces the fee-adjusted risk. A funding payment increases it.

Pass `fundingRate` as that signed fraction, positive when you pay. Or pass `fundingPer8h` and `holdHours`. The total fraction is `fundingPer8h * holdHours / 8`. A positive 8 hour rate means longs pay and shorts receive. Do not pass both. Breakeven is the full-close price where net is zero after fees and funding.

## R

For a target price T, net pnl is the price pnl minus the entry fee, the exit fee at T, and funding.

```text
R = net pnl / fee-adjusted risk
```

The fee-adjusted risk in that ratio is the loss of the position you actually sized. If the leverage cap cut the size, R is measured against that smaller loss, not against the original budget.

At the stop, R is -1. That is checked in the tests, including with fees and funding. The price-only R ignores fees:

```text
long:  (target - entry) / (entry - stop)
short: (entry - target) / (stop - entry)
```

The calculator also solves the net-pnl equation for price at R = -1, 1, 2, and 3, unless you pass your own list. R = -1 comes back as the stop.

A target may be a price, or a price and a close percent. `closePercent: 50` closes half the original size. That row's R uses the fee-adjusted loss of the half, so it matches a full exit at the same price. When every target has a close percent, `blended` sums the nets. Blended R divides by the loss of the closed size. `rOnFullRisk` divides by the loss of the whole position. Percents must be above 0, at most 100, and must not add past 100. A list of bare prices stays a set of full-size scenarios and does not blend. Mixing the two is an error. A partial list that adds to less than 100 raises `TARGETS_LEAVE_A_REST`.

## Worked long

Input: `examples/perp-long.json`. Account 10,000, risk 1 percent, entry 100, stop 95, long, leverage cap 10, taker 0.0005 on entry and on the exit, maintenance margin 0.005, no funding.

```text
unit loss = 5 + 0.0005 x 100 + 0.0005 x 95 = 5.0975
```

Quantity = 100 / 5.0975.

The text view rounds. This is what the CLI prints:

```text
position size (base)        19.61746
position size (quote)       1961.746
notional                    1961.746
margin needed               196.174595
effective leverage          0.1961746
liquidation                 90.548014
liquidation vs stop         4.451986
stop hits first             yes
liquidation, full account   0
bankruptcy                  90.05
fee-adjusted risk           100
price risk                  98.087298
entry fee                   0.98087298
exit fee at stop            0.93182933
```

Target 110 is about 1.94 R after fees, and 2 R on price alone. The full account cannot liquidate this long: notional is about 1,962 against a 10,000 account, so that price is reported as 0.

Isolated liquidation with the entry fee taken from margin:

```text
100 * (1 - 0.1 + 0.0005) / (1 - 0.005 - 0.0005) = 90.548014...
```

## Worked short, no fees

Input: `examples/perp-short.json`. Risk 100 quote, entry 100, stop 110, leverage cap 5, maintenance margin 0.005.

Quantity is 10. Notional is 1,000. Margin is 200. Effective leverage is 0.1.

Isolated liquidation:

```text
100 * (1 + 1/5) / 1.005 = 119.402985...
```

The stop at 110 is hit first. Distance is about 9.40. Bankruptcy is 120, past liquidation, which is the right order for a short.

The full-account liquidation is about 1,094.53. That is not a bug. Cross margin puts the whole 10,000 behind a 1,000 notional short, so the price has to travel a long way. Isolated at 5x does not.

## Liquidation before the stop

Input: `examples/perp-liq-before-stop.json`. Entry 100, stop 90, leverage cap 20, maintenance margin 0.005, no fees.

```text
100 * (1 - 1/20) / 0.995 = 95.477387...
```

The stop is 90. Liquidation is about 95.48. Distance is about -5.48. The warning is loud, and `stop hits first` is `no`.

The stop order is still a real order. It does not cap the loss if the venue closes the position on the way there.

## Warnings

| Code                                  | Severity | When                                                                 |
| ------------------------------------- | -------- | -------------------------------------------------------------------- |
| `LIQUIDATION_BEFORE_STOP`             | loud     | The selected liquidation is on the wrong side of the stop.           |
| `FULL_ACCOUNT_STILL_LIQUIDATES_FIRST` | loud     | Isolated mode, and the full-account price is also on the wrong side. |
| `LEVERAGE_CAP_BINDS`                  | note     | Size was cut. Fee-adjusted risk is below the budget.                 |
| `RISK_BUDGET_ABOVE_ACCOUNT`           | note     | The fixed risk budget is larger than the account.                    |
| `TARGETS_LEAVE_A_REST`                | note     | Partial closes add up to less than 100 percent.                      |

`--strict` turns a loud warning into exit code 3. It does not hide the result.

## What this does not model

- Inverse contracts.
- A second position, or a cross wallet already short on something else.
- Margin brackets that change with notional. One maintenance rate is the whole schedule here.
- The insurance fund, auto-deleveraging, and a partial liquidation.
- Slippage. The stop is assumed to fill at the stop price. Live stops often do not.
- A path of changing funding rates. One 8 hour rate times the number of periods is a flat hold, not the settlements that actually print.
- Extra margin added after entry. Isolated liquidation assumes the venue leverage is the cap and you do not add margin. Adding margin pushes liquidation away. The full-account figure is the other extreme, not a forecast of what you will actually post.
- Fees charged in a third asset, rebates, and VIP tiers. A negative fee is rejected. If you are paid to make, set that fee to 0 and accept a slightly smaller size.

If your venue's published formula disagrees with the equity identity in this file, believe the venue for that venue. The tests here check this identity, not a screenshot from a specific exchange.
