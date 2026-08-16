---
name: address-all-pr-feedback
description: "Fetch every unresolved review thread and comment on a pull request and resolve each one using the address-pr-feedback workflow, keeping all fixes local until the user has reviewed them."
argument-hint: "[PR number or URL]"
disable-model-invocation: true
---

# Address All PR Feedback

Collect every piece of unaddressed feedback on a pull request and resolve
each item with the address-pr-feedback skill's workflow.

## 1. Fetch the PR and its feedback

Always fetch with the GitHub CLI — never a web fetch of the PR URL, which
fails on private repos:

```sh
gh pr view <number-or-url> --comments  # description, discussion, review summaries
# Inline review threads — the command above does NOT include these:
gh api graphql -f query='query($owner:String!,$repo:String!,$pr:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$pr){reviewThreads(first:100){nodes{id isResolved isOutdated path line comments(first:50){nodes{author{login} body}}}}}}}' -f owner=<owner> -f repo=<repo> -F pr=<number> --jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved | not)'
```

Check out the PR branch with `gh pr checkout <number-or-url>`. If the working
tree has unrelated local changes, stop and ask before proceeding.

## 2. Build the feedback list

One review thread = one feedback item; replies within a thread are context
for that item, not separate items. Add actionable requests from review
summaries and discussion comments. Skip resolved threads, plain approvals and
acknowledgements, and bot noise (CI status, coverage) unless it requests a
concrete change. Outdated (`isOutdated`) threads may still be valid — judge
them like any other item.

## 3. Address each item

Invoke the address-pr-feedback skill once and apply its workflow to each item
in turn, treating the item's comments — with their file/line context — as the
feedback message. Skip that skill's GitHub resolve prompt; ask once in step 5
instead. If skill invocation is unavailable, read
`../address-pr-feedback/SKILL.md` and follow it.

Per that workflow, don't narrate progress between items, and keep every fix
local — nothing is pushed while working.

## 4. Report back

One line per item — `path:line — valid / partially valid / invalid — fix made
or reason rejected` — followed by anything cross-cutting: shared root causes,
verification run, residual risks.

Do not push until the user has reviewed the changes; push to the PR branch
only after they approve.

## 5. Resolve on GitHub (ask first)

Skip the per-item GitHub resolve prompt from address-pr-feedback. After the
report, ask once whether to resolve the PR comments. Use a question tool with
**Yes** / **No** when available; otherwise ask yes or no in the report. Only
proceed on an explicit yes.

`gh` has no first-class resolve command. Resolve each handled review thread
(valid, partially valid, or invalid — the conversation is done) with its
GraphQL `id` (`PRRT_...`) from step 1:

```sh
gh api graphql -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}' -f id=<thread-id>
```

Do not resolve threads that were skipped. Plain discussion comments
(`gh pr comment`) cannot be marked resolved. Do not push.
