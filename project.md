# Project build policy

Builds remain paused until the user explicitly gives the go-ahead.

When authorized, build Windows and macOS on GitHub and Linux locally. Keep build outputs in this project folder. Retain only the latest successful, verified build for each platform and architecture. Replace obsolete artifacts only after the new corresponding build succeeds and is verified; preserve the existing successful build when a new build fails. Retention applies only to build artifacts, never source, credentials, or unrelated files.

No build, artifact cleanup, GitHub push, release publication, or workflow dispatch is authorized by this policy alone. The current request records future build and retention behavior; it does not start builds or remove existing artifacts.

## Approved participant generation policy — 9 October 2026

Use only `Write exactly N words.` at the absolute end of the complete participant request. Keep targets EN 700/420/420/330 and FR 675/405/405/315 (presentation/commentary/response/judge answer); judge questions retain maximum 75 words. Before TTS, count deterministically using the app counter. If the first complete answer differs by more than 10%, allow exactly ONE fresh complete answer with byte-identical prompts, model and resolved effort, without the discarded draft, critique, count feedback, rewrite or countdown. Select the second complete answer even if it also misses; retain hard time cutoff. Discarded output stays only in private generation/cost records and never enters TTS or participant/judge transcript. Record every physical attempt and usage. Technical recovery remains separately bounded; retry failure surfaces an error. Reset/close cancels further content retry and stale publication. Historical alternatives remain evidence only. See docs/debate-process.md and docs/word-policy-validation.md. No build or push is authorized by this policy.
