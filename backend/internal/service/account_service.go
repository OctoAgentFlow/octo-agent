package service

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"octo-agent/backend/internal/config"
	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/pkg/requestid"
	"octo-agent/backend/internal/repository"

	"go.uber.org/zap"
)

type AccountService struct {
	repo       *repository.TwitterAccountRepository
	oauth      config.XOAuthConfig
	httpClient *http.Client
}

const xOAuthRequestedScopes = "tweet.read tweet.write users.read offline.access dm.read dm.write"

func NewAccountService(repo *repository.TwitterAccountRepository, oauth config.XOAuthConfig) *AccountService {
	return &AccountService{
		repo:       repo,
		oauth:      oauth,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

func (s *AccountService) List(userID uint) (*dto.AccountListResponse, error) {
	accounts, err := s.repo.ListByUserID(userID)
	if err != nil {
		return nil, err
	}
	items := make([]dto.AccountItem, 0, len(accounts))
	for _, acc := range accounts {
		item := dto.AccountItem{
			ID:          acc.ID,
			AvatarURL:   acc.AvatarURL,
			Username:    acc.Username,
			DisplayName: acc.DisplayName,
			Status:      acc.Status,
			Followers:   acc.Followers,
		}
		if acc.LastSyncedAt != nil {
			item.LastSyncedAt = acc.LastSyncedAt.UTC().Format(time.RFC3339)
		}
		items = append(items, item)
	}
	return &dto.AccountListResponse{Items: items}, nil
}

func (s *AccountService) StartXOAuth(ctx context.Context, userID uint) (*dto.OAuthStartResponse, error) {
	clientID := strings.TrimSpace(s.oauth.ClientID)
	redirectURI := strings.TrimSpace(s.oauth.RedirectURI)
	if clientID == "" || redirectURI == "" {
		zap.L().Warn("x oauth: start rejected, yaml incomplete",
			xOAuthZapCtx(ctx,
				zap.Uint("user_id", userID),
				zap.Bool("has_client_id", clientID != ""),
				zap.Bool("has_redirect_uri", redirectURI != ""),
			)...)
		return nil, errors.New("x oauth not configured: set x_oauth.client_id and x_oauth.redirect_uri in configs/config.<env>.yaml")
	}

	codeVerifier, err := randomHexString(32)
	if err != nil {
		zap.L().Warn("x oauth: pkce verifier generation failed", xOAuthZapCtx(ctx, zap.Uint("user_id", userID), zap.Error(err))...)
		return nil, err
	}
	codeChallenge := base64.RawURLEncoding.EncodeToString(sha256Bytes(codeVerifier))
	state, err := s.buildOAuthState(userID, codeVerifier)
	if err != nil {
		zap.L().Warn("x oauth: build state failed", xOAuthZapCtx(ctx, zap.Uint("user_id", userID), zap.Error(err))...)
		return nil, err
	}

	q := url.Values{}
	q.Set("response_type", "code")
	q.Set("client_id", clientID)
	q.Set("redirect_uri", redirectURI)
	q.Set("scope", xOAuthRequestedScopes)
	q.Set("state", state)
	q.Set("code_challenge", codeChallenge)
	q.Set("code_challenge_method", "S256")
	authURL := "https://twitter.com/i/oauth2/authorize?" + q.Encode()
	zap.L().Info("x oauth: authorize url ready",
		xOAuthZapCtx(ctx,
			zap.Uint("user_id", userID),
			zap.String("redirect_uri", redirectURI),
			zap.String("client_id_prefix", maskPrefix(clientID, 8)),
			zap.Int("auth_url_len", len(authURL)),
			zap.Bool("has_client_secret", strings.TrimSpace(s.oauth.ClientSecret) != ""),
		)...)
	return &dto.OAuthStartResponse{AuthURL: authURL, State: state}, nil
}

func (s *AccountService) HandleXOAuthCallback(ctx context.Context, code string, state string) (uint, error) {
	userID, codeVerifier, err := s.parseOAuthState(state)
	if err != nil {
		zap.L().Warn("x oauth: state invalid or expired", xOAuthZapCtx(ctx, zap.Error(err))...)
		return 0, err
	}
	zap.L().Info("x oauth: state verified", xOAuthZapCtx(ctx, zap.Uint("user_id", userID))...)

	tokens, err := s.exchangeXToken(ctx, code, codeVerifier)
	if err != nil {
		zap.L().Warn("x oauth: token exchange failed", xOAuthZapCtx(ctx, zap.Uint("user_id", userID), zap.Error(err))...)
		return 0, err
	}
	zap.L().Info("x oauth: access token received",
		xOAuthZapCtx(ctx,
			zap.Uint("user_id", userID),
			zap.Bool("has_refresh_token", strings.TrimSpace(tokens.RefreshToken) != ""),
		)...)

	profile, err := s.fetchXProfile(ctx, tokens.AccessToken)
	if err != nil {
		zap.L().Warn("x oauth: users/me failed", xOAuthZapCtx(ctx, zap.Uint("user_id", userID), zap.Error(err))...)
		return 0, err
	}

	account := &model.TwitterAccount{
		TwitterUserID: profile.Data.ID,
		Username:      strings.TrimSpace(profile.Data.Username),
		DisplayName:   strings.TrimSpace(profile.Data.Name),
		AvatarURL:     strings.TrimSpace(profile.Data.ProfileImageURL),
		Followers:     "",
		AccessToken:   tokens.AccessToken,
		RefreshToken:  tokens.RefreshToken,
		OAuthScopes:   normalizedOAuthScopes(tokens.Scope),
	}
	if account.Username == "" {
		zap.L().Warn("x oauth: profile missing username",
			xOAuthZapCtx(ctx,
				zap.Uint("user_id", userID),
				zap.String("x_user_id", profile.Data.ID),
			)...)
		return 0, errors.New("x oauth user info missing username")
	}
	if _, err := s.repo.UpsertByUser(userID, account); err != nil {
		zap.L().Error("x oauth: upsert twitter account failed",
			xOAuthZapCtx(ctx,
				zap.Uint("user_id", userID),
				zap.String("x_user_id", account.TwitterUserID),
				zap.String("username", account.Username),
				zap.Error(err),
			)...)
		return 0, err
	}
	zap.L().Info("x oauth: account bound",
		xOAuthZapCtx(ctx,
			zap.Uint("user_id", userID),
			zap.String("x_user_id", account.TwitterUserID),
			zap.String("username", account.Username),
		)...)
	return userID, nil
}

func (s *AccountService) Delete(userID, accountID uint) error {
	return s.repo.DeleteByUserAndID(userID, accountID)
}

type xTokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	Scope        string `json:"scope"`
}

func (s *AccountService) exchangeXToken(ctx context.Context, code string, codeVerifier string) (*xTokenResponse, error) {
	clientID := strings.TrimSpace(s.oauth.ClientID)
	clientSecret := strings.TrimSpace(s.oauth.ClientSecret)
	redirectURI := strings.TrimSpace(s.oauth.RedirectURI)
	if clientID == "" || clientSecret == "" || redirectURI == "" {
		zap.L().Warn("x oauth: token exchange skipped, yaml incomplete",
			xOAuthZapCtx(ctx,
				zap.Bool("has_client_id", clientID != ""),
				zap.Bool("has_client_secret", clientSecret != ""),
				zap.Bool("has_redirect_uri", redirectURI != ""),
			)...)
		return nil, errors.New("x oauth not configured: set x_oauth.client_id, x_oauth.client_secret, and x_oauth.redirect_uri in configs/config.<env>.yaml")
	}

	zap.L().Info("x oauth: token request",
		xOAuthZapCtx(ctx,
			zap.String("endpoint", "https://api.x.com/2/oauth2/token"),
			zap.String("redirect_uri", redirectURI),
			zap.String("client_id_prefix", maskPrefix(clientID, 8)),
			zap.Int("code_len", len(code)),
			zap.Int("code_verifier_len", len(codeVerifier)),
		)...)

	form := url.Values{}
	form.Set("code", code)
	form.Set("grant_type", "authorization_code")
	form.Set("redirect_uri", redirectURI)
	form.Set("code_verifier", codeVerifier)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.x.com/2/oauth2/token", strings.NewReader(form.Encode()))
	if err != nil {
		zap.L().Warn("x oauth: token request build failed", xOAuthZapCtx(ctx, zap.Error(err))...)
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.SetBasicAuth(clientID, clientSecret)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		zap.L().Warn("x oauth: token http transport error", xOAuthZapCtx(ctx, zap.Error(err))...)
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		zap.L().Warn("x oauth: token endpoint error response",
			xOAuthZapCtx(ctx,
				zap.Int("http_status", resp.StatusCode),
				zap.String("body_preview", truncateForLog(string(body), 400)),
			)...)
		return nil, fmt.Errorf("x oauth token exchange failed: %s", strings.TrimSpace(string(body)))
	}
	var tokenResp xTokenResponse
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		zap.L().Warn("x oauth: token json decode failed",
			xOAuthZapCtx(ctx,
				zap.Int("body_len", len(body)),
				zap.Error(err),
			)...)
		return nil, err
	}
	if strings.TrimSpace(tokenResp.AccessToken) == "" {
		zap.L().Warn("x oauth: token response missing access_token",
			xOAuthZapCtx(ctx, zap.Int("body_len", len(body)))...)
		return nil, errors.New("x oauth token exchange returned empty access_token")
	}
	return &tokenResp, nil
}

type xUserResponse struct {
	Data struct {
		ID              string `json:"id"`
		Name            string `json:"name"`
		Username        string `json:"username"`
		ProfileImageURL string `json:"profile_image_url"`
	} `json:"data"`
}

func (s *AccountService) fetchXProfile(ctx context.Context, accessToken string) (*xUserResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.x.com/2/users/me?user.fields=profile_image_url", nil)
	if err != nil {
		zap.L().Warn("x oauth: users/me request build failed", xOAuthZapCtx(ctx, zap.Error(err))...)
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		zap.L().Warn("x oauth: users/me http transport error", xOAuthZapCtx(ctx, zap.Error(err))...)
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		zap.L().Warn("x oauth: users/me error response",
			xOAuthZapCtx(ctx,
				zap.Int("http_status", resp.StatusCode),
				zap.String("body_preview", truncateForLog(string(body), 400)),
			)...)
		return nil, fmt.Errorf("x oauth fetch user failed: %s", strings.TrimSpace(string(body)))
	}
	var result xUserResponse
	if err := json.Unmarshal(body, &result); err != nil {
		zap.L().Warn("x oauth: users/me json decode failed",
			xOAuthZapCtx(ctx,
				zap.Int("body_len", len(body)),
				zap.Error(err),
			)...)
		return nil, err
	}
	return &result, nil
}

type oauthStatePayload struct {
	UserID       uint   `json:"u"`
	CodeVerifier string `json:"v"`
	Nonce        string `json:"n"`
	ExpiredAt    int64  `json:"e"`
}

func (s *AccountService) buildOAuthState(userID uint, codeVerifier string) (string, error) {
	nonce, err := randomHexString(8)
	if err != nil {
		return "", err
	}
	payload := oauthStatePayload{
		UserID:       userID,
		CodeVerifier: codeVerifier,
		Nonce:        nonce,
		ExpiredAt:    time.Now().Add(10 * time.Minute).Unix(),
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	encoded := base64.RawURLEncoding.EncodeToString(raw)
	mac := s.signOAuthState(encoded)
	return encoded + "." + mac, nil
}

func (s *AccountService) parseOAuthState(state string) (uint, string, error) {
	parts := strings.Split(state, ".")
	if len(parts) != 2 {
		return 0, "", errors.New("invalid oauth state")
	}
	encoded := parts[0]
	expected := s.signOAuthState(encoded)
	if !hmac.Equal([]byte(expected), []byte(parts[1])) {
		return 0, "", errors.New("invalid oauth state signature")
	}
	raw, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return 0, "", errors.New("invalid oauth state payload")
	}
	var payload oauthStatePayload
	if err := json.Unmarshal(raw, &payload); err != nil {
		return 0, "", errors.New("invalid oauth state payload")
	}
	if payload.UserID == 0 || payload.CodeVerifier == "" || payload.ExpiredAt < time.Now().Unix() {
		return 0, "", errors.New("oauth state expired")
	}
	return payload.UserID, payload.CodeVerifier, nil
}

func (s *AccountService) signOAuthState(data string) string {
	secret := strings.TrimSpace(s.oauth.StateSecret)
	if secret == "" {
		secret = "octo-agent-dev-oauth-state-secret"
	}
	m := hmac.New(sha256.New, []byte(secret))
	m.Write([]byte(data))
	return hex.EncodeToString(m.Sum(nil))
}

func sha256Bytes(s string) []byte {
	sum := sha256.Sum256([]byte(s))
	return sum[:]
}

func randomHexString(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func xOAuthZapCtx(ctx context.Context, fields ...zap.Field) []zap.Field {
	out := make([]zap.Field, 0, len(fields)+1)
	if id := requestid.FromContext(ctx); id != "" {
		out = append(out, zap.String("request_id", id))
	}
	out = append(out, fields...)
	return out
}

func maskPrefix(s string, n int) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	if len(s) <= n {
		return s + "…"
	}
	return s[:n] + "…"
}

func truncateForLog(s string, max int) string {
	s = strings.TrimSpace(s)
	if len(s) <= max {
		return s
	}
	return s[:max] + "…(truncated)"
}

func normalizedOAuthScopes(scope string) string {
	fields := strings.Fields(strings.TrimSpace(scope))
	if len(fields) == 0 {
		return xOAuthRequestedScopes
	}
	return strings.Join(fields, " ")
}
