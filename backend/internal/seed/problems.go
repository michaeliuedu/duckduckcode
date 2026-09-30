package seed

import "github.com/duckduckcode/backend/internal/store"

// Problems returns the catalog: the first ten problems of the classic
// interview-prep sequence, in order.
//
// The statements are written here rather than copied from anywhere — they
// describe the same well-known tasks in our own words, with our own examples
// and cases. Two of them are adapted to what the browser runner can actually
// pass across the wire: the harness calls a function with JSON arguments, so
// the linked lists of "Add Two Numbers" are lists of digits here, and the
// problems that admit several correct answers have their tie broken in the
// statement so a test can check the answer exactly.
func Problems() []Problem {
	return []Problem{
		twoSum(),
		addTwoNumbers(),
		longestSubstring(),
		medianOfTwoSortedArrays(),
		longestPalindrome(),
		zigzagConversion(),
		reverseInteger(),
		stringToInteger(),
		palindromeNumber(),
		regularExpressionMatching(),
	}
}

func twoSum() Problem {
	return Problem{
		Slug:       "two-sum",
		Difficulty: "easy",
		Draft: store.ProblemDraft{
			Title:      "Two Sum",
			Difficulty: "easy",
			Summary:    "Find the two numbers in a list that add up to a target, and return where they are.",
			Statement: `You are given a list of integers ` + "`nums`" + ` and an integer ` + "`target`" + `. Exactly one pair of *different* positions holds two numbers that add up to ` + "`target`" + `. Return those two positions as a list, smallest first.

The same element may not be used twice — but the list may well contain the same *value* twice, and those are two different positions and a perfectly good answer.

The obvious solution compares every pair, which is fine and will pass. The interesting one runs in a single pass: as you walk the list, remember every value you have already seen and where you saw it, and at each step ask whether the number that would complete the pair is already in that record.

**Constraints:** 2 <= len(nums) <= 10**4, -10**9 <= nums[i] <= 10**9, and exactly one valid answer exists.`,
			EntryPoint: "two_sum",
			Examples: []store.Example{
				{
					Input:       `nums = [2, 7, 11, 15], target = 9`,
					Output:      `[0, 1]`,
					Explanation: "nums[0] + nums[1] is 2 + 7, which is 9.",
				},
				{
					Input:       `nums = [3, 2, 4], target = 6`,
					Output:      `[1, 2]`,
					Explanation: "3 + 3 would need position 0 twice, which is not allowed. 2 + 4 is.",
				},
				{
					Input:       `nums = [3, 3], target = 6`,
					Output:      `[0, 1]`,
					Explanation: "The same value at two different positions is a valid pair.",
				},
			},
			Tests: []store.TestCase{
				{
					Name:     "the first two numbers",
					Args:     args([]int{2, 7, 11, 15}, 9),
					Expected: expect([]int{0, 1}),
				},
				{
					Name:     "skips the pair that would reuse a position",
					Args:     args([]int{3, 2, 4}, 6),
					Expected: expect([]int{1, 2}),
				},
				{
					Name:     "a repeated value is two different positions",
					Args:     args([]int{3, 3}, 6),
					Expected: expect([]int{0, 1}),
				},
				{
					Name:     "negative numbers",
					Args:     args([]int{-1, -2, -3, -4, -5}, -8),
					Expected: expect([]int{2, 4}),
				},
				{
					Name:     "zeroes at either end",
					Args:     args([]int{0, 4, 3, 0}, 0),
					Expected: expect([]int{0, 3}),
					Hidden:   true,
				},
				{
					Name:     "the answer is the last two",
					Args:     args([]int{1, 5, 11, 2, 8}, 10),
					Expected: expect([]int{3, 4}),
					Hidden:   true,
				},
			},
			StarterCode: `from typing import List


def two_sum(nums: List[int], target: int) -> List[int]:
    """Return the two positions whose values add up to target, smallest first."""
    # TODO: walk the list once, keeping {value seen: its index}. At each step
    # check whether target - value is already in there.
    return []


if __name__ == "__main__":
    print(two_sum([2, 7, 11, 15], 9))  # expected: [0, 1]
    print(two_sum([3, 2, 4], 6))  # expected: [1, 2]
`,
		},
	}
}

func addTwoNumbers() Problem {
	return Problem{
		Slug:       "add-two-numbers",
		Difficulty: "medium",
		Draft: store.ProblemDraft{
			Title:      "Add Two Numbers",
			Difficulty: "medium",
			Summary:    "Add two numbers whose digits are given least-significant first, and return the sum the same way.",
			Statement: `Two non-negative integers are given as lists of single digits stored in **reverse** order: the first element is the ones digit, the next is the tens digit, and so on. So ` + "`[2, 4, 3]`" + ` is the number 342.

Add the two numbers and return the sum in the same reversed-digit form, with no leading zeros in the number itself — which, because the list is reversed, means no *trailing* zeros in the list. The number zero is the single-element list ` + "`[0]`" + `.

> **A note on the original.** This problem is usually posed with singly linked lists. The browser runner hands your function plain JSON, so it is posed here with lists of digits instead. The work is the same: walk both inputs together, one digit at a time, carrying the overflow — and resist joining the digits into an int, because the linked-list version cannot.

**Constraints:** 1 <= len(left), len(right) <= 100, every element is 0-9, and neither list has a trailing zero unless the number is zero.`,
			EntryPoint: "add_two_numbers",
			Examples: []store.Example{
				{
					Input:       `left = [2, 4, 3], right = [5, 6, 4]`,
					Output:      `[7, 0, 8]`,
					Explanation: "342 + 465 = 807.",
				},
				{
					Input:       `left = [0], right = [0]`,
					Output:      `[0]`,
					Explanation: "Zero plus zero. The result is one digit, not an empty list.",
				},
				{
					Input:       `left = [9, 9, 9, 9, 9, 9, 9], right = [9, 9, 9, 9]`,
					Output:      `[8, 9, 9, 9, 0, 0, 0, 1]`,
					Explanation: "9999999 + 9999 = 10009998. The carry runs off the end and adds a digit.",
				},
			},
			Tests: []store.TestCase{
				{
					Name:     "342 + 465",
					Args:     args([]int{2, 4, 3}, []int{5, 6, 4}),
					Expected: expect([]int{7, 0, 8}),
				},
				{
					Name:     "zero plus zero",
					Args:     args([]int{0}, []int{0}),
					Expected: expect([]int{0}),
				},
				{
					Name:     "the carry adds a digit",
					Args:     args([]int{9, 9, 9, 9, 9, 9, 9}, []int{9, 9, 9, 9}),
					Expected: expect([]int{8, 9, 9, 9, 0, 0, 0, 1}),
				},
				{
					Name:     "5 + 5 carries into a new digit",
					Args:     args([]int{5}, []int{5}),
					Expected: expect([]int{0, 1}),
				},
				{
					Name:     "the two numbers have very different lengths",
					Args:     args([]int{1}, []int{9, 9}),
					Expected: expect([]int{0, 0, 1}),
					Hidden:   true,
				},
				{
					Name:     "no carry anywhere",
					Args:     args([]int{1, 2, 3}, []int{4, 5, 6}),
					Expected: expect([]int{5, 7, 9}),
					Hidden:   true,
				},
			},
			StarterCode: `from typing import List


def add_two_numbers(left: List[int], right: List[int]) -> List[int]:
    """Add two reversed-digit numbers and return the sum in the same form.

    left, right: digits least-significant first, so [2, 4, 3] is 342.
    """
    # TODO: walk both lists together with a carry. Remember that one list may
    # run out before the other, and that a final carry adds a digit.
    return []


if __name__ == "__main__":
    print(add_two_numbers([2, 4, 3], [5, 6, 4]))  # expected: [7, 0, 8]
    print(add_two_numbers([5], [5]))  # expected: [0, 1]
`,
		},
	}
}

func longestSubstring() Problem {
	return Problem{
		Slug:       "longest-substring-without-repeating-characters",
		Difficulty: "medium",
		Draft: store.ProblemDraft{
			Title:      "Longest Substring Without Repeating Characters",
			Difficulty: "medium",
			Summary:    "Find the length of the longest run of characters in a string with nothing repeated.",
			Statement: `Given a string ` + "`s`" + `, return the length of the longest **substring** that contains no repeated character.

A substring is a contiguous run — the characters have to be next to each other. That is what makes this different from picking out a set of distinct characters, and it is where most first attempts go wrong.

The efficient shape is a sliding window: keep a left and a right edge, push the right edge along, and whenever the character you just added is already inside the window, pull the left edge past the place it last appeared. Every character enters and leaves the window once, so the whole thing is a single pass.

**Constraints:** 0 <= len(s) <= 5 * 10**4. ` + "`s`" + ` may contain letters, digits, symbols and spaces.`,
			EntryPoint: "length_of_longest_substring",
			Examples: []store.Example{
				{
					Input:       `s = "abcabcbb"`,
					Output:      `3`,
					Explanation: `"abc" is the longest run with no repeat.`,
				},
				{
					Input:       `s = "bbbbb"`,
					Output:      `1`,
					Explanation: `Every character is the same, so the best available is a single "b".`,
				},
				{
					Input:       `s = "pwwkew"`,
					Output:      `3`,
					Explanation: `"wke" is the answer. "pwke" is not — it is a subsequence, not a substring.`,
				},
			},
			Tests: []store.TestCase{
				{Name: `"abcabcbb"`, Args: args("abcabcbb"), Expected: expect(3)},
				{Name: `"bbbbb", all the same character`, Args: args("bbbbb"), Expected: expect(1)},
				{Name: `"pwwkew", where the answer is not a prefix`, Args: args("pwwkew"), Expected: expect(3)},
				{Name: "the empty string", Args: args(""), Expected: expect(0)},
				{
					Name:     "a single space still counts as a character",
					Args:     args(" "),
					Expected: expect(1),
					Hidden:   true,
				},
				{
					Name:     `"dvdf", where the window must not jump too far left`,
					Args:     args("dvdf"),
					Expected: expect(3),
					Hidden:   true,
				},
				{
					Name:     "every character distinct",
					Args:     args("abcdefg"),
					Expected: expect(7),
					Hidden:   true,
				},
			},
			StarterCode: `def length_of_longest_substring(s: str) -> int:
    """Return the length of the longest substring of s with no repeated character."""
    # TODO: slide a window. Keep {character: the index just after its last
    # sighting} so the left edge only ever moves forward.
    return 0


if __name__ == "__main__":
    print(length_of_longest_substring("abcabcbb"))  # expected: 3
    print(length_of_longest_substring("pwwkew"))  # expected: 3
`,
		},
	}
}

func medianOfTwoSortedArrays() Problem {
	return Problem{
		Slug:       "median-of-two-sorted-arrays",
		Difficulty: "hard",
		Draft: store.ProblemDraft{
			Title:      "Median of Two Sorted Arrays",
			Difficulty: "hard",
			Summary:    "Find the median of two sorted lists combined, without paying to merge them.",
			Statement: `You are given two sorted lists of integers, ` + "`a`" + ` and ` + "`b`" + `. Return the median of all their elements taken together.

The median is the middle value once everything is in order. When the combined length is even there is no single middle, so return the average of the two middle values — which means the answer can be a half-integer, and the return type is a float.

Merging the two lists and indexing the middle is the honest first answer, and it passes every case here. The reason this problem is rated hard is the follow-up: it can be done in O(log(min(len(a), len(b)))) by binary-searching for the place to *cut* the shorter list, without ever building the merged list. Get the easy one working first, then come back for that.

**Constraints:** 0 <= len(a), len(b) <= 1000, the two are not both empty, and each list is sorted ascending.`,
			EntryPoint: "find_median_sorted_arrays",
			Examples: []store.Example{
				{
					Input:       `a = [1, 3], b = [2]`,
					Output:      `2.0`,
					Explanation: "Together they are [1, 2, 3]. The middle value is 2.",
				},
				{
					Input:       `a = [1, 2], b = [3, 4]`,
					Output:      `2.5`,
					Explanation: "Together they are [1, 2, 3, 4]. The middle two are 2 and 3, and their average is 2.5.",
				},
				{
					Input:       `a = [], b = [1]`,
					Output:      `1.0`,
					Explanation: "One of the two lists may be empty.",
				},
			},
			Tests: []store.TestCase{
				{
					Name:     "odd total length",
					Args:     args([]int{1, 3}, []int{2}),
					Expected: expect(2.0),
				},
				{
					Name:     "even total length averages the middle two",
					Args:     args([]int{1, 2}, []int{3, 4}),
					Expected: expect(2.5),
				},
				{
					Name:     "one list is empty",
					Args:     args([]int{}, []int{1}),
					Expected: expect(1.0),
				},
				{
					Name:     "empty on the left, even length on the right",
					Args:     args([]int{}, []int{2, 3}),
					Expected: expect(2.5),
				},
				{
					Name:     "every value the same",
					Args:     args([]int{0, 0}, []int{0, 0}),
					Expected: expect(0.0),
					Hidden:   true,
				},
				{
					Name:     "the lists do not interleave at all",
					Args:     args([]int{1, 2, 3}, []int{40, 50, 60}),
					Expected: expect(21.5),
					Hidden:   true,
				},
				{
					Name:     "negative values",
					Args:     args([]int{-5, -3, -1}, []int{-4, -2}),
					Expected: expect(-3.0),
					Hidden:   true,
				},
			},
			StarterCode: `from typing import List


def find_median_sorted_arrays(a: List[int], b: List[int]) -> float:
    """Return the median of a and b combined, as a float."""
    # TODO: merging both lists and taking the middle works. The O(log n)
    # version binary-searches the shorter list for where to cut it.
    return 0.0


if __name__ == "__main__":
    print(find_median_sorted_arrays([1, 3], [2]))  # expected: 2.0
    print(find_median_sorted_arrays([1, 2], [3, 4]))  # expected: 2.5
`,
		},
	}
}

func longestPalindrome() Problem {
	return Problem{
		Slug:       "longest-palindromic-substring",
		Difficulty: "medium",
		Draft: store.ProblemDraft{
			Title:      "Longest Palindromic Substring",
			Difficulty: "medium",
			Summary:    "Return the longest stretch of a string that reads the same backwards.",
			Statement: `Given a string ` + "`s`" + `, return the longest **substring** of it that is a palindrome — one that reads the same forwards and backwards.

**If two palindromes tie for longest, return the one that starts earliest.** The original problem accepts any of them; this one pins it down so the tests can check your answer exactly.

A single character is a palindrome, so a non-empty string always has an answer.

The usual approach is to expand around centres. Every position is the middle of a possible odd-length palindrome, and every gap between two positions is the middle of a possible even-length one. Walk outwards from each of those 2n-1 centres while the characters still match, and keep the best one you find.

**Constraints:** 1 <= len(s) <= 1000. ` + "`s`" + ` contains only letters and digits.`,
			EntryPoint: "longest_palindrome",
			Examples: []store.Example{
				{
					Input:       `s = "babad"`,
					Output:      `"bab"`,
					Explanation: `"aba" is also a palindrome of length 3, but "bab" starts earlier.`,
				},
				{
					Input:       `s = "cbbd"`,
					Output:      `"bb"`,
					Explanation: "The longest palindrome here has even length, so it has no single middle character.",
				},
				{
					Input:       `s = "a"`,
					Output:      `"a"`,
					Explanation: "A single character is a palindrome.",
				},
			},
			Tests: []store.TestCase{
				{
					Name:     "a tie is broken by which starts first",
					Args:     args("babad"),
					Expected: expect("bab"),
				},
				{
					Name:     "an even-length palindrome",
					Args:     args("cbbd"),
					Expected: expect("bb"),
				},
				{
					Name:     "one character",
					Args:     args("a"),
					Expected: expect("a"),
				},
				{
					Name:     "no palindrome longer than one character",
					Args:     args("ac"),
					Expected: expect("a"),
				},
				{
					Name:     "buried in the middle of a longer string",
					Args:     args("forgeeksskeegfor"),
					Expected: expect("geeksskeeg"),
					Hidden:   true,
				},
				{
					Name:     "the whole string is a palindrome",
					Args:     args("racecar"),
					Expected: expect("racecar"),
					Hidden:   true,
				},
				{
					Name:     "every character the same",
					Args:     args("aaaa"),
					Expected: expect("aaaa"),
					Hidden:   true,
				},
			},
			StarterCode: `def longest_palindrome(s: str) -> str:
    """Return the longest palindromic substring, the earliest one on a tie."""
    # TODO: for each of the 2n-1 centres, expand outwards while the characters
    # match, and keep the longest. Only replace the best on a strictly longer
    # find, so a tie keeps the earlier one.
    return ""


if __name__ == "__main__":
    print(longest_palindrome("babad"))  # expected: "bab"
    print(longest_palindrome("cbbd"))  # expected: "bb"
`,
		},
	}
}

func zigzagConversion() Problem {
	return Problem{
		Slug:       "zigzag-conversion",
		Difficulty: "medium",
		Draft: store.ProblemDraft{
			Title:      "Zigzag Conversion",
			Difficulty: "medium",
			Summary:    "Write a string in a zigzag down and up a fixed number of rows, then read it back row by row.",
			Statement: `Write the characters of ` + "`s`" + ` into ` + "`num_rows`" + ` rows in a zigzag: start at the top row and go straight down, one character per row, and when you reach the bottom row turn around and come back up — and so on until the string runs out. Then read the grid back one row at a time, top to bottom, and return the result as a single string.

For ` + "`s = \"PAYPALISHIRING\"`" + ` and ` + "`num_rows = 3`" + ` the zigzag looks like this:

` + "```" + `
P   A   H   N
A P L S I I G
Y   I   R
` + "```" + `

Reading the rows off gives ` + "`\"PAHNAPLSIIGYIR\"`" + `.

Watch the edge case: when ` + "`num_rows`" + ` is 1 there is nothing to zigzag between, and the answer is ` + "`s`" + ` unchanged. A step that flips sign at the top and bottom row handles it if you are careful; a formula that divides by ` + "`num_rows - 1`" + ` will divide by zero.

**Constraints:** 1 <= len(s) <= 1000, 1 <= num_rows <= 1000.`,
			EntryPoint: "convert",
			Examples: []store.Example{
				{
					Input:       `s = "PAYPALISHIRING", num_rows = 3`,
					Output:      `"PAHNAPLSIIGYIR"`,
					Explanation: "Row 0 is PAHN, row 1 is APLSIIG, row 2 is YIR.",
				},
				{
					Input:       `s = "PAYPALISHIRING", num_rows = 4`,
					Output:      `"PINALSIGYAHRPI"`,
					Explanation: "Four rows means a longer diagonal on the way back up.",
				},
				{
					Input:       `s = "A", num_rows = 1`,
					Output:      `"A"`,
					Explanation: "One row never turns around, so the string comes back unchanged.",
				},
			},
			Tests: []store.TestCase{
				{
					Name:     "three rows",
					Args:     args("PAYPALISHIRING", 3),
					Expected: expect("PAHNAPLSIIGYIR"),
				},
				{
					Name:     "four rows",
					Args:     args("PAYPALISHIRING", 4),
					Expected: expect("PINALSIGYAHRPI"),
				},
				{
					Name:     "a single row returns the string unchanged",
					Args:     args("A", 1),
					Expected: expect("A"),
				},
				{
					Name:     "a single row, longer string",
					Args:     args("AB", 1),
					Expected: expect("AB"),
				},
				{
					Name:     "two rows is a simple alternation",
					Args:     args("ABCD", 2),
					Expected: expect("ACBD"),
					Hidden:   true,
				},
				{
					Name:     "more rows than characters",
					Args:     args("AB", 5),
					Expected: expect("AB"),
					Hidden:   true,
				},
			},
			StarterCode: `def convert(s: str, num_rows: int) -> str:
    """Write s in a zigzag over num_rows rows, then read it back row by row."""
    # TODO: keep one buffer per row and walk s, moving the row index by +1 or
    # -1 and flipping direction at the top and bottom. num_rows == 1 never
    # flips, so handle it first.
    return ""


if __name__ == "__main__":
    print(convert("PAYPALISHIRING", 3))  # expected: "PAHNAPLSIIGYIR"
    print(convert("PAYPALISHIRING", 4))  # expected: "PINALSIGYAHRPI"
`,
		},
	}
}

func reverseInteger() Problem {
	return Problem{
		Slug:       "reverse-integer",
		Difficulty: "medium",
		Draft: store.ProblemDraft{
			Title:      "Reverse Integer",
			Difficulty: "medium",
			Summary:    "Reverse the digits of a signed integer, returning 0 if the result will not fit in 32 bits.",
			Statement: `Given a signed integer ` + "`x`" + `, reverse the order of its digits and return the result, keeping the sign. Leading zeros disappear on their own: reversing 120 gives 21, not 021.

**If the reversed value falls outside the signed 32-bit range [-2**31, 2**31 - 1], return 0.** That is the whole point of the problem. Python integers are unbounded, so nothing will overflow on you — you have to check the range deliberately, which is exactly the check you would have to get right in a language where the overflow was real.

**Constraints:** -2**31 <= x <= 2**31 - 1.`,
			EntryPoint: "reverse",
			Examples: []store.Example{
				{Input: `x = 123`, Output: `321`, Explanation: "The digits in the other order."},
				{Input: `x = -123`, Output: `-321`, Explanation: "The sign stays where it is."},
				{
					Input:       `x = 120`,
					Output:      `21`,
					Explanation: "The trailing zero becomes a leading zero, which is not written.",
				},
				{
					Input:       `x = 1534236469`,
					Output:      `0`,
					Explanation: "Reversed this is 9646324351, which is larger than 2**31 - 1, so the answer is 0.",
				},
			},
			Tests: []store.TestCase{
				{Name: "a positive number", Args: args(123), Expected: expect(321)},
				{Name: "a negative number keeps its sign", Args: args(-123), Expected: expect(-321)},
				{Name: "a trailing zero disappears", Args: args(120), Expected: expect(21)},
				{Name: "zero", Args: args(0), Expected: expect(0)},
				{
					Name:     "overflowing the positive limit returns 0",
					Args:     args(1534236469),
					Expected: expect(0),
					Hidden:   true,
				},
				{
					Name:     "overflowing the negative limit returns 0",
					Args:     args(-2147483648),
					Expected: expect(0),
					Hidden:   true,
				},
				{
					Name:     "a single digit is its own reverse",
					Args:     args(7),
					Expected: expect(7),
					Hidden:   true,
				},
			},
			StarterCode: `def reverse(x: int) -> int:
    """Reverse the digits of x, or return 0 if the result overflows 32 bits."""
    # TODO: reverse the digits of abs(x), put the sign back, then check the
    # result against [-2**31, 2**31 - 1] before returning it.
    return 0


if __name__ == "__main__":
    print(reverse(123))  # expected: 321
    print(reverse(-123))  # expected: -321
    print(reverse(1534236469))  # expected: 0
`,
		},
	}
}

func stringToInteger() Problem {
	return Problem{
		Slug:       "string-to-integer-atoi",
		Difficulty: "medium",
		Draft: store.ProblemDraft{
			Title:      "String to Integer (atoi)",
			Difficulty: "medium",
			Summary:    "Parse a leading integer out of a string the way C's atoi does, clamped to the 32-bit range.",
			Statement: `Read an integer off the front of a string, following these steps in order:

1. Skip any leading spaces.
2. Read an optional single ` + "`+`" + ` or ` + "`-`" + `.
3. Read digits until you hit something that is not a digit, or the string ends.
4. Convert what you read. If there were no digits at all, the answer is 0.
5. Clamp the result to the signed 32-bit range: anything below -2**31 becomes -2**31, and anything above 2**31 - 1 becomes 2**31 - 1.

Anything after the digits is ignored, and anything unexpected *before* them stops the parse dead — ` + "`\"words and 987\"`" + ` is 0, because the very first character is not a space, a sign or a digit.

This is a reading-comprehension problem as much as a coding one. Do not reach for ` + "`int()`" + ` inside a ` + "`try`" + `: it accepts underscores and surrounding whitespace that these rules do not, and rejects the trailing junk that these rules allow.

**Constraints:** 0 <= len(s) <= 200.`,
			EntryPoint: "my_atoi",
			Examples: []store.Example{
				{Input: `s = "42"`, Output: `42`, Explanation: "Digits from the start."},
				{Input: `s = "   -42"`, Output: `-42`, Explanation: "Leading spaces are skipped, then the sign is read."},
				{
					Input:       `s = "1337c0d3"`,
					Output:      `1337`,
					Explanation: `Reading stops at "c". Everything after it is ignored.`,
				},
				{
					Input:       `s = "words and 987"`,
					Output:      `0`,
					Explanation: "The first character is a letter, so no digits are ever read.",
				},
			},
			Tests: []store.TestCase{
				{Name: "plain digits", Args: args("42"), Expected: expect(42)},
				{Name: "leading spaces and a minus sign", Args: args("   -42"), Expected: expect(-42)},
				{Name: "stops at the first non-digit", Args: args("1337c0d3"), Expected: expect(1337)},
				{Name: "a letter before the digits means 0", Args: args("words and 987"), Expected: expect(0)},
				{Name: "the empty string", Args: args(""), Expected: expect(0)},
				{
					Name:     "below the 32-bit minimum clamps",
					Args:     args("-91283472332"),
					Expected: expect(-2147483648),
					Hidden:   true,
				},
				{
					Name:     "above the 32-bit maximum clamps",
					Args:     args("91283472332"),
					Expected: expect(2147483647),
					Hidden:   true,
				},
				{
					Name:     "a second sign ends the parse before any digit",
					Args:     args("+-12"),
					Expected: expect(0),
					Hidden:   true,
				},
				{
					Name:     "a decimal point ends the number",
					Args:     args("3.14159"),
					Expected: expect(3),
					Hidden:   true,
				},
			},
			StarterCode: `def my_atoi(s: str) -> int:
    """Parse a leading integer out of s, clamped to the signed 32-bit range."""
    # TODO: spaces, then an optional sign, then digits, then stop. Clamp to
    # [-2**31, 2**31 - 1] at the end.
    return 0


if __name__ == "__main__":
    print(my_atoi("42"))  # expected: 42
    print(my_atoi("   -42"))  # expected: -42
    print(my_atoi("words and 987"))  # expected: 0
`,
		},
	}
}

func palindromeNumber() Problem {
	return Problem{
		Slug:       "palindrome-number",
		Difficulty: "easy",
		Draft: store.ProblemDraft{
			Title:      "Palindrome Number",
			Difficulty: "easy",
			Summary:    "Decide whether an integer reads the same forwards and backwards.",
			Statement: `Given an integer ` + "`x`" + `, return ` + "`True`" + ` if it reads the same forwards and backwards, and ` + "`False`" + ` otherwise.

Two things fall out of that definition and account for most wrong answers:

- **A negative number is never a palindrome.** ` + "`-121`" + ` backwards is ` + "`121-`" + `, which is not the same thing.
- **Nor is any positive number ending in 0**, apart from 0 itself, because its reverse would have a leading zero.

Turning the number into a string makes this a two-line problem. The follow-up is to do it without: reverse only the second half of the number arithmetically and compare it to the first half, which never needs more digits than you started with.

**Constraints:** -2**31 <= x <= 2**31 - 1.`,
			EntryPoint: "is_palindrome",
			Examples: []store.Example{
				{Input: `x = 121`, Output: `True`, Explanation: "121 reversed is 121."},
				{Input: `x = -121`, Output: `False`, Explanation: "Backwards it reads 121-, which is not the same."},
				{Input: `x = 10`, Output: `False`, Explanation: "Reversed it is 01, so the two do not match."},
			},
			Tests: []store.TestCase{
				{Name: "a three-digit palindrome", Args: args(121), Expected: expect(true)},
				{Name: "negative numbers are never palindromes", Args: args(-121), Expected: expect(false)},
				{Name: "a trailing zero rules it out", Args: args(10), Expected: expect(false)},
				{Name: "zero is a palindrome", Args: args(0), Expected: expect(true)},
				{
					Name:     "an even number of digits",
					Args:     args(1221),
					Expected: expect(true),
					Hidden:   true,
				},
				{
					Name:     "nearly a palindrome",
					Args:     args(1000021),
					Expected: expect(false),
					Hidden:   true,
				},
				{
					Name:     "a single digit",
					Args:     args(7),
					Expected: expect(true),
					Hidden:   true,
				},
			},
			StarterCode: `def is_palindrome(x: int) -> bool:
    """Return True if x reads the same forwards and backwards."""
    # TODO: rule out the negatives and the trailing zeros first, then compare
    # the digits from both ends inwards.
    return False


if __name__ == "__main__":
    print(is_palindrome(121))  # expected: True
    print(is_palindrome(-121))  # expected: False
`,
		},
	}
}

func regularExpressionMatching() Problem {
	return Problem{
		Slug:       "regular-expression-matching",
		Difficulty: "hard",
		Draft: store.ProblemDraft{
			Title:      "Regular Expression Matching",
			Difficulty: "hard",
			Summary:    "Implement matching for . and * from scratch, over the whole string.",
			Statement: `Implement matching for a tiny pattern language with exactly two special characters:

- ` + "`.`" + ` matches any single character.
- ` + "`*`" + ` matches **zero or more** of the character immediately before it.

The match has to cover the **entire** string, not merely some part of it. ` + "`*`" + ` never appears first in a pattern, and never directly after another ` + "`*`" + `.

The ` + "`*`" + ` is what makes this hard. At every ` + "`x*`" + ` you have a choice: use none of it and move past the pair, or consume one character of ` + "`s`" + ` and stay where you are in the pattern. That is a branch, and a recursion over ` + "`(position in s, position in p)`" + ` explores both. Memoise on those two indices and it is fast; leave it plain and a pattern like ` + "`\"a*a*a*a*b\"`" + ` will take a very long time.

Reaching for Python's ` + "`re`" + ` module is not the exercise. Write the matcher.

**Constraints:** 0 <= len(s) <= 20, 1 <= len(p) <= 30. ` + "`s`" + ` is lowercase letters; ` + "`p`" + ` is lowercase letters, ` + "`.`" + ` and ` + "`*`" + `.`,
			EntryPoint: "is_match",
			Examples: []store.Example{
				{
					Input:       `s = "aa", p = "a"`,
					Output:      `False`,
					Explanation: `"a" matches only the first character, and the match has to cover all of s.`,
				},
				{
					Input:       `s = "aa", p = "a*"`,
					Output:      `True`,
					Explanation: `"a*" is zero or more "a", which covers "aa".`,
				},
				{
					Input:       `s = "ab", p = ".*"`,
					Output:      `True`,
					Explanation: `".*" is zero or more of any character.`,
				},
				{
					Input:       `s = "aab", p = "c*a*b"`,
					Output:      `True`,
					Explanation: `"c*" matches zero "c", "a*" matches "aa", then "b" matches "b".`,
				},
			},
			Tests: []store.TestCase{
				{Name: "a partial match is not a match", Args: args("aa", "a"), Expected: expect(false)},
				{Name: "star repeats the character before it", Args: args("aa", "a*"), Expected: expect(true)},
				{Name: "dot-star matches anything", Args: args("ab", ".*"), Expected: expect(true)},
				{Name: "a star matching zero occurrences", Args: args("aab", "c*a*b"), Expected: expect(true)},
				{
					Name:     "a pattern that nearly fits",
					Args:     args("mississippi", "mis*is*p*."),
					Expected: expect(false),
				},
				{
					Name:     "the pattern needs more than is left",
					Args:     args("ab", ".*c"),
					Expected: expect(false),
					Hidden:   true,
				},
				{
					Name:     "an empty string against a star",
					Args:     args("", ".*"),
					Expected: expect(true),
					Hidden:   true,
				},
				{
					Name:     "an empty string against a literal",
					Args:     args("", "a"),
					Expected: expect(false),
					Hidden:   true,
				},
				{
					Name:     "backtracking is required",
					Args:     args("aaa", "a*a"),
					Expected: expect(true),
					Hidden:   true,
				},
			},
			StarterCode: `from functools import lru_cache


def is_match(s: str, p: str) -> bool:
    """Return True if p matches the whole of s.

    "." is any single character; "*" is zero or more of the character before it.
    """

    @lru_cache(maxsize=None)
    def match(i: int, j: int) -> bool:
        # TODO: j past the end of p means s must be exhausted too. Otherwise
        # ask whether s[i] matches p[j], then handle p[j + 1] == "*" as the
        # choice between skipping the pair and consuming one character.
        return False

    return match(0, 0)


if __name__ == "__main__":
    print(is_match("aa", "a"))  # expected: False
    print(is_match("aa", "a*"))  # expected: True
    print(is_match("aab", "c*a*b"))  # expected: True
`,
		},
	}
}
