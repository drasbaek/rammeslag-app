---
name: review-on-mobile
description: Drive the Playwright browser MCP over all five Rammeslag screens at 390x844, screenshot each one, and check them against the design principles in AGENTS.md - no horizontal overflow, Danish user-facing copy, every stat showing its sample size. Use before marking any frontend work done, before attaching screenshots to a PR, and when reviewing a Vercel preview deployment.
---

# review-on-mobile

AGENTS.md: *"Mobile-first at 390×844. Nothing overflows horizontally, ever.
A layout that only works on a laptop is not done."*

An agent that cannot see its own layout will ship a broken one and report
success, because every test it can run will pass. This skill is the eyes.
Run it before you tick the screenshot box on a PR, and never tick that box
without having actually looked at the images.

## Setup

The `playwright` MCP server in `.mcp.json` is already pinned to a 390×844
viewport. Confirm it, do not assume it - a resized window silently
invalidates the whole review.

Pick a target:

- **local**: `npm --prefix frontend run dev` → `http://localhost:3000`
- **preview**: the Vercel deployment URL for the PR. Get it from the Vercel
  MCP server, or from the deployment comment on the PR. Prefer this: it is
  the build the reviewer will open on their phone, with real data behind it.

## The five screens

Confirm the routes against `frontend/app/` - they are authoritative, this
list is a reminder.

| # | Screen | Route | What it must survive |
|---|---|---|---|
| 1 | Ladder | `/` | the longest player name next to a four-digit rating |
| 2 | Sessions | `/sessions` | a long session note, a session with zero matches |
| 3 | Session detail | `/sessions/<id>` | four names in one match row |
| 4 | Player profile | `/players/<id>` | the rating chart, the partner stats |
| 5 | Register a match | the match form | the keyboard open, a score stepper |

For each screen, in order: navigate, wait for the data to settle, run the
automated checks below, screenshot, then look at the screenshot yourself.

## Automated checks

### 1. Horizontal overflow, and what caused it

A page-level check tells you *that* it overflows. This tells you *which
element*, which is the only version worth having. Run it with
`browser_evaluate`:

```js
() => {
  const doc = document.documentElement;
  const limit = doc.clientWidth;
  const guilty = [];
  for (const el of document.querySelectorAll("body *")) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    if (rect.right > limit + 1 || rect.left < -1) {
      guilty.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || "").toString().slice(0, 60),
        text: (el.textContent || "").trim().slice(0, 40),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
      });
    }
  }
  return {
    viewport: limit,
    scrollWidth: doc.scrollWidth,
    overflows: doc.scrollWidth > limit + 1,
    // outermost offenders first: fixing a parent usually fixes its children
    guilty: guilty.slice(0, 10),
  };
}
```

`overflows: true` is a blocking failure. Do not report the screen as done.
The usual causes, in order of frequency:

- a long name in a flex row with no `min-w-0` on the shrinking child
- a fixed-width table or `whitespace-nowrap` on something that is not a number
- an oversized numeral with letter-spacing that rounds up past the gutter
- a chart with an explicit pixel width instead of a responsive container

### 2. Stress it with the longest real name

A ladder that fits is not proof - it may only fit *today*. Before you sign
off, check screen 1 and 3 with the longest name in the fixture actually
rendered. If you cannot get that state from real data, note it in the PR as
unverified rather than assuming.

### 3. Danish copy

Every string a player reads is Danish, hardcoded. Collect the visible text
and read it:

```js
() => {
  const skip = new Set(["SCRIPT", "STYLE", "NOSCRIPT"]);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const out = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (skip.has(node.parentElement?.tagName)) continue;
    const text = node.textContent.trim();
    if (text) out.push(text);
  }
  return [...new Set(out)];
}
```

Then read the list yourself. Do not grep for a word list - "Session" and
"Rating" are Danish too. What you are hunting is the tell-tale English of a
hurried agent: `Loading…`, `No data`, `Submit`, `View all`, `Players`,
`Wins`, `Settings`, an empty state nobody translated, a date formatted
`Mar 3` instead of `3. marts`, an error string that came straight from the
API. Flag each one with the Danish replacement you propose.

Two places English hides after everyone else has been fixed: the `<title>`
in `layout.tsx`, and the PWA manifest `name` / `short_name`.

### 4. Every stat shows its sample size

AGENTS.md: *"'3-1 with Jacob' — never an unqualified claim of chemistry from
four matches."*

On the player profile and anywhere else showing a derived number, list every
stat you can see and ask of each: **can a reader tell how many matches this
came from?** A win rate of 75% is a lie of omission if it is three matches
out of four. Flag any percentage, any "best partner", any "form" claim that
appears without its `n`.

This is a judgement call, not a regex. Make it and write it down.

### 5. The cheap ones, on every screen

- **Tap targets.** Anything clickable smaller than 44×44 CSS px:

```js
() => [...document.querySelectorAll("a,button,[role=button],input,select")]
  .map((el) => ({ el: el.tagName + "." + (el.className || "").toString().slice(0, 30),
                  w: Math.round(el.getBoundingClientRect().width),
                  h: Math.round(el.getBoundingClientRect().height),
                  text: (el.textContent || "").trim().slice(0, 24) }))
  .filter((box) => box.w > 0 && (box.w < 44 || box.h < 44))
```

- **Console errors.** Read them with the MCP's console tool. A hydration
  warning on a Next.js client component usually means the layout you
  screenshotted is not the layout a real phone renders.
- **The bottom of the page.** Scroll to the end before screenshotting the
  last view. Content hidden behind a fixed bottom bar is the most common
  thing a desktop review misses, and it is where the submit button lives.

## Screenshots for the PR

One full-page screenshot per screen, named so the reviewer can tell them
apart without opening them:

```
390x844-ladder.png
390x844-sessions.png
390x844-session-detail.png
390x844-player-profile.png
390x844-register-match.png
```

Attach all five to the PR even when you only touched one. The screen you did
not touch is where the regression is.

## Report

Write this into the PR, not into the chat:

```markdown
## Reviewed at 390x844

| Screen | Overflow | Danish | Sample sizes | Notes |
|---|---|---|---|---|
| Ladder | clean | clean | n/a | |
| Sessions | clean | "Loading…" → "Henter…" | n/a | |
| Session detail | **fails** | clean | n/a | match row, 4 names, no min-w-0 |
| Player profile | clean | clean | **fails** | "72% med Jacob" has no match count |
| Register match | clean | clean | n/a | submit button under the keyboard on focus |
```

Then say plainly what you did **not** check. "I could not reach the register
screen without a PIN, so screen 5 is unverified" is a useful sentence. A
green table that quietly covers four screens out of five is not.
