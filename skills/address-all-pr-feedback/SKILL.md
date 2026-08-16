---
name: address-all-pr-feedback
description: "Fetch every unresolved review thread and comment on a pull request and resolve each one using the address-pr-feedback workflow, keeping all fixes local until the user has reviewed them."
argument-hint: "[PR number or URL]"
disable-model-invocation: true
---

# Address All PR Feedback

Collect unaddressed PR feedback and run each item through the address-pr-feedback workflow.

## 1. Fetch the PR and its feedback

Always `gh` — never a web fetch of the PR URL (fails on private repos):

```sh
gh pr view <number-or-url> --comments  # description, discussion, review summaries
# Inline review threads — the command above does NOT include these:
gh api graphql -f query='query($owner:String!,$repo:String!,$pr:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$pr){reviewThreads(first:100){nodes{id isResolved isOutdated path line comments(first:50){nodes{author{login} body}}}}}}}' -f owner=<owner> -f repo=<repo> -F pr=<number> --jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved | not)'
```

`gh pr checkout <number-or-url>`. If the working tree has unrelated local changes, stop and ask.

## 2. Build the feedback list

One review thread = one item; replies are context. Add actionable requests from review summaries and discussion. Skip resolved threads, plain approvals, and bot noise unless it asks for a concrete change. Outdated threads may still be valid.

## 3. Address each item

Apply address-pr-feedback to each item (file/line + comments as the feedback). Skip that skill's GitHub resolve prompt; ask once in step 5. If the skill is not loaded, read `../address-pr-feedback/SKILL.md`.

Don't narrate between items. Keep every fix local.

## 4. Report back

One line per item — `path:line — valid / partially valid / invalid — fix made or reason rejected` — then cross-cutting notes (shared causes, verification, residual risks).

Do not push until the user has reviewed; push only after they approve.

## 5. Resolve on GitHub (ask first)

After the report, ask once whether to resolve the PR comments (Yes/No). On yes, resolve each handled thread from step 1 with the GraphQL mutation in address-pr-feedback. Do not resolve skipped threads. Discussion comments cannot be marked resolved. Do not push.
