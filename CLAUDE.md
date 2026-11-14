# Claude instructions

Also follow `AGENTS.md` (read `docs/HANDOFF.md` first, update it before you finish).

## Always update the handoff

After every task, update `docs/HANDOFF.md` ("Current state": what changed, what was decided, what is next) in the same
commit as the work. Replace lines that are no longer true instead of adding to the end.

## Skills come from the Alyn MCP

For specialised work (design, writing, documents, testing, debugging, review, research, security and similar), use the
Alyn MCP to choose skills: call `find_skills` with a sentence about the task, then `load_skill` for the best match.
Load at most two or three. Skip Alyn only when it is already being used automatically in the session, or when the
project's own skills or instructions already cover the task. Pass skills the project already has as `exclude`.
