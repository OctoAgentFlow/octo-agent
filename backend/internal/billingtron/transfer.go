package billingtron

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/crypto"
)

const base58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

// VerifyTRC20Transfer verifies one TRC20 Transfer event in a confirmed TRON
// Solidity JSON-RPC receipt. Addresses may be configured as TRON base58,
// 41-prefixed hex, or 0x-prefixed EVM-style hex.
func VerifyTRC20Transfer(ctx context.Context, rpcURL string, params VerifyParams) error {
	if strings.TrimSpace(rpcURL) == "" {
		return fmt.Errorf("tron rpc url is required")
	}
	token, err := tronAddressToEVMHex(params.TokenAddress)
	if err != nil {
		return fmt.Errorf("token address: %w", err)
	}
	receiver, err := tronAddressToEVMHex(params.ReceiverAddress)
	if err != nil {
		return fmt.Errorf("receiver address: %w", err)
	}
	txHash, err := normalizeTxHash(params.TxHash)
	if err != nil {
		return err
	}

	client := &rpcClient{url: rpcURL, http: &http.Client{Timeout: 30 * time.Second}}
	if params.ExpectedChainID != nil {
		chainID, err := client.chainID(ctx)
		if err != nil {
			return fmt.Errorf("tron chain id: %w", err)
		}
		if chainID.Cmp(params.ExpectedChainID) != 0 {
			return fmt.Errorf("chain_id mismatch: rpc has %s, expected %s", chainID.String(), params.ExpectedChainID.String())
		}
	}

	receipt, err := client.receipt(ctx, txHash)
	if err != nil {
		return err
	}
	if receipt == nil {
		return fmt.Errorf("transaction receipt not found")
	}
	if !receipt.success() {
		return fmt.Errorf("transaction execution failed (status != 1)")
	}

	transferSig := crypto.Keccak256Hash([]byte("Transfer(address,address,uint256)")).Hex()
	var matched bool
	for _, lg := range receipt.Logs {
		if !sameHexAddress(lg.Address, token) {
			continue
		}
		if len(lg.Topics) != 3 {
			continue
		}
		if !strings.EqualFold(lg.Topics[0], transferSig) {
			continue
		}
		to, err := topicToEVMAddress(lg.Topics[2])
		if err != nil || !sameHexAddress(to, receiver) {
			continue
		}
		val, err := hexBig(lg.Data)
		if err != nil {
			continue
		}
		if val.Cmp(params.ExpectedMinUnit) != 0 {
			return fmt.Errorf("transfer amount mismatch: want %s got %s", params.ExpectedMinUnit.String(), val.String())
		}
		if matched {
			return fmt.Errorf("ambiguous: multiple matching transfers in one tx")
		}
		matched = true
	}
	if !matched {
		return fmt.Errorf("no matching TRC20 Transfer log for token=%s receiver=%s", params.TokenAddress, params.ReceiverAddress)
	}
	return nil
}

type VerifyParams struct {
	TxHash          string
	TokenAddress    string
	ReceiverAddress string
	ExpectedMinUnit *big.Int
	ExpectedChainID *big.Int
}

type TransferEvent struct {
	TxHash      string
	Amount      *big.Int
	BlockNumber uint64
	BlockTime   time.Time
}

type ScanParams struct {
	TokenAddress    string
	ReceiverAddress string
	ExpectedChainID *big.Int
	FromBlock       uint64
	ToBlock         uint64
	BlockLookback   uint64
}

func ScanTRC20Transfers(ctx context.Context, rpcURL string, params ScanParams) ([]TransferEvent, error) {
	if strings.TrimSpace(rpcURL) == "" {
		return nil, fmt.Errorf("tron rpc url is required")
	}
	token, err := tronAddressToEVMHex(params.TokenAddress)
	if err != nil {
		return nil, fmt.Errorf("token address: %w", err)
	}
	receiver, err := tronAddressToEVMHex(params.ReceiverAddress)
	if err != nil {
		return nil, fmt.Errorf("receiver address: %w", err)
	}
	client := &rpcClient{url: rpcURL, http: &http.Client{Timeout: 30 * time.Second}}
	if params.ExpectedChainID != nil {
		chainID, err := client.chainID(ctx)
		if err != nil {
			return nil, fmt.Errorf("tron chain id: %w", err)
		}
		if chainID.Cmp(params.ExpectedChainID) != 0 {
			return nil, fmt.Errorf("chain_id mismatch: rpc has %s, expected %s", chainID.String(), params.ExpectedChainID.String())
		}
	}
	latest, err := client.blockNumber(ctx)
	if err != nil {
		return nil, err
	}
	from := params.FromBlock
	to := params.ToBlock
	if to == 0 || to > latest {
		to = latest
	}
	if from == 0 && params.BlockLookback > 0 && to > params.BlockLookback {
		from = to - params.BlockLookback
	}
	if from > to {
		from = to
	}
	transferSig := crypto.Keccak256Hash([]byte("Transfer(address,address,uint256)")).Hex()
	var out []txLog
	filter := map[string]any{
		"fromBlock": fmt.Sprintf("0x%x", from),
		"toBlock":   fmt.Sprintf("0x%x", to),
		"address":   token,
		"topics": []any{
			transferSig,
			nil,
			"0x" + strings.Repeat("0", 24) + strings.TrimPrefix(strings.ToLower(receiver), "0x"),
		},
	}
	if err := client.call(ctx, "eth_getLogs", []any{filter}, &out); err != nil {
		return nil, fmt.Errorf("filter logs: %w", err)
	}
	blockTimes := make(map[uint64]time.Time)
	events := make([]TransferEvent, 0, len(out))
	for _, lg := range out {
		if len(lg.Topics) != 3 || !strings.EqualFold(lg.Topics[0], transferSig) {
			continue
		}
		toAddr, err := topicToEVMAddress(lg.Topics[2])
		if err != nil || !sameHexAddress(toAddr, receiver) {
			continue
		}
		amount, err := hexBig(lg.Data)
		if err != nil {
			continue
		}
		blockNumber, err := hexUint64(lg.BlockNumber)
		if err != nil {
			continue
		}
		bt, ok := blockTimes[blockNumber]
		if !ok {
			bt, err = client.blockTime(ctx, blockNumber)
			if err != nil {
				return nil, err
			}
			blockTimes[blockNumber] = bt
		}
		txHash, err := normalizeTxHash(lg.TransactionHash)
		if err != nil {
			continue
		}
		events = append(events, TransferEvent{
			TxHash:      txHash,
			Amount:      amount,
			BlockNumber: blockNumber,
			BlockTime:   bt,
		})
	}
	return events, nil
}

type rpcClient struct {
	url  string
	http *http.Client
}

func (c *rpcClient) chainID(ctx context.Context) (*big.Int, error) {
	var out string
	if err := c.call(ctx, "eth_chainId", []any{}, &out); err != nil {
		return nil, err
	}
	return hexBig(out)
}

func (c *rpcClient) blockNumber(ctx context.Context) (uint64, error) {
	var out string
	if err := c.call(ctx, "eth_blockNumber", []any{}, &out); err != nil {
		return 0, fmt.Errorf("block number: %w", err)
	}
	return hexUint64(out)
}

func (c *rpcClient) blockTime(ctx context.Context, blockNumber uint64) (time.Time, error) {
	var out *txBlock
	if err := c.call(ctx, "eth_getBlockByNumber", []any{fmt.Sprintf("0x%x", blockNumber), false}, &out); err != nil {
		return time.Time{}, fmt.Errorf("block %d: %w", blockNumber, err)
	}
	if out == nil {
		return time.Time{}, fmt.Errorf("block %d not found", blockNumber)
	}
	ts, err := hexUint64(out.Timestamp)
	if err != nil {
		return time.Time{}, fmt.Errorf("block %d timestamp: %w", blockNumber, err)
	}
	return time.Unix(int64(ts), 0).UTC(), nil
}

func (c *rpcClient) receipt(ctx context.Context, txHash string) (*txReceipt, error) {
	var out *txReceipt
	if err := c.call(ctx, "eth_getTransactionReceipt", []any{txHash}, &out); err != nil {
		return nil, fmt.Errorf("transaction receipt: %w", err)
	}
	return out, nil
}

func (c *rpcClient) call(ctx context.Context, method string, params []any, result any) error {
	body, err := json.Marshal(map[string]any{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  method,
		"params":  params,
	})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("rpc http status %d: %s", resp.StatusCode, strings.TrimSpace(string(data)))
	}
	var envelope struct {
		Result json.RawMessage `json:"result"`
		Error  *struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil {
		return err
	}
	if envelope.Error != nil {
		return fmt.Errorf("rpc error %d: %s", envelope.Error.Code, envelope.Error.Message)
	}
	if len(envelope.Result) == 0 || string(envelope.Result) == "null" {
		return nil
	}
	return json.Unmarshal(envelope.Result, result)
}

type txReceipt struct {
	Status string  `json:"status"`
	Logs   []txLog `json:"logs"`
	Result string  `json:"result"`
}

type txLog struct {
	Address         string   `json:"address"`
	Topics          []string `json:"topics"`
	Data            string   `json:"data"`
	BlockNumber     string   `json:"blockNumber"`
	TransactionHash string   `json:"transactionHash"`
}

type txBlock struct {
	Timestamp string `json:"timestamp"`
}

func (r *txReceipt) success() bool {
	status := strings.TrimSpace(r.Status)
	if status == "" {
		status = strings.TrimSpace(r.Result)
	}
	status = strings.TrimPrefix(strings.ToLower(status), "0x")
	return status == "1" || status == "success"
}

func normalizeTxHash(v string) (string, error) {
	h := strings.TrimSpace(v)
	h = strings.TrimPrefix(strings.ToLower(h), "0x")
	if len(h) != 64 {
		return "", fmt.Errorf("invalid tx_hash")
	}
	if _, err := hex.DecodeString(h); err != nil {
		return "", fmt.Errorf("invalid tx_hash")
	}
	return "0x" + h, nil
}

func tronAddressToEVMHex(addr string) (string, error) {
	a := strings.TrimSpace(addr)
	if a == "" {
		return "", fmt.Errorf("empty address")
	}
	lower := strings.ToLower(a)
	if strings.HasPrefix(lower, "0x") {
		raw, err := hex.DecodeString(strings.TrimPrefix(lower, "0x"))
		if err != nil || len(raw) != 20 {
			return "", fmt.Errorf("invalid evm hex address")
		}
		return "0x" + hex.EncodeToString(raw), nil
	}
	if len(a) == 42 && strings.HasPrefix(a, "41") {
		raw, err := hex.DecodeString(a)
		if err != nil || len(raw) != 21 || raw[0] != 0x41 {
			return "", fmt.Errorf("invalid tron hex address")
		}
		return "0x" + hex.EncodeToString(raw[1:]), nil
	}
	raw, err := decodeBase58Check(a)
	if err != nil {
		return "", err
	}
	if len(raw) != 21 || raw[0] != 0x41 {
		return "", fmt.Errorf("invalid tron address payload")
	}
	return "0x" + hex.EncodeToString(raw[1:]), nil
}

func decodeBase58Check(s string) ([]byte, error) {
	num := big.NewInt(0)
	base := big.NewInt(58)
	for _, r := range s {
		i := strings.IndexRune(base58Alphabet, r)
		if i < 0 {
			return nil, fmt.Errorf("invalid base58 character")
		}
		num.Mul(num, base)
		num.Add(num, big.NewInt(int64(i)))
	}
	decoded := num.Bytes()
	for _, r := range s {
		if r != '1' {
			break
		}
		decoded = append([]byte{0}, decoded...)
	}
	if len(decoded) < 5 {
		return nil, fmt.Errorf("invalid base58check length")
	}
	payload := decoded[:len(decoded)-4]
	checksum := decoded[len(decoded)-4:]
	first := sha256.Sum256(payload)
	second := sha256.Sum256(first[:])
	if !bytes.Equal(checksum, second[:4]) {
		return nil, fmt.Errorf("invalid base58check checksum")
	}
	return payload, nil
}

func topicToEVMAddress(topic string) (string, error) {
	raw, err := hexBytes(topic)
	if err != nil {
		return "", err
	}
	if len(raw) < 20 {
		return "", fmt.Errorf("invalid topic address")
	}
	return "0x" + hex.EncodeToString(raw[len(raw)-20:]), nil
}

func hexBig(v string) (*big.Int, error) {
	raw, err := hexBytes(v)
	if err != nil {
		return nil, err
	}
	return new(big.Int).SetBytes(raw), nil
}

func hexUint64(v string) (uint64, error) {
	n, err := hexBig(v)
	if err != nil {
		return 0, err
	}
	if !n.IsUint64() {
		return 0, fmt.Errorf("hex integer overflows uint64")
	}
	return n.Uint64(), nil
}

func hexBytes(v string) ([]byte, error) {
	s := strings.TrimPrefix(strings.ToLower(strings.TrimSpace(v)), "0x")
	if s == "" {
		return []byte{}, nil
	}
	if len(s)%2 == 1 {
		s = "0" + s
	}
	return hex.DecodeString(s)
}

func sameHexAddress(a, b string) bool {
	aa, errA := tronAddressToEVMHex(a)
	if errA != nil {
		aa = strings.ToLower(strings.TrimSpace(a))
	}
	bb, errB := tronAddressToEVMHex(b)
	if errB != nil {
		bb = strings.ToLower(strings.TrimSpace(b))
	}
	return strings.EqualFold(aa, bb)
}
