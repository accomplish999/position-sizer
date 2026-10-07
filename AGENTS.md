# Agents

This repo calculates a size. It does not send an order. Do not treat a result as a signal.

Use `--json`. Read `ok`, then `warnings`, then `result`. A loud warning is still a successful calculation. Exit 0 means "no loud warning, or strict mode was off." It does not mean the stop is safe.

```bash
npx tsx src/cli.ts perp --file examples/perp-long.json --json
npx tsx src/cli.ts perp --file examples/perp-liq-before-stop.json --json --strict
npx tsx src/cli.ts defi il --file examples/defi-constant-product.json --json
npx tsx src/cli.ts defi size --file examples/defi-size.json --json
npx tsx src/cli.ts defi breakeven --file examples/defi-breakeven.json --json
npx tsx src/cli.ts defi hedge --file examples/defi-hedge.json --json
```

`--strict` on the liquidation example exits 3 and still prints the body. Parse stdout either way.

Percent inputs: `1` means 1 percent, not 0.01. On the CLI, prefer `--risk 1%`.

Full field list, exit codes, and the JSON envelope: [docs/AGENTS.md](docs/AGENTS.md).
Formulas: [docs/PERPS.md](docs/PERPS.md), [docs/DEFI.md](docs/DEFI.md).
