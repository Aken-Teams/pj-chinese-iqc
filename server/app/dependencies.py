from typing import Generator, Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models.user import User

security = HTTPBearer()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    try:
        payload = jwt.decode(
            credentials.credentials, settings.SECRET_KEY, algorithms=["HS256"]
        )
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    """Allow only admin accounts. Used to gate the admin console endpoints."""
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return user


def can_see_all_domains(user: Optional[User]) -> bool:
    """Admins see every site; everyone else is scoped to their own AD domain."""
    return bool(user and user.role == "admin")


def scope_lots_by_domain(query, user: Optional[User]):
    """Restrict a query that selects/joins `Lot` to the rows the user may see.

    Admins (and, defensively, an unidentified caller) see all sites; a regular
    site user sees only lots tagged with their own domain. Legacy lots
    (domain IS NULL) are therefore invisible to site users and visible to admins.
    """
    from app.models.lot import Lot
    if can_see_all_domains(user) or user is None:
        return query
    return query.filter(Lot.domain == user.domain)


def scope_formats_by_domain(query, user: Optional[User]):
    """Restrict a query selecting `VendorFormat` to templates the user's site may
    use: its own domain plus unassigned (null) templates. Admins see all. Used
    both to list templates and to pick which templates upload detection tries,
    so one site's template never parses/detects another site's file."""
    from sqlalchemy import or_
    from app.models.vendor import VendorFormat
    if can_see_all_domains(user) or user is None:
        return query
    return query.filter(or_(VendorFormat.domain == user.domain, VendorFormat.domain.is_(None)))


def scope_products_by_domain(query, user: Optional[User]):
    """Restrict a query selecting/joining `Product` to the user's site. Admins
    (and an unidentified caller) see all sites; a site user sees only their
    domain's products (and thus their own specs/rules, which hang off products)."""
    from app.models.product import Product
    if can_see_all_domains(user) or user is None:
        return query
    return query.filter(Product.domain == user.domain)


def assert_lot_visible(lot, user: Optional[User]) -> None:
    """Raise 404 (not 403, to avoid leaking existence) when a site user asks for
    a lot outside their domain."""
    if can_see_all_domains(user) or user is None:
        return
    if lot.domain != user.domain:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lot not found")


def get_optional_user(request: Request, db: Session = Depends(get_db)) -> Optional[User]:
    """Best-effort current user from the Bearer token; returns None instead of
    raising when absent/invalid.

    Only for the upload *preview* step, which needs the caller's domain to pick
    which site templates to try but must still respond when the token is stale.
    Do NOT use this to gate data access: the domain-scoping helpers treat a None
    user as "sees everything", so an endpoint reading lots/wafers must depend on
    `get_current_user` instead."""
    auth = request.headers.get("Authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    token = auth[7:].strip()
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        user_id = payload.get("sub")
        if user_id is None:
            return None
        return db.query(User).filter(User.id == int(user_id)).first()
    except (JWTError, ValueError):
        return None
