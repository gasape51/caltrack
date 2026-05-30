"""
CalTrack — Flask API
"""
import calendar
import time
import threading
import logging
import os
from datetime import date, timedelta
from flask import Flask, jsonify, render_template, request

import config
from tracker import YazioClient, GarminClient, HealthTracker

# Configure logging to file and console
log_dir = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(log_dir, exist_ok=True)
log_file = os.path.join(log_dir, "caltrack.log")

formatter = logging.Formatter("%(asctime)s %(levelname)s [%(filename)s:%(lineno)d] %(message)s")
handler_file = logging.FileHandler(log_file)
handler_file.setFormatter(formatter)
handler_console = logging.StreamHandler()
handler_console.setFormatter(formatter)

logging.basicConfig(level=logging.INFO, handlers=[handler_file, handler_console])
log = logging.getLogger(__name__)

app = Flask(__name__)


@app.after_request
def add_cache_headers(response):
    if request.path == "/" or request.path == "/static/sw.js":
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


# ── Tracker (lazy init, thread-safe) ─────────────────────────────────
_tracker: HealthTracker | None = None
_tracker_lock = threading.Lock()
_tracker_error: str | None = None


def get_tracker() -> HealthTracker:
    global _tracker, _tracker_error
    if _tracker is not None:
        return _tracker
    with _tracker_lock:
        if _tracker is not None:
            return _tracker
        log.info("Initialisation Yazio + Garmin…")
        try:
            config.require_credentials()
            yazio  = YazioClient(config.YAZIO_EMAIL, config.YAZIO_PASSWORD)
            garmin = GarminClient(config.GARMIN_EMAIL, config.GARMIN_PASSWORD,
                                  config.GARMIN_TOKEN_DIR)
            yazio.login()
            log.info("✅ Yazio connecté")
            garmin.login()
            log.info("✅ Garmin connecté")
            _tracker = HealthTracker(yazio, garmin)
            _tracker_error = None
            log.info("✅ HealthTracker initialisé avec succès")
        except Exception as e:
            _tracker_error = str(e)
            log.error(f"❌ Erreur init tracker: {e}", exc_info=True)
            raise
    return _tracker


# ── Cache mémoire simple ──────────────────────────────────────────────
_cache: dict = {}


def cache_get(key: str):
    if key in _cache:
        val, ts, ttl = _cache[key]
        if time.time() - ts < ttl:
            return val
    return None


def cache_set(key: str, val, ttl: int):
    _cache[key] = (val, time.time(), ttl)


def _avg(rows: list[dict], field: str):
    vals = [float(r.get(field) or 0) for r in rows]
    return sum(vals) / len(vals) if vals else None


def _sum(rows: list[dict], field: str) -> float:
    return sum(float(r.get(field) or 0) for r in rows)


def _best(rows: list[dict], field: str, reverse: bool = True):
    if not rows:
        return None
    return sorted(rows, key=lambda r: float(r.get(field) or 0), reverse=reverse)[0]


def _current_deficit_streak(rows: list[dict]) -> int:
    streak = 0
    for day in sorted(rows, key=lambda r: r["date"], reverse=True):
        if day.get("delta", 0) < 0:
            streak += 1
        else:
            break
    return streak


def _period_total(rows: list[dict], start: date | None = None, end: date | None = None) -> dict:
    selected = []
    start_iso = start.isoformat() if start else None
    end_iso = end.isoformat() if end else None
    for row in rows:
        ds = row.get("date")
        if start_iso and ds < start_iso:
            continue
        if end_iso and ds > end_iso:
            continue
        selected.append(row)
    return {
        "start": selected[0]["date"] if selected else start_iso,
        "end": selected[-1]["date"] if selected else end_iso,
        "days": len(selected),
        "total_delta": round(_sum(selected, "delta"), 1) if selected else None,
    }


def build_stats(days: list[dict], today_iso: str) -> dict:
    complete = [d for d in days if d.get("complete_data")]
    finished = [d for d in complete if d["date"] != today_iso]
    recent_7 = finished[-7:]
    previous_7 = finished[-14:-7]

    today_date = date.fromisoformat(today_iso)
    week_start = today_date - timedelta(days=today_date.weekday())
    month_start = today_date.replace(day=1)

    avg_delta = _avg(finished, "delta")
    avg_steps = _avg(finished, "steps")
    avg_distance = _avg(finished, "distance_km")
    avg_active = _avg(finished, "burned_active")

    recent_avg_delta = _avg(recent_7, "delta")
    previous_avg_delta = _avg(previous_7, "delta")
    recent_avg_steps = _avg(recent_7, "steps")
    previous_avg_steps = _avg(previous_7, "steps")

    deficit_days = [d for d in finished if d.get("delta", 0) < 0]
    surplus_days = [d for d in finished if d.get("delta", 0) > 0]
    target_days = [
        d for d in finished
        if d.get("delta", 0) <= -config.DEFICIT_GOAL
    ]

    return {
        "period": {
            "start": days[0]["date"] if days else None,
            "end": days[-1]["date"] if days else None,
            "days": len(days),
            "complete_days": len(finished),
        },
        "balance": {
            "avg_delta": round(avg_delta, 1) if avg_delta is not None else None,
            "total_delta": round(_sum(finished, "delta"), 1),
            "avg_eaten": round(_avg(finished, "eaten") or 0, 1) if finished else None,
            "avg_burned": round(_avg(finished, "burned_total") or 0, 1) if finished else None,
            "deficit_days": len(deficit_days),
            "target_days": len(target_days),
            "deficit_rate": round(len(deficit_days) / len(finished) * 100, 1) if finished else None,
            "target_rate": round(len(target_days) / len(finished) * 100, 1) if finished else None,
            "streak_days": _current_deficit_streak(finished),
        },
        "calorie_totals": {
            "week": _period_total(finished, week_start, today_date),
            "month": _period_total(finished, month_start, today_date),
            "since_start": _period_total(finished, None, today_date),
        },
        "activity": {
            "avg_steps": round(avg_steps, 0) if avg_steps is not None else None,
            "avg_distance_km": round(avg_distance, 2) if avg_distance is not None else None,
            "total_distance_km": round(_sum(finished, "distance_km"), 2),
            "avg_active": round(avg_active, 1) if avg_active is not None else None,
        },
        "trend": {
            "recent_days": len(recent_7),
            "previous_days": len(previous_7),
            "avg_delta_change": (
                round(recent_avg_delta - previous_avg_delta, 1)
                if recent_avg_delta is not None and previous_avg_delta is not None else None
            ),
            "avg_steps_change": (
                round(recent_avg_steps - previous_avg_steps, 0)
                if recent_avg_steps is not None and previous_avg_steps is not None else None
            ),
        },
        "records": {
            "best_deficit": _best(deficit_days, "delta", reverse=False),
            "biggest_surplus": _best(surplus_days, "delta", reverse=True),
            "most_steps": _best(finished, "steps", reverse=True),
            "longest_distance": _best(finished, "distance_km", reverse=True),
            "most_active": _best(finished, "burned_active", reverse=True),
        },
        "days": days,
    }


# ── Routes ────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html",
                           deficit_goal=config.DEFICIT_GOAL,
                           steps_goal=config.STEPS_GOAL)


@app.route("/api/status")
def api_status():
    """Vérifie si le tracker est initialisé."""
    try:
        get_tracker()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 503


@app.route("/api/today")
def api_today():
    key = f"today_{date.today().isoformat()}"
    cached = cache_get(key)
    if cached:
        return jsonify(cached)
    try:
        t   = get_tracker()
        day = t.get_today()
        data = day.to_dict()
        cache_set(key, data, config.CACHE_TTL_TODAY)
        return jsonify(data)
    except Exception as e:
        log.error(f"Erreur /api/today: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 503


@app.route("/api/day")
def api_day():
    """GET /api/day?date=YYYY-MM-DD"""
    ds = request.args.get("date", date.today().isoformat())
    key = f"day_{ds}"
    cached = cache_get(key)
    if cached:
        return jsonify(cached)
    try:
        d = date.fromisoformat(ds)
        t = get_tracker()
        days = t.get_range(d, d, with_meals=True)
        data = days[0].to_dict()
        ttl  = config.CACHE_TTL_TODAY if d == date.today() else config.CACHE_TTL_PAST
        cache_set(key, data, ttl)
        return jsonify(data)
    except Exception as e:
        log.error(f"Erreur /api/day (date={ds}): {e}", exc_info=True)
        return jsonify({"error": str(e)}), 503


@app.route("/api/week")
def api_week():
    """GET /api/week?offset=0  (0=semaine en cours, 1=semaine précédente, …)"""
    offset = int(request.args.get("offset", 0))
    today  = date.today()
    # Semaine lundi→dimanche
    mon = today - timedelta(days=today.weekday()) - timedelta(weeks=offset)
    sun = mon + timedelta(days=6)
    if sun > today:
        sun = today
    key = f"week_{mon}_{sun}"
    cached = cache_get(key)
    if cached:
        return jsonify(cached)
    try:
        t    = get_tracker()
        days = t.get_range(mon, sun)
        data = [d.to_dict() for d in days]
        ttl  = config.CACHE_TTL_TODAY if offset == 0 else config.CACHE_TTL_PAST
        cache_set(key, data, ttl)
        return jsonify(data)
    except Exception as e:
        log.error(f"Erreur /api/week (offset={offset}, {mon}→{sun}): {e}", exc_info=True)
        return jsonify({"error": str(e)}), 503


@app.route("/api/month")
def api_month():
    """GET /api/month?year=2025&month=5"""
    today = date.today()
    year  = int(request.args.get("year",  today.year))
    month = int(request.args.get("month", today.month))
    key   = f"month_{year}_{month}"
    cached = cache_get(key)
    if cached:
        return jsonify(cached)
    try:
        _, days_in_month = calendar.monthrange(year, month)
        start = date(year, month, 1)
        end   = date(year, month, days_in_month)
        if end > today:
            end = today
        t    = get_tracker()
        days = t.get_range(start, end)
        data = [d.to_dict() for d in days]
        ttl  = config.CACHE_TTL_TODAY if (year == today.year and month == today.month) else config.CACHE_TTL_PAST
        cache_set(key, data, ttl)
        return jsonify(data)
    except Exception as e:
        log.error(f"Erreur /api/month (year={year}, month={month}): {e}", exc_info=True)
        return jsonify({"error": str(e)}), 503


@app.route("/api/stats")
def api_stats():
    """GET /api/stats?days=90"""
    today = date.today()
    configured_start = getattr(config, "STATS_START_DATE", None)
    try:
        days_count = max(7, min(int(request.args.get("days", 90)), 90))
        start = today - timedelta(days=days_count - 1)
        # Toujours couvrir depuis le 1er du mois courant (évite de rater le jour 1 en fin de mois)
        start = min(start, today.replace(day=1))
        if configured_start:
            start = min(date.fromisoformat(configured_start), today)
    except ValueError as e:
        return jsonify({"error": f"Paramètre stats invalide: {e}"}), 400
    key = f"stats_{start}_{today}_{days_count}"
    cached = cache_get(key)
    if cached:
        return jsonify(cached)
    try:
        t = get_tracker()
        days = [d.to_dict() for d in t.get_range(start, today)]
        data = build_stats(days, today.isoformat())
        cache_set(key, data, config.CACHE_TTL_TODAY)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 503


# ── Cache invalidation manuelle ───────────────────────────────────────
@app.route("/api/refresh", methods=["POST"])
def api_refresh():
    global _cache
    _cache = {}
    return jsonify({"ok": True, "message": "Cache vidé"})


if __name__ == "__main__":
    app.run(host=config.HOST, port=config.PORT, debug=config.DEBUG)
