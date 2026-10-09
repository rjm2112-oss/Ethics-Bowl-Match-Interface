# Approved debate process

Current process approved 9 October 2026. Production uses one minimal participant request and one bounded fresh-answer retry for a major word-count miss. Historical comparison scripts and reports are retained as evidence; they are not active strategies or fallbacks.

## Participant requests and word policy

Presentation, commentary, response and judge-answer requests preserve participant/opponent names, selected English or Québec French, full current case, moderator question, phase/role, full delivered substantive discussion, applicable official rubric and nonempty optional saved instructions. Phase actions ask only to present, comment, respond or answer. The participant opening remains “You are {name}, a participant in a live Ethics Bowl match against {other participant}.” There is no assigned stance, philosophical approach, forced opening, tone or heading restriction.

The sole app-generated length instruction is `Write exactly N words.` at the absolute end of the participant user request, after the phase action and optional instructions. Targets are fixed across models:

| Phase | English | Québec French |
| --- | ---: | ---: |
| Presentation | 700 | 675 |
| Commentary | 420 | 405 |
| Response | 420 | 405 |
| Judge answer | 330 | 315 |

Before TTS, the app counts the first complete answer using its existing Unicode letter/number word counter. Apostrophes and hyphens inside a word remain part of that word; standalone punctuation does not count. Exactly ±10% is accepted. The integer comparison is `10 * abs(actualWords - target) > target`, avoiding floating-point boundary ambiguity.

A miss greater than 10% allows exactly one fresh complete-answer request with byte-identical system/user prompts and the same model, resolved effort and initial output allowance. The discarded answer, its count and any critique are never included in that request. There is no rewrite, draft feedback, self-check, countdown, added constraint or content-retry loop. If the second complete answer also misses, it is selected unchanged and remains subject to the ordinary hard phase cutoff. A technical failure of the fresh request surfaces a clear failure; it never silently falls back to the discarded first answer or starts a third content request.

Only the selected answer is cached, prepared for speech and published as a participant turn. A discarded first answer never enters TTS or the participant/judge transcript. Every physical provider request, response and returned usage remains in the private generation/cost ledger with unique request IDs; diagnostic context identifies the match run, phase, target and content attempt. Reset, close, interrupted/completed phase or changed bound judge question prevent stale text publication and any further content retry. Concurrent preparation shares the same bounded operation.

Preparation starts as soon as the preceding substantive discussion is finalized: presentations can prepare during the case reading, and commentary, responses and bound judge answers can prepare during moderator handoffs. Unheard previews and unfinished recognition cannot supply that context. Conferral limits are two minutes before presentations and one minute before commentary and responses; AI participants may yield once preparation is ready. Failed background generation remains failed until the user explicitly retries, so entering another phase cannot silently repeat a failed bounded operation.

Provider technical recovery is separate: transient network/status failures retain the existing maximum three transport attempts; one incomplete output-budget recovery may increase the token ceiling to 32,768 with the same full prompt and effort. Partial answers are rejected. This policy does not prune context, change targets or reduce reasoning.

## Judge questions and final scoring

Judge questions start in each active judge-question phase after the preceding delivery finishes. They preserve judge identity, addressee, full case and moderator question, full substantive discussion and published rubric, optional instructions, the 60-second allowance and JSON format. Their separate length instruction remains “Ask one question to {participant} in no more than 75 words.” They do not use the participant word-count retry policy. Each stored question is bound to the following answer; there are no early drafts, assigned specialties or automatic substantive rewrites.

Each independent AI judge receives the same completed delivered discussion and rubric without other judges’ scores. Its strict scorecard returns seven numeric criteria plus two team-level comments for each participant: “What the team did well” and “What needs improvement.” The app calculates /60 totals and votes. Completed cards publish incrementally in dialogue, are deduplicated and are never spoken. There is no new overall-comment or per-criterion prose field. Historical completed cards retain their original single comment without fabricated paired fields. Human/hybrid final entry uses the same seven numeric criteria and four comment fields per judge.

Each participant independently selects Human or AI. Human judging uses manual questions and final scoring. Hybrid uses AI questions and human final scoring. AI scoring is guarded off in human/hybrid modes.

## Reasoning, input integrity and delivered audio

All contestants use medium consistently across models, participant phases and retries. All judges use high for questions/final scoring. High/medium receive a 25,000-token reasoning allowance added once to visible output budgets and at least 180 seconds per transport attempt. The fresh content retry freezes this resolved effort. A longer wait for Fable is accepted; preparation does not switch its model or lower its effort to meet a deadline.

The full approved original English 2025 rubric is used in both interface languages; French models answer in Québec French. Published bands/notes and the leftmost-uncompleted-box rule remain intact. Criterion maxima are 5/5/5/10/20/10/5, totaling 60. See [official documents](https://www.ethicsbowl.ca/documents) and src/shared/ethics-bowl-rubric.js. Transport limits reject oversized full cases/instructions/context rather than clip them.

Speech is generated only for the selected complete answer. Whole-audio measured playback remains pitch-preserving and bounded 0.924–1.09×, with the existing 350 ms handoff lead and validated 3-second startup reserve. Audio measurement is reused rather than decoded twice. Full-audio recognition starts during preparation and runs alongside playback instead of delaying audio readiness; delivery completion and subsequent model requests still await authoritative recognized speech. The hard phase clock stops remaining audio. Spoken-audio recognition supplies the actual delivered discussion; interrupted delivery contributes only a finalized heard prefix and unresolved recognition blocks subsequent model context.

The interface displays the full selected generated speech as a reading preview before playback, separate from the delivered transcript. Spoken-word highlighting maps valid recognized timing anchors onto that preview, accounting for punctuation, contractions and chunk boundaries. Invalid or ambiguous anchors remain unhighlighted; no timestamps are invented. This display mapping is separate from the strict delivered-text policy, so a malformed timing token need not disable highlighting throughout a speech. Word and chunk updates preserve the reader’s scroll position and existing text nodes; a new visible turn scrolls to its start only if the reader was already following the bottom. Completion or interruption replaces the preview with the confirmed delivered text.

Stop Reading is disabled while a substantive participant speech is queued or playing, and its handler rejects a stale activation that could interrupt a participant. Normal timer cutoff, match reset and close retain their existing behavior. Participants use the largest sentence-boundary chunks within the 4096-character speech input limit and identical instructions for consistent vocal register/cadence, reducing independent synthesis boundaries without changing models or voices.

## Verification

Offline tests cover both providers/languages, every contestant phase, inclusive word-count boundaries, two misses, immutable retry prompts, discarded-text isolation, ledger IDs/usage, bounded technical failure and reset/close during retry. Tests mock provider transports and do not spend API credit. Generated audio, model responses and private ledgers remain local and are excluded from source control and packaged applications.

On 9 October 2026, one live English commentary per contestant was measured at medium using the same case, completed presentation context and 420-word target. Preparation includes complete answer selection, speech synthesis and audio-duration measurement. These seconds measure preparation, not the length of the spoken commentary.

| Contestant | Selected words | Preparation (seconds) |
| --- | ---: | ---: |
| GPT-6 Astra | 421 | 48.2 |
| GPT-6.1 Sol | 419 | 54.1 |
| GPT-6 Luna | 421 | 45.1 |
| Claude Fable 5.1 | 422 | 89.9 |
| Claude Opus 5.5 | 420 | 62.3 |
| Claude Sonnet 5.5 | 443 | 64.5 |
| Claude Haiku 5.5 | 420 | 60.6 |

All selected answers met the existing ±10% policy and measured playback fit the 180-second slot with the existing bounded, pitch-preserving rate and startup reserve. Sonnet's first answer had 466 words and triggered the single allowed fresh request. Reusing each prepared answer/audio at handoff made no additional provider calls.

Preparation starts before the conferral announcement, whose completion starts the 60-second clock. Separately synthesizing that unchanged announcement measured 10.56 seconds of playback, giving at least 70.56 seconds of preparation in this measured scenario before also counting announcement synthesis and other handoffs. Comparing the measured durations, every contestant except Fable fits that window. This is a component timing comparison from one English sample per model, not a full-match latency guarantee; provider timing varies. Fable's additional wait is accepted without changing its reasoning policy. Combined live checks, including the earlier high/medium comparison and this announcement, cost approximately US$1.13 against the authorized US$10 limit.

See [build instructions](release-builds.md). Builds and publishing are performed only when explicitly authorized; workflow execution does not create a public GitHub Release.
