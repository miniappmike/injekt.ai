# Claude instructions

Also follow `AGENTS.md` (read `docs/HANDOFF.md` first, update it before you finish).

## Read only what the task needs

Read only the context a task needs. Open the files, docs and sections that bear on it and skip the rest. Search for the
right file instead of reading whole directories, and read part of a large file (`docs/HANDOFF.md` past "Current state",
`PROGRESS.md`, long components) unless the task needs all of it.

## Skills come from the Alyn MCP

For specialised work (design, writing, documents, testing, debugging, review, research, security and similar), use the
Alyn MCP to choose skills: call `find_skills` with a sentence about the task, then `load_skill` for the best match.
Load at most two or three. Skip Alyn only when it is already being used automatically in the session, or when the
project's own skills or instructions already cover the task. Pass skills the project already has as `exclude`.
