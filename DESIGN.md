# Swaggrr — Design Decisions

This document records every significant architectural decision made during the
creation of this extension. Each section answers three questions:

1. **What** was chosen.
2. **Why** it was chosen over the obvious alternatives.
3. **Trade-offs** accepted.

---

## 1. Extension type: Chrome MV3 content script

**What:** A Chrome Extension using Manifest V3, distributed as an unpacked
folder (or eventually via the Chrome Web Store).

**Why over alternatives:**

- *Userscript (Tampermonkey / Violentmonkey)*: Userscripts require the user to
  install a separate extension first, then install the script. They also have
  no auto-update path outside of GreasyFork. A Chrome Extension has a first-
  class install flow and is self-contained.
- *Manifest V2*: Chrome has deprecated MV2. Extensions using it will stop
  working in Chrome stable in 2025. Starting on MV3 avoids a forced migration.
- *Browser extension (Firefox WebExtension)*: The code is compatible with
  Firefox's WebExtension API, but the `<all_urls>` match and MV3 manifest are
  the same syntax. A Firefox port is a low-friction future step.

**Trade-offs:** Chrome-only by default (Edge works too, since it's Chromium).
A Firefox port requires a separate submission but minimal code changes.

---

## 2. Language: vanilla JavaScript, no build tooling

**What:** Plain `.js` files with no npm, no bundler, no transpiler.

**Why over alternatives:**

- *React / Vue / Svelte*: A UI framework would add a mandatory build step
  (`npm run build`). For a ~400-line content script with no component tree,
  that's pure overhead. Frameworks also introduce supply-chain risk via
  `node_modules`.
- *TypeScript*: Would catch type errors but requires `tsc` or a bundler. The
  marginal benefit for a file this size doesn't justify the added setup.
  Anyone who wants types can add a `// @ts-check` pragma and JSDoc annotations.
- *ES modules in content scripts*: Chrome content scripts cannot use native
  `import`/`export` without a bundler that produces a single IIFE. Since we
  want zero build tooling, a single IIFE is the right shape.

**Trade-offs:** No static type safety. Mitigated by keeping the file small and
straightforward.

---

## 3. Single IIFE in content.js

**What:** The entire content script is one immediately-invoked function
expression: `(() => { ... })();`.

**Why:** Content scripts share the global scope with the page's own JavaScript
in older browsers; in modern Chrome they run in an isolated world, but the IIFE
is still the idiomatic pattern that:

- Prevents any accidental global leakage.
- Makes the module boundary explicit to any reader.
- Works without a bundler (ES modules require one for content scripts).

**Trade-offs:** Everything lives in one file. For this extension's scope that's
fine — splitting would require a bundler.

---

## 4. `<all_urls>` content script match

**What:** The manifest declares `"matches": ["*://*/*"]`, injecting the
content script into every http and https page.

**Why:** Swagger UI runs on:

- Public domains (`petstore.swagger.io`, `api.example.com/docs`)
- Internal IP addresses (`192.168.1.1/swagger-ui`)
- `localhost` on arbitrary ports
- Arbitrary URL paths (`/api/v1/swagger`, `/docs`, `/swagger-ui/index.html`)

It is impossible to enumerate these patterns ahead of time. The broadest
practical match is needed.

**Why `*://*/*` and not `<all_urls>`:** `<all_urls>` also matches `file://`
and `chrome-extension://` pages, where Swagger UI never runs. Narrowing to
`*://*/*` (http + https only) reduces the injection footprint with no
functional cost.

**Why this is acceptable:** The content script's very first action is:

```js
const existing = document.getElementById('swagger-ui');
if (existing) { init(existing); } else { /* watch for it */ }
```

On any page without `#swagger-ui`, the MutationObserver is set up but
disconnects itself 10 seconds after the page's `load` event. No DOM data is
read, no network requests are made. The footprint on non-Swagger pages is a
single `getElementById` call followed by a short-lived observer.

**Trade-offs:** Chrome will show `*://*/*` as "Read and change all your data
on websites" in the install prompt. This is unavoidable given the use case.
The narrow in-code guard (`getElementById('swagger-ui')`) means no meaningful
access occurs on non-Swagger pages despite the broad match.

---

## 5. Two-stage MutationObserver for initialisation

**What:** If `#swagger-ui` doesn't exist at `document_idle`, a
`MutationObserver` watches `document.body` for it to appear, then calls
`init()` and disconnects itself.

**Why:** Swagger UI is a React application. Many frameworks that embed it
(FastAPI `/docs`, Spring Boot `/swagger-ui/`, Redoc) render the React tree
asynchronously after the browser fires the `DOMContentLoaded` event. The
`document_idle` run-time in the manifest fires after `DOMContentLoaded`, but
before React finishes rendering. Without the observer, the extension would
silently fail on every SPA-hosted Swagger doc.

**Why not polling (`setInterval`):** Polling wastes CPU on every page, fires
even when Swagger hasn't appeared, and has unpredictable latency. A
`MutationObserver` fires exactly when the DOM changes.

**Trade-offs:** A second `MutationObserver` (watching `swaggerRoot` for React
re-renders) is also needed. Two observers is still far cheaper than polling.

---

## 6. Click `.opblock-summary` instead of toggling `.is-open`

**What:** Expanding or collapsing an endpoint is done by calling
`.opblock-summary.click()`, not by manually adding/removing the `.is-open`
class.

**Why:** Swagger UI is a React app. React maintains an internal virtual DOM
state tree. If you manually toggle a CSS class, React's state doesn't know
about it. The next time React re-renders (e.g., on filter input), it will
overwrite your change based on its own stale state, causing:

- An endpoint that looks open but React thinks is closed (or vice versa).
- Broken "Try it out" forms that don't appear when they should.
- Console errors from React detecting unexpected DOM mutations.

Clicking the summary fires React's synthetic `onClick` handler, which updates
React's state correctly.

**Trade-offs:** We depend on `.opblock-summary` remaining Swagger UI's click
target. This has been stable across Swagger UI 3.x and 4.x.

---

## 7. `requestAnimationFrame` in the "Try it out" shortcut

**What:** After expanding a collapsed endpoint via `summary.click()`, the
"Try it out" button click is deferred with `requestAnimationFrame`.

**Why:** Calling `summary.click()` schedules a React state update.
React processes updates asynchronously in batches. The `.try-out__btn` element
doesn't exist in the DOM until React finishes re-rendering after the state
update. If we click immediately, `querySelector('.try-out__btn')` returns
`null`.

`requestAnimationFrame` defers the callback to the next browser paint cycle,
which happens after React has flushed its pending updates and written the new
DOM.

**Why not `setTimeout(fn, 0)`:** `rAF` is semantically "run after the next
paint", which aligns perfectly with "run after React has rendered". `setTimeout`
with delay 0 can fire before the paint in some edge cases.

**Why not a `MutationObserver` on the block:** That would be correct but
significantly more complex for a one-shot operation on a single button.

**Trade-offs:** In very slow environments (heavy page, CPU throttling), one
frame might not be enough. In practice Swagger renders in < 16 ms. If this
ever becomes a problem, a short-polling observer would be the next step.

---

## 8. Index-based focus tracking (re-query every time)

**What:** `focusedIndex` stores an integer. `getOpblocks()` always calls
`querySelectorAll` fresh. Element references are never cached.

**Why:** Swagger re-creates DOM nodes when:

- A tag section is collapsed/expanded (all child `.opblock` nodes are removed
  and re-added).
- A filter is applied (React unmounts and remounts matching nodes).

If we stored an element reference (`focusedEl = blocks[3]`), that reference
would become a detached DOM node after any re-render. Operations on detached
nodes are silently ignored, and the reference keeps the node alive in memory.

Re-querying the DOM on every keypress is cheap — `querySelectorAll` on a
subtree of a few hundred nodes takes < 1 ms.

**Trade-offs:** `onDomChanged()` must re-sync `focusedIndex` by searching for
the `.swaggrr-focus` class in the fresh node list. This is O(n) on every DOM
mutation, but n is at most a few hundred and mutations are infrequent.

---

## 9. `outline` for the focus ring

**What:** The focus indicator is `outline: 3px solid #49cc90` with
`outline-offset: 2px`.

**Why over alternatives:**

- *`border`*: Borders are inside the box model. Adding a border shifts the
  element's layout, which can misalign Swagger UI's carefully sized endpoint
  cards.
- *`box-shadow`*: Box shadows are clipped by `overflow: hidden`. Several
  Swagger UI themes set `overflow: hidden` on `.opblock` or its ancestors,
  which would make the shadow invisible.
- *`outline`*: Rendered outside the box model (doesn't affect layout), not
  clipped by `overflow`, and supported in all modern browsers.

The colour `#49cc90` matches Swagger UI's own GET-method accent colour,
so the focus ring feels native to the page.

**Trade-offs:** `outline-offset: 2px` can sometimes overlap adjacent elements
on very dense Swagger pages. The alternative would be a transparent gap, but
that reduces visibility.

---

## 10. Static `HELP_HTML` template literal in content.js

**What:** The help overlay HTML is a JavaScript template literal constant
inside `content.js`. It is injected once via `helpOverlay.innerHTML = HELP_HTML`.

**Why not a separate HTML file loaded via `web_accessible_resources`:**

- A file in `web_accessible_resources` is publicly fetchable by any page via
  `chrome-extension://<id>/help.html`. This is a minor but unnecessary
  exposure.
- Loading an external file requires `fetch` plus async handling, making `init`
  more complex.
- The help content is entirely static text (no user input, no dynamic data), so
  `innerHTML` is safe from XSS. There is no injection vector.

**Why `innerHTML` instead of building elements with `createElement`:** The
help card has ~30 elements. Building them one by one with `createElement` and
`appendChild` would triple the line count for no security benefit, because
`HELP_HTML` is a compile-time constant with no user-controlled parts.

**Trade-offs:** Modifying the help card requires editing a string inside
`content.js`. This is a minor DX cost. A separate HTML file would be more
editor-friendly, but the security trade-off isn't worth it.

---

## 11. Permissions: none declared

**What:** The manifest declares no `"permissions"` at all. The key is omitted
entirely.

**Why zero permissions:**

`popup.js` calls `chrome.tabs.query({ active: true, currentWindow: true })`
and then `chrome.tabs.sendMessage(tab.id, ...)`. Neither call requires any
declared permission:

- `chrome.tabs.query` always returns tab objects including `tab.id` without
  any permission. The `tabs` permission only gates sensitive fields like `url`
  and `title` — we never access those.
- `chrome.tabs.sendMessage` needs only a tab ID, which the above provides.

**Why not `activeTab`:** `activeTab` was initially declared but proved
redundant — removed in a subsequent security-hardening pass. Declaring it
would have added a visible permission in the install prompt with no
corresponding benefit.

**Why not `scripting`:** The `scripting` permission allows
`chrome.scripting.executeScript()` — the ability to inject arbitrary
JavaScript into any tab. This is far beyond what Swaggrr needs and introduces
real risk. The popup uses message passing instead (see §12).

**Why not `tabs`:** The `tabs` permission grants access to the URL, title, and
favIcon of every open tab. We never need tab URLs — we only need to know if the
current tab is running a Swagger page, which the content script answers via a
boolean `ping` response.

**Trade-offs:** With no permissions, the popup's "Active on this page" status
check requires the content script to already be running in the tab. If the
user installs the extension and immediately clicks the icon before reloading a
Swagger tab, the content script won't be present and the popup will show
"Not a Swagger UI page". Refreshing the tab resolves this — a reasonable and
well-understood first-run expectation.

---

## 12. Message-passing for popup ↔ content script communication

**What:** `popup.js` calls `chrome.tabs.sendMessage(tabId, { action: 'ping' })`.
The content script's `chrome.runtime.onMessage` listener responds with
`{ isSwagger: !!swaggerRoot }`.

**Why not `scripting.executeScript`:** See §11. We avoid `scripting`
entirely. Message passing to a content script declared in the manifest achieves
the same result — the content script already has access to the DOM; we just ask
it a question.

**Why not `chrome.storage`:** Storage is persistent and would require cleanup.
A synchronous message is the simplest way to ask a stateful content script for
a one-time answer.

**Trade-offs:** If the content script has crashed (rare), `sendMessage` will
fail with `chrome.runtime.lastError`. `popup.js` handles this case by showing
"Not a Swagger UI page".

---

## 13. Keyboard shortcut choices

### Navigation: `j` / `k` (with `↑` / `↓` as aliases)

Vim-style `j`/`k` are the de-facto standard for keyboard navigation in
developer tools: GitHub, Gmail, Jira, Linear, and Notion all use them. Arrow
keys are also supported for users unfamiliar with vim bindings. Both coexist.

### Tag-section jumps: `J` / `K` (Shift+j / Shift+k)

Capital letters are a natural extension of the j/k pattern (vim uses `}` / `{`
for paragraph jumps; capital shift feels similar in intent).

### Expand/collapse: `Enter` / `Space`

These are the universal keyboard interactions for "activate the focused item".
They mirror how native HTML `<button>` elements work with keyboard focus.

### Expand all / collapse all: `o` / `c`

Mnemonic: **o**pen / **c**lose. Alternatives considered:

- `e` / `E`: `e` would conflict with a natural future shortcut for "execute"
  or "edit".
- Ctrl+↓ / Ctrl+↑: Harder to type quickly; also shadows browser/OS shortcuts.
- `+` / `-`: Not on all keyboard layouts without the numpad.

### Try it out: `t`

Mnemonic: **t**ry. Unambiguous, easy to remember.

### Filter: `f`

Mnemonic: **f**ilter. Standard in many keyboard-driven apps (GitHub's file
finder uses `t`, Notion uses `/`, but `f` = filter is intuitive).

### Authorize: `a`

Mnemonic: **a**uthorize. The Authorize dialog is prominent in any Swagger
page that requires auth; a single-key shortcut is valuable.

### Help: `?`

Universal convention. GitHub, Gmail, and almost every keyboard-driven app use
`?` for "show help". Shift is not required on most keyboards in the US/UK
layout (`?` = Shift+`/`).

### Close: `Escape`

Always-on, even in input fields. `Escape` is universally "dismiss this modal".

---

## 14. No background service worker

**What:** The manifest has no `"background"` key.

**Why:** A background service worker would only be needed for:

1. **Chrome Commands API** (`"commands"` in manifest): This API allows
   registering system-wide keyboard shortcuts. However, MV3 service workers
   are ephemeral — Chrome shuts them down after 30 seconds of inactivity and
   restarts them on demand. A service worker that needs to relay keyboard
   commands to a content script must re-establish a port connection every time
   it wakes up. This is fragile and unnecessary when content scripts can listen
   for `keydown` directly.
2. **Cross-tab state**: We have no state that needs to persist across tabs.
3. **External requests**: We make no network requests.

**Trade-offs:** Without the Commands API, shortcuts cannot be triggered when
the browser's address bar or DevTools panel has focus. This is acceptable
because Swaggrr's shortcuts are only meaningful when the user is interacting
with the Swagger page.
