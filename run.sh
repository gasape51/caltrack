#!/usr/bin/env bash
# ══════════════════════════════════════════════════
#  CalTrack — Démarrage serveur (Gunicorn)
# ══════════════════════════════════════════════════
source .venv/bin/activate

LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"

echo "🟢 CalTrack démarré sur http://0.0.0.0:5000"
if [[ -n "$LAN_IP" ]]; then
  echo "   iPhone / réseau local: http://${LAN_IP}:5000"
fi
echo "   (Ctrl+C pour arrêter)"

EXTRA_BINDS=()
if [[ "${ENABLE_IPV6:-0}" == "1" ]]; then
  EXTRA_BINDS+=(--bind "[::]:5000")
fi

# 2 workers, timeout 120s (les APIs Garmin/Yazio peuvent être lentes)
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-5000}"

exec gunicorn app:app \
  --bind "${HOST}:${PORT}" \
  "${EXTRA_BINDS[@]}" \
  --workers 2 \
  --timeout 120 \
  --log-level info \
  --access-logfile -
