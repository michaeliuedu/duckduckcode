// Package slug turns a title into the identifier that appears in a URL.
package slug

import (
	"fmt"
	"regexp"
	"strings"
	"unicode"
)

// MaxLength matches the CHECK constraint on problems.slug and lists.slug.
const MaxLength = 80

var collapse = regexp.MustCompile(`-+`)

// Make converts a title into a slug: lowercase, ASCII letters and digits,
// words joined by single hyphens.
//
// Returns "" when nothing usable survives — a title written entirely in a
// script this transliteration does not handle, for example. Callers fall back
// to a generated name rather than rejecting the title, because a person should
// not have to rename their problem to satisfy a URL.
func Make(title string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(strings.TrimSpace(title)) {
		switch {
		case r < unicode.MaxASCII && (unicode.IsLetter(r) || unicode.IsDigit(r)):
			b.WriteRune(r)
		case unicode.IsSpace(r) || r == '-' || r == '_' || r == '/':
			b.WriteByte('-')
		default:
			// Anything else, including non-ASCII letters, is dropped rather
			// than guessed at.
		}
	}
	out := collapse.ReplaceAllString(b.String(), "-")
	out = strings.Trim(out, "-")
	if len(out) > MaxLength {
		out = strings.Trim(out[:MaxLength], "-")
	}
	// The schema requires a leading alphanumeric and at least two characters.
	if len(out) < 2 {
		return ""
	}
	return out
}

// Unique returns the first free slug in the series base, base-2, base-3, …
//
// taken reports whether a candidate is already in use. Racing with a concurrent
// insert is still possible, which is why the unique index is the real
// authority; this only makes the common case produce a readable name.
func Unique(base string, taken func(string) (bool, error)) (string, error) {
	if base == "" {
		base = "problem"
	}
	for attempt := 1; attempt <= 50; attempt++ {
		candidate := base
		if attempt > 1 {
			suffix := fmt.Sprintf("-%d", attempt)
			trimmed := base
			if len(trimmed)+len(suffix) > MaxLength {
				trimmed = strings.Trim(trimmed[:MaxLength-len(suffix)], "-")
			}
			candidate = trimmed + suffix
		}
		used, err := taken(candidate)
		if err != nil {
			return "", err
		}
		if !used {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("slug: no free name based on %q", base)
}
