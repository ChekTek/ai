---
name: grill-me
description: "Grill the user about a plan, decision, or idea, round by round, until every decision is settled."
argument-hint: "[plan, decision, or idea]"
disable-model-invocation: true
---

# Grill Me

Interview the user until you share an understanding of the plan. Treat it as a
tree: each decision opens the decisions that depend on it.

- Work in rounds. Each round, ask every question whose prerequisites are
  settled, then wait for answers. A question that depends on one still open
  belongs to a later round.
- Ask at most five questions per round, each with at most five options. Hold
  the rest for the next round.
- Ask in plain text in your reply, not with a question tool.
- Look up facts yourself (code, files, tools). Only decisions go to the user.
- Done when no questions remain and nothing is silently assumed. Summarize the
  decisions and do not act until the user confirms.

## Format

Follow this sample. 🟢 marks the one recommended option, listed first.

```markdown
---

**Q1** | Where should the session token live?

🟢 **A)** HttpOnly cookie — safe from XSS, needs CSRF protection
🔵 **B)** In memory — simplest, lost on reload
🔵 **C)** localStorage — persists, readable by any injected script

---

**Q2** | How long should a session last?

🟢 **A)** 7 days, sliding — fewer logins, longer exposure if stolen
🔵 **B)** 24 hours, fixed — tighter, daily re-login

---
```
