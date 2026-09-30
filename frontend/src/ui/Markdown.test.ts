// DOMPurify sanitises by parsing into a real DOM, so this file needs one.
// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./Markdown";

// Problem statements are written by one member and rendered for another, so
// this is the boundary that has to hold. Each case is an attack that has
// worked against a naive markdown pipeline at some point.
describe("renderMarkdown sanitises", () => {
  const attacks: Record<string, string> = {
    "script tag": "<script>alert(1)</script>",
    "img onerror": '<img src=x onerror="alert(1)">',
    "svg onload": '<svg onload="alert(1)"></svg>',
    "javascript: link": "[click me](javascript:alert(1))",
    "data: link": "[click me](data:text/html,<script>alert(1)</script>)",
    iframe: '<iframe src="https://evil.example"></iframe>',
    "inline event handler": '<a href="#" onclick="alert(1)">x</a>',
    "style tag": "<style>body{display:none}</style>",
    form: '<form action="https://evil.example"><input name="password"></form>',
    "object tag": '<object data="evil.swf"></object>',
  };

  for (const [name, source] of Object.entries(attacks)) {
    it(`removes a ${name}`, () => {
      const html = renderMarkdown(source);
      expect(html).not.toMatch(/<script/i);
      expect(html).not.toMatch(/onerror=/i);
      expect(html).not.toMatch(/onload=/i);
      expect(html).not.toMatch(/onclick=/i);
      expect(html).not.toMatch(/javascript:/i);
      expect(html).not.toMatch(/<iframe/i);
      expect(html).not.toMatch(/<style/i);
      expect(html).not.toMatch(/<form/i);
      expect(html).not.toMatch(/<object/i);
      expect(html).not.toMatch(/data:text\/html/i);
    });
  }
});

describe("renderMarkdown keeps what a statement needs", () => {
  it("renders emphasis, code and lists", () => {
    const html = renderMarkdown("**bold** and `code`\n\n- one\n- two");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain("<li>one</li>");
  });

  it("renders fenced code blocks", () => {
    expect(renderMarkdown("```\nprint(1)\n```")).toContain("<pre>");
  });

  it("renders tables", () => {
    const html = renderMarkdown("| a | b |\n| - | - |\n| 1 | 2 |");
    expect(html).toContain("<table>");
    expect(html).toContain("<td>1</td>");
  });

  it("keeps ordinary links but disowns this page", () => {
    const html = renderMarkdown("[docs](https://example.edu/docs)");
    expect(html).toContain('href="https://example.edu/docs"');
    expect(html).toContain('rel="noopener noreferrer nofollow ugc"');
    expect(html).toContain('target="_blank"');
  });

  it("keeps relative and mailto links", () => {
    expect(renderMarkdown("[here](/problems/two-sum)")).toContain('href="/problems/two-sum"');
    expect(renderMarkdown("[mail](mailto:ta@example.edu)")).toContain("mailto:ta@example.edu");
  });

  it("escapes text that looks like a tag", () => {
    expect(renderMarkdown("use <b> carefully")).not.toContain("<b>");
  });
});
