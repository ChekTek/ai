---
name: wizard
description: "Generate an interactive bash wizard that walks the user through steps only a human can perform: dashboards, credentials, CI secrets, one-off migrations."
argument-hint: "[procedure to walk through]"
disable-model-invocation: true
---

# Wizard

Write a bash script that walks the user through a manual procedure one stage at
a time: it opens each URL, says what to click and copy, captures the values, and
writes them where they belong. Perform any step you can do yourself instead of
scripting it.

[template.sh](template.sh) supplies the helpers. Copy it and edit only below the
`STAGES` marker.

## 1. Scope

Read the repo before asking: env files, README, compose and framework config,
and every `secrets.*` and `vars.*` reference in `.github/workflows`. For a
migration, find the current state, the target state, and the irreversible
actions between them.

For each stage, know the exact path a human follows: the URL, what to do there,
and where the value appears. For each captured value, know where it is written
and whether it is secret. When unsure of a UI or command, check the docs or ask;
never invent steps.

Show the user the ordered stages and the values each produces. Let them add,
drop, or reorder before you write anything.

## 2. Write

Save to a scratch path unless the user wants the wizard kept in the repo. Give
each stage one focused task, in dependency order.

| Helper | Effect |
| --- | --- |
| `stage "Title"` | Waits for Enter, clears the screen, shows progress. Call unindented: these lines are counted for the total. |
| `step "Text"` | Prints a numbered instruction. |
| `open_url URL` | Prints the URL and opens it in the browser. |
| `ask VAR "Prompt"` | Reads a required value into `VAR`. |
| `ask_secret VAR "Prompt"` | Same, with hidden input. |
| `write_env KEY "$VAR"` | Upserts `KEY` in `$ENV_FILE` (default `.env`). |
| `set_secret NAME "$VAR"` | Sets a GitHub Actions secret with `gh`. |
| `set_var NAME "$VAR"` | Sets a GitHub Actions variable with `gh`. |
| `confirm "Question"` | Stops the wizard unless the answer is yes. |

- Open the URL before asking for its value.
- Use `ask_secret` for anything secret, and `set_secret` only for values CI reads.
- `confirm` before every irreversible action.
- Make sure the env file is gitignored before the wizard writes to it.
- Keep the `gh auth status` check only when a stage writes to GitHub.

## 3. Verify

Run `bash -n`, `shellcheck` if installed, and `chmod +x`. Do not run the wizard:
it opens browsers and blocks on input. Instead trace that every value from
scoping is captured and written where planned, and that every `set_secret` name
matches its `secrets.*` reference. Then tell the user how to run it.
