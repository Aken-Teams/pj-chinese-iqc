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


class UploadConfirmRequest(BaseModel):
    file_path: str
    vendor_code: str
