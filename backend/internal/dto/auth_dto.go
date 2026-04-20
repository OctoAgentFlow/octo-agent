package dto

type RegisterRequest struct {
	Email            string `json:"email" binding:"required,email"`
	Password         string `json:"password" binding:"required,min=6"`
	Name             string `json:"name"`
	VerificationCode string `json:"verification_code" binding:"required,len=6,numeric"`
}

type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

type SendEmailCodeRequest struct {
	Email   string `json:"email" binding:"required,email"`
	Purpose string `json:"purpose"`
}

type SendEmailCodeResponse struct {
	Email     string `json:"email"`
	Purpose   string `json:"purpose"`
	ExpiresIn int64  `json:"expires_in"`
	Code      string `json:"code,omitempty"`
}

type VerifyEmailCodeRequest struct {
	Email   string `json:"email" binding:"required,email"`
	Purpose string `json:"purpose"`
	Code    string `json:"code" binding:"required,len=6,numeric"`
}

type VerifyEmailCodeResponse struct {
	Email    string `json:"email"`
	Purpose  string `json:"purpose"`
	Verified bool   `json:"verified"`
}

type AuthUserData struct {
	ID    uint   `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
}

type TokenData struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int64  `json:"expires_in"`
}

type AuthResponse struct {
	User   AuthUserData `json:"user"`
	Tokens TokenData    `json:"tokens"`
}

type MeResponse struct {
	ID            uint   `json:"id"`
	Email         string `json:"email"`
	Name          string `json:"name"`
	Status        string `json:"status"`
	WalletAddress string `json:"wallet_address,omitempty"`
}
