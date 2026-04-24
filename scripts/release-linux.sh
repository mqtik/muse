#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$REPO_ROOT/app"
ENV_FILE="$REPO_ROOT/.env"

# Load GitHub credentials from .env (only RELEASE_REPO needed for Linux)
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: .env file not found at $REPO_ROOT/.env"
  echo "Copy .env.example to .env and set RELEASE_REPO at minimum."
  exit 1
fi
set -a; source "$ENV_FILE"; set +a

if [[ -z "${RELEASE_REPO:-}" ]]; then
  echo "ERROR: RELEASE_REPO is not set in .env"
  exit 1
fi

if ! gh auth status &>/dev/null; then
  echo "ERROR: gh CLI is not authenticated. Run: gh auth login"
  exit 1
fi

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

echo ""
echo "==> Step 1: Pre-flight checks"
if [[ -n "$(git -C "$REPO_ROOT" status --porcelain | grep -v '^??')" ]]; then
  echo "ERROR: Uncommitted changes. Commit or stash first."
  exit 1
fi

echo "Pulling latest..."
git -C "$REPO_ROOT" pull --ff-only

cd "$APP_DIR"

CURRENT_VERSION="$(read_version)"
echo "==> Current version: $CURRENT_VERSION"

if [[ "${BUMP:-}" == "1" ]]; then
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
  echo "Using existing version $CURRENT_VERSION (run with BUMP=1 to increment)"
fi

echo ""
echo "==> Step 3: Build AppImage"
npm run tauri -- build --bundles appimage

APPIMAGE_PATH="$(find src-tauri/target/release/bundle/appimage -name "*$CURRENT_VERSION*amd64.AppImage" 2>/dev/null | head -1)"
if [[ -z "$APPIMAGE_PATH" ]]; then
  echo "ERROR: Could not find AppImage"
  echo "Available bundles:"
  find src-tauri/target/release/bundle/appimage -name "*.AppImage" 2>/dev/null || echo "(none)"
  exit 1
fi

APPIMAGE_NAME="$(basename "$APPIMAGE_PATH")"
echo "Found AppImage: $APPIMAGE_NAME"

echo ""
echo "==> Step 4: Publish to GitHub"
if gh release view "v$CURRENT_VERSION" --repo "$RELEASE_REPO" &>/dev/null; then
  echo "Release v$CURRENT_VERSION exists, uploading asset..."
  gh release upload "v$CURRENT_VERSION" --repo "$RELEASE_REPO" --clobber "$APPIMAGE_PATH"
else
  NOTES="$(git -C "$REPO_ROOT" log --oneline \
    "$(git -C "$REPO_ROOT" describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo HEAD~10)..HEAD" \
    2>/dev/null | head -20 || echo "Release v$CURRENT_VERSION")"
  gh release create "v$CURRENT_VERSION" --repo "$RELEASE_REPO" \
    --title "v$CURRENT_VERSION" \
    --notes "$NOTES" \
    "$APPIMAGE_PATH"
fi

echo ""
echo "==> Linux release complete!"
gh release view "v$CURRENT_VERSION" --repo "$RELEASE_REPO" --json assets -q '.assets[].name'
