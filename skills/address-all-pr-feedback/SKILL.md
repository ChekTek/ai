---
name: address-all-pr-feedback
description: "Fetch every unresolved review thread and comment on a pull request and resolve each one using the address-pr-feedback workflow, keeping all fixes local until the user chooses to push and resolve."
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

One review thread = one item; replies are context, not proof. Add actionable requests from review summaries and discussion. Skip resolved threads, plain approvals, and bot noise unless it asks for a concrete change. Outdated threads may still be valid.

## 3. Address each item

Apply address-pr-feedback to each item (file/line + comments as the feedback). Validate each item independently and do not change code unless it represents a plausible real-world issue. Skip that skill's GitHub prompt; ask once in step 5. If the skill is not loaded, read `../address-pr-feedback/SKILL.md`.

Don't narrate between items. Keep every fix local until the prompt.

## 4. Report back

One line per item — `path:line — valid / partially valid / invalid — fix made or reason rejected` — then cross-cutting notes (shared causes, verification, residual risks).

## 5. GitHub prompt (ask first)

After the report, ask once with a question tool when available:

- **Push and resolve** — commit the feedback fixes (not unrelated files), push the PR branch, then for each handled thread comment how it was resolved and mark the thread resolved.
- **Keep local** — leave the code unpushed; do not comment or resolve.

Only proceed on an explicit choice. Do not resolve skipped threads. Discussion comments cannot be marked resolved.

On **Push and resolve**, comment first, then resolve, using the GraphQL mutations in address-pr-feedback and each handled thread's `id` from step 1. The reply must say how that item was handled. If there is nothing to push, still comment and resolve.
