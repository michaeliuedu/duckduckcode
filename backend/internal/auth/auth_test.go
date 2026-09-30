package auth_test

import (
	"strings"
	"testing"

	"github.com/duckduckcode/backend/internal/auth"
)

func TestHashAndVerifyPassword(t *testing.T) {
	const password = "correct horse battery"

	hash, err := auth.HashPassword(password)
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	if !strings.HasPrefix(hash, "$argon2id$v=19$") {
		t.Fatalf("hash is not argon2id PHC format: %q", hash)
	}
	if strings.Contains(hash, password) {
		t.Fatal("hash contains the password")
	}

	ok, err := auth.VerifyPassword(hash, password)
	if err != nil || !ok {
		t.Fatalf("correct password rejected: ok=%v err=%v", ok, err)
	}

	ok, err = auth.VerifyPassword(hash, "correct horse batterY")
	if err != nil {
		t.Fatalf("verify wrong password: %v", err)
	}
	if ok {
		t.Fatal("wrong password accepted")
	}
}

func TestHashesAreSalted(t *testing.T) {
	a, err := auth.HashPassword("same password")
	if err != nil {
		t.Fatal(err)
	}
	b, err := auth.HashPassword("same password")
	if err != nil {
		t.Fatal(err)
	}
	if a == b {
		t.Fatal("two hashes of the same password are identical, so the salt is not random")
	}
}

func TestVerifyRejectsMalformedHashes(t *testing.T) {
	cases := map[string]string{
		"empty":             "",
		"not a hash":        "hunter2",
		"wrong algorithm":   "$argon2i$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ$aGFzaGhhc2g",
		"wrong version":     "$argon2id$v=16$m=19456,t=2,p=1$c2FsdHNhbHQ$aGFzaGhhc2g",
		"missing params":    "$argon2id$v=19$$c2FsdHNhbHQ$aGFzaGhhc2g",
		"bad base64 salt":   "$argon2id$v=19$m=19456,t=2,p=1$!!!!$aGFzaGhhc2g",
		"bad base64 digest": "$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ$!!!!",
		"too few fields":    "$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ",
	}
	for name, encoded := range cases {
		t.Run(name, func(t *testing.T) {
			ok, err := auth.VerifyPassword(encoded, "anything")
			if ok {
				t.Fatal("a malformed hash must never verify")
			}
			if err == nil {
				t.Fatal("a malformed hash should report an error, not just a mismatch")
			}
		})
	}
}

func TestSessionTokens(t *testing.T) {
	a, err := auth.NewSessionToken()
	if err != nil {
		t.Fatal(err)
	}
	b, err := auth.NewSessionToken()
	if err != nil {
		t.Fatal(err)
	}
	if a == b {
		t.Fatal("session tokens repeat")
	}
	if len(a) < 40 {
		t.Fatalf("token looks too short to hold 256 bits: %q", a)
	}

	hash := auth.HashSessionToken(a)
	if len(hash) != 32 {
		t.Fatalf("token hash should be 32 bytes, got %d", len(hash))
	}
	if strings.Contains(string(hash), a) {
		t.Fatal("the hash contains the token")
	}
	if string(auth.HashSessionToken(a)) != string(hash) {
		t.Fatal("hashing is not deterministic")
	}
	if string(auth.HashSessionToken(b)) == string(hash) {
		t.Fatal("different tokens hash the same")
	}
}

func TestNormalizers(t *testing.T) {
	if got := auth.NormalizeEmail("  Ana@Example.EDU "); got != "ana@example.edu" {
		t.Fatalf("email: %q", got)
	}
	if got := auth.NormalizeHandle(" @Ana_Codes "); got != "ana_codes" {
		t.Fatalf("handle: %q", got)
	}
	if got := auth.NormalizeDisplayName("  Ana   the   Great  "); got != "Ana the Great" {
		t.Fatalf("display name: %q", got)
	}
}

func validSignup() auth.Signup {
	return auth.Signup{
		Email:       "Ana@Example.edu",
		Handle:      "ana",
		DisplayName: "Ana",
		Password:    "a good long password",
	}
}

func TestSignupValidateAcceptsAndNormalizes(t *testing.T) {
	out, errs := validSignup().Validate()
	if errs.Any() {
		t.Fatalf("valid signup rejected: %v", errs)
	}
	if out.Email != "ana@example.edu" {
		t.Fatalf("email not normalised: %q", out.Email)
	}
	if out.Handle != "ana" || out.DisplayName != "Ana" {
		t.Fatalf("unexpected normalisation: %+v", out)
	}
}

func TestSignupValidateFallsBackToHandleForDisplayName(t *testing.T) {
	in := validSignup()
	in.DisplayName = "   "
	out, errs := in.Validate()
	if errs.Any() {
		t.Fatalf("blank display name should be filled in, not rejected: %v", errs)
	}
	if out.DisplayName != "ana" {
		t.Fatalf("display name should fall back to the handle, got %q", out.DisplayName)
	}
}

func TestSignupValidateRejections(t *testing.T) {
	cases := []struct {
		name   string
		field  string
		mutate func(*auth.Signup)
	}{
		{"missing email", "email", func(s *auth.Signup) { s.Email = "" }},
		{"email without an @", "email", func(s *auth.Signup) { s.Email = "ana.example.edu" }},
		{"email without a dot", "email", func(s *auth.Signup) { s.Email = "ana@example" }},
		{"email far too long", "email", func(s *auth.Signup) { s.Email = strings.Repeat("a", 250) + "@example.edu" }},
		{"missing handle", "handle", func(s *auth.Signup) { s.Handle = "" }},
		{"handle too short", "handle", func(s *auth.Signup) { s.Handle = "ab" }},
		{"handle too long", "handle", func(s *auth.Signup) { s.Handle = strings.Repeat("a", 31) }},
		{"handle with a space", "handle", func(s *auth.Signup) { s.Handle = "ana codes" }},
		{"handle with punctuation", "handle", func(s *auth.Signup) { s.Handle = "ana.codes" }},
		{"handle starting with a hyphen", "handle", func(s *auth.Signup) { s.Handle = "-ana" }},
		{"reserved handle", "handle", func(s *auth.Signup) { s.Handle = "settings" }},
		{"display name too long", "displayName", func(s *auth.Signup) { s.DisplayName = strings.Repeat("a", 61) }},
		{"missing password", "password", func(s *auth.Signup) { s.Password = "" }},
		{"password too short", "password", func(s *auth.Signup) { s.Password = "short" }},
		{"password too long", "password", func(s *auth.Signup) { s.Password = strings.Repeat("a", 129) }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			in := validSignup()
			tc.mutate(&in)
			_, errs := in.Validate()
			if !errs.Any() {
				t.Fatal("expected a validation error")
			}
			if _, ok := errs[tc.field]; !ok {
				t.Fatalf("expected an error on %q, got %v", tc.field, errs)
			}
		})
	}
}

func TestReservedHandlesCoverTheRoutes(t *testing.T) {
	// If a route is added to the frontend, its first path segment belongs in
	// reservedHandles, or someone can register it and shadow the page.
	for _, taken := range []string{"api", "login", "signup", "settings", "problems", "lists", "rooms", "u"} {
		in := validSignup()
		in.Handle = taken
		if _, errs := in.Validate(); !errs.Any() {
			t.Fatalf("%q should be reserved", taken)
		}
	}
}
