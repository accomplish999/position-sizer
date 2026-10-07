# FAQ

## Why is the size smaller than account times risk, divided by the stop distance?

Fees and funding are inside the unit loss. The price gap is only the first term. If you size on the gap and then pay taker to get in and taker to get stopped, you lose more than the budget. This tool shrinks the quantity until the whole loss matches the budget, unless the leverage cap shrinks it further.

## I passed 0.01 and got a tiny position

In percent mode, 1 means 1 percent. 0.01 means one hundredth of a percent. On the CLI, write `--risk 1%` or `--risk-percent 1`.

## The liquidation is above my long stop. Is the stop still useful?

It is still an order. It does not cap the loss if the position is liquidated on the way down. The warning exists for that case. Either widen the stop until it sits beyond liquidation, lower the leverage cap so liquidation moves away, or post more margin. The full-account price shows the second of those extremes. It is not a promise that you will post it.

## Does this match my exchange?

Not as a claim. The liquidation price is the equity identity in [PERPS.md](PERPS.md): wallet plus pnl equals maintenance on the mark, plus the taker fee to close. Exchanges add brackets, other positions, and their own fee treatment. If their number disagrees, use theirs for live margin and use this one to see the shape of the problem.

## What is the difference between isolated and cross here?

Isolated backs the position with initial margin at the leverage cap. Cross backs it with the whole account, and assumes this is the only position. Same size, same fees. The liquidation prices differ, sometimes by a lot. The short example is the clean one: isolated near 119, full account near 1,095, because 10,000 quote is standing behind 1,000 of notional.

## The 4x IL says 20 percent, but sizing used 0.5. Which is it?

Both. 20 percent is the pool versus holding the coins. 0.5 is the quote gap per quote you deposited, because the hold grew to 2.5x while the pool grew to 2x. A budget is a pile of quote, so the size uses the gap. [DEFI.md](DEFI.md) walks through the 200 deploy on a 100 quote budget.

## Does the hedge remove impermanent loss?

No. It flats the base delta at the price you ran. The pool still bends. Move the price and the hedge is the wrong size. The last line of the hedge output says this on purpose.

## The breakeven APR looks absurd

It often is. A 20 percent gap over 30 days, in range half the time, needs a fee APR near 487 percent. The tool is not going to round that into something comforting. If the horizon is a year and you stay in range, a 20 percent gap needs a 20 percent fee APR, which is a different question. Change `--days` and look again.

## Can I lose more than the fee-adjusted risk?

Yes. The fee-adjusted risk assumes the stop fills at the stop, that funding matches the single rate you typed, and that you are not liquidated first. Miss any one of those and the loss is a different number. Slippage past the stop is not in the model.

## Is this financial advice?

No. Past results do not predict future results. The numbers are this model applied to the inputs you type.
