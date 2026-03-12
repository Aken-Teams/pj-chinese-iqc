from pydantic import BaseModel


class LoginRequest(BaseModel):
    employee_id: str
    password: str


class UserResponse(BaseModel):
    id: str
    name: str
    role: str
    department: str | None
    email: str | None
    employeeId: str


class LoginResponse(BaseModel):
    token: str
    user: UserResponse
