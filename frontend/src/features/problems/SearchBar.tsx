/**
 * The problem search box.
 *
 * Submits to `/problems` as a GET, so a search is a shareable URL rather than
 * component state: the back button works, and a link to a search result set is
 * just a link.
 */

import { Form, useNavigation } from "react-router";
import { Button } from "@/ui/Button";
import { SearchIcon } from "@/ui/Icons";

export function SearchBar({ defaultValue = "", className = "" }: { defaultValue?: string; className?: string }) {
  const navigation = useNavigation();
  const searching = navigation.state === "loading" && navigation.location?.pathname === "/problems";

  return (
    <Form
      method="get"
      action="/problems"
      className={`flex min-w-[240px] gap-2 ${className}`.trim()}
      data-testid="search-form"
    >
      <div className="relative flex-1">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">
          <SearchIcon size={15} />
        </span>
        <input
          type="search"
          name="q"
          defaultValue={defaultValue}
          placeholder="Search problems — graphs, strings, recursion…"
          aria-label="Search problems"
          data-testid="search-input"
          className="field h-10 w-full pl-9 text-[14px]"
        />
      </div>
      <Button type="submit" variant="ghost" busy={searching}>
        Search
      </Button>
    </Form>
  );
}
