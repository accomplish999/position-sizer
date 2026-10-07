# CLI

```text
position-sizer perp [flags]
position-sizer defi il [flags]
position-sizer defi size [flags]
position-sizer defi breakeven [flags]
position-sizer defi hedge [flags]
position-sizer defi bounds [flags]
```

From a clone, `npx tsx src/cli.ts` runs the TypeScript. After `npm run build`, `npx position-sizer` runs `dist/src/cli.js` if you are inside this package.

## Shared flags

| Flag              | Effect                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `--json`          | One JSON object on stdout. Errors are JSON too.                                                                                        |
| `--strict`        | Exit 3 if the result contains a loud warning. The body is still printed.                                                               |
| `--file path`     | Read the input object from a file. `--file -` reads stdin. Input flags besides `--json` and `--strict` are ignored when a file is set. |
| `--help`, `-h`    | Print help. Exit 0.                                                                                                                    |
| `--version`, `-v` | Print the version. Exit 0.                                                                                                             |

## Exit codes

| Code | Meaning                                                        |
| ---- | -------------------------------------------------------------- |
| 0    | A result, and no loud warning (or `--strict` was not set).     |
| 1    | Bad input, unknown command, or invalid JSON.                   |
| 3    | A result that includes a loud warning, and `--strict` was set. |

Text mode writes errors to stderr as `CODE: message`. JSON mode writes every object to stdout.

## Perp flags

```text
--account <quote>
--risk <1% or a fixed quote amount>
--risk-percent <1 means 1 percent>
--risk-fixed <quote>
--entry <price>
--stop <price>
--side long|short
--leverage <cap>
--taker <fraction or %>
--maker <fraction or %>
--mmr <fraction or %>
--entry-liquidity taker|maker
--exit-liquidity taker|maker
--funding <fraction or %>
--margin isolated|cross
--entry-fee-from-margin true|false
--target <price>
--r <multiple>
```

Pass one of `--risk`, `--risk-percent`, or `--risk-fixed`. `--target` and `--r` can be repeated.

A bare fee or maintenance rate is a fraction. A trailing `%` divides by 100, so `--mmr 0.5%` and `--mmr 0.005` match. `--risk 1%` is percent mode. `--risk 1` is a fixed 1 quote, which is almost never what you want.

## DeFi flags

`il`

```text
--model constant-product|concentrated
--entry <price>
--price <price now>
--deposit <quote>
--lower <price>
--upper <price>
```

Lower and upper are required for `concentrated`.

`size`

```text
--model constant-product|concentrated
--capital <quote>
--kind il|drawdown
--entry <price>
--price <scenario price>
--max-loss-percent <1 means 1 percent>
--max-loss <quote>
--lower <price>
--upper <price>
```

Pass one of the two max-loss flags.

`breakeven`

```text
--loss <fraction or %>
--days <n>
--fee-apr <fraction or %>
--in-range <fraction or %>
```

`--loss 20%` is a loss fraction of 0.2. Pass the size of the loss, not a signed IL number.

`hedge`

```text
--model constant-product|concentrated
--entry <price>
--price <price now>
--deposit <quote>
--lower <price>
--upper <price>
```

`bounds`

```text
--model constant-product|concentrated
--entry <price>
--kind il|drawdown
--magnitude <fraction or %>
--lower <price>
--upper <price>
```

## JSON

Success:

```json
{
  "ok": true,
  "tool": "perp",
  "warnings": [],
  "result": {}
}
```

`tool` is `perp`, `defi.il`, `defi.size`, `defi.breakeven`, `defi.hedge`, or `defi.bounds`.

Failure:

```json
{
  "ok": false,
  "error": { "code": "STOP_ON_WRONG_SIDE", "message": "A long stop has to sit below the entry." }
}
```

Warning objects have `code`, `severity` (`loud` or `note`), and `message`.

The result objects match the TypeScript types exported from `src/index.ts`. Text output rounds. JSON keeps the full double. Do not retype a rounded line into another tool and expect the tests to match.

## Files

The objects in [examples/](../examples/) are valid `--file` inputs. The printed text is copied into [EXAMPLES.md](EXAMPLES.md).
