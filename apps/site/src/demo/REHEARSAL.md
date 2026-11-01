# Rehearsal: Kiteline hero demo

Built with [Stageshow](https://benji.org/stageshow), following its workflow.

## Starting point

- **Gold copied:** `device-pair` (a window pinned top-left and bled off the
  bottom, with a phone straddling its right edge). The touch interaction is
  borrowed from `phone-touch`, and the streamed reply from `ai-chat`.
- **Size:** 960 × 660 wide, with a `compact` design at 358 × 612 that drops the
  editor and keeps the phone, its sheet and the Allow button whole.

## What changed from the gold

- The desktop window is a code editor rather than a dashboard. A terminal
  mirroring the phone would imply that Kiteline sessions show up in your
  terminal, which they don't; a file changing in your editor is what actually
  happens when you allow an edit.
- The phone is cropped at the top instead of the bottom, because Kiteline's
  approval sheet lives at the bottom of the screen and Allow must stay in frame.
  The crop falls below the session header, inside the content.
- The feed is bottom-anchored like the real app, with earlier history as filler
  above the request.
- The editor fades out at its foot (a fade crop) instead of a hard cut.
- The loop resets by dissolving the opening frame in over the payoff, then
  resetting the scene under it, so no frame is ever empty.

## Story

Thinking (context) → the edit request and the sheet (action) → a tap on Allow →
line 9 rolls to `redirect(next ?? "/")` with a change mark in the gutter → the
reply streams in and holds for 2.6s (payoff). About 10.6s per loop.

## Verified

- `film.mjs --gate` ends `rehearsal passed` at 960 and at 358.
- Every beat was stilled and inspected: the opening, the sheet, the roll, the
  payoff and the loop seam (last frame against first).

## Lines left on purpose

- `framing: satellite … kl-composer / kl-sheet` and `twin satellites`: these
  are the phone's own composer and sheet, not satellites. Their shadows sit on
  inner surfaces for this reason; the notes that remain come from the crossfade
  cover, which holds a second copy for half a second.
- `touching: placeholder … diff`: filler under the open sheet, covered by it.
- `uneven padding: kl-sheet`: the sheet's grabber sits 8pt from the top, as on
  iOS.
- `unclipped: ss-window`: the stage clips with `clip-path` (top and bottom
  only, so the shadows aren't sliced at the sides), which the check doesn't
  read.

## Not checked

- Real iOS Safari and Android Chrome; filmed in headless Chromium only.
- Dark mode: the demo is drawn in Kiteline's light theme on purpose.
