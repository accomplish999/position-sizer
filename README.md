# position-sizer

[![ci](https://github.com/accomplish999/position-sizer/actions/workflows/ci.yml/badge.svg)](https://github.com/accomplish999/position-sizer/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/github/license/accomplish999/position-sizer)](./LICENSE)

Size the loss before you size the trade.

Two calculators. One for perpetual futures. One for a liquidity position. Fees go in before the size comes out. The perp calculator also checks whether liquidation sits before the stop.

A stop the venue will never reach is not a stop.

This is arithmetic. It is not a signal, and it is not advice. Past results do not predict future results.

## What you get

- Position size in base and in quote, notional, margin, and effective leverage.
- Fee-adjusted loss at the stop, including an optional funding estimate.
- Estimated liquidation price, and the distance from your stop. A loud warning when liquidation is first.
- R multiples for the target prices you pass, and the price that lands on 1R, 2R, and 3R after fees.
- Impermanent loss for a constant-product pool and for a concentrated range.
- How much capital to deploy so a chosen scenario stays inside a loss budget.
- The fee APR that would cover that loss over a horizon you pick.
- The perp size that hedges the base exposure of the liquidity position right now.

The formulas are in [docs/PERPS.md](docs/PERPS.md) and [docs/DEFI.md](docs/DEFI.md). The tests lock the worked numbers.

## Quick start

Node 20 or newer.

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

`--risk 1%` is one percent of the account. A bare `--risk 250` is 250 quote units, not a percent.

JSON, for a script or an agent:

```bash
npx tsx src/cli.ts perp --file examples/perp-long.json --json
npx tsx src/cli.ts defi il --file examples/defi-constant-product.json --json
```

`--strict` exits 3 when a loud warning is present. The JSON is still printed. Exit 1 is a bad input. Exit 0 is a result with no loud warning.

The same inputs are filled in on the static page: open [web/index.html](web/index.html) after `npm run build:web`, or use the hosted copy once Pages has deployed.

## Library

```ts
import { sizePerp, impermanentLoss, sizeLp, feeBreakeven, hedgeRatio } from "position-sizer";
```

That import resolves after `npm run build`. From a clone, tests import the TypeScript directly. This package is not published to the npm registry. Clone it, or depend on the git tag.

`1` in `{ mode: "percent", value: 1 }` means 1 percent. It does not mean 0.01.

## Read next

- [Docs index](docs/INDEX.md)
- [Perps formulas](docs/PERPS.md)
- [DeFi formulas](docs/DEFI.md)
- [CLI](docs/CLI.md)
- [Examples](docs/EXAMPLES.md)
- [Agents](AGENTS.md)
- [FAQ](docs/FAQ.md)
- [Glossary](docs/GLOSSARY.md)

## What it will not do

It will not place an order. It will not tell you the trade is a good idea. It does not know your venue's margin brackets. If the venue steps the maintenance rate up with notional, the real liquidation can differ from this model. Read the "What this does not model" section in each formula doc before you trust a number with money behind it.

## License

[MIT](LICENSE). Copyright 2026 position-sizer contributors.
