/**
 * Rendering a problem statement.
 *
 * This is the one place in the app where text written by one person is turned
 * into HTML shown to another, so it is the one place an XSS bug would matter.
 * Two rules, both enforced here rather than at the call sites:
 *
 *  1. Every string goes through `marked` and then DOMPurify. `marked` is not a
 *     sanitiser — it passes raw HTML through by design — so the purify step is
 *     what actually makes this safe.
 *  2. Nothing else in the codebase calls `dangerouslySetInnerHTML`. If a second
 *     caller ever appears, it should come through this component.
 */

import DOMPurify from "dompurify";
import { marked } from "marked";
import { useMemo } from "react";

// A deliberately small allow-list. A problem statement needs prose, code,
// lists, tables and emphasis; it does not need forms, iframes or styles.
const ALLOWED_TAGS = [
  "p", "br", "hr", "strong", "em", "del", "code", "pre", "blockquote",
  "ul", "ol", "li", "a", "h1", "h2", "h3", "h4", "h5", "h6",
  "table", "thead", "tbody", "tr", "th", "td", "sup", "sub", "img",
];

const ALLOWED_ATTR = ["href", "title", "alt", "src", "start", "colspan", "rowspan"];

marked.setOptions({
  // Newlines inside a paragraph become <br>, which is what someone typing into
  // a textarea expects.
  breaks: true,
  gfm: true,
});

/**
 * Links in user content open in a new tab and disown this page.
 *
 * `noopener` is the one that matters: without it the opened page can navigate
 * ours through `window.opener`, which is a tidy way to move someone from a
 * problem statement to a fake sign-in form.
 */
function hardenLinks(node: Element): void {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer nofollow ugc");
  }
  if (node.tagName === "IMG") {
    node.setAttribute("loading", "lazy");
    node.setAttribute("referrerpolicy", "no-referrer");
  }
}

let hookInstalled = false;

function sanitize(html: string): string {
  if (!hookInstalled) {
    DOMPurify.addHook("afterSanitizeAttributes", hardenLinks);
    hookInstalled = true;
  }
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Block every scheme but the ones a statement legitimately needs, so
    // `javascript:` and `data:` links cannot survive.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#|\/)/i,
  });
}

/** Renders trusted-by-nobody Markdown as safe HTML. */
export function Markdown({ source, className = "" }: { source: string; className?: string }) {
  const html = useMemo(() => sanitize(marked.parse(source, { async: false })), [source]);
  return (
    <div
      className={`prose-statement ${className}`.trim()}
      // Safe: `html` is the output of the sanitiser above, never raw input.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** The sanitiser on its own, for tests and for anything that needs the string. */
export function renderMarkdown(source: string): string {
  return sanitize(marked.parse(source, { async: false }));
}
