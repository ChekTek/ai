---
name: retro
description: "Review the current session and suggest changes to the agent's environment so the next run goes better."
disable-model-invocation: true
---

# Retro

Review the current session and agent environment. Find what slowed the agent down or caused a
mistake. Suggest only; change nothing until the user picks.

- **Navigation:** the agent was slow to find a file or fact. Add a pointer to
  an existing doc before writing a new one.
- **Checks:** a lint, type, or test check would have caught the mistake. Read
  the repo's check scripts and CI first: a check that exists but is unwired or
  broken is the finding. A repo with no pre-commit hook or CI check is one too.
- **Standards:** review missed a mistake. A mechanical rule (fixed pattern,
  banned API, file location) becomes a lint rule, hook, or CI job. Only
  judgement calls become written rules, enforced at review, not implementation.
- **AGENTS.md:** it is large, in the repo or globally. Every agent loads it, so
  keep it to pointers. Move rules to checks or review standards, and delete
  instructions that change nothing.
- **Tool cost:** a tool call or custom tool (CLI, MCP) spent many tokens.
  Streamline it.
- **Information:** a needed fact was out of reach. Give access: tee dev server
  logs, read-only access to outside services.

Report the candidates, worst first. For each, give what happened in the session
and the change that prevents it.
