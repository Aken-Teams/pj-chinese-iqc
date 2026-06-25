import secrets

from fastapi import APIRouter, Depends, HTTPException
from jose import jwt
from passlib.hash import bcrypt
from sqlalchemy.orm import Session

from app.config import settings
from app.dependencies import get_db
from app.models.user import User
from app.schemas.auth import (
    AdLoginRequest,
    DomainOption,
    LoginRequest,
    LoginResponse,
    UserResponse,
)
from app.services import ad_auth

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _issue_token(user: User) -> LoginResponse:
    token = jwt.encode(
        {"sub": str(user.id), "name": user.name, "role": user.role},
        settings.SECRET_KEY,
        algorithm="HS256",
    )
    return LoginResponse(
        token=token,
        user=UserResponse(
            id=str(user.id),
            name=user.name,
            role=user.role,
            department=user.department or "",
            email=user.email or "",
            employeeId=user.employee_id,
            domain=user.domain,
        ),
    )


@router.get("/domains", response_model=list[DomainOption])
def list_domains():
    return [DomainOption(**d) for d in ad_auth.AD_DOMAINS]


@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.employee_id == req.employee_id).first()
    if not user or not bcrypt.verify(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return _issue_token(user)


@router.post("/ad-login", response_model=LoginResponse)
def ad_login(req: AdLoginRequest, db: Session = Depends(get_db)):
    if not ad_auth.is_configured():
        raise HTTPException(status_code=503, detail="AD login is not configured")

    try:
        domain = ad_auth.normalize_domain(req.domain)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid company/domain")

    try:
        ok = ad_auth.authenticate(req.employee_id, req.password, domain)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid company/domain")
    except ad_auth.ADError:
        raise HTTPException(status_code=502, detail="AD service unavailable")

    if not ok:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    profile = ad_auth.fetch_user(req.employee_id, domain)

    # Upsert local user so the JWT `sub` maps to a real row used across the app.
    user = db.query(User).filter(User.employee_id == req.employee_id).first()
    if user is None:
        user = User(
            employee_id=req.employee_id,
            # AD accounts authenticate remotely; store an unusable local hash so
            # the local /login path can never succeed for them.
            password_hash=bcrypt.hash(secrets.token_urlsafe(32)),
            role="user",
        )
        db.add(user)

    user.name = profile.display_name or req.employee_id
    user.department = profile.department or user.department
    user.email = profile.email or user.email
    user.domain = domain
    db.commit()
    db.refresh(user)

    return _issue_token(user)
