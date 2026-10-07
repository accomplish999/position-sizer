# Design rules

These hold on every page. `scripts/check-design-rules.mjs` enforces the first two and runs in CI and before every build, so a violation fails the deploy.

## 1. No divider lines

Sections, headers, meta rows, list items and cards are separated by whitespace, never by a rule.

- No `<hr>`, no `<Separator>`, no `border-top` or `border-bottom` (or left and right) used as a separator.
- No Tailwind `border-t`, `border-b`, `divide-y` and friends.
- No hairlines faked with `box-shadow: inset`.

Use margin on a consistent spacing scale instead. More space between sections than between items in a section.

## 2. No boxed prose

Paragraphs, lists of studies, verdicts, notes, hints and results are never wrapped in an outlined box or card.

- A list of items is an unboxed editorial list: a heading line (number, title, status dot), then the paragraph in the column, then space before the next item.
- A verdict or status is an inline label with a dot, for example `Verdict: Failed`.

## 3. Where lines are allowed

Only on things that are lines by nature:

- real data tables (rows and cells)
- sheets (spreadsheet style grids)
- inputs, selects, textareas and buttons
- dialogs and modals
- charts and their axes

If a rule outside this list truly needs a line, put `/* design-rules: allow <reason> */` inside the CSS block. Expect to justify it in review.

## 4. Type

- Body prose is the serif at the article measure (about 36rem), normal body size and leading (about 1.5).
- Mono is for labels, numbers, dates and short meta only. Never for paragraphs, notes or captions.
- Intro and dek lines use body size or a step above, not a display size with loose leading.

## 5. Keep

- The wavy link underlines.
- No em or en dashes in copy.

## Scope in this repo

The check covers `web/`. It runs in `npm run lint` (CI) and before `npm run build:web` (the Pages deploy). The price ruler in the results is a chart axis and is allowed by name.
