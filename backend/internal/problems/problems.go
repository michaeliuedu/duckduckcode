// Package problems holds the built-in practice problem catalog.
//
// The first version supports exactly one programming language (Python) and
// one file per room, so each problem ships a single Python starter file.
package problems

// Language is the only language supported by this MVP.
const Language = "python"

// Example is a worked input/output pair shown alongside the statement.
type Example struct {
	Input       string `json:"input"`
	Output      string `json:"output"`
	Explanation string `json:"explanation,omitempty"`
}

// Problem is a practice problem with a statement and starter code.
type Problem struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	Difficulty  string    `json:"difficulty"`
	Summary     string    `json:"summary"`
	Statement   string    `json:"statement"` // plain text; paragraphs separated by blank lines
	Examples    []Example `json:"examples"`
	StarterCode string    `json:"starterCode"`
	Language    string    `json:"language"`
}

// Summary is the lightweight view used by the problem picker.
type Summary struct {
	ID         string `json:"id"`
	Title      string `json:"title"`
	Difficulty string `json:"difficulty"`
	Summary    string `json:"summary"`
	Language   string `json:"language"`
}

var catalog = []Problem{
	{
		ID:         "office-hours-queue",
		Title:      "Office Hours Queue",
		Difficulty: "easy",
		Language:   Language,
		Summary:    "Simulate a single TA helping students in arrival order and report when each student is seen.",
		Statement: `A TA runs office hours alone. Students arrive at various minutes and each one needs a fixed number of minutes of help. The TA helps one student at a time, always taking the student who arrived earliest. If two students arrive at the same minute, the one whose name sorts first alphabetically goes first. The TA never takes a break: as soon as one student is done, the next waiting student starts immediately. If nobody is waiting, the TA waits for the next arrival.

You are given a list of students, each as a tuple (name, arrival_minute, minutes_needed). Return a list of (name, start_minute) tuples in the order the students were helped.

Constraints: 1 <= len(students) <= 1000, 0 <= arrival_minute <= 10**6, 1 <= minutes_needed <= 120. Names are unique.`,
		Examples: []Example{
			{
				Input:       `[("ana", 0, 10), ("bo", 3, 5), ("cy", 4, 2)]`,
				Output:      `[("ana", 0), ("bo", 10), ("cy", 15)]`,
				Explanation: "ana starts at 0 and finishes at 10. bo (arrived at 3) is helped next, from 10 to 15. cy starts at 15.",
			},
			{
				Input:       `[("dee", 5, 1), ("al", 5, 1), ("zed", 30, 4)]`,
				Output:      `[("al", 5), ("dee", 6), ("zed", 30)]`,
				Explanation: "al and dee tie on arrival, so al goes first. Nobody is waiting after dee, so the TA idles until zed arrives at 30.",
			},
		},
		StarterCode: `from typing import List, Tuple


def office_hours_queue(
    students: List[Tuple[str, int, int]],
) -> List[Tuple[str, int]]:
    """Return (name, start_minute) for each student in the order they were helped.

    students: list of (name, arrival_minute, minutes_needed)
    """
    # TODO: sort by (arrival, name), then walk the queue keeping track of
    # when the TA becomes free.
    return []


if __name__ == "__main__":
    print(office_hours_queue([("ana", 0, 10), ("bo", 3, 5), ("cy", 4, 2)]))
    # expected: [("ana", 0), ("bo", 10), ("cy", 15)]
`,
	},
	{
		ID:         "duck-pond-census",
		Title:      "Duck Pond Census",
		Difficulty: "medium",
		Language:   Language,
		Summary:    "Count the flocks of ducks on a pond grid, where a flock is a group of touching ducks.",
		Statement: `A pond is described by a rectangular grid of characters. Each cell is either '.' (open water) or 'D' (a duck). Two ducks belong to the same flock if their cells share an edge (up, down, left or right; diagonals do not count). A single duck with no neighbours is a flock of size 1.

Write a function that returns the sizes of all flocks on the pond, sorted from largest to smallest.

Constraints: 1 <= rows, cols <= 200. The grid is well-formed (every row has the same length).`,
		Examples: []Example{
			{
				Input:       `["DD..", ".D.D", "...D", "D..."]`,
				Output:      `[3, 2, 1]`,
				Explanation: "The three ducks in the top-left touch each other (size 3). The two ducks in the right column touch (size 2). The duck at the bottom-left is alone.",
			},
			{
				Input:  `["....", "...."]`,
				Output: `[]`,
			},
		},
		StarterCode: `from typing import List


def flock_sizes(pond: List[str]) -> List[int]:
    """Return the sizes of all 4-directionally connected groups of 'D' cells,
    sorted in descending order."""
    rows = len(pond)
    cols = len(pond[0]) if rows else 0
    seen = [[False] * cols for _ in range(rows)]
    sizes: List[int] = []

    # TODO: for every unvisited 'D', flood-fill its flock (BFS/DFS) and
    # record the size.

    return sorted(sizes, reverse=True)


if __name__ == "__main__":
    print(flock_sizes(["DD..", ".D.D", "...D", "D..."]))
    # expected: [3, 2, 1]
`,
	},
	{
		ID:         "commit-message-linter",
		Title:      "Commit Message Linter",
		Difficulty: "easy",
		Language:   Language,
		Summary:    "Check a list of git commit subjects against three style rules and report the violations.",
		Statement: `Your course project enforces a small style guide for git commit subject lines:

Rule 1 ("length"): the subject must be at most 50 characters long.

Rule 2 ("capital"): the first character must be an uppercase letter A-Z.

Rule 3 ("period"): the subject must not end with a period.

Given a list of commit subjects, return a list with one entry per subject, in the same order. Each entry is the list of rule names that the subject violates, in the order length, capital, period. A subject that follows all rules gets an empty list.

Constraints: 0 <= len(subjects) <= 10**4. Subjects are non-empty strings without newlines.`,
		Examples: []Example{
			{
				Input:  `["Add login page", "fix typo.", "Refactor the entire persistence layer to use repositories."]`,
				Output: `[[], ["capital", "period"], ["length", "period"]]`,
			},
			{
				Input:       `["12 tweaks"]`,
				Output:      `[["capital"]]`,
				Explanation: "A digit is not an uppercase letter.",
			},
		},
		StarterCode: `from typing import List

MAX_LENGTH = 50


def lint_commit_subjects(subjects: List[str]) -> List[List[str]]:
    """Return, for each subject, the list of violated rule names in the order
    "length", "capital", "period"."""
    results: List[List[str]] = []
    for subject in subjects:
        violations: List[str] = []
        # TODO: check each rule and append its name when violated.
        results.append(violations)
    return results


if __name__ == "__main__":
    print(lint_commit_subjects(["Add login page", "fix typo."]))
    # expected: [[], ["capital", "period"]]
`,
	},
}

// All returns the full problem catalog in display order.
func All() []Problem {
	out := make([]Problem, len(catalog))
	copy(out, catalog)
	return out
}

// Summaries returns the picker view of the catalog.
func Summaries() []Summary {
	out := make([]Summary, 0, len(catalog))
	for _, p := range catalog {
		out = append(out, Summary{ID: p.ID, Title: p.Title, Difficulty: p.Difficulty, Summary: p.Summary, Language: p.Language})
	}
	return out
}

// Get returns the problem with the given id.
func Get(id string) (Problem, bool) {
	for _, p := range catalog {
		if p.ID == id {
			return p, true
		}
	}
	return Problem{}, false
}
