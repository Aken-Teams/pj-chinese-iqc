"""
Verification script: Parse real customer Excel files and run review calculations.
This validates the parser + review engine WITHOUT needing a database.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import numpy as np
from app.services.parser.jjw_parser import JJWParser
from app.services.parser.xrw_parser import XRWParser
from app.services.review_engine import calculate_wafer_param_review

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "IQC", "extracted")

def verify_file(parser, filepath, label):
    print(f"\n{'='*70}")
    print(f"  {label}: {os.path.basename(filepath)}")
    print(f"{'='*70}")

    # 1. Full parse
    result = parser.parse(filepath)
    print(f"\nProduct: {result.product_id}")
    print(f"Lot: {result.lot_id}")
    print(f"Vendor: {result.vendor_code}")
    print(f"Total rows: {result.total_rows}")
    print(f"Wafers: {len(result.wafers)}")
    print(f"Params: {len(result.param_names)}")
    print(f"Param names: {result.param_names[:5]}{'...' if len(result.param_names) > 5 else ''}")

    # 2. CP Specs (limits)
    print(f"\n--- CP Specs (limits from Excel) ---")
    for spec in result.cp_specs[:5]:
        print(f"  {spec.param_name}: lower={spec.lower_limit}, upper={spec.upper_limit}")
    if len(result.cp_specs) > 5:
        print(f"  ... ({len(result.cp_specs)} total)")

    # 3. Per-wafer summary
    print(f"\n--- Wafer Summary ---")
    print(f"{'Wafer':<10} {'Total':>6} {'Bin1':>6} {'Bin1%':>8}")
    for w in result.wafers[:5]:
        pct = (w.bin1_count / w.gross_die * 100) if w.gross_die > 0 else 0
        print(f"{w.wafer_id:<10} {w.gross_die:>6} {w.bin1_count:>6} {pct:>7.2f}%")
    if len(result.wafers) > 5:
        print(f"  ... ({len(result.wafers)} wafers total)")

    # 4. Run review calculation on first wafer, first 3 params
    print(f"\n--- Review Calculation (Wafer: {result.wafers[0].wafer_id}) ---")
    first_wafer = result.wafers[0]
    bin1_dies = [d for d in first_wafer.dies if d.bin == 1]
    total_die = first_wafer.gross_die

    print(f"Total dies: {total_die}, Bin1 dies: {len(bin1_dies)}")

    for spec in result.cp_specs[:3]:
        pname = spec.param_name
        values = [d.electrical[pname] for d in bin1_dies if d.electrical.get(pname) is not None]

        if not values:
            print(f"\n  {pname}: No values found")
            continue

        # Use CP spec limits as Q1 limits for verification
        calc = calculate_wafer_param_review(
            values=values,
            total_die_count=total_die,
            q1_lower=spec.lower_limit,
            q1_upper=spec.upper_limit,
            q2_lower=None, q2_upper=None,
            q3_lower=None, q3_upper=None,
        )

        print(f"\n  Param: {pname}")
        print(f"    Spec range: [{spec.lower_limit}, {spec.upper_limit}]")
        print(f"    Values count: {len(values)}")
        print(f"    Average:   {calc['average']:.6f}")
        print(f"    Stdev:     {calc['stdev']:.6f}")
        print(f"    Min:       {calc['min_val']:.6f}")
        print(f"    Max:       {calc['max_val']:.6f}")
        print(f"    Bin1 yield: {calc['bin1_yield']*100:.2f}%")
        print(f"    Q1 yield:   {calc['q1_yield']*100:.2f}% (within spec)")

        # Cross-check with numpy directly
        arr = np.array(values)
        assert abs(calc['average'] - float(np.mean(arr))) < 1e-10, "Average mismatch!"
        assert abs(calc['stdev'] - float(np.std(arr, ddof=1))) < 1e-10, "Stdev mismatch!"
        assert abs(calc['max_val'] - float(np.max(arr))) < 1e-10, "Max mismatch!"
        assert abs(calc['min_val'] - float(np.min(arr))) < 1e-10, "Min mismatch!"

        # Verify Q1 yield manually
        if spec.lower_limit is not None and spec.upper_limit is not None:
            manual_q1 = sum(1 for v in values if v > spec.lower_limit and v < spec.upper_limit)
            expected_q1_yield = manual_q1 / total_die
            assert abs(calc['q1_yield'] - expected_q1_yield) < 1e-10, "Q1 yield mismatch!"

    # 5. Show all wafer bin1 yields
    print(f"\n--- All Wafer Bin1 Yields ---")
    total_bin1 = 0
    total_gross = 0
    for w in result.wafers:
        total_bin1 += w.bin1_count
        total_gross += w.gross_die
        pct = (w.bin1_count / w.gross_die * 100) if w.gross_die > 0 else 0
        print(f"  {w.wafer_id}: {pct:.2f}% ({w.bin1_count}/{w.gross_die})")

    overall = (total_bin1 / total_gross * 100) if total_gross > 0 else 0
    print(f"\n  Overall: {overall:.2f}% ({total_bin1}/{total_gross})")

    # 6. Check for data quality issues
    print(f"\n--- Data Quality Check ---")
    empty_electrical = 0
    non_numeric = 0
    for w in result.wafers:
        for d in w.dies:
            for pname, val in d.electrical.items():
                if val is None:
                    empty_electrical += 1

    print(f"  Missing electrical values: {empty_electrical}")
    print(f"  Bin distribution:")
    bin_counts = {}
    for w in result.wafers:
        for d in w.dies:
            bin_counts[d.bin] = bin_counts.get(d.bin, 0) + 1
    for b in sorted(bin_counts.keys()):
        print(f"    Bin {b}: {bin_counts[b]}")

    print(f"\n  ALL ASSERTIONS PASSED")
    return result


if __name__ == "__main__":
    jjw_file = os.path.join(DATA_DIR, "Microsoft_Excel_Worksheet.xlsx")
    xrw_file = os.path.join(DATA_DIR, "Microsoft_Excel_Worksheet1.xlsx")

    if os.path.exists(jjw_file):
        verify_file(JJWParser(), jjw_file, "JJW Format")
    else:
        print(f"JJW file not found: {jjw_file}")

    if os.path.exists(xrw_file):
        verify_file(XRWParser(), xrw_file, "XRW Format")
    else:
        print(f"XRW file not found: {xrw_file}")

    print(f"\n{'='*70}")
    print(f"  VERIFICATION COMPLETE")
    print(f"{'='*70}")
