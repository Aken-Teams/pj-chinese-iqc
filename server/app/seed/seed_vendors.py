from sqlalchemy.orm import Session

from app.models.vendor import Vendor, VendorFormat


VENDORS = [
    {"name": "捷捷微", "code": "JJW"},
    {"name": "祥瑞微", "code": "XRW"},
    {"name": "华晶微", "code": "HJM"},
]

VENDOR_FORMATS = [
    {
        "vendor_code": "JJW",
        "format_name": "JJW Standard",
        "header_row": 8,
        "data_start_row": 9,
        "lower_limit_row": 2,
        "upper_limit_row": 3,
        "electrical_start_col": 15,
        "wafer_id_col": 4,
        "bin_col": 12,
        "x_coord_col": 13,
        "y_coord_col": 14,
        "product_id_col": 1,
        "lot_id_col": 2,
        "fixed_die_count": None,
    },
    {
        "vendor_code": "XRW",
        "format_name": "XRW Standard",
        "header_row": 5,
        "data_start_row": 6,
        "lower_limit_row": 2,
        "upper_limit_row": 3,
        "electrical_start_col": 12,
        "wafer_id_col": 4,
        "bin_col": 9,
        "x_coord_col": 10,
        "y_coord_col": 11,
        "product_id_col": 1,
        "lot_id_col": 2,
        "fixed_die_count": 208,
    },
]


def seed_vendors(db: Session) -> None:
    for v in VENDORS:
        existing = db.query(Vendor).filter(Vendor.code == v["code"]).first()
        if not existing:
            db.add(Vendor(**v))
    db.flush()

    for fmt in VENDOR_FORMATS:
        vendor_code = fmt["vendor_code"]
        fmt_data = {k: v for k, v in fmt.items() if k != "vendor_code"}
        vendor = db.query(Vendor).filter(Vendor.code == vendor_code).first()
        if vendor:
            existing = (
                db.query(VendorFormat)
                .filter(
                    VendorFormat.vendor_id == vendor.id,
                    VendorFormat.format_name == fmt_data["format_name"],
                )
                .first()
            )
            if not existing:
                db.add(VendorFormat(vendor_id=vendor.id, **fmt_data))

    db.commit()
