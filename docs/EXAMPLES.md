# Examples

Each file is an input object. The text under it is the CLI output from that file, wrapped only for this page. Re-run the command if you change the math. Do not edit the numbers by hand.

## Perp, fees in, stop first

```bash
npx tsx src/cli.ts perp --file examples/perp-long.json
```

Account 10,000. Risk 1 percent. Entry 100, stop 95, long. Leverage cap 10. Taker fee 5 basis points on the way in and on the stop. Maintenance margin 0.5 percent.

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

targets
  110   1.941148 R   net 194.114762   price-only 2 R
  120   3.901913 R   net 390.19127   price-only 4 R

R to price
  -1 R   price 95
  1 R   price 105.2001
  2 R   price 110.30015
  3 R   price 115.4002
```

The price-only column still says 2 R at 110. After fees it is about 1.94 R. The 2 R price, net of fees, is about 110.30, not 110.

## Perp, short, no fees

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

targets
  90   1 R   net 100   price-only 1 R

R to price
  -1 R   price 110
  1 R   price 90
  2 R   price 80
  3 R   price 70
```

## Perp, liquidation first

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

targets
  110   1 R   net 100   price-only 1 R

R to price
  -1 R   price 90
  1 R   price 110
  2 R   price 120
  3 R   price 130
```

With `--strict` this command exits 3. Without it, the exit is 0 and the warning is still in the output. Do not treat exit 0 as "the stop is safe." Read `stop hits first`.

## Constant-product IL

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

The pool is up versus the deposit. It is down versus holding the original coins. Both statements are true. Drawdown versus the deposit is negative here because the value rose.

## Concentrated range

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

The exact IL is -1/21. The text view rounds it.

## Size the deposit

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

IL versus holding on that 4x path is 20 percent. The quote gap per quote deposited is 0.5. The 100 quote budget therefore deploys 200. See [DEFI.md](DEFI.md).

## Fee breakeven

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

## Hedge

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

## Bounds

```bash
npx tsx src/cli.ts defi bounds --model constant-product --entry 100 --kind il --magnitude 20%
```

```text
price down                  25
price up                    400
```

A 20 percent IL on a constant-product pool is a 4x move, in either direction, from an entry of 100.
