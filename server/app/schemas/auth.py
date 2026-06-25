from pydantic import BaseModel


class LoginRequest(BaseModel):
    employee_id: str
    password: str


class AdLoginRequest(BaseModel):
    employee_id: str
    password: str
    domain: str | None = None


class DomainOption(BaseModel):
    code: str
    name: str


class UserResponse(BaseModel):
    id: str
    name: str
    role: str
    department: str | None
    email: str | None
    employeeId: str
    domain: str | None = None


class LoginResponse(BaseModel):
    token: str
    user: UserResponse
