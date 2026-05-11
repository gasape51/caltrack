# CalTrack — Dashboard Yazio × Garmin PWA

Dashboard mobile-first hébergé sur Raspberry Pi, installable sur iPhone (PWA).

---

## Architecture du projet

```
health-dashboard/
├── app.py                    ← Flask API (routes + cache mémoire)
├── tracker.py                ← Logique métier Yazio + Garmin
├── config.py                 ← Configuration via variables d'environnement
├── .env.example              ← Exemple de configuration sans secret
├── requirements.txt
├── setup.sh                  ← Installation automatique
├── run.sh                    ← Démarrage Gunicorn
├── .gitignore
├── templates/
│   └── index.html            ← SPA : Jour / Semaine / Mois
└── static/
    ├── manifest.json         ← Config PWA
    ├── sw.js                 ← Service Worker (offline cache)
    └── icons/
        └── generate_icons.py ← Génère les PNG d'icônes
```

---

## Installation sur Raspberry Pi 4

### 1. Copier le projet

```bash
scp -r health-dashboard/ pi@<IP_DU_PI>:~/
ssh pi@<IP_DU_PI>
cd health-dashboard
```

### 2. Configurer les identifiants

Créez un fichier `.env` local à partir de `.env.example` :

```bash
cp .env.example .env
nano .env
```

```dotenv
YAZIO_EMAIL=votre@email.com
YAZIO_PASSWORD=votre_mot_de_passe
GARMIN_EMAIL=votre@email.com
GARMIN_PASSWORD=votre_mot_de_passe
DEFICIT_GOAL=500
STEPS_GOAL=10000
STATS_START_DATE=2026-01-01
```

Le fichier `.env` est ignoré par git. Ne mettez jamais de secrets dans
`config.py`, le README ou un fichier tracké.

> **Note Garmin** : Le token Garmin est mis en cache dans `~/.garminconnect/`
> (créé automatiquement au premier lancement). Si Garmin demande une 2FA,
> lancez d'abord le script original en CLI pour valider une fois.

### 3. Installer les dépendances

```bash
chmod +x setup.sh run.sh
bash setup.sh
```

Cela crée le venv Python, installe les packages et génère les icônes PNG.

### 4. Démarrer l'application

```bash
bash run.sh
```

L'app est disponible sur `http://<IP_DU_PI>:5000`

---

## Configurer la PWA sur iPhone

### Méthode A : Sur le même réseau Wi-Fi (recommandée)

1. Connectez votre iPhone au même réseau Wi-Fi que le Pi.
2. Ouvrez Safari sur iPhone → `http://<IP_DU_PI>:5000`
3. Appuyez sur **Partager** (icône en bas) → **Sur l'écran d'accueil**
4. Nommez-la "CalTrack" → **Ajouter**

> ⚠️ Safari iOS exige HTTPS pour les fonctionnalités PWA avancées (notifications,
> Service Worker complet). Pour un usage simple sur réseau local, HTTP suffit.

### Méthode B : HTTPS avec un certificat auto-signé (optionnel)

Si vous voulez le plein support PWA (icônes maskable, offline complet) :

```bash
# Installer mkcert sur le Pi
curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/arm64"
chmod +x mkcert-v*-linux-arm64
sudo mv mkcert-v*-linux-arm64 /usr/local/bin/mkcert
mkcert -install
mkcert <IP_DU_PI> localhost 127.0.0.1

# Modifier run.sh pour passer les certificats à gunicorn :
# --certfile=<IP>.pem --keyfile=<IP>-key.pem
```

---

## Démarrage automatique au boot (systemd)

```bash
sudo nano /etc/systemd/system/caltrack.service
```

```ini
[Unit]
Description=CalTrack Health Dashboard
After=network.target

[Service]
WorkingDirectory=/home/pi/health-dashboard
ExecStart=/home/pi/health-dashboard/.venv/bin/gunicorn app:app --bind 0.0.0.0:5000 --workers 2 --timeout 120
User=pi
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable caltrack
sudo systemctl start caltrack
sudo systemctl status caltrack
```

---

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /` | Dashboard SPA |
| `GET /api/today` | Données aujourd'hui (avec repas) |
| `GET /api/day?date=YYYY-MM-DD` | Données d'un jour spécifique |
| `GET /api/week?offset=N` | Semaine (0=courante, 1=précédente…) |
| `GET /api/month?year=Y&month=M` | Données du mois |
| `POST /api/refresh` | Vide le cache mémoire |

### Cache
- Données du jour : 2 min
- Données passées : 1 h
- Le bouton ↻ dans l'app vide le cache et recharge.

---

## Fonctionnalités

### Vue Jour
- Déficit/surplus calorique en grand (vert = bon, rouge = mauvais)
- Calories mangées, dépensées, nombre de pas
- Barre de progression mangé/dépensé
- Macros (protéines / glucides / lipides) avec mini-barres
- Liste des repas de la journée
- Navigation jour par jour ← →

### Vue Semaine
- Déficit moyen de la semaine
- Graphique en barres des 7 jours (CSS pur, pas de lib JS)
- Liste détaillée jour par jour

### Vue Mois
- Grille calendrier avec couleur par intensité de déficit
- Vert foncé = fort déficit, vert clair = léger déficit
- Orange/rouge = surplus
- Clic sur une cellule → navigation vers la vue Jour
- Statistiques du mois : déficit moyen + nb jours en déficit

---

## Dépannage

**L'app ne se connecte pas à Garmin**
→ Supprimez `~/.garminconnect/` et relancez pour forcer un nouveau login.

**Le token Yazio expire**
→ Le client se reconnecte automatiquement à chaque restart du serveur.
   Pour un token persistant, adaptez `YazioClient.login()` pour sauvegarder/relire le token.

**Garmin demande une authentification 2FA**
→ Lancez une fois le script CLI original, validez la 2FA, puis relancez `run.sh`.
