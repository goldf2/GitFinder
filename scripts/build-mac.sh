#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
RELEASE_MODE="${GITFINDER_RELEASE_MODE:-development}"
case "$RELEASE_MODE" in development|official) ;; *) echo "Invalid release mode" >&2; exit 1;; esac
SOURCE_ARGS=(--phase source --mode "$RELEASE_MODE")
if [ -n "${GITFINDER_EXPECTED_TAG:-}" ]; then SOURCE_ARGS+=(--expected-tag "$GITFINDER_EXPECTED_TAG"); fi
npm run build:renderer
node scripts/verify-release.js "${SOURCE_ARGS[@]}"
BUILDER_ARGS=(--mac dmg zip --arm64 --publish never --config.electronDist=node_modules/electron/dist)
if [ "$RELEASE_MODE" = official ]; then
  : "${GITFINDER_CODESIGN_IDENTITY:?Developer ID required}" "${APPLE_TEAM_ID:?Team required}" "${GITFINDER_NOTARY_KEYCHAIN_PROFILE:?Notary profile required}"
  case "$GITFINDER_CODESIGN_IDENTITY" in "Developer ID Application:"*) ;; *) exit 1;; esac
  BUILDER_ARGS+=("--config.mac.identity=$GITFINDER_CODESIGN_IDENTITY")
else
  BUILDER_ARGS+=(--config.mac.identity=-)
fi
node node_modules/electron-builder/out/cli/cli.js "${BUILDER_ARGS[@]}"
APP_PATH="dist/mac-arm64/GitFinder 2 Alpha.app"
if [ "$RELEASE_MODE" = official ]; then
  xcrun notarytool submit "dist/GitFinder-2-$(node -p "require('./package.json').version")-arm64-mac.dmg" --keychain-profile "$GITFINDER_NOTARY_KEYCHAIN_PROFILE" --wait
  xcrun stapler staple "$APP_PATH"
  # Rebuild from the signed/stapled app so updater metadata matches the final archives.
  node node_modules/electron-builder/out/cli/cli.js --prepackaged "$APP_PATH" --mac dmg zip --arm64 --publish never
fi
ARTIFACT_ARGS=(--phase artifact --mode "$RELEASE_MODE" --report dist/release-verification.json)
if [ -n "${GITFINDER_EXPECTED_TAG:-}" ]; then ARTIFACT_ARGS+=(--expected-tag "$GITFINDER_EXPECTED_TAG"); fi
if [ -n "${APPLE_TEAM_ID:-}" ]; then ARTIFACT_ARGS+=(--expected-team-id "$APPLE_TEAM_ID"); fi
node scripts/verify-release.js "${ARTIFACT_ARGS[@]}"
