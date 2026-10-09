# Full match verification

`npm test` covers offline behavior without paid requests. `--timing-test` adds
audio measurements to the normal match. It uses the same preparation, speech
recognition, playback, transcript delivery, timer cutoff, and scoring paths.
It no longer skips audio or completes undelivered speech.

For a monitored native match, run the following with an Electron executable:

```sh
electron scripts/full-match-qa.cjs \
  --output=evidence/full-match-en \
  --locale=en --factor=6 \
  --credentials=/absolute/path/to/local/.env \
  --budget-module=/absolute/path/to/private/budget.cjs
```

The private budget module must export `guardedFetch` and should export
`budget.providers` for the final report. It must reserve spending before each
request and enforce the authorized provider limits. Credentials can instead
come from the existing environment. Never commit credentials, prompts, speech
records, or test output. The runner uses an isolated Electron profile and the
normal secure IPC bridge. It does not record video or open a remote debugging
port. `--app=/path/to/app.asar` verifies an already packaged application.

The runner selects Sol and Opus, medium contestant reasoning, three GPT-6 Astra
judges, and the first discussion question for each of two archived cases. Use
`--locale=fr-ca` for French or `--factor=1` for normal playback.
`--judge-panel=all-anthropic` exercises the three-Fable panel.
`--repeatable-coin=yes` selects heads, heads, then lead for a reproducible order.
When replaying saved provider responses, require exact request equality and
report the replay separately from fresh requests. Recorded audio still follows
normal decoding, recognition, playback, delivery, and time limits.

Acceleration begins only when decoded duration agrees with the media element,
recognition has completed, and any dependent participant audio is ready. Each
participant chunk begins with at least five seconds at its production rate.
The complete audio plays continuously; the runner never seeks or fabricates a
delivery callback. The match timer adds only time saved by measured media
progress. API waits, stalls, handoff gaps, and unrelated timers retain real time.
Unknown timing stays at the production rate. Clock tests cover rate changes,
chunk boundaries, stalls, and invalid seeking.

The report retains real and virtual timestamps separately. Review phase
screenshots, spoken-generation records, request timing, delivered text, and all
three scorecards. Acceleration does not establish voice quality for the whole
speech at normal speed. A run that fails, skips a phase, has unresolved delivery,
or lacks complete scorecards must not be reported as a passing full match.
