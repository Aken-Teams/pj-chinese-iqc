from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint, JSON, func
from sqlalchemy.orm import relationship

from app.database import Base


class Vendor(Base):
    __tablename__ = "vendors"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    code = Column(String(20), unique=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    formats = relationship("VendorFormat", back_populates="vendor")
    products = relationship("Product", back_populates="vendor")
    site_links = relationship("VendorDomain", cascade="all, delete-orphan", back_populates="vendor")


class VendorDomain(Base):
    """Which AD sites (廠區) a vendor is visible to. A vendor is a shared
    supplier (unique code) that can serve multiple sites — e.g. JJW serves both
    徐州 and 無錫 — so this is a many-to-many. A vendor with NO rows is
    unassigned and visible to everyone (backward-compatible default)."""
    __tablename__ = "vendor_domains"

    id = Column(Integer, primary_key=True, autoincrement=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False)
    domain = Column(String(20), nullable=False, index=True)

    vendor = relationship("Vendor", back_populates="site_links")

    __table_args__ = (
        UniqueConstraint("vendor_id", "domain", name="uq_vendor_domain"),
    )


class VendorFormat(Base):
    __tablename__ = "vendor_formats"

    id = Column(Integer, primary_key=True, autoincrement=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False)
    format_name = Column(String(100))
    header_row = Column(Integer, nullable=False)
    data_start_row = Column(Integer, nullable=False)
    lower_limit_row = Column(Integer, nullable=False)
    upper_limit_row = Column(Integer, nullable=False)
    electrical_start_col = Column(Integer, nullable=False)
    # Nullable since the 2026-08 site survey: of six real vendor formats only two
    # carry a per-row wafer id column. See `wafer_id_source` below.
    wafer_id_col = Column(Integer, nullable=True)
    bin_col = Column(Integer, nullable=False)
    x_coord_col = Column(Integer)
    y_coord_col = Column(Integer)
    product_id_col = Column(Integer)
    lot_id_col = Column(Integer)
    fixed_die_count = Column(Integer, nullable=True)
    # Read product/lot from a fixed metadata cell instead of data rows.
    # Format: "row,col" (1-indexed), e.g. "2,2" = row 2 col B.
    product_id_cell = Column(String(20), nullable=True)
    lot_id_cell = Column(String(20), nullable=True)

    # --- Where the wafer id comes from -------------------------------------
    # Real CP files disagree wildly, so the source is explicit rather than
    # inferred (silently guessing a column is what produced wafer ids like
    # "1.4728" — an electrical value read as an id):
    #   column   -> one wafer id per data row      (东部高科, 祥微)
    #   cell     -> fixed metadata cell            (天狼芯 r7)
    #   label    -> find a label, take the neighbour cell; survives the row
    #               drifting between files         (禾纳 "wafer number")
    #   filename -> extract from the file name via regex (世界先进, 新洁能 —
    #               files whose contents carry no wafer id at all)
    #   single   -> whole file is one wafer, id supplied by the user
    wafer_id_source = Column(String(20), nullable=False, server_default="column")
    wafer_id_cell = Column(String(20), nullable=True)      # "row,col"
    wafer_id_label = Column(String(100), nullable=True)    # label text to anchor on
    wafer_id_pattern = Column(String(200), nullable=True)  # regex, group 1 = id

    # Label-anchored variants of the product/lot metadata cells, for files where
    # the metadata block shifts (variable-length Bias sections, etc).
    product_id_label = Column(String(100), nullable=True)
    lot_id_label = Column(String(100), nullable=True)

    # Some formats split the header across two rows: one naming the electrical
    # parameters, another naming the id columns (东部高科: r10 ITEM NAME +
    # r14 WAFER ID/BIN/XCORD/YCORD). `header_row` stays the parameter-name row;
    # this is the optional second one. Null when the format uses a single row.
    id_header_row = Column(Integer, nullable=True)
    unit_row = Column(Integer, nullable=True)

    # Worksheet to read: name, or "#n" for a 1-indexed position. Null keeps the
    # legacy behaviour (a sheet called "data", else the first one).
    sheet_selector = Column(String(100), nullable=True)

    # Explicit list of electrical columns. Null = the legacy contiguous scan
    # from `electrical_start_col`. Needed where limit-less columns sit in the
    # middle of the block (东部高科's two PSCAN columns).
    param_cols = Column(JSON, nullable=True)

    # Delimiter for text dumps: "tab", "comma", or null to sniff.
    text_delimiter = Column(String(10), nullable=True)
    # AD site (廠區) this template belongs to. The SAME supplier can ship a
    # different CP file format to different sites, so templates are per-site;
    # upload detection only tries the uploader's own templates (no cross-site
    # pollution). Null = unassigned (usable by everyone).
    domain = Column(String(20), index=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    vendor = relationship("Vendor", back_populates="formats")
