# 002 — Remove red from the website (black and white only)

- **Status:** DONE (approved by Dan 2026-11-02)
- **Written against commit:** 97683d5
- **Finding:** The website uses a red colour for error text and the "Yes, stop it" button, against the black-and-white design.

## Why
`DECISIONS.md` D-023 (approved by Dan as "option A"): "**Design:** black and white, mobile first …".

`web/src/styles.css` defines `--danger` (line 8: `#b00020`; dark mode line 19: `#ff6b81`). It is used by:
- `.error` (line 227–228) → error lines in `web/src/pages/Pool.tsx` (claim form) and `web/src/pages/Credit.tsx:228` (claim card).
- `.button-danger` (lines 187–190, also hard-codes `color: #fff`) → the "Yes, stop it" button, `web/src/pages/Credit.tsx:198`.

## Change
In `web/src/styles.css`:
1. Delete `--danger` from both `:root` blocks (lines 8 and 19).
2. `.error`: change `color: var(--danger);` to `color: var(--fg);` (keep `font-weight: 600`).
3. Delete the `.button-danger` rule (lines 187–191).

In `web/src/pages/Credit.tsx:198`: change `className="button button-danger"` to `className="button"` (the standard black button: `--fg` fill, `--bg` text, which also works in dark mode).

## Do not change
- The two-step confirmation ("Stop this key" → "Yes, stop it" / "Cancel"): it is what prevents accidental stops.
- `role="alert"` on error lines.
- Any other colour token.

## Affected surfaces
- Pool page: claim form error line.
- My credit: claim card error line; "Yes, stop it" button (light and dark mode).

## Verify
- `pnpm lint && pnpm typecheck && pnpm e2e` — all pass (e2e finds the button by its name, "Yes, stop it").
- `grep -n "danger\|#fff\|#b00020\|#ff6b81" web/src` returns nothing.
- Look at `e2e/screenshots/05-my-credit-stopped-mobile.png` after the run; optionally add a screenshot of the confirm step.

## Docs to update
None (D-023 already says black and white).
