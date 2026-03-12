"""
End-to-end DB verification:
1. Parse real Excel file
2. Persist to MySQL via the same logic as upload/confirm
3. Run review engine against DB data
4. Verify results match direct calculation
"""
import sys
import os
import time
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(__file__))

import numpy as np
from sqlalchemy import text
from app.config import settings
from app.database import SessionLocal, Base, engine
from app.models.vendor import Vendor, VendorFormat
from app.models.product import Product
from app.models.lot import Lot
from app.models.wafer import Wafer
from app.models.die_data import DieData, ElectricalValue
from app.models.spec import CpSpec
from app.models.review import ReviewResult
from app.services.parser.jjw_parser import JJWParser
from app.services.parser.xrw_parser import XRWParser
from app.services.review_engine import execute_review, calculate_wafer_param_review

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "IQC", "extracted")


def persist_parsed_data(db, result):
    """Same logic as upload/confirm router."""
    vendor = db.query(Vendor).filter(Vendor.code == result.vendor_code).first()
    if not vendor:
        raise Exception(f"Vendor {result.vendor_code} not found")

    product = db.query(Product).filter(Product.product_code == result.product_id).first()
    if not product:
        product = Product(product_code=result.product_id, vendor_id=vendor.id)
        db.add(product)
        db.flush()

    # Check if lot already exists
    existing_lot = db.query(Lot).filter(Lot.lot_id == result.lot_id).first()
    if existing_lot:
        print(f"  Lot {result.lot_id} already exists (id={existing_lot.id}), cleaning up...")
        # Delete in order: electrical_values -> die_data -> wafers -> cp_specs -> review_results -> lot
        wafer_ids = [w.id for w in db.query(Wafer).filter(Wafer.lot_id == existing_lot.id).all()]
        if wafer_ids:
            die_ids = [d.id for d in db.query(DieData).filter(DieData.wafer_id.in_(wafer_ids)).all()]
            if die_ids:
                # Delete in batches to avoid too-large IN clause
                batch_size = 500
                for i in range(0, len(die_ids), batch_size):
                    batch = die_ids[i:i+batch_size]
                    db.query(ElectricalValue).filter(ElectricalValue.die_id.in_(batch)).delete(synchronize_session=False)
                db.query(DieData).filter(DieData.wafer_id.in_(wafer_ids)).delete(synchronize_session=False)
            db.query(ReviewResult).filter(ReviewResult.wafer_id.in_(wafer_ids)).delete(synchronize_session=False)
            db.query(Wafer).filter(Wafer.lot_id == existing_lot.id).delete(synchronize_session=False)
        db.query(CpSpec).filter(CpSpec.lot_id == existing_lot.id).delete(synchronize_session=False)
        db.query(Lot).filter(Lot.id == existing_lot.id).delete(synchronize_session=False)
        db.flush()

    lot = Lot(
        lot_id=result.lot_id,
        mark_lot_id=result.mark_lot_id,
        product_id=product.id,
        test_program=result.test_program,
        file_name="test_verify.xlsx",
        status="pending",
    )
    db.add(lot)
    db.flush()

    for spec in result.cp_specs:
        db.add(CpSpec(
            lot_id=lot.id,
            param_name=spec.param_name,
            lower_limit=spec.lower_limit,
            upper_limit=spec.upper_limit,
            unit=spec.unit,
        ))

    for pw in result.wafers:
        wafer = Wafer(
            lot_id=lot.id,
            wafer_id=pw.wafer_id,
            gross_die=pw.gross_die,
            bin1_count=pw.bin1_count,
            bin1_yield=pw.bin1_count / pw.gross_die if pw.gross_die > 0 else 0,
            cp_step=pw.cp_step,
        )
        db.add(wafer)
        db.flush()

        # Bulk insert dies using raw SQL
        die_rows = [
            {"wafer_id": wafer.id, "site_no": d.site_no, "bin": d.bin,
             "x_coord": d.x_coord, "y_coord": d.y_coord}
            for d in pw.dies
        ]
        if die_rows:
            db.execute(DieData.__table__.insert(), die_rows)
            db.flush()

        die_ids = [
            r[0] for r in db.execute(
                text("SELECT id FROM die_data WHERE wafer_id = :wid ORDER BY id"),
                {"wid": wafer.id}
            ).fetchall()
        ]

        ev_rows = []
        for die_id, die in zip(die_ids, pw.dies):
            for pname, val in die.electrical.items():
                if val is not None:
                    ev_rows.append({"die_id": die_id, "param_name": pname, "value": val})
        if ev_rows:
            db.execute(ElectricalValue.__table__.insert(), ev_rows)

    db.commit()
    return lot


def verify_e2e(parser, filepath, label):
    print(f"\n{'='*70}")
    print(f"  E2E: {label}")
    print(f"{'='*70}")

    # Step 1: Parse
    t0 = time.time()
    result = parser.parse(filepath)
    t_parse = time.time() - t0
    print(f"\n[1] Parse: {len(result.wafers)} wafers, {result.total_rows} rows in {t_parse:.2f}s")

    # Step 2: Persist to DB
    db = SessionLocal()
    try:
        t0 = time.time()
        lot = persist_parsed_data(db, result)
        t_persist = time.time() - t0
        print(f"[2] Persist: lot_id={lot.id}, lot_code={lot.lot_id} in {t_persist:.2f}s")

        # Verify row counts
        wafer_count = db.query(Wafer).filter(Wafer.lot_id == lot.id).count()
        assert wafer_count == len(result.wafers), f"Wafer count mismatch: {wafer_count} != {len(result.wafers)}"
        print(f"    Wafers in DB: {wafer_count} ✓")

        first_wafer = db.query(Wafer).filter(Wafer.lot_id == lot.id).first()
        die_count = db.query(DieData).filter(DieData.wafer_id == first_wafer.id).count()
        expected_die = result.wafers[0].gross_die
        assert die_count == expected_die, f"Die count mismatch: {die_count} != {expected_die}"
        print(f"    Dies in first wafer: {die_count} ✓")

        ev_count = db.query(ElectricalValue).join(DieData).filter(DieData.wafer_id == first_wafer.id).count()
        print(f"    Electrical values in first wafer: {ev_count}")

        # Step 3: Run review
        t0 = time.time()
        review_results = execute_review(db, lot.id)
        t_review = time.time() - t0
        print(f"[3] Review: {len(review_results)} results in {t_review:.2f}s")

        # Step 4: Cross-check review results with direct calculation
        print(f"\n[4] Cross-checking review results...")
        first_wafer_results = [r for r in review_results if r.wafer_id == result.wafers[0].wafer_id]
        bin1_dies = [d for d in result.wafers[0].dies if d.bin == 1]
        total_die = result.wafers[0].gross_die

        errors = 0
        checked = 0
        for rr in first_wafer_results[:5]:
            values = [d.electrical[rr.param_name] for d in bin1_dies if d.electrical.get(rr.param_name) is not None]
            if not values:
                continue

            arr = np.array(values)
            expected_avg = float(np.mean(arr))
            expected_std = float(np.std(arr, ddof=1)) if len(arr) > 1 else 0.0
            expected_max = float(np.max(arr))
            expected_min = float(np.min(arr))

            ok = True
            if abs(rr.average - expected_avg) > 1e-6:
                print(f"  FAIL {rr.param_name} avg: DB={rr.average}, expected={expected_avg}")
                ok = False
                errors += 1
            if abs(rr.stdev - expected_std) > 1e-6:
                print(f"  FAIL {rr.param_name} std: DB={rr.stdev}, expected={expected_std}")
                ok = False
                errors += 1
            if abs(rr.max_val - expected_max) > 1e-6:
                print(f"  FAIL {rr.param_name} max: DB={rr.max_val}, expected={expected_max}")
                ok = False
                errors += 1
            if abs(rr.min_val - expected_min) > 1e-6:
                print(f"  FAIL {rr.param_name} min: DB={rr.min_val}, expected={expected_min}")
                ok = False
                errors += 1
            if ok:
                print(f"    {rr.param_name}: avg={rr.average:.6f}, std={rr.stdev:.6f} ✓")
            checked += 1

        # Verify lot status changed
        db.refresh(lot)
        assert lot.status == "reviewed", f"Lot status should be 'reviewed', got '{lot.status}'"
        print(f"\n    Lot status: {lot.status} ✓")

        # Verify DB review results are saved
        db_results = db.query(ReviewResult).filter(
            ReviewResult.wafer_id == first_wafer.id
        ).count()
        print(f"    ReviewResults in DB for first wafer: {db_results}")

        if errors == 0:
            print(f"\n  ALL {checked} CHECKS PASSED ✓")
        else:
            print(f"\n  {errors} ERRORS in {checked} checks")

        print(f"\n  Timing: parse={t_parse:.2f}s, persist={t_persist:.2f}s, review={t_review:.2f}s")

    finally:
        db.close()


if __name__ == "__main__":
    # Ensure tables exist
    Base.metadata.create_all(bind=engine)

    # Seed vendors if needed
    db = SessionLocal()
    try:
        from app.seed.seed_vendors import seed_vendors
        seed_vendors(db)
    finally:
        db.close()

    jjw_file = os.path.join(DATA_DIR, "Microsoft_Excel_Worksheet.xlsx")
    xrw_file = os.path.join(DATA_DIR, "Microsoft_Excel_Worksheet1.xlsx")

    if os.path.exists(jjw_file):
        verify_e2e(JJWParser(), jjw_file, "JJW Format (捷捷微)")

    if os.path.exists(xrw_file):
        verify_e2e(XRWParser(), xrw_file, "XRW Format (祥瑞微)")

    print(f"\n{'='*70}")
    print(f"  E2E VERIFICATION COMPLETE")
    print(f"{'='*70}")
