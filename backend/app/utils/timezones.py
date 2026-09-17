"""Business-timezone helpers.

The server clock runs UTC (Etc/UTC) but the business operates in
Africa/Kampala (UTC+3, fixed offset — no DST). All business-DAY semantics must
use the Kampala calendar day, never the naive server/UTC date, otherwise
transactions recorded between local 00:00 and 02:59 get bucketed to the
previous day.

Use ``today_local()`` anywhere a business *date* is defaulted or compared
against another business date, ``now_local()`` when a tz-aware business
*timestamp* is defaulted, and ``at_business_tz(col)`` when extracting the
calendar-day date of a ``timestamptz`` column in SQL (plain ``func.date(col)``
would use the UTC session timezone and display one day behind).
"""

from datetime import date, datetime
from zoneinfo import ZoneInfo

BUSINESS_TZ = ZoneInfo("Africa/Kampala")
BUSINESS_TZ_NAME = "Africa/Kampala"


def today_local() -> date:
    """The business calendar day right now (Africa/Kampala)."""
    return datetime.now(BUSINESS_TZ).date()


def now_local() -> datetime:
    """The current instant expressed in the business time zone (tz-aware)."""
    return datetime.now(BUSINESS_TZ)


def at_business_tz(column):
    """Wrap a SQLAlchemy ``timestamptz`` column so its date logic runs in the
    business timezone: ``(column AT TIME ZONE 'Africa/Kampala')``."""
    return column.op("AT TIME ZONE")(BUSINESS_TZ_NAME)