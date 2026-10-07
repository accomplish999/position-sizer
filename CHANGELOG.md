# Changelog

## 0.2.0

- The hosted calculator is <https://accompli.sh/position-sizer/>.
- Partial closes. A target can carry a close percent. Each row has a net and an R. The blend sums the closed slices.
- Funding per 8 hours and a hold in hours. That cost is in the size, the target nets, and the breakeven price.
- The page keeps its inputs in the URL hash. Copy link copies that URL. Opening it restores the fields.

## 0.1.0

First public release.

- Perp position size in base and quote, with fees, an optional funding estimate, margin, effective leverage, liquidation distance, and R multiples.
- Loud warning when liquidation sits before the stop.
- Constant-product and concentrated-range impermanent loss, deposit sizing against a loss budget, fee APR breakeven, and a perp hedge ratio.
- CLI with text and JSON output.
- Static page in `web/`.
