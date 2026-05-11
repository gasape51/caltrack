#!/usr/bin/env bash
# ══════════════════════════════════════════════════
#  CalTrack — Script d'installation (Raspberry Pi 4)
# ══════════════════════════════════════════════════
set -e
echo "🚀 Installation CalTrack…"

# 1. Python venv
python3 -m venv .venv
source .venv/bin/activate

# 2. Dépendances Python
pip install --upgrade pip
pip install -r requirements.txt

# 3. Génération des icônes PWA
echo "🎨 Génération des icônes…"
python static/icons/generate_icons.py

echo ""
echo "✅ Installation terminée !"
echo ""
echo "⚠️  AVANT DE LANCER : éditez config.py avec vos identifiants."
echo ""
echo "▶️  Lancer l'app :  bash run.sh"
echo "🌐 Puis ouvrir   :  http://$(hostname -I | awk '{print $1}'):5000"
