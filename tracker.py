"""
Yazio + Garmin — Moteur de données
"""
import os
import requests
import garminconnect
from datetime import date, timedelta
from dataclasses import dataclass, field
from typing import Optional

# ── Constantes Yazio ─────────────────────────────────────────────────
YAZIO_BASE      = "https://yzapi.yazio.com"
YAZIO_VERSION   = "v15"
YAZIO_CLIENT_ID = "1_4hiybetvfksgw40o0sog4s884kwc840wwso8go4k8c04goo4c"
YAZIO_SECRET    = "6rok2m65xuskgkgogw40wkkk8sw0osg84s8cggsc4woos4s8o"

MEAL_LABELS = {
    "breakfast": "🌅 Petit-déjeuner",
    "lunch":     "☀️ Déjeuner",
    "dinner":    "🌙 Dîner",
    "snack":     "🍎 Collation",
}


# ── Data classes ──────────────────────────────────────────────────────
@dataclass
class MealNutrition:
    name:     str
    calories: float = 0.0
    protein:  float = 0.0
    carbs:    float = 0.0
    fat:      float = 0.0


@dataclass
class DayBalance:
    date:          str
    eaten:         float = 0.0
    protein:       float = 0.0
    carbs:         float = 0.0
    fat:           float = 0.0
    goal_calories: float = 0.0
    goal_protein:  float = 0.0
    goal_carbs:    float = 0.0
    goal_fat:      float = 0.0
    meals:         list  = field(default_factory=list)
    burned_total:  float = 0.0
    burned_active: float = 0.0
    burned_bmr:    float = 0.0
    steps:         int   = 0
    distance_km:   float = 0.0

    @property
    def delta(self) -> float:
        """Mangé − Dépensé  (+= surplus, −= déficit)."""
        return self.eaten - self.burned_total

    @property
    def has_data(self) -> bool:
        """Au moins une source a des données."""
        return self.eaten > 0 or self.burned_total > 0

    @property
    def complete_data(self) -> bool:
        """Les deux sources (Yazio et Garmin actif) ont des données — utilisé pour les moyennes."""
        return self.eaten > 0 and self.burned_active > 0

    def to_dict(self) -> dict:
        return {
            "date":          self.date,
            "eaten":         round(self.eaten, 1),
            "protein":       round(self.protein, 1),
            "carbs":         round(self.carbs, 1),
            "fat":           round(self.fat, 1),
            "goal_calories": round(self.goal_calories, 1),
            "goal_protein":  round(self.goal_protein, 1),
            "goal_carbs":    round(self.goal_carbs, 1),
            "goal_fat":      round(self.goal_fat, 1),
            "burned_total":  round(self.burned_total, 1),
            "burned_active": round(self.burned_active, 1),
            "burned_bmr":    round(self.burned_bmr, 1),
            "steps":         self.steps,
            "distance_km":   round(self.distance_km, 2),
            "delta":         round(self.delta, 1),
            "has_data":      self.has_data,
            "complete_data": self.complete_data,
            "meals": [
                {
                    "name":     m.name,
                    "calories": round(m.calories, 1),
                    "protein":  round(m.protein, 1),
                    "carbs":    round(m.carbs, 1),
                    "fat":      round(m.fat, 1),
                }
                for m in self.meals
            ],
        }


# ── Helpers ──────────────────────────────────────────────────────────
def _parse_nutrients(n: dict):
    cal  = float(n.get("energy.energy") or n.get("energy_kcal") or n.get("energy") or 0)
    prot = float(n.get("nutrient.protein") or n.get("protein") or 0)
    carb = float(n.get("nutrient.carb") or n.get("carbohydrates") or n.get("carbs") or 0)
    fat  = float(n.get("nutrient.fat") or n.get("fat") or 0)
    return cal, prot, carb, fat


def _goal_value(goals: dict, *keys: str) -> float:
    for key in keys:
        val = goals.get(key)
        if val is not None:
            try:
                return float(val)
            except (TypeError, ValueError):
                continue
    return 0.0


# ── Yazio client ─────────────────────────────────────────────────────
class YazioClient:
    def __init__(self, email: str, password: str):
        self.email    = email
        self.password = password
        self.session  = requests.Session()
        self.session.headers["Accept"] = "application/json"

    def _url(self, ep: str) -> str:
        return f"{YAZIO_BASE}/{YAZIO_VERSION}/{ep.lstrip('/')}"

    def login(self):
        r = requests.post(self._url("oauth/token"), json={
            "client_id":     YAZIO_CLIENT_ID,
            "client_secret": YAZIO_SECRET,
            "username":      self.email,
            "password":      self.password,
            "grant_type":    "password",
        }, timeout=15)
        if not r.ok:
            raise RuntimeError(f"Yazio login échoué {r.status_code}: {r.text[:200]}")
        self.session.headers["Authorization"] = f"Bearer {r.json()['access_token']}"

    def _get(self, ep: str, params=None):
        url = self._url(ep)
        r = self.session.get(url, params=params, timeout=15)
        if r.status_code == 401:
            try:
                self.login()
            except Exception:
                r.raise_for_status()
            r = self.session.get(url, params=params, timeout=15)
        r.raise_for_status()
        return r.json()

    def get_range(self, start: date, end: date) -> dict:
        rows = self._get("user/consumed-items/nutrients-daily", {
            "start": start.strftime("%Y-%m-%d"),
            "end":   end.strftime("%Y-%m-%d"),
        })
        if not isinstance(rows, list):
            return {}
        return {
            r["date"]: {
                "eaten":         float(r.get("energy", 0)),
                "protein":       float(r.get("protein", 0)),
                "carbs":         float(r.get("carb", 0)),
                "fat":           float(r.get("fat", 0)),
                "goal_calories": float(r.get("energy_goal", 0)),
            }
            for r in rows if "date" in r
        }

    def get_meals(self, target_date: date):
        try:
            data = self._get("user/widgets/daily-summary",
                             {"date": target_date.strftime("%Y-%m-%d")})
        except Exception:
            return [], 0, {}
        goals = data.get("goals", {})
        gc = _goal_value(goals, "energy.energy", "energy_kcal", "energy")
        macro_goals = {
            "goal_protein": _goal_value(goals, "nutrient.protein", "protein", "protein_goal"),
            "goal_carbs":   _goal_value(goals, "nutrient.carb", "carb", "carbs", "carb_goal"),
            "goal_fat":     _goal_value(goals, "nutrient.fat", "fat", "fat_goal"),
        }
        meals = []
        for key, meal_data in data.get("meals", {}).items():
            if not isinstance(meal_data, dict):
                continue
            cal, prot, carb, fat = _parse_nutrients(meal_data.get("nutrients", {}))
            if cal > 0:
                meals.append(MealNutrition(MEAL_LABELS.get(key, key), cal, prot, carb, fat))
        return meals, gc, macro_goals


# ── Garmin client ─────────────────────────────────────────────────────
class GarminClient:
    def __init__(self, email: str, password: str, token_dir: str):
        self.email     = email
        self.password  = password
        self.token_dir = token_dir
        self.api: Optional[garminconnect.Garmin] = None

    def login(self):
        self.api = garminconnect.Garmin(self.email, self.password)
        try:
            self.api.login(self.token_dir)
        except Exception:
            self.api.login()
            os.makedirs(self.token_dir, exist_ok=True)
            self.api.garth.dump(self.token_dir)

    def get_full_day_bmr(self, before_date: date, fallback: float = 0.0) -> float:
        """Retourne le dernier BMR journalier complet connu par Garmin."""
        if not self.api:
            return fallback
        for days_back in range(1, 8):
            try:
                data = self.api.get_stats((before_date - timedelta(days=days_back)).isoformat())
                bmr = float(data.get("bmrKilocalories") or 0)
                if bmr > 0:
                    return bmr
            except Exception:
                continue
        return fallback

    def get_day(self, target_date: date) -> dict:
        empty = {"burned_total": 0, "burned_active": 0, "burned_bmr": 0, "steps": 0, "distance_km": 0}
        if not self.api:
            return empty
        try:
            data = self.api.get_stats(target_date.isoformat())
            burned_active = float(data.get("activeKilocalories") or 0)
            burned_bmr = float(data.get("bmrKilocalories") or 0)
            distance_m = float(data.get("totalDistanceMeters") or data.get("wellnessDistanceMeters") or 0)
            if target_date == date.today() and burned_bmr > 0:
                burned_bmr = self.get_full_day_bmr(target_date, fallback=burned_bmr)
                burned_total = burned_bmr + burned_active
            else:
                burned_total = float(data.get("totalKilocalories") or 0)
            return {
                "burned_total":  burned_total,
                "burned_active": burned_active,
                "burned_bmr":    burned_bmr,
                "steps":         int(data.get("totalSteps") or 0),
                "distance_km":   distance_m / 1000,
            }
        except Exception:
            return empty


# ── Moteur principal ─────────────────────────────────────────────────
class HealthTracker:
    def __init__(self, yazio: YazioClient, garmin: GarminClient):
        self.yazio  = yazio
        self.garmin = garmin
        self._garmin_cache: dict[str, dict] = {}

    def _get_garmin_day(self, target: date) -> dict:
        """Récupère les données Garmin d'un jour passé depuis le cache si disponible."""
        ds = target.isoformat()
        today = date.today()
        if target < today and ds in self._garmin_cache:
            return self._garmin_cache[ds]
        g = self.garmin.get_day(target)
        if target < today:
            self._garmin_cache[ds] = g
        return g

    def get_range(self, start: date, end: date, with_meals: bool = False) -> list:
        yazio_data = self.yazio.get_range(start, end)
        results = []
        cur = start
        while cur <= end:
            ds  = cur.strftime("%Y-%m-%d")
            day = DayBalance(date=ds)
            if ds in yazio_data:
                y = yazio_data[ds]
                day.eaten         = y["eaten"]
                day.protein       = y["protein"]
                day.carbs         = y["carbs"]
                day.fat           = y["fat"]
                day.goal_calories = y["goal_calories"]
            if with_meals:
                meals, gc, macro_goals = self.yazio.get_meals(cur)
                day.meals = meals
                day.goal_calories = day.goal_calories or gc
                day.goal_protein = macro_goals.get("goal_protein", 0)
                day.goal_carbs   = macro_goals.get("goal_carbs", 0)
                day.goal_fat     = macro_goals.get("goal_fat", 0)
            g = self._get_garmin_day(cur)
            day.burned_total  = g["burned_total"]
            day.burned_active = g["burned_active"]
            day.burned_bmr    = g["burned_bmr"]
            day.steps         = g["steps"]
            day.distance_km   = g["distance_km"]
            results.append(day)
            cur += timedelta(days=1)
        return results

    def get_today(self) -> DayBalance:
        return self.get_range(date.today(), date.today(), with_meals=True)[0]
