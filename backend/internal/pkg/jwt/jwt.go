package jwt

import (
	"errors"
	"os"
	"strconv"
	"time"

	jwtv5 "github.com/golang-jwt/jwt/v5"
)

const (
	defaultAccessExpireSeconds  = 7200
	defaultRefreshExpireSeconds = 2592000
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
	sec, err := strconv.ParseInt(v, 10, 64)
	if err != nil || sec <= 0 {
		return defaultAccessExpireSeconds
	}
	return sec
}

func refreshExpireSeconds() int64 {
	v := os.Getenv("JWT_REFRESH_EXPIRE_SECONDS")
	sec, err := strconv.ParseInt(v, 10, 64)
	if err != nil || sec <= 0 {
		return defaultRefreshExpireSeconds
	}
	return sec
}

func signToken(userID uint, expSec int64) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID: userID,
		RegisteredClaims: jwtv5.RegisteredClaims{
			ExpiresAt: jwtv5.NewNumericDate(now.Add(time.Duration(expSec) * time.Second)),
			IssuedAt:  jwtv5.NewNumericDate(now),
		},
	}

	token := jwtv5.NewWithClaims(jwtv5.SigningMethodHS256, claims)
	return token.SignedString(secret())
}

func SignAccessToken(userID uint) (string, int64, error) {
	expSec := accessExpireSeconds()
	signed, err := signToken(userID, expSec)
	return signed, expSec, err
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

func SignRefreshToken(userID uint) (string, error) {
	return signToken(userID, refreshExpireSeconds())
}

func ParseRefreshToken(tokenStr string) (*Claims, error) {
	return ParseAccessToken(tokenStr)
}
