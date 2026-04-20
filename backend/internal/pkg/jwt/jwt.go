package jwt

import (
	"errors"
	"os"
	"strconv"
	"time"

	jwtv5 "github.com/golang-jwt/jwt/v5"
)

const (
	defaultExpireSeconds = 7200
)

type Claims struct {
	UserID uint `json:"user_id"`
	jwtv5.RegisteredClaims
}

func secret() []byte {
	s := os.Getenv("JWT_SECRET")
	if s == "" {
		s = "octo-agent-local-secret"
	}
	return []byte(s)
}

func accessExpireSeconds() int64 {
	v := os.Getenv("JWT_ACCESS_EXPIRE_SECONDS")
	if v == "" {
		return defaultExpireSeconds
	}
	sec, err := strconv.ParseInt(v, 10, 64)
	if err != nil || sec <= 0 {
		return defaultExpireSeconds
	}
	return sec
}

func SignAccessToken(userID uint) (string, int64, error) {
	expSec := accessExpireSeconds()
	now := time.Now()
	claims := Claims{
		UserID: userID,
		RegisteredClaims: jwtv5.RegisteredClaims{
			ExpiresAt: jwtv5.NewNumericDate(now.Add(time.Duration(expSec) * time.Second)),
			IssuedAt:  jwtv5.NewNumericDate(now),
		},
	}

	token := jwtv5.NewWithClaims(jwtv5.SigningMethodHS256, claims)
	signed, err := token.SignedString(secret())
	if err != nil {
		return "", 0, err
	}
	return signed, expSec, nil
}

func ParseAccessToken(tokenStr string) (*Claims, error) {
	token, err := jwtv5.ParseWithClaims(tokenStr, &Claims{}, func(token *jwtv5.Token) (interface{}, error) {
		return secret(), nil
	})
	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}

// Simplified refresh strategy for MVP: refresh token == access token.
func SignRefreshToken(userID uint) (string, error) {
	token, _, err := SignAccessToken(userID)
	return token, err
}

func ParseRefreshToken(tokenStr string) (*Claims, error) {
	return ParseAccessToken(tokenStr)
}
