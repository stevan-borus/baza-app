# Campaigns are admin-composed and admin-sent, not cron-automated

We considered automating Campaigns to lapsed / idle-package Clients in a cron (the obvious instinct, since the segments are machine-computable and we already have `cron:package-expiry` doing exactly this kind of scheduled find-and-notify). We rejected pure-cron auto-send: a Campaign's value is an **admin-composed message** carrying a specific offer/wording/deadline that a machine can't invent, so a cron version degrades into another fixed-text reminder rather than a Campaign. Instead the machine computes the audience **on demand** and surfaces a live match count while the admin composes; the admin writes the message and decides whether/when to send (hybrid B+C).

## Considered Options

- **(A) Pure cron** — predicate picks audience, fixed i18n template, schedule sends. Rejected: that's a system reminder, not a Campaign. Still available later as a *separate* concept if set-and-forget churn nudges are ever wanted.

  Note: a **scheduled** Campaign (admin writes it, picks a future send time, a cron fires it) does **not** violate this decision — the cron only *dispatches* content a human authored, it never *invents* the message. The forbidden thing is the machine choosing the words, not the machine choosing the clock.
- **(B) Admin campaign** — admin picks axes, types the message, hits send. Chosen.
- **(C) Suggested audience** — machine computes the segment and shows a live match count to the admin during compose. Adopted as an ergonomic layer on top of B.

## Consequences

- "Expiring soon" as a Campaign axis overlaps the automated `cron:package-expiry` reminder. Accepted, not deduped — they are different messages (system nudge vs. marketing offer). Documented in CONTEXT.md so it isn't filed as a bug.
