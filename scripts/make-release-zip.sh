#!/usr/bin/env bash
# Build static visualizer/ (if needed) and create dist/music-waves-visualizer-static-v<version>.zip
# for GitHub Releases: visualizer/ + INSTALL_LOCAL_STATIC.md + docs-bundled/
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="$(node -p "require('./package.json').version")"
OUT_DIR="${ROOT}/dist"
ZIP_NAME="music-waves-visualizer-static-v${VERSION}.zip"
STAGE="$(mktemp -d)"
cleanup() { rm -rf "${STAGE}"; }
trap cleanup EXIT

REBUILD=0
for arg in "$@"; do
  case "$arg" in
    --rebuild) REBUILD=1 ;;
  esac
done

if [[ "${REBUILD}" -eq 1 ]] || [[ ! -f "${ROOT}/visualizer/index.html" ]]; then
  echo "Running npm run build:html ..."
  npm run build:html
fi

if [[ ! -f "${ROOT}/visualizer/index.html" ]]; then
  echo "ERROR: visualizer/index.html missing after build." >&2
  exit 1
fi

mkdir -p "${OUT_DIR}"
mkdir -p "${STAGE}/visualizer" "${STAGE}/docs-bundled/docs"

cp -a "${ROOT}/visualizer/." "${STAGE}/visualizer/"
cp "${ROOT}/docs/INSTALL_LOCAL_STATIC.md" "${STAGE}/INSTALL_LOCAL_STATIC.md"

# Root-level legal & hosting docs
for f in LICENSE NOTICE CHANGELOG.md HTML_HOSTING.md SERVER_REQUIREMENTS.md USER_TERMS.md PRIVACY_POLICY.md EU_GDPR_NOTICE.md; do
  if [[ -f "${ROOT}/${f}" ]]; then
    cp "${ROOT}/${f}" "${STAGE}/docs-bundled/"
  fi
done

# docs/ subtree (selected)
for f in BUILD.md SECURITY.md FFMPEG.md README.md INSTALL_LOCAL_STATIC.md; do
  if [[ -f "${ROOT}/docs/${f}" ]]; then
    cp "${ROOT}/docs/${f}" "${STAGE}/docs-bundled/docs/"
  fi
done

( cd "${STAGE}" && if command -v zip >/dev/null 2>&1; then
    zip -r -q "${OUT_DIR}/${ZIP_NAME}" .
  else
    python3 - "${OUT_DIR}/${ZIP_NAME}" <<'PY'
import pathlib
import sys
import zipfile

out_path = pathlib.Path(sys.argv[1])
root = pathlib.Path('.')
with zipfile.ZipFile(out_path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
    for path in sorted(root.rglob('*')):
        if path.is_file():
            zf.write(path, path.relative_to(root))
PY
  fi )
echo "Created ${OUT_DIR}/${ZIP_NAME}"
ls -lh "${OUT_DIR}/${ZIP_NAME}"
