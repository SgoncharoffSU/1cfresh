import calendar
from datetime import datetime, timedelta, timezone

_MOSCOW = timezone(timedelta(hours=3))

WEEK_NAMES = {0: 'Понедельник', 1: 'Вторник', 2: 'Среда', 3: 'Четверг',
              4: 'Пятница', 5: 'Суббота', 6: 'Воскресенье'}

MONTH_NAMES = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
               'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']


def _now_moscow() -> datetime:
    return datetime.now(_MOSCOW).replace(tzinfo=None)


def _resolve_day(month_day: str | None, year: int, month: int) -> int:
    if month_day == 'first' or not month_day:
        return 1
    if month_day == 'last':
        return calendar.monthrange(year, month)[1]
    return min(int(month_day), calendar.monthrange(year, month)[1])


def compute_contract_next_run(
    frequency: str,
    week_day: int | None,
    month_day: str | None,
    from_dt: datetime | None = None,
) -> datetime:
    now = from_dt or _now_moscow()
    nine = now.replace(hour=9, minute=0, second=0, microsecond=0)

    # Для тестирования: «каждые N минут» (week_day хранит интервал)
    if frequency == 'minutes':
        interval = max(1, week_day or 5)
        return now + timedelta(minutes=interval)

    if frequency == 'weekly':
        wd = week_day if week_day is not None else 0
        days_ahead = wd - now.weekday()
        if days_ahead < 0 or (days_ahead == 0 and now >= nine):
            days_ahead += 7
        return (now + timedelta(days=days_ahead)).replace(hour=9, minute=0, second=0, microsecond=0)

    if frequency == 'monthly':
        day = _resolve_day(month_day, now.year, now.month)
        candidate = now.replace(day=day, hour=9, minute=0, second=0, microsecond=0)
        if candidate > now:
            return candidate
        # следующий месяц
        nm = (now.replace(day=28) + timedelta(days=4)).replace(day=1)
        day = _resolve_day(month_day, nm.year, nm.month)
        return nm.replace(day=day, hour=9, minute=0, second=0, microsecond=0)

    if frequency == 'quarterly':
        # Кварталы: Янв/Апр/Июл/Окт
        quarter_starts = [1, 4, 7, 10]
        for year in [now.year, now.year + 1]:
            for qm in quarter_starts:
                if year == now.year and qm < now.month:
                    continue
                day = _resolve_day(month_day, year, qm)
                try:
                    candidate = now.replace(year=year, month=qm, day=day,
                                            hour=9, minute=0, second=0, microsecond=0)
                    if candidate > now:
                        return candidate
                except ValueError:
                    pass

    return now + timedelta(days=1)


def describe_contract_schedule(
    frequency: str,
    week_day: int | None,
    month_day: str | None,
) -> str:
    if frequency == 'weekly':
        wd_name = WEEK_NAMES.get(week_day or 0, 'Понедельник')
        return f'Еженедельно, {wd_name}'

    day_label = ''
    if month_day == 'first':
        day_label = 'в начале'
    elif month_day == 'last':
        day_label = 'в конце'
    elif month_day:
        day_label = f'{month_day}-го числа'

    if frequency == 'monthly':
        return f'Ежемесячно, {day_label}'
    if frequency == 'quarterly':
        return f'Ежеквартально, {day_label}'

    return 'Расписание'
