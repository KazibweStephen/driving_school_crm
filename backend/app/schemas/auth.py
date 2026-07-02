from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    phone: str = Field(..., pattern=r"^\d{7,15}$")
    pin: str = Field(..., min_length=4, max_length=4)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class PinResetRequest(BaseModel):
    phone: str = Field(..., pattern=r"^\d{7,15}$")


class PinResetVerifyRequest(BaseModel):
    phone: str = Field(..., pattern=r"^\d{7,15}$")
    otp: str = Field(..., min_length=6, max_length=6)
    new_pin: str = Field(..., min_length=4, max_length=4)
