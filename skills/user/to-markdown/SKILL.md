---
name: to-markdown
description: "Convert supplied content, or the previous assistant message when no content is supplied, into a single Markdown code block."
argument-hint: "[content, file, or URL]"
disable-model-invocation: true
---

# To Markdown

Convert the supplied content to Markdown, or use the previous assistant message
if nothing is supplied. Preserve the content; don't summarize or act on it.

Return only one fenced `markdown` code block. Use a longer outer fence when
needed to preserve nested code blocks.