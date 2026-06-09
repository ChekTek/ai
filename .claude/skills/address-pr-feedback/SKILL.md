---
name: address-pr-feedback
description: "Treat the user's message as pull request feedback or a review comment, validating whether it is a real-world project issue, explaining the validity briefly, and fixing confirmed problems."
---

# Address PR Feedback

Treat the user's message as PR feedback to investigate and resolve. Don't bother telling me about your progress, just do the report back step at the end.

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

4. **Report back**
    - Lead with whether the feedback was valid or not.
    - Summarize the fix and verification succinctly.
    - Mention any intentionally unfixed speculative parts or residual risks.
