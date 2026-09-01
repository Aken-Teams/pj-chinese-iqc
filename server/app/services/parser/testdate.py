"""Read the test date out of whatever a vendor wrote.

Every fab stamps its CP files with a date and none of them agree on the format.
Collected from the 2026-08 files:

    2026-01-27 10:27:53      东部高科
    Start 2026.07.09 15:13   天狼芯 — prefixed, dotted, and paired with a Finish
    2025/12/30               新洁能
    2026-06-13 13:40:22      祥微
    2026-02-09               禾纳

A single regular expression covers all of them because the parts are always
year, month, day in that order; only the separators and the surrounding text
change. Anything that does not yield a real calendar date returns None rather
than a guess, so a lot with an unreadable stamp falls back to its upload time
instead of landing at an invented point on the trend.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Optional

# Year first, then month and day, separated by - / or . — with optional time.
_DATE = re.compile(
    r"(?P<y>20\d{2})[-/.](?P<m>\d{1,2})[-/.](?P<d>\d{1,2})"
    r"(?:[\sT]+(?P<hh>\d{1,2}):(?P<mm>\d{2})(?::(?P<ss>\d{2}))?)?"
)

# Excel hands back a real datetime for a date-formatted cell; nothing to parse.
_PASSTHROUGH = (datetime,)


def parse_test_date(value) -> Optional[datetime]:
    """The date a lot was tested, or None if the value carries none."""
    if value is None:
        return None
    if isinstance(value, _PASSTHROUGH):
        return value

    match = _DATE.search(str(value))
    if not match:
        return None
    try:
        return datetime(
            int(match.group("y")), int(match.group("m")), int(match.group("d")),
            int(match.group("hh") or 0), int(match.group("mm") or 0),
            int(match.group("ss") or 0),
        )
    except ValueError:
        # A stamp like 2026-13-45 is a misread, not a date.
        return None
