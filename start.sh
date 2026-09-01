#!/usr/bin/env bash
# ARIA Kit — one command, one server, one URL
#   cd ~/Aria && ./start.sh
#   → http://127.0.0.1:8877
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
FINCH_ROOT="${FINCH_ROOT:-/home/Hatari/repos/PT/finch}"
PORT="${ARIA_PORT:-8877}"
HOST="${ARIA_HOST:-127.0.0.1}"

export FINCH_ROOT
export PYTHONUNBUFFERED=1

echo "==> ARIA Kit — integrated protocol"
echo "    Dashboard:  http://${HOST}:${PORT}"
echo "    Finch seed: embedded (no second server)"
echo "    Finch root: ${FINCH_ROOT}"
echo ""

# Finch venv — seed engine deps
if [[ ! -d "${FINCH_ROOT}/venv" ]]; then
  echo "==> Creating Finch venv (first run)…"
  python3 -m venv "${FINCH_ROOT}/venv"
fi
# shellcheck disable=SC1091
source "${FINCH_ROOT}/venv/bin/activate"
python -m pip install --upgrade pip -q 2>/dev/null || true
python -m pip install -r "${FINCH_ROOT}/requirements.txt" -q

# ARIA deps (same venv is fine — uses finch python)
python -m pip install -r "${ROOT}/requirements.txt" -q

# Free stale port
if command -v ss >/dev/null 2>&1; then
  PIDS=$(ss -ltnp "sport = :${PORT}" 2>/dev/null | awk -F'pid=' 'NR>1{split($2,a,","); print a[1]}' | sort -u || true)
  if [[ -n "${PIDS:-}" ]]; then
    echo "==> Port ${PORT} busy — stopping ${PIDS}"
    # shellcheck disable=SC2086
    kill $PIDS 2>/dev/null || true
    sleep 0.5
  fi
fi

cd "${ROOT}"
export FINCH_PYTHON="${FINCH_ROOT}/venv/bin/python"
exec python -m backend serve --host "${HOST}" --port "${PORT}"
