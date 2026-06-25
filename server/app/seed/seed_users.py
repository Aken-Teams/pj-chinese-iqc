from passlib.hash import bcrypt
from sqlalchemy.orm import Session

from app.models.user import User


def seed_users(db: Session) -> None:
    existing = db.query(User).filter(User.employee_id == "admin").first()
    if not existing:
        db.add(
            User(
                employee_id="admin",
                name="System Admin",
                password_hash=bcrypt.hash("IqcAdmin@2026"),
                role="admin",
                department="IQC Department",
                email="admin@panjit.com",
            )
        )
        db.commit()
