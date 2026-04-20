package billingevm

import (
	"context"
	"fmt"
	"math/big"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
)

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
	TxHash            common.Hash
	TokenAddress      string
	ReceiverAddress   string
	ExpectedMinUnit   *big.Int
	ExpectedChainID   *big.Int
}
