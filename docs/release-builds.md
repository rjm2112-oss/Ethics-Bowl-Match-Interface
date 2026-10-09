# Desktop builds

Install the pinned dependencies with npm ci using Node 24, then run npm test. The test suite mocks provider transports and makes no paid calls. Local credentials, diagnostics, recordings and checkpoints remain private and are excluded from source control and packaged apps.

Build Linux locally with npm run dist:linux -- --x64. Build Windows x64 with npm run dist:win -- --x64, and macOS separately with npm run dist:mac -- --x64 or --arm64. All commands set --publish never; they do not create a GitHub Release. Windows produces an NSIS installer and portable executable; macOS produces DMG and ZIP; Linux produces AppImage. Artifact filenames include platform/architecture and distinguish Windows installer from portable.

The GitHub Build Electron App workflow runs Windows x64 and macOS x64/arm64 on approved main pushes, version tags or explicit dispatch. It runs offline tests and package verification before staging one installer per job. Downloads are labeled Windows Installer, Mac Intel, and Mac Apple Silicon. Mac DMG filenames also say Intel or Apple Silicon. Portable executables, duplicate ZIP distributions, unpacked applications, and verification metadata are excluded from installer downloads. Linux is built locally. No signing or notarization credentials are configured by this process.

Run node scripts/verify-package.cjs OUTPUT_DIRECTORY PLATFORM ARCH after each build (PLATFORM is linux, win or mac). Verification checks expected artifact types/signatures, SHA256, the packaged app entrypoint and every application source/font/logo against the current checkout, and rejects packaged credentials, recordings, test data or checkpoints.

Use a fresh output directory until verification succeeds. Keep local builds Linux-only and mark intermediate pushes `[skip ci]` while validating the match. Once a monitored full match passes without unresolved problems, the user has authorized one Windows x64 and macOS x64/arm64 workflow dispatch for the validated commit. Replace the installed AppImage only after verification and preserve its credentials/settings. Once the replacement is verified, delete superseded Linux builds without archiving them, as requested.

Keep only installable files in the retained local build folder: the Linux AppImage, Windows setup executable, Mac Intel DMG, and Mac Apple Silicon DMG. Preserve verification records with private diagnostics under evidence/; remove packaging intermediates and duplicate distributions after verification.
