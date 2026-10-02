package slug_test

import (
	"strings"
	"testing"

	"github.com/duckduckcode/backend/internal/slug"
)

func TestMake(t *testing.T) {
	cases := map[string]string{
		"Longest Palindromic Substring":      "longest-palindromic-substring",
		"  Median  of Two   Sorted Arrays  ": "median-of-two-sorted-arrays",
		"Two-Sum":                            "two-sum",
		"snake_case_title":                   "snake-case-title",
		"C++ pointers?!":                     "c-pointers",
		"100 Doors":                          "100-doors",
		"a/b testing":                        "a-b-testing",
		"--leading and trailing--":           "leading-and-trailing",
	}
	for title, want := range cases {
		if got := slug.Make(title); got != want {
			t.Errorf("Make(%q) = %q, want %q", title, got, want)
		}
	}
}

func TestMakeReturnsEmptyWhenNothingSurvives(t *testing.T) {
	for _, title := range []string{"", "   ", "!!!", "??", "日本語"} {
		if got := slug.Make(title); got != "" {
			t.Errorf("Make(%q) = %q, want empty so the caller can fall back", title, got)
		}
	}
}

func TestMakeCapsLength(t *testing.T) {
	got := slug.Make(strings.Repeat("long title ", 40))
	if len(got) > slug.MaxLength {
		t.Fatalf("slug is %d characters, over the %d limit", len(got), slug.MaxLength)
	}
	if strings.HasSuffix(got, "-") {
		t.Fatalf("truncation left a trailing hyphen: %q", got)
	}
}

func TestUniqueAppendsACounter(t *testing.T) {
	used := map[string]bool{"two-sum": true, "two-sum-2": true}
	got, err := slug.Unique("two-sum", func(candidate string) (bool, error) { return used[candidate], nil })
	if err != nil {
		t.Fatal(err)
	}
	if got != "two-sum-3" {
		t.Fatalf("got %q, want two-sum-3", got)
	}
}

func TestUniqueReturnsTheBaseWhenItIsFree(t *testing.T) {
	got, err := slug.Unique("two-sum", func(string) (bool, error) { return false, nil })
	if err != nil || got != "two-sum" {
		t.Fatalf("got %q, %v", got, err)
	}
}

func TestUniqueFallsBackForAnEmptyBase(t *testing.T) {
	got, err := slug.Unique("", func(string) (bool, error) { return false, nil })
	if err != nil || got != "problem" {
		t.Fatalf("got %q, %v", got, err)
	}
}

func TestUniqueKeepsTheSuffixWithinTheLimit(t *testing.T) {
	base := strings.Repeat("a", slug.MaxLength)
	got, err := slug.Unique(base, func(candidate string) (bool, error) { return candidate == base, nil })
	if err != nil {
		t.Fatal(err)
	}
	if len(got) > slug.MaxLength {
		t.Fatalf("slug is %d characters, over the %d limit", len(got), slug.MaxLength)
	}
}
