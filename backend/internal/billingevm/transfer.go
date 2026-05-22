package billingevm

import (
	"context"
	"fmt"
	"math/big"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
)

const defaultMaxEVMLogScanBlockRange uint64 = 1400

// VerifyERC20Transfer checks that txHash contains exactly one ERC-20 Transfer to receiver
// from token contract with value == expectedMinUnit (smallest units). Does not use tx ETH value.
func VerifyERC20Transfer(ctx context.Context, rpcURL string, params VerifyParams) error {
	client, err := ethclient.DialContext(ctx, rpcURL)
	if err != nil {
		return fmt.Errorf("evm rpc dial: %w", err)
	}
	defer client.Close()

	if params.ExpectedChainID != nil {
		chainID, err := client.ChainID(ctx)
		if err != nil {
			return fmt.Errorf("chain id: %w", err)
		}
		if chainID.Cmp(params.ExpectedChainID) != 0 {
			return fmt.Errorf("chain_id mismatch: rpc has %s, expected %s", chainID.String(), params.ExpectedChainID.String())
		}
	}

	receipt, err := client.TransactionReceipt(ctx, params.TxHash)
	if err != nil {
		return fmt.Errorf("transaction receipt: %w", err)
	}
	if receipt.Status != 1 {
		return fmt.Errorf("transaction execution failed (status != 1)")
	}

	tokenAddr := common.HexToAddress(params.TokenAddress)
	receiver := common.HexToAddress(params.ReceiverAddress)
	transferSig := crypto.Keccak256Hash([]byte("Transfer(address,address,uint256)"))

	var matched bool
	for _, lg := range receipt.Logs {
		if lg.Address != tokenAddr {
			continue
		}
		if len(lg.Topics) != 3 {
			continue
		}
		if lg.Topics[0] != transferSig {
			continue
		}
		to := common.BytesToAddress(lg.Topics[2].Bytes()[12:])
		if to != receiver {
			continue
		}
		if len(lg.Data) < 32 {
			continue
		}
		val := new(big.Int).SetBytes(lg.Data)
		if val.Cmp(params.ExpectedMinUnit) != 0 {
			return fmt.Errorf("transfer amount mismatch: want %s got %s", params.ExpectedMinUnit.String(), val.String())
		}
		if matched {
			return fmt.Errorf("ambiguous: multiple matching transfers in one tx")
		}
		matched = true
	}
	if !matched {
		return fmt.Errorf("no matching ERC20 Transfer log for token=%s receiver=%s", params.TokenAddress, params.ReceiverAddress)
	}
	return nil
}

// VerifyParams validates one Transfer event against expected payout.
type VerifyParams struct {
	TxHash          common.Hash
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
	MaxBlockRange   uint64
}

func ScanERC20Transfers(ctx context.Context, rpcURL string, params ScanParams) ([]TransferEvent, error) {
	client, err := ethclient.DialContext(ctx, rpcURL)
	if err != nil {
		return nil, fmt.Errorf("evm rpc dial: %w", err)
	}
	defer client.Close()

	if params.ExpectedChainID != nil {
		chainID, err := client.ChainID(ctx)
		if err != nil {
			return nil, fmt.Errorf("chain id: %w", err)
		}
		if chainID.Cmp(params.ExpectedChainID) != 0 {
			return nil, fmt.Errorf("chain_id mismatch: rpc has %s, expected %s", chainID.String(), params.ExpectedChainID.String())
		}
	}

	latest, err := client.BlockNumber(ctx)
	if err != nil {
		return nil, fmt.Errorf("block number: %w", err)
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

	transferSig := crypto.Keccak256Hash([]byte("Transfer(address,address,uint256)"))
	receiverTopic := common.BytesToHash(common.HexToAddress(params.ReceiverAddress).Bytes())
	maxBlockRange := params.MaxBlockRange
	if maxBlockRange == 0 || maxBlockRange > defaultMaxEVMLogScanBlockRange {
		maxBlockRange = defaultMaxEVMLogScanBlockRange
	}

	var logs []types.Log
	for start := from; start <= to; {
		end := start + maxBlockRange - 1
		if end < start || end > to {
			end = to
		}
		chunkLogs, err := client.FilterLogs(ctx, ethereum.FilterQuery{
			FromBlock: new(big.Int).SetUint64(start),
			ToBlock:   new(big.Int).SetUint64(end),
			Addresses: []common.Address{common.HexToAddress(params.TokenAddress)},
			Topics:    [][]common.Hash{{transferSig}, nil, {receiverTopic}},
		})
		if err != nil {
			return nil, fmt.Errorf("filter logs %d-%d: %w", start, end, err)
		}
		logs = append(logs, chunkLogs...)
		if end == to {
			break
		}
		start = end + 1
	}
	blockTimes := make(map[uint64]time.Time)
	events := make([]TransferEvent, 0, len(logs))
	for _, lg := range logs {
		if len(lg.Data) < 32 {
			continue
		}
		bt, ok := blockTimes[lg.BlockNumber]
		if !ok {
			header, err := client.HeaderByNumber(ctx, new(big.Int).SetUint64(lg.BlockNumber))
			if err != nil {
				return nil, fmt.Errorf("block header %d: %w", lg.BlockNumber, err)
			}
			bt = time.Unix(int64(header.Time), 0).UTC()
			blockTimes[lg.BlockNumber] = bt
		}
		events = append(events, TransferEvent{
			TxHash:      lg.TxHash.Hex(),
			Amount:      new(big.Int).SetBytes(lg.Data),
			BlockNumber: lg.BlockNumber,
			BlockTime:   bt,
		})
	}
	return events, nil
}
