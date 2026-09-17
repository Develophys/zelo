---
name: zelo-verify-before-reporting
description: Use when writing a report, review finding, or "gap worth flagging" about existing code, before stating any claim about what a file does or doesn't do.
---

# Zelo Verify Before Reporting

## The rule

Never state that existing code lacks a convention, option, or behavior without pasting the exact
line(s) you read that prove it. A claim about what code does or doesn't do is either backed by a
`Read` or a `grep` you actually ran in this task, or it doesn't get stated at all.

**Violating the letter of this rule is violating the spirit of it.** "I'm confident from the
pattern" is not verification — it's the exact failure this skill exists to stop.

## Why this exists

Measured directly: three agents independently confirmed the same existing screen already
satisfied a task and correctly declined to duplicate it. One of the three then added, with equal
confidence and no hedge, a specific false claim about that screen — that its forms omitted
`mode: "onBlur"`. A direct read of the file showed both forms already had it. The other two
claims in the same report were accurate; the fabricated one was indistinguishable from them by
tone. A reader acting on the report would go looking for a bug that does not exist.

## Rationalization table

| Excuse | Reality |
|---|---|
| "This is the kind of code that usually misses X" | A pattern in similar files is not this file. Read this file. |
| "I already read a file like this one earlier in the task" | A similar file is not evidence about a different file. |
| "It's a minor detail, not worth re-checking" | A wrong claim in an otherwise-accurate report costs more than the check. |
| "I'm confident, so I don't need the quote" | Confidence is not evidence. The quote is the deliverable. |

## Red flags — stop and verify

- "probably", "likely", "typically" applied to a specific file's behavior.
- A claim about a file you haven't opened in this task.
- A gap or deficiency stated without a line number or grep result attached.

**All of these mean: open the file or run the grep before writing the sentence.**
