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
exec gunicorn app:app \
  --bind 0.0.0.0:5000 \
  "${EXTRA_BINDS[@]}" \
  --workers 2 \œ  -
  --timeout 120 \
  --log-level info \
  --access-logfile -
