# The learning loop

Nick's addition, 2026-08-27: the Agent should learn continuously from every
user, so that it connects its own suggestions to what people actually thought
of them. Suggest an area, the user visits, they rate it 1/10 — the system
should take that seriously, and take it into account for people whose
profiles look like theirs.

This is the part of the Agent that **compounds**. Every other signal in
`data-sources.md` is public data a competitor can also download. Verdicts
are not: they accumulate only by having users, they get better with volume,
and nobody can start from scratch and catch up. It is the strongest claim
Maloca has to being real IP rather than a nicely-packaged model.

It also completes the anchor-and-expand idea. The plan already says that not
being able to verify a suggestion is a feature — send them to visit and let
them decide. The verdict they bring back is what closes that circle.

## Two levels, and only one of them works early

**Level 1 — learn this person.** Immediately useful, works with one user.
Someone rates a suggestion 2/10; the system knows which features drove that
suggestion, and can downweight them for that person. Effectively a
correction to their own weights, and it should visibly change what they see
next. This is what to build first.

**Level 2 — learn across people.** The real prize, and useless until there
is volume. "People whose anchor and priorities resemble yours also rated
Nunhead highly." This is what turns verdicts into a moat, but with a handful
of households it produces noise dressed up as insight.

**Do not build Level 2 first.** With few users it cannot work, and worse, it
will appear to work — small numbers always produce a pattern. Level 1 pays
off from day one and the data it collects is exactly what Level 2 later
needs, so nothing is wasted by waiting.

## A number alone is nearly useless

A 1/10 is ambiguous. It might mean the area was dead, or that it rained, or
the coffee was bad, or the flat they viewed was grim, or they had a row on
the way. None of that is about the area, and a bare score cannot tell them
apart.

So the verdict must capture **why**, in a form the system can act on: a
short set of reasons that map onto features we actually hold — *too quiet,
too busy, felt unsafe, nothing open, too expensive, too far, loved the high
street, wrong crowd* — plus free text for everything else. "Too quiet" is
learnable because it points at a specific signal. "2/10" is not.

Capture the ratings honestly, too: how confident the person is, and whether
they actually went. A verdict from someone who visited on a wet Tuesday
morning is weaker evidence than one from a Saturday afternoon, and the
system should know the difference rather than treating all verdicts alike.

## The interaction — and the participation problem

Nick's design, 2026-08-27: the user taps a suggested area card, scores it
0–10, and a button lets them say why. He also flagged the hard part — **that
getting people to actually do it might be tricky.** It is, and it is the
thing that decides whether any of this works.

**The framing that makes it work: the rating is not a favour to us.** An
explicit "rate this to help us improve" prompt will get very low response,
because nobody fills in surveys for apps. But house-hunters already want to
keep track of what they thought of places and compare notes — Nick and
Harriet did exactly that manually. So the score has to *be* their record of
the hunt, the thing they open to remember whether they liked Nunhead, and
the learning is a by-product of them using the app for their own reasons. If
it ever reads as data collection, it dies.

Design decisions that follow from that:

- **Prompt at the moment they've been**, not later. The app can often tell —
  a viewing booked in that area, or a calendar entry. A Saturday-evening
  nudge asking what they made of somewhere they went that day is a fair
  question; an undated backlog of unrated cards is a chore.
- **One tap is the whole ask.** The score alone must be a complete, valid
  answer. The "why" is a second, optional step — as Nick has it. Requiring
  the reason would collapse the response rate.
- **Only prompt for "why" at the extremes.** Nick's instinct here is right:
  ask on 0–2 and 9–10. That is where the information actually is — a 6 says
  very little, a 0 says a great deal — and it means the extra step is rare
  enough to feel worth doing.
- **Reasons are chips, not typing.** Multi-select taps, with free text
  underneath for anyone who wants it. Typing a paragraph on a phone after a
  day out is a big ask.
- **The score is a slider** (Nick's call, 2026-08-27) — eleven separate tap
  targets is too fiddly for a thumb. Two things it must get right: it starts
  **unset**, with no handle resting on a default, because a slider parked at
  5 records an opinion nobody gave and would quietly poison the data; and the
  drag target needs to be tall enough to grab without precision, showing the
  number as it moves.
- **Pay it back immediately.** The moment they score something, the
  suggestions should visibly shift — *"noted, here are two more like the ones
  you rated highly."* Rating then feels like steering rather than filling in
  a form, and it is the single strongest reason to do it again.
- **Let them say they haven't been.** A card needs a "not yet" state and a
  distinction between *been recently*, *know it already* and *just a guess*.
  Without that, guesses pollute the data — and a guess is exactly the
  model-recall problem this whole plan exists to escape.
- **Two people is an advantage.** This is a household app. "Harriet gave it
  8, you gave it 4" is interesting in itself, and each partner rating
  prompts the other. A single-user app has no equivalent pull.

**A reassurance on volume.** Level 1 — learning an individual's own weights —
needs only that person's handful of ratings, so a user who scores five areas
gets a better experience immediately, whatever anyone else does. Low
participation across the base does not block that; it only delays Level 2.
And house-hunting is unusually high-involvement — people are choosing where
to live — so engagement should run well above a typical consumer app. It is
still the assumption most worth testing early with real users.

## Traps this must avoid

**The filter bubble.** If the system only ever learns from areas it
suggested, it never learns anything about the areas it never suggests. A
place wrongly scored low stays unsuggested forever and never gets the chance
to be corrected. The fix is to deliberately include a wildcard in each set
of suggestions — something the model is genuinely unsure about — and to be
honest with the user that it is a punt. That also happens to be a good
experience: one surprise among the safe bets.

**Small numbers lie.** Three people disliking an area is not evidence about
that area. Require a real threshold before a shared verdict influences
anyone else, and say when confidence is low rather than hiding it.

**Confounding with the property.** People will rate an area badly because
the flat they saw was awful. Ask about the area and the property separately,
or the signal is polluted from the start.

**Entrenching segregation — the serious one.** Learning "people like you
liked X" can encode class and race, because in London where people live
already correlates with both. A system that learns which profiles avoid
which areas, and then stops suggesting those areas to those profiles, will
quietly reinforce the segregation it observed — and it will look like it is
working while it does so. This is a real risk, not a hypothetical.

Mitigations, all of which need to be deliberate:

- Similarity between people is defined by their *stated preferences and
  their anchor*, never by demographic attributes.
- Never let a verdict-derived signal exclude an area outright — it adjusts
  ranking, it does not filter.
- Keep the wildcard slot, which structurally guarantees suggestions outside
  the learned pattern.
- Audit periodically: if the system is steering identifiable groups away
  from identifiable areas, that must be visible to us and fixable.

**Privacy.** Verdicts are personal data tied to an identifiable household
and their movements. They must be aggregated before informing anyone else's
suggestions, never exposed individually, and covered explicitly in the
privacy policy. This is a change to what the app collects, so it needs
saying out loud rather than being slipped in.

## Where it sits

Phase 5 in the plan (`~/.claude/plans/look-into-my-code-pure-cerf.md`) —
after similarity works. It cannot come earlier: there is nothing to learn
from until the Agent is making suggestions worth reacting to. Level 1 is a
sensible first slice; Level 2 waits for volume.

The one thing worth doing *early*, well before Phase 5, is **starting to
collect verdicts**. The data only accumulates in real time, so the sooner
the app asks "did you go, and what did you think?", the sooner the loop has
something to work with. Collecting is cheap; learning can come later.

## Status — collecting is BUILT (30 Aug 2026)

The collecting half exists and nothing learns from it yet, which is the
order this document argued for.

**What is live.** `PickDetailCard` is now the verdict card: a `ScoreSlider`
that starts unset, a basis (been / know it / guessing), reason chips at
0–2 and 9–10 only, an optional free-text note, and a line of payback the
moment a score lands. `SelectedAreaCard` and the Top Picks list set a
score through `recordQuickScore` — the same store, so an area cannot show
two different numbers.

**Where it lives.** `lib/verdicts.ts` is the model and the vocabulary;
`lib/verdictSync.ts` reads and writes `users/{uid}/verdicts` or
`households/{hid}/verdicts`; `store/verdictsStore.ts` holds them;
`hooks/useVerdict.ts` drives one card. Loaded on sign-in alongside the
profile, cleared on sign-out.

**Every reason names its dimensions.** Each chip in the vocabulary lists
the `AreaFeatures` dimensions it points at, so Level 1 can move the right
weights rather than inferring which. A test walks the whole vocabulary
against `DIMENSIONS`, because a typo would produce a chip that looks
learnable and teaches nothing.

**Two reasons name nothing, on purpose.** "Didn't feel safe" and "out of
our price range" carry `targets: ['none']` and a quiet marker in the UI.
We hold no data for either. They stay on offer because removing them would
train people to only say things we can already measure, and because their
frequency is the argument for going and finding those datasets.

**Provenance travels with the verdict.** Each record stores the score,
reason and confidence the app claimed when it suggested the area. The
ranking moves as preferences move, so by the time anything learns from a
verdict, why that area was ever shown would otherwise be unrecoverable.

### Still to do, in the order it matters

1. **The wildcard slot.** This document calls it non-optional and it is
   NOT built. Without it the system only ever collects verdicts on areas
   it already suggests, and an area wrongly scored low can never be
   corrected. It belongs in the ranking, not here — but it has to exist
   before the learning does, or the filter bubble is baked in from the
   first day of data.
2. **Prompt at the moment they've been.** Verdicts today are given only
   when someone opens a card of their own accord. The nudge this document
   describes — a Saturday-evening "what did you make of Nunhead?" — needs
   a trigger the app can honestly detect, and probably notifications.
3. **Ask about the area and the property separately**, once viewings
   exist. Right now there is nothing to confound it with, because there
   are no property records on mobile yet.
4. **The privacy policy.** It now covers the waiting list but NOT
   verdicts. It must say that we record which areas a household visited
   and what they thought, before this reaches anyone outside Nick and
   Harriet.
5. **Level 1 learning**, and only then Level 2 — with the segregation
   mitigations in this document treated as build requirements, not
   aspirations.
