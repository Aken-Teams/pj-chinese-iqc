from passlib.hash import bcrypt
from sqlalchemy.orm import Session

from app.models.user import User


def seed_users(db: Session) -> None:
    existing = db.query(User).filter(User.employee_id == "admin").first()
    if not existing:
        db.add(
            User(
                employee_id="admin",
                name="Zhang Wei",
                password_hash=bcrypt.hash("admin123"),
                role="admin",
                department="IQC Department",
                email="zhang.wei@panjit.com",
            )
        )
        db.commit()
