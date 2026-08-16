---
name: address-pr-feedback
description: "Treat the user's message as pull request feedback or a review comment, validating whether it is a real-world project issue, explaining the validity briefly, and fixing confirmed problems."
disable-model-invocation: true
---

# Address PR Feedback

Treat the user's message as PR feedback to investigate and resolve. Don't bother telling me about your progress, just do the report back step at the end, then the GitHub prompt.

## Workflow

1. **Validate with a skeptical eye**
    - Confirm whether the project could encounter the issue in a real-world use case.
    - Check actual code paths, data shapes, runtime behavior, configuration, and tests.
    - Do not accept purely theoretical issues unless they map to a plausible product scenario.
    - Do not dismiss feedback only because the current test suite misses it.

2. **State validity briefly**
    - If valid, say why the issue can happen and what user-facing or developer-facing impact it has.
    - If partially valid, name the real part and ignore the speculative part.
    - If invalid, explain why the scenario cannot occur or is already handled, then stop without unrelated code changes.

3. **Fix confirmed problems**
    - Keep the fix local until the user answers the GitHub prompt.

4. **Report back**
    - Lead with whether the feedback was valid or not.
    - Summarize the fix and verification succinctly.
    - Mention any intentionally unfixed speculative parts or residual risks.

5. **GitHub prompt (ask first)**
    Skip this step when invoked from address-all-pr-feedback — that skill asks once at the end.

    After reporting back, if this feedback maps to an unresolved GitHub review thread, ask with a question tool when available:

    - **Push and resolve** — commit the feedback fixes (not unrelated files), push the PR branch, then for each handled thread comment how it was resolved and mark the thread resolved.
    - **Keep local** — leave the code unpushed; do not comment or resolve.

    Only proceed on an explicit choice.

    Identify the PR from a URL in the message or `gh pr view` on the current branch. Fetch unresolved threads (include GraphQL `id`, which starts with `PRRT_`) and match by path, line, and comment body.

    On **Push and resolve**, for each handled thread, comment first, then resolve:

    ```sh
    gh api graphql -f query='mutation($id:ID!,$body:String!){addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$id,body:$body}){comment{id}}}' -f id=<thread-id> -f body='<how it was resolved>'
    gh api graphql -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}' -f id=<thread-id>
    ```

    The reply must say how the item was handled (fix made, or why it was rejected). Skip if there is no matching review thread. Plain discussion comments (`gh pr comment`) cannot be marked resolved. If there is nothing to push, still comment and resolve.
