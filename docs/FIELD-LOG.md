# Field log

U6 asks for ten evenings in a household that is not the maintainer's, **with
what broke written down**. The writing-down is not a formality attached to the
gate — it is the gate. Ten evenings with no record produces "it was fine",
which is unauditable and which nobody outside this repository has any reason to
believe.

This file is where those evenings go. It is empty, and that is the honest
current state of U6.

## How to use it

One entry per evening, written the same night or not at all — a week later
produces a summary, and a summary is where the useful detail goes to die.

Copy the template. Fill in what happened. **Do not tidy it up.** The value is in
the parts that sound trivial or embarrassing; a log that only records real bugs
has already thrown away the finding.

### What counts

Everything below is worth an entry, and the first three are the ones that get
skipped:

- **Somebody hesitated.** A pause before a tap is a design defect that has not
  been named yet. Write what they were looking at.
- **Somebody asked a question.** If the screen had answered it, they would not
  have asked. Write the question in their words, not the answer you gave.
- **Somebody did it the slow way.** Typed a code that could have been scanned,
  swiped when they could have pressed. The fast path exists and did not get
  used, which is a fact about the fast path.
- Something was wrong on screen, or too slow, or in the wrong order.
- A film was in the deck that should not have been, or missing when it should
  not have been.
- Anybody said any version of "it's doing the thing again".

### What does not count

- Your own opinions about the design. You are not the household; that is the
  entire point of U6.
- Anything you fixed during the evening. Write it here first, then fix it.

## Template

```
### Evening N — YYYY-MM-DD

Who:        how many people, and whether anybody was new to it
Scope:      Jellyfin only / Any Movie
Picked:     what won, and roughly how long it took
Restarts:   did the server restart or the deploy run mid-night

What broke:
- 

What somebody asked:
- 

What somebody did the slow way:
- 

What they said afterwards, unprompted:
- 
```

## The evenings

*None yet.* U6 has never been attempted, and this file says so rather than
implying a log that exists somewhere else.
