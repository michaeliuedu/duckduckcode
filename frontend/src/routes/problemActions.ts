/**
 * Router actions for authoring problems and keeping lists.
 *
 * Like the account forms, these return `{ error, fields }` rather than throwing
 * so a rejected field is reported beside its input.
 */

import { redirect, type ActionFunctionArgs } from "react-router";
import { ApiError, api } from "@/api/client";
import type { ProblemDraft, TestCase, Visibility } from "@/api/types";
import type { FormFailure } from "./authActions";

function asFailure(error: unknown, fallback: string): FormFailure {
  if (error instanceof ApiError) return { error: error.message, fields: error.fields };
  return { error: fallback, fields: {} };
}

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * The authoring form posts its examples and test cases as one JSON field each.
 *
 * They are repeating, nested structures; encoding them as `tests[0][args]`
 * form fields would mean writing a parser for a format nobody enjoys, when the
 * editor already holds them as objects.
 */
function json<T>(form: FormData, name: string, fallback: T): T {
  const raw = text(form, name);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function readProblemDraft(form: FormData): ProblemDraft {
  return {
    title: text(form, "title"),
    summary: text(form, "summary"),
    statement: text(form, "statement"),
    difficulty: text(form, "difficulty") || "easy",
    starterCode: text(form, "starterCode"),
    entryPoint: text(form, "entryPoint"),
    examples: json(form, "examples", []),
    tests: json<TestCase[]>(form, "tests", []),
  };
}

export async function createProblemAction({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  try {
    const { problem } = await api.createProblem(readProblemDraft(form));
    // Straight to the editor for the new problem, which is also where the
    // publish control lives.
    return redirect(`/problems/${problem.id}/edit?created=1`);
  } catch (error) {
    return asFailure(error, "Could not create the problem.");
  }
}

export async function editProblemAction({ params, request }: ActionFunctionArgs) {
  const slug = params.slug ?? "";
  const form = await request.formData();
  const intent = text(form, "intent");

  if (intent === "visibility") {
    try {
      await api.setProblemVisibility(slug, text(form, "visibility") as Visibility);
      return { saved: "visibility" as const };
    } catch (error) {
      return asFailure(error, "Could not change who can see this.");
    }
  }

  if (intent === "delete") {
    try {
      await api.deleteProblem(slug);
      return redirect("/problems?mine=1");
    } catch (error) {
      return asFailure(error, "Could not delete the problem.");
    }
  }

  try {
    await api.updateProblem(slug, readProblemDraft(form));
    return { saved: "draft" as const };
  } catch (error) {
    return asFailure(error, "Could not save the problem.");
  }
}

export type ProblemEditActionData = FormFailure | { saved: "draft" | "visibility" };

export type ListsActionData = FormFailure | { saved: "add" | "remove" | "created"; listId?: string };

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

export async function listsAction({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const intent = text(form, "intent");

  if (intent === "add" || intent === "remove") {
    // Posted by the "Add to list" menu on a problem page.
    const listId = text(form, "listId");
    const problemId = text(form, "problemId");
    try {
      if (intent === "add") await api.addToList(listId, problemId);
      else await api.removeFromList(listId, problemId);
      return { saved: intent };
    } catch (error) {
      return asFailure(error, "Could not update the list.");
    }
  }

  try {
    const { list } = await api.createList({
      title: text(form, "title"),
      description: text(form, "description"),
      visibility: (text(form, "visibility") || "private") as Visibility,
    });
    // Creating from the "Add to list" menu drops the problem straight in.
    const problemId = text(form, "problemId");
    if (problemId) {
      await api.addToList(list.id, problemId);
      return { saved: "add" as const };
    }
    // Otherwise stay put. The loader revalidates, so the new list appears in
    // place — someone setting up a term is likely to make several at once.
    return { saved: "created" as const, listId: list.id };
  } catch (error) {
    return asFailure(error, "Could not create the list.");
  }
}

export async function listAction({ params, request }: ActionFunctionArgs) {
  const id = params.id ?? "";
  const form = await request.formData();
  const intent = text(form, "intent");

  try {
    if (intent === "delete") {
      await api.deleteList(id);
      return redirect("/lists");
    }
    if (intent === "remove") {
      await api.removeFromList(id, text(form, "problemId"));
      return { saved: "remove" as const };
    }
    await api.updateList(id, {
      title: text(form, "title"),
      description: text(form, "description"),
      visibility: (text(form, "visibility") || "private") as Visibility,
    });
    return { saved: "list" as const };
  } catch (error) {
    return asFailure(error, "Could not save the list.");
  }
}
