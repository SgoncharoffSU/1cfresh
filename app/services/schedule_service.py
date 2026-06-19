import calendar
from datetime import datetime, timedelta, timezone

_MOSCOW = timezone(timedelta(hours=3))

WD_NAMES = {0: 'Пн', 1: 'Вт', 2: 'Ср', 3: 'Чт', 4: 'Пт', 5: 'Сб', 6: 'Вс'}


def _now_moscow() -> datetime:
    return datetime.now(_MOSCOW).replace(tzinfo=None)


def compute_next_run(schedule_type: str, config: dict, from_dt: datetime | None = None) -> datetime:
    now = from_dt or _now_moscow()

    if schedule_type == "interval_minutes":
        return now + timedelta(minutes=int(config.get("minutes", 1)))

    if schedule_type == "interval_days":
        return now + timedelta(days=int(config.get("days", 1)))

    if schedule_type == "monthly_days":
        days = sorted(int(d) for d in config.get("days", [1]))
        # Seek next occurrence in current month, then next month
        for day in days:
            max_d = calendar.monthrange(now.year, now.month)[1]
            candidate = now.replace(day=min(day, max_d), hour=9, minute=0, second=0, microsecond=0)
            if candidate > now:
                return candidate
        # Roll to next month
        first = (now.replace(day=28) + timedelta(days=4)).replace(day=1)
        max_d = calendar.monthrange(first.year, first.month)[1]
        return first.replace(day=min(days[0], max_d), hour=9, minute=0, second=0, microsecond=0)

    if schedule_type == "weekly_days":
        weekdays = sorted(int(d) for d in config.get("weekdays", [0]))
        today_wd = now.weekday()
        nine_today = now.replace(hour=9, minute=0, second=0, microsecond=0)
        for wd in weekdays:
            days_ahead = wd - today_wd
            if days_ahead < 0 or (days_ahead == 0 and now >= nine_today):
                days_ahead += 7
            candidate = (now + timedelta(days=days_ahead)).replace(hour=9, minute=0, second=0, microsecond=0)
            if candidate > now:
                return candidate
        days_ahead = weekdays[0] - today_wd + 7
        return (now + timedelta(days=days_ahead)).replace(hour=9, minute=0, second=0, microsecond=0)

    return now + timedelta(days=1)


def describe_schedule(schedule_type: str, config: dict) -> str:
    if schedule_type == "interval_minutes":
        m = int(config.get("minutes", 1))
        if m == 1:
            return "Каждую минуту"
        return f"Каждые {m} минут"

    if schedule_type == "interval_days":
        d = int(config.get("days", 1))
        if d == 1:
            return "Каждый день"
        return f"Каждые {d} дней"

    if schedule_type == "monthly_days":
        days = sorted(int(d) for d in config.get("days", []))
        return f"Числа месяца: {', '.join(str(d) for d in days)}"

    if schedule_type == "weekly_days":
        wds = [WD_NAMES.get(int(d), str(d)) for d in sorted(config.get("weekdays", []))]
        return f"Еженедельно: {', '.join(wds)}"

    return "Расписание"
