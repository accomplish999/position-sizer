# Examples

Input objects for `--file`. The printed results, and what they mean, are in [docs/EXAMPLES.md](../docs/EXAMPLES.md).

```bash
npx tsx src/cli.ts perp --file examples/perp-long.json --json
npx tsx src/cli.ts perp --file examples/perp-short.json
npx tsx src/cli.ts perp --file examples/perp-liq-before-stop.json --strict
npx tsx src/cli.ts defi il --file examples/defi-constant-product.json
npx tsx src/cli.ts defi il --file examples/defi-concentrated.json
npx tsx src/cli.ts defi size --file examples/defi-size.json
npx tsx src/cli.ts defi breakeven --file examples/defi-breakeven.json
npx tsx src/cli.ts defi hedge --file examples/defi-hedge.json
```
