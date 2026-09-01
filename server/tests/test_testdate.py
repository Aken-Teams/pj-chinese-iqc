"""Reading the test date out of each vendor's stamp.

議題四's time axis needs the date the lot was tested, and every fab writes it
differently. These are the exact strings their 2026-08 files contain.
"""

from datetime import datetime

import pytest

from app.services.parser.testdate import parse_test_date


class TestRealVendorStamps:
    @pytest.mark.parametrize("raw,expected", [
        # 东部高科 — "Test End Time" column
        ("2026-01-27 10:27:53", datetime(2026, 1, 27, 10, 27, 53)),
        # 天狼芯 — prefixed with a word, dotted, paired with a Finish time
        ("Start 2026.07.09 15:13", datetime(2026, 7, 9, 15, 13)),
        # 新洁能 — slashes, date only
        ("2025/12/30", datetime(2025, 12, 30)),
        # 祥微 — "START_TIME" column
        ("2026-06-13 13:40:22", datetime(2026, 6, 13, 13, 40, 22)),
        # 禾纳 — dashes, date only
        ("2026-02-09", datetime(2026, 2, 9)),
    ])
    def test_each_vendor(self, raw, expected):
        assert parse_test_date(raw) == expected


class TestNonDates:
    @pytest.mark.parametrize("raw", [
        None, "", "  ", "N/A", "/",
        "1234",              # a lot number, not a date
        "PJ0120N600G1",      # a product code
        "14:04:36",          # 禾纳's Time cell — no date in it
        "2026-13-45",        # month 13, day 45: a misread
        "1999-01-01",        # before the 20xx window these files live in
    ])
    def test_returns_none(self, raw):
        assert parse_test_date(raw) is None


class TestAlreadyADatetime:
    def test_excel_datetime_passes_through(self):
        """A date-formatted cell arrives from openpyxl as a datetime."""
        value = datetime(2026, 3, 12, 17, 2)
        assert parse_test_date(value) is value


class TestPickingOutOfSurroundingText:
    def test_finds_the_date_inside_a_sentence(self):
        assert parse_test_date("Test End Time: 2026-01-27 10:27:53 (CP1)") == \
            datetime(2026, 1, 27, 10, 27, 53)

    def test_takes_the_first_date_when_two_are_present(self):
        """天狼芯 write Start and Finish on one line; the start is the test date."""
        assert parse_test_date("Start 2026.07.09 15:13 Finish 2026.07.09 16:56") == \
            datetime(2026, 7, 9, 15, 13)
