from sqlalchemy import Column, Integer, String, DateTime, func

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(String(50), unique=True, nullable=False)
    name = Column(String(100), nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="user")
    department = Column(String(100))
    email = Column(String(100))
    domain = Column(String(20))  # AD/LDAP domain code for SSO users; null for local accounts
    created_at = Column(DateTime, server_default=func.now())
