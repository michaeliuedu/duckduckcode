package auth

import (
	"regexp"
	"strings"
	"unicode/utf8"
)

// FieldErrors maps a request field name to a message meant for the person
// filling in the form. The client renders each one next to its input, so the
// keys match the form field names exactly.
type FieldErrors map[string]string

// Any reports whether validation failed.
func (e FieldErrors) Any() bool { return len(e) > 0 }

func (e FieldErrors) set(field, message string) {
	if _, taken := e[field]; !taken {
		e[field] = message
	}
}

// Password length bounds. Length is the only rule: composition requirements
// push people towards "Password1!" and are not what NIST recommends. The upper
// bound exists because argon2 will happily chew on a megabyte of input.
const (
	MinPasswordLength = 10
	MaxPasswordLength = 128
)

const (
	MinHandleLength      = 3
	MaxHandleLength      = 30
	MaxDisplayNameLength = 60
	MaxEmailLength       = 254
)

// Deliberately loose: the only authority on whether an address works is
// sending mail to it. This rejects obvious nonsense and nothing more.
var emailPattern = regexp.MustCompile(`^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$`)

var handlePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{2,29}$`)

// reservedHandles are names that would collide with a route or impersonate the
// service. Kept in sync with the top-level paths in the frontend router.
var reservedHandles = map[string]bool{
	"about": true, "admin": true, "api": true, "auth": true, "duckduckcode": true,
	"health": true, "healthz": true, "help": true, "list": true, "lists": true,
	"login": true, "logout": true, "me": true, "new": true, "problem": true,
	"problems": true, "readyz": true, "room": true, "rooms": true, "root": true,
	"settings": true, "signup": true, "support": true, "u": true, "user": true,
	"users": true, "ws": true,
}

// NormalizeEmail lower-cases and trims. Addresses are compared as stored, so
// every path into the database must go through this.
func NormalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// NormalizeHandle lower-cases and trims, and drops a leading "@" so that
// pasting "@ana" does the obvious thing.
func NormalizeHandle(handle string) string {
	return strings.ToLower(strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(handle), "@")))
}

// NormalizeDisplayName collapses runs of whitespace.
func NormalizeDisplayName(name string) string {
	return strings.Join(strings.Fields(name), " ")
}

// Signup is the set of fields a new account needs.
type Signup struct {
	Email       string
	Handle      string
	DisplayName string
	Password    string
}

// Validate normalises the input and reports per-field problems. The returned
// Signup is what should be written to the database; the original must not be.
func (s Signup) Validate() (Signup, FieldErrors) {
	out := Signup{
		Email:       NormalizeEmail(s.Email),
		Handle:      NormalizeHandle(s.Handle),
		DisplayName: NormalizeDisplayName(s.DisplayName),
		Password:    s.Password,
	}
	errs := FieldErrors{}

	switch {
	case out.Email == "":
		errs.set("email", "Enter your email address.")
	case len(out.Email) > MaxEmailLength:
		errs.set("email", "That email address is too long.")
	case !emailPattern.MatchString(out.Email):
		errs.set("email", "That does not look like an email address.")
	}

	switch {
	case out.Handle == "":
		errs.set("handle", "Pick a username.")
	case utf8.RuneCountInString(out.Handle) < MinHandleLength:
		errs.set("handle", "Usernames are at least 3 characters.")
	case utf8.RuneCountInString(out.Handle) > MaxHandleLength:
		errs.set("handle", "Usernames are at most 30 characters.")
	case !handlePattern.MatchString(out.Handle):
		errs.set("handle", "Use lowercase letters, numbers, hyphens and underscores, starting with a letter or number.")
	case reservedHandles[out.Handle]:
		errs.set("handle", "That username is reserved. Pick another.")
	}

	switch {
	case out.DisplayName == "":
		// Falling back to the handle is friendlier than refusing the form.
		out.DisplayName = out.Handle
	case utf8.RuneCountInString(out.DisplayName) > MaxDisplayNameLength:
		errs.set("displayName", "That display name is too long.")
	}

	if err := ValidatePassword(out.Password); err != "" {
		errs.set("password", err)
	}

	return out, errs
}

// ValidatePassword returns a message to show the person, or "" if the password
// is acceptable.
func ValidatePassword(password string) string {
	switch {
	case password == "":
		return "Choose a password."
	case utf8.RuneCountInString(password) < MinPasswordLength:
		return "Use at least 10 characters. Length matters more than symbols."
	case len(password) > MaxPasswordLength:
		return "That password is too long."
	default:
		return ""
	}
}
