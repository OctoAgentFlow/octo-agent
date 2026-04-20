package billingamount

import (
	"fmt"
	"math/big"
	"strings"
)

// ToMinUnits parses a decimal amount string (e.g. "10" or "10.5") into smallest units using `decimals`.
func ToMinUnits(amountStr string, decimals int) (*big.Int, error) {
	s := strings.TrimSpace(amountStr)
	if s == "" {
		return nil, fmt.Errorf("empty amount")
	}
	parts := strings.SplitN(s, ".", 2)
	intStr := parts[0]
	if intStr == "" {
		intStr = "0"
	}
	if strings.HasPrefix(intStr, "-") {
		return nil, fmt.Errorf("negative amount not supported")
	}
	fracStr := ""
	if len(parts) == 2 {
		fracStr = parts[1]
	}
	for _, c := range intStr {
		if c < '0' || c > '9' {
			return nil, fmt.Errorf("invalid amount")
		}
	}
	for _, c := range fracStr {
		if c < '0' || c > '9' {
			return nil, fmt.Errorf("invalid amount")
		}
	}
	if len(fracStr) > decimals {
		return nil, fmt.Errorf("fraction exceeds token decimals")
	}
	fracStr += strings.Repeat("0", decimals-len(fracStr))
	combined := strings.TrimLeft(intStr+fracStr, "0")
	if combined == "" {
		return big.NewInt(0), nil
	}
	v, ok := new(big.Int).SetString(combined, 10)
	if !ok {
		return nil, fmt.Errorf("invalid amount")
	}
	return v, nil
}
