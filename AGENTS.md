<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# StraftatPresets

For implementation, debugging, review, or maintenance, read `.agents/skills/develop-straftat-presets/SKILL.md`. It defines the project workflow, architecture seams, state invariants, local/remote boundary, and completion checks.

- Work locally unless a production action is explicitly requested. Deployment, `--remote`, and scripts ending in `:remote` require separate authorization.
- Keep environment files, `.dev.vars`, `.wrangler/`, backups, credentials, tokens, logs, and user data outside commits and tool output.
- Inspect the working tree before editing. Preserve unrelated changes and stage explicit files.
