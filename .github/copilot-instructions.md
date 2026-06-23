# Context Engineering Rules

These rules apply to every chat request in this workspace.

## Before writing any code
- Search the codebase for existing patterns before inventing a new one. Mirror naming, folder structure, and conventions already in use.
- Reference exact file paths and function/component names in your plan — never vague references like "the auth file."
- Check `package.json` / `requirements.txt` for the actual library versions in use before suggesting an API.

## How to structure work
Break every feature into tasks tagged with one of:
- `CREATE` — brand new file/functionality
- `UPDATE` — modify existing logic
- `ADD` — extend an existing feature without changing its current behavior
- `REMOVE` — delete obsolete code
- `REFACTOR` — improve structure without changing behavior
- `MIRROR` — replicate an existing pattern elsewhere in the repo for consistency

List these tasks in dependency order before implementing.

## Validation
- A task is not "done" until tests pass. Run the project's test command and show the output.
- If no tests exist for the touched code, say so explicitly instead of silently skipping validation.
- Flag any assumption you had to make due to missing context, instead of guessing silently.

## Style
- Keep generated code consistent with existing formatting/lint rules in the repo (don't introduce a new style).
- Prefer small, reviewable diffs over large rewrites unless explicitly asked for a refactor.
