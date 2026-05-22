package billingtron

import "testing"

func TestTronAddressToEVMHex(t *testing.T) {
	got, err := tronAddressToEVMHex("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t")
	if err != nil {
		t.Fatalf("tronAddressToEVMHex returned error: %v", err)
	}
	want := "0xa614f803b6fd780986a42c78ec9c7f77e6ded13c"
	if got != want {
		t.Fatalf("unexpected evm hex: got %s want %s", got, want)
	}
}

func TestNormalizeTxHash(t *testing.T) {
	got, err := normalizeTxHash("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
	if err != nil {
		t.Fatalf("normalizeTxHash returned error: %v", err)
	}
	want := "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	if got != want {
		t.Fatalf("unexpected normalized hash: got %s want %s", got, want)
	}
}

func TestConfiguredTRC20AddressesAreValid(t *testing.T) {
	for _, addr := range []string{
		"TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj",
		"TR4vMB8o5rA3KXTN1QLxewgPeuh9RhmAuX",
	} {
		if _, err := tronAddressToEVMHex(addr); err != nil {
			t.Fatalf("configured TRON address %s is invalid: %v", addr, err)
		}
	}
}
