from fastapi import APIRouter, Depends, HTTPException
from jose import jwt
from passlib.hash import bcrypt
from sqlalchemy.orm import Session

from app.config import settings
from app.dependencies import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, LoginResponse, UserResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.employee_id == req.employee_id).first()
    if not user or not bcrypt.verify(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

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
        ),
    )
