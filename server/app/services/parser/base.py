from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ParsedDie:
    site_no: Optional[int]
    bin: int
    x_coord: Optional[int]
    y_coord: Optional[int]
    electrical: dict[str, Optional[float]]  # param_name -> value


@dataclass
class ParsedWafer:
    wafer_id: str
    gross_die: int
    bin1_count: int
    cp_step: Optional[str] = None
    start_time: Optional[str] = None
    dies: list[ParsedDie] = field(default_factory=list)


@dataclass
class ParsedCpSpec:
    param_name: str
    lower_limit: Optional[float] = None
    upper_limit: Optional[float] = None
    unit: Optional[str] = None


@dataclass
class ParseResult:
    product_id: str
    lot_id: str
    mark_lot_id: Optional[str]
    test_program: Optional[str]
    vendor_code: str
    wafers: list[ParsedWafer]
    cp_specs: list[ParsedCpSpec]
    param_names: list[str]
    total_rows: int


class BaseParser(ABC):
    @abstractmethod
    def parse(self, filepath: str) -> ParseResult:
        ...

    @abstractmethod
    def preview(self, filepath: str) -> dict:
        ...
