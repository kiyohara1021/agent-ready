# Demo assets

The README references `docs/assets/demo.gif`, which is not recorded yet. This
note describes how to produce it so the result is reproducible rather than a
one-off screen capture.

## What to record

```bash
npx agentworthy check
```

Run it against a **realistic repository** — one with genuine gaps. A repository
staged to produce a perfect score is obvious to viewers and undersells the
product, which is about finding gaps rather than celebrating their absence.
Running the tool against its own repository is a reasonable choice, since that
output is honest and already reproduced in the README.

## Recording

Any terminal recorder works. [`vhs`](https://github.com/charmbracelet/vhs) is
convenient because the recording is scripted and therefore repeatable:

```text
Output docs/assets/demo.gif
Set FontSize 16
Set Width 1200
Set Height 800
Set Padding 20
Type "npx agentworthy check"
Enter
Sleep 6s
```

[`asciinema`](https://asciinema.org) plus `agg` is a fine alternative.

## Constraints

- Keep it under roughly 15 seconds and a few megabytes; GitHub READMEs are often
  read on slow connections.
- Use a plain prompt and a high-contrast theme. Do not show a personal home
  directory path, hostname, or anything else machine-specific.
- Show the whole report, including the recommendations, without editing the
  output.
- Do not add captions or arrows that claim results the tool does not produce.

## After recording

Save the file as `docs/assets/demo.gif`, then replace the placeholder comment in
both [README.md](../../README.md) and [README.ja.md](../../README.ja.md) with:

```markdown
![agentworthy check](docs/assets/demo.gif)
```

Remove the "not recorded yet" note in the same change.
