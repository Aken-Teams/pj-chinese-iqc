from pydantic import BaseModel


class UploadPreview(BaseModel):
    fileName: str
    wafersDetected: int
    diePerWafer: int | None
    dataRows: int
    format: str
    productId: str | None = None
    lotId: str | None = None
    paramNames: list[str] = []
    # Vendor auto-detected from the file content (independent of the user's
    # selection); lets the UI confirm/warn about the chosen vendor.
    detectedVendor: str | None = None
    detectedRows: int = 0


class UploadConfirmRequest(BaseModel):
    file_path: str
    vendor_code: str
