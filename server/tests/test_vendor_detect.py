"""Vendor auto-detection ranking.

Upload with no vendor selected probes every template the uploader's site can
see and keeps the best reading. The ranking used to be "most data rows", which
is not evidence: every template walks the same sheet, so a wrong one counts
roughly the same number of non-blank rows. Two real misreadings came out of
that and are pinned here.
"""

from app.routers.upload import _preview_quality, _looks_like_id


def _pv(rows, wafers=0, params=0, product=None, lot=None, junk=0):
    return {
        "dataRows": rows, "wafersDetected": wafers,
        "paramNames": ["p%d" % i for i in range(params)],
        "productId": product, "lotId": lot, "junkRows": junk,
    }


def test_row_count_does_not_beat_a_real_extraction():
    """東部高科's file scored 5,556 rows under 祥微's template and 5,550 under its
    own. 祥微 won by six rows while reading no parameters, no lot, and a product
    id of "PROBE CARD ID:" — a label that leaked out of a neighbouring cell."""
    xrw = _pv(5556, wafers=31, params=0, product="PROBE CARD ID:")
    dbh = _pv(5550, wafers=25, params=16, product="PJ0120N600G1", lot="1ACX02")
    assert _preview_quality(dbh) > _preview_quality(xrw)


def test_junk_rows_beat_row_count():
    """禾納 and 新潔能 ship the same tester format, but 禾納's files carry an extra
    "wafer number <n>" line before the dies. 新潔能's template starts one row
    higher, so on a 禾納 file it reads that line as a die and wins on row count
    with 301 against 300."""
    nce = _pv(301, wafers=1, params=18, product="ALE1084AU", lot="SPC011UC", junk=1)
    hn = _pv(300, wafers=1, params=18, product="ALE1084AU", lot="SPC011UC", junk=0)
    assert _preview_quality(hn) > _preview_quality(nce)


def test_more_rows_still_wins_all_else_equal():
    """The two 新潔能 templates differ only in row count on a 新潔能 file, and
    there the larger reading is the right one."""
    nce = _pv(155, wafers=1, params=14, product="NCETSG340KAA", lot="FA5Z-3372")
    hn = _pv(154, wafers=1, params=14, product="NCETSG340KAA", lot="FA5Z-3372")
    assert _preview_quality(nce) > _preview_quality(hn)


def test_params_and_wafers_outrank_either_alone():
    both = _pv(100, wafers=5, params=10)
    wafers_only = _pv(900, wafers=5, params=0)
    params_only = _pv(900, wafers=0, params=10)
    assert _preview_quality(both) > _preview_quality(wafers_only)
    assert _preview_quality(both) > _preview_quality(params_only)


def test_looks_like_id_rejects_leaked_labels():
    assert _looks_like_id("1ACX02")
    assert _looks_like_id("SPC011UC-FT020037-260209")
    assert not _looks_like_id("PROBE CARD ID:")   # trailing colon = a label
    assert not _looks_like_id(None)
    assert not _looks_like_id("")
    assert not _looks_like_id("x" * 41)           # too long to be a code
