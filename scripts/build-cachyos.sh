#!/usr/bin/env bash
# One-shot vsix build for CachyOS / Arch-based distros (pacman).
# Mirrors the CI check sequence locally:
#   gen -> check:fast (or check with --full) -> upstream:analyze -> build:vsix -> report:coverage
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SKIP_INSTALL=0
SKIP_UPSTREAM=0
SKIP_CHECKS=0
FULL=0

usage() {
  cat <<'EOF'
Usage: scripts/build-cachyos.sh [options]

  --skip-install    do not install missing prerequisites via pacman
  --skip-upstream   reuse cached upstream VSIX (no download/analyze);
                    requires .cache/upstream/*.vsix to already exist
  --skip-checks     skip prerequisite/check gates (build only)
  --full            also run `npm run check` (contracts) before building
  -h, --help        show this help
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-install) SKIP_INSTALL=1 ;;
    --skip-upstream) SKIP_UPSTREAM=1 ;;
    --skip-checks) SKIP_CHECKS=1 ;;
    --full) FULL=1 ;;
    -h | --help) usage && exit 0 ;;
    *) echo "unknown option: $1" >&2 && usage >&2 && exit 2 ;;
  esac
  shift
done

OS_ID="$(. /etc/os-release 2>/dev/null && echo "${ID:-}")"
UPSTREAM_REL=".cache/upstream/augment.vscode-augment.latest.vsix"
ANALYSIS_REL=".cache/reports/upstream-analysis.json"

step() {
  printf '\n==> %s\n' "$*"
}

node_ok() {
  if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
    echo "node/npm not found" >&2
    return 1
  fi
  node -e 'const m = +process.versions.node.split(".")[0]; if (m < 20) process.exit(1)' 2>/dev/null
}

prereq_check() {
  if node_ok; then
    echo "node $(node -v) + npm: OK"
  else
    echo "node >= 20 + npm required" >&2
    return 1
  fi
  if command -v python3 >/dev/null; then
    echo "python3 $(python3 --version 2>&1 | awk '{print $2}'): OK"
  else
    echo "python3 required" >&2
    return 1
  fi
}

install_prereqs() {
  case "$OS_ID" in
    cachyos | arch | archarm)
      echo "installing nodejs npm python via pacman"
      sudo pacman -S --needed --noconfirm nodejs npm python
      ;;
    *)
      echo "unsupported distro (id=$OS_ID); install nodejs>=20, npm, python3 manually" >&2
      return 1
      ;;
  esac
}

if [ "$SKIP_CHECKS" -eq 0 ]; then
  step "prerequisites"
  if ! prereq_check; then
    if [ "$SKIP_INSTALL" -eq 1 ]; then
      echo "missing prereqs and --skip-install given" >&2
      exit 1
    fi
    install_prereqs
    prereq_check
  fi
fi

step "sync generated blocks"
npm run gen

if [ "$SKIP_CHECKS" -eq 0 ]; then
  if [ "$SKIP_UPSTREAM" -eq 0 ]; then
    step "analyze upstream"
    node tools/build/upstream-analyze.js
  fi
  if [ "$FULL" -eq 1 ]; then
    step "full check (fast + contracts)"
    npm run check
  else
    step "fast checks"
    npm run check:fast
  fi
elif [ "$SKIP_UPSTREAM" -eq 0 ]; then
  step "analyze upstream"
  node tools/build/upstream-analyze.js
fi

step "build vsix (reuse analyzed upstream)"
if [ ! -f "$UPSTREAM_REL" ]; then
  echo "missing cached upstream VSIX: $UPSTREAM_REL" >&2
  echo "run without --skip-upstream once to download it" >&2
  exit 1
fi
node tools/build/build-vsix.js --skip-download

if [ "$SKIP_UPSTREAM" -eq 0 ] && [ -f "$ANALYSIS_REL" ]; then
  step "endpoint coverage"
  node tools/report/endpoint-coverage.js --analysis "$ANALYSIS_REL" --out dist/endpoint-coverage.report.md --fail-fast
else
  echo "skip endpoint coverage (no analysis report)"
fi

step "done"
ls -1 dist/*.vsix