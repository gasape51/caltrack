"""
Configuration de l'application.

Les secrets ne doivent pas etre commites. Definissez-les via l'environnement
ou dans un fichier local `.env` ignore par git.
"""
import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
ENV_FILE = BASE_DIR / ".env"


def _load_dotenv(path: Path = ENV_FILE) -> None:
    """Charge un fichier .env minimal sans dependance externe."""
    if not path.exists():
        return
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key:
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        os.environ.setdefault(key, value)


def _env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name, default)
    if isinstance(value, str) and value == "":
        return None
    return value


def _env_int(name: str, default: int) -> int:
    value = _env(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError as exc:
        raise ValueError(f"{name} doit etre un entier") from exc


def _env_bool(name: str, default: bool = False) -> bool:
    value = _env(name)
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


_load_dotenv()

# Yazio
YAZIO_EMAIL = _env("YAZIO_EMAIL")
YAZIO_PASSWORD = _env("YAZIO_PASSWORD")

# Garmin
GARMIN_EMAIL = _env("GARMIN_EMAIL")
GARMIN_PASSWORD = _env("GARMIN_PASSWORD")
GARMIN_TOKEN_DIR = os.path.expanduser(_env("GARMIN_TOKEN_DIR", "~/.garminconnect"))

# Objectifs
DEFICIT_GOAL = _env_int("DEFICIT_GOAL", 500)
STEPS_GOAL = _env_int("STEPS_GOAL", 10_000)

# Historique
STATS_START_DATE = _env("STATS_START_DATE")

# Serveur
HOST = _env("HOST", "0.0.0.0")
PORT = _env_int("PORT", 5000)
DEBUG = _env_bool("DEBUG", False)

# Cache API (secondes)
CACHE_TTL_TODAY = _env_int("CACHE_TTL_TODAY", 120)
CACHE_TTL_PAST = _env_int("CACHE_TTL_PAST", 3600)


def require_credentials() -> None:
    missing = [
        name for name, value in {
            "YAZIO_EMAIL": YAZIO_EMAIL,
            "YAZIO_PASSWORD": YAZIO_PASSWORD,
            "GARMIN_EMAIL": GARMIN_EMAIL,
            "GARMIN_PASSWORD": GARMIN_PASSWORD,
        }.items()
        if not value
    ]
    if missing:
        names = ", ".join(missing)
        raise RuntimeError(
            f"Variables d'environnement manquantes: {names}. "
            "Creez un fichier .env a partir de .env.example ou exportez-les."
        )
