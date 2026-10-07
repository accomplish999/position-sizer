# Contributing

The tests are the spec for the formulas. If you change a formula, update the test and the matching section in `docs/PERPS.md` or `docs/DEFI.md` in the same change. If you change a default, update `docs/CLI.md` and the help text too.

```bash
npm install
npm test
npm run typecheck
npm run lint
npm run smoke
npm run links
npm run copy
npm run build:web
```

Node 20 or newer. `npm run format` rewrites the files Prettier owns. `npm run copy` rejects an em dash or an en dash. `npm run links` checks relative links in the markdown. `npm run build:web` refreshes `web/position-sizer.js`. Commit that file. CI diffs it against a fresh build.

Do not commit `.env`. This project does not need a key. Do not add one "for later."

The worked numbers in `docs/EXAMPLES.md` are CLI output. If a change moves them, re-run the commands and replace the blocks. Do not type a new number from memory.

The page in `web/` calls the bundle, which is the same TypeScript as the CLI. Do not keep a second copy of the math in `web/app.js`.
