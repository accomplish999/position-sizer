# Glossary

## Bankruptcy price

The price where the backing wallet plus unrealized pnl is zero, if you ignore maintenance margin and the fee to close. Liquidation happens before this, on the side that still leaves maintenance margin.

## Base

The asset the price is quoted for. On a BTC-USDT perp, base is BTC. Position size in base is a quantity of BTC.

## Drawdown versus deposit

Deposit minus the pool's current value, in quote. Positive when the position is worth less than you put in. A rally can show a negative drawdown and a negative IL at the same time.

## Effective leverage

Notional divided by account size. This is not the leverage cap. A small position on a large account has a small effective leverage even if the venue is set to 20x.

## Fee-adjusted risk

The quote loss at the stop after the entry fee, the exit fee at the stop price, and the funding estimate. When the risk budget is what binds, this equals the budget.

## Hedge ratio

Hedge notional divided by the pool's current value. For a constant-product pool it is one half. For a concentrated range it moves from 1 (all base, below the range) to 0 (all quote, above the range).

## Impermanent loss

Pool value divided by the value of holding the entry tokens, minus 1. Zero if price has not moved. Negative if it has. "Impermanent" is the usual name. If you exit at the new price, the gap is permanent.

## Initial margin

Notional divided by the leverage cap. The amount the isolated model posts at the venue setting you chose as the cap.

## Liquidation price

The mark where equity equals maintenance margin plus the taker fee to close. See [PERPS.md](PERPS.md) for the long and short forms.

## Maintenance margin rate

The fraction of mark notional the venue wants left before it liquidates. 0.005 means 0.5 percent. This tool takes one rate, not a ladder.

## Notional

Quantity times entry, in quote. On these linear contracts it is also the quote size of the position.

## Quote

The money unit. USDT, if that is how the contract is quoted. Risk, margin, fees, and R pnl are in quote.

## R

Net pnl at a price, divided by the fee-adjusted loss at the stop. The stop is -1 R after fees. A price-only R ignores fees and will look cleaner than the net one.

## Unit loss

Quote lost per one base unit if the stop fills, including fees and funding. Quantity is the risk budget divided by unit loss, then cut by the leverage cap if needed.
