#!/usr/bin/env bash
# phone-tunnel.sh — get a public URL for the dev server so you can open the
# app from a phone (Wi-Fi or mobile data).
#
# Preferred: ngrok with a free account → STABLE URL that survives restarts.
#   Setup (one time, ~2 min):
#     1. Create a free account at https://dashboard.ngrok.com/signup
#     2. Run once: ngrok config add-authtoken <YOUR_TOKEN>
#     3. Put your free "assigned dev domain" from the ngrok dashboard into
#        ~/.config/ngrok/ngrok.yml (uncomment the `url:` line) so the phone
#        URL never changes — no more resetting the domain.
#   Any paid ?.ngrok.app domain also works there.
#
# Fallback (no account needed): localtunnel — random URL each start.
#
# Usage:  ./scripts/phone-tunnel.sh
# Requires: Vite dev server running on :5174 (npm run dev) — and the tunnel
# must be started FROM this PC so it can reach the dev server.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NGR="${NGR:-$HOME/bin/ngrok}"
BRIDGE_PORT="${BRIDGE_PORT:-8090}"
BRIDGE_LOG=/tmp/sms-bridge.log
NGROK_LOG=/tmp/sms-ngrok.log
LT_LOG=/tmp/sms-lt.log
NGROK_CONFIG="${NGROK_CONFIG:-$HOME/.config/ngrok/ngrok.yml}"

# ── 0. clean slate: remove any previous tunnel processes ─────────────────
pkill -f 'localtunnel' 2>/dev/null || true
[ -x "$NGR" ] && pkill -f "$NGR http" 2>/dev/null || true

# ── 1. plain-HTTP bridge in front of the HTTPS-only Vite dev server ─────
# (Vite on :5174 is HTTPS-only; tunnels talk plain HTTP to :8090)
if ! curl -sf -o /dev/null "http://127.0.0.1:${BRIDGE_PORT}/"; then
  nohup node "$ROOT/scripts/vite-http-bridge.js" > "$BRIDGE_LOG" 2>&1 &
  for _ in $(seq 1 15); do
    curl -sf -o /dev/null "http://127.0.0.1:${BRIDGE_PORT}/" && break
    sleep 1
  done
fi

URL=""

# ── 2. try ngrok first (needs the one-time `ngrok config add-authtoken`) ─
HAS_AUTH=no
[ -n "${NGROK_AUTHTOKEN:-}" ] && HAS_AUTH=yes
grep -qE '^\s*authtoken:\s*\S+' "$NGROK_CONFIG" 2>/dev/null && HAS_AUTH=yes

if [ -x "$NGR" ] && [ "$HAS_AUTH" = yes ]; then
  # Optional permanent domain, from `NGROK_DOMAIN` env or the `url:` line in
  # ~/.config/ngrok/ngrok.yml (uncomment it with your assigned/free or paid name)
  DOMAIN="${NGROK_DOMAIN:-}"
  [ -z "$DOMAIN" ] && DOMAIN="$(grep -E '^\s*[u]rl:\s*https?://' "$NGROK_CONFIG" 2>/dev/null | head -1 | awk '{print $2}')" || true

  NGROK_DOMAIN_ARG=()
  [ -n "$DOMAIN" ] && NGROK_DOMAIN_ARG=(--url "$DOMAIN")

  nohup "$NGR" http "http://127.0.0.1:${BRIDGE_PORT}" "${NGROK_DOMAIN_ARG[@]}" --log=stdout > "$NGROK_LOG" 2>&1 &
  NGROK_PID=$!
  for _ in $(seq 1 30); do
    sleep 1
    URL=$(curl -sf "http://127.0.0.1:4040/api/tunnels" 2>/dev/null \
            | grep -o '"public_url":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
    [ -n "$URL" ] && break
    kill -0 "$NGROK_PID" 2>/dev/null || break   # agent exited (e.g. bad token)
  done
fi

# ── 3. fallback: account-free localtunnel (random URL each start, slower) ─
if [ -z "$URL" ]; then
  [ -x "$NGR" ] && pkill -f "$NGR http" 2>/dev/null || true
  nohup sh -c "npx --yes localtunnel@2.0.2 --port $BRIDGE_PORT" > "$LT_LOG" 2>&1 &
  for _ in $(seq 1 30); do
    URL=$(grep -o 'https://[a-z0-9-]*\.loca\.lt' "$LT_LOG" 2>/dev/null | head -1 || true)
    [ -n "$URL" ] && break
    sleep 1
  done
fi

if [ -z "$URL" ]; then
  echo "ERROR: could not obtain a tunnel URL. Recent logs:" >&2
  tail -n 5 "$NGROK_LOG" 2>/dev/null || true
  tail -n 5 "$LT_LOG" 2>/dev/null || true
  exit 1
fi

echo ""
echo "──────────────────────────────────────────────"
echo "  Phone URL (open this on the phone):"
echo "  $URL"
echo "──────────────────────────────────────────────"
echo "Works on Wi-Fi or mobile data. Valid TLS cert → no warnings, GPS allowed."
echo "Keep this PC + the Vite server running while using it."