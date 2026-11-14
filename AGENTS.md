## Read this first

`docs/HANDOFF.md` is this project's memory between sessions. Read its "Current state" section before you start, and
update it in the same commit as your work before you finish: what changed, what was decided, what is next. Replace
lines that are no longer true instead of adding to the end. `README.md` lists the other docs.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
