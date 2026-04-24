#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$REPO_ROOT/app"
ENV_FILE="$REPO_ROOT/.env"

# Load credentials from .env
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: .env file not found at $REPO_ROOT/.env"
  echo "Copy .env.example to .env and fill in your credentials."
  exit 1
fi
set -a; source "$ENV_FILE"; set +a

# Validate required vars
for var in APPLE_SIGNING_IDENTITY APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID RELEASE_REPO; do
  if [[ -z "${!var:-}" ]]; then
    echo "ERROR: $var is not set in .env"
    exit 1
  fi
done

read_version() {
  python3 -c "import json; print(json.load(open('src-tauri/tauri.conf.json'))['version'])"
}

bump_version() {
  local semver="$1"
  IFS='.' read -r MAJOR MINOR PATCH <<< "$semver"
  echo "$MAJOR.$MINOR.$((PATCH + 1))"
}

write_version() {
  local ver="$1"
  python3 - "$ver" <<'EOF'
import json, sys
ver = sys.argv[1]
for path in ["src-tauri/tauri.conf.json", "package.json"]:
    with open(path) as f:
        d = json.load(f)
    d["version"] = ver
    with open(path, "w") as f:
        json.dump(d, f, indent=2)
        f.write("\n")
EOF
}

cd "$APP_DIR"

CURRENT_VERSION="$(read_version)"
echo "==> Current version: $CURRENT_VERSION"

if [[ "${SKIP_BUMP:-}" != "1" ]]; then
  echo ""
  echo "==> Step 1: Pre-flight checks"
  if [[ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]]; then
    echo "ERROR: Uncommitted changes. Commit or stash first."
    exit 1
  fi

  echo ""
  echo "==> Step 2: Version bump"
  NEW_VERSION="$(bump_version "$CURRENT_VERSION")"
  write_version "$NEW_VERSION"
  echo "Bumped to $NEW_VERSION"

  cd "$REPO_ROOT"
  git add app/src-tauri/tauri.conf.json app/package.json
  git commit -m "release v$NEW_VERSION"
  git tag "v$NEW_VERSION"
  git push origin main --tags
  cd "$APP_DIR"

  CURRENT_VERSION="$NEW_VERSION"
else
  echo "Skipping version bump (SKIP_BUMP=1)"
fi

echo ""
echo "==> Step 3: Build"
npm run tauri build

ARCH="$(uname -m)"
if [[ "$ARCH" == "arm64" ]]; then
  DMG_GLOB="src-tauri/target/release/bundle/dmg/Muse_${CURRENT_VERSION}_aarch64.dmg"
else
  DMG_GLOB="src-tauri/target/release/bundle/dmg/Muse_${CURRENT_VERSION}_x64.dmg"
fi

DMG_PATH="$(ls $DMG_GLOB 2>/dev/null | head -1)"
if [[ -z "$DMG_PATH" ]]; then
  echo "ERROR: Could not find DMG at $DMG_GLOB"
  echo "Available bundles:"
  find src-tauri/target/release/bundle -name "*.dmg" 2>/dev/null || echo "(none)"
  exit 1
fi

DMG_NAME="$(basename "$DMG_PATH")"
echo "Found DMG: $DMG_PATH"

echo ""
echo "==> Step 4: Publish to GitHub"
if gh release view "v$CURRENT_VERSION" --repo "$RELEASE_REPO" &>/dev/null; then
  echo "Release v$CURRENT_VERSION exists, uploading asset..."
  gh release upload "v$CURRENT_VERSION" --repo "$RELEASE_REPO" --clobber "$DMG_PATH"
else
  NOTES="$(git -C "$REPO_ROOT" log --oneline \
    "$(git -C "$REPO_ROOT" describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo HEAD~10)..HEAD" \
    2>/dev/null | head -20 || echo "Release v$CURRENT_VERSION")"
  gh release create "v$CURRENT_VERSION" --repo "$RELEASE_REPO" \
    --title "v$CURRENT_VERSION" \
    --notes "$NOTES" \
    "$DMG_PATH"
fi

echo ""
echo "==> macOS release complete!"
gh release view "v$CURRENT_VERSION" --repo "$RELEASE_REPO" --json assets -q '.assets[].name'
