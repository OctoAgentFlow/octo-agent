package service

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/repository"

	"github.com/ethereum/go-ethereum/accounts"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

type WalletService struct {
	walletRepo *repository.WalletRepository
}

func NewWalletService(walletRepo *repository.WalletRepository) *WalletService {
	return &WalletService{walletRepo: walletRepo}
}

func (s *WalletService) CreateChallenge(userID uint, req dto.WalletChallengeRequest) (*dto.WalletChallengeData, error) {
	address := strings.TrimSpace(strings.ToLower(req.Address))
	if address == "" {
		return nil, errors.New("address is required")
	}
	nonce, err := randomHex(16)
	if err != nil {
		return nil, err
	}
	challengeID, err := randomHex(16)
	if err != nil {
		return nil, err
	}
	expiredAt := time.Now().Add(5 * time.Minute)
	message := fmt.Sprintf("Octo-Agent wallet bind\nAddress: %s\nChainId: %d\nNonce: %s", address, req.ChainID, nonce)
	ch := &model.WalletChallenge{
		ChallengeID: challengeID,
		UserID:      userID,
		Address:     address,
		ChainID:     req.ChainID,
		Nonce:       nonce,
		Message:     message,
		ExpiredAt:   expiredAt,
	}
	if err := s.walletRepo.CreateChallenge(ch); err != nil {
		return nil, err
	}

	return &dto.WalletChallengeData{
		ChallengeID: challengeID,
		Message:     message,
		Nonce:       nonce,
		ExpiredAt:   expiredAt.Format(time.RFC3339),
	}, nil
}

func (s *WalletService) Bind(userID uint, req dto.WalletBindRequest) (*dto.WalletBindData, error) {
	if !strings.HasPrefix(req.Signature, "0x") {
		return nil, errors.New("invalid signature format")
	}
	ch, err := s.walletRepo.GetValidChallenge(req.ChallengeID)
	if err != nil {
		return nil, errors.New("challenge is invalid or expired")
	}
	if ch.UserID != userID {
		return nil, errors.New("challenge does not belong to current user")
	}
	address := strings.ToLower(strings.TrimSpace(req.Address))
	if !strings.EqualFold(ch.Address, address) || ch.ChainID != req.ChainID {
		return nil, errors.New("challenge mismatch")
	}
	if !verifyWalletSignature(ch.Message, address, req.Signature) {
		return nil, errors.New("invalid wallet signature")
	}

	if err := s.walletRepo.MarkChallengeUsed(ch.ID); err != nil {
		return nil, err
	}

	wallet, err := s.walletRepo.UpsertUserWallet(userID, address, req.ChainID)
	if err != nil {
		return nil, err
	}
	return &dto.WalletBindData{
		WalletAddress: wallet.Address,
		BoundAt:       wallet.BoundAt.Format(time.RFC3339),
	}, nil
}

func verifyWalletSignature(message, address, signatureHex string) bool {
	sig := common.FromHex(strings.TrimSpace(signatureHex))
	if len(sig) != 65 {
		return false
	}
	if sig[64] == 27 || sig[64] == 28 {
		sig[64] -= 27
	}
	if sig[64] != 0 && sig[64] != 1 {
		return false
	}

	hash := accounts.TextHash([]byte(message))
	pubKey, err := crypto.SigToPub(hash, sig)
	if err != nil {
		return false
	}
	recovered := crypto.PubkeyToAddress(*pubKey).Hex()
	return strings.EqualFold(recovered, strings.TrimSpace(address))
}

func (s *WalletService) Unbind(userID uint, req dto.WalletUnbindRequest) error {
	return s.walletRepo.UnbindUserWallet(userID, strings.TrimSpace(strings.ToLower(req.Address)), req.ChainID)
}

func randomHex(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}
