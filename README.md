# Swaggrr

A Chrome extension that adds keyboard shortcuts to any [Swagger UI](https://swagger.io/tools/swagger-ui/) page — whether it's hosted on a public domain, an internal IP, or `localhost`.

If you spend time navigating large OpenAPI docs, Swaggrr lets you move through endpoints, expand and collapse sections, fire up "Try it out", and jump to the Authorize dialog without touching the mouse.

---

## Shortcuts

Press `?` on any Swagger page to see this reference card inside the browser.

### Navigate

| Key | Action |
|-----|--------|
| `j` / `↓` | Move to next endpoint |
| `k` / `↑` | Move to previous endpoint |
| `J` | Jump to next tag section |
| `K` | Jump to previous tag section |

### Operations

| Key | Action |
|-----|--------|
| `Enter` / `Space` | Expand or collapse the focused endpoint |
| `o` | Expand **all** endpoints |
| `c` | Collapse **all** endpoints |
| `t` | Activate "Try it out" on the focused endpoint |

### Global

| Key | Action |
|-----|--------|
| `f` | Focus the operation filter input |
| `a` | Open the Authorize dialog |
| `?` | Toggle the in-page shortcut reference |
| `Esc` | Close the shortcut reference |

> Shortcuts are automatically disabled while your cursor is in any text input, so you can type normally in filter boxes, parameter fields, and request bodies.

---

## Installation

Swaggrr is not (yet) on the Chrome Web Store, so you load it as an unpacked extension:

1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the root of this repository.

The Swaggrr icon will appear in your toolbar. Click it on any Swagger page to confirm the extension is active and to see the shortcut reference.

> **Edge:** the same steps work in Microsoft Edge (`edge://extensions`).

### After installing

If you had a Swagger page open before installing, refresh that tab — content scripts only inject into pages loaded after the extension is active.

---

## Compatibility

Swaggrr works with any page that renders Swagger UI, regardless of what serves it:

- Public Swagger/OpenAPI docs
- FastAPI `/docs`
- Spring Boot `/swagger-ui/` (Springfox, springdoc-openapi)
- Express / Koa apps using `swagger-ui-express`
- Any internal or localhost URL

It uses a `MutationObserver` to wait for Swagger UI's React tree to finish rendering, so it works on both statically-served pages and single-page apps that mount Swagger UI asynchronously.

On pages that don't contain Swagger UI, the extension does nothing — it checks for `#swagger-ui` on load and exits immediately if it's absent.

---

## Permissions

The extension declares **no permissions** in the manifest. It:

- Does **not** read or exfiltrate page content.
- Does **not** make any network requests.
- Does **not** use `scripting`, `tabs`, `storage`, `cookies`, or any other declared permission.
- Does **not** need `activeTab` — the popup only reads `tab.id` to send a message to the content script, which works without any declared permission in MV3.

The content script matches `*://*/*` (http and https only — no `file://` or internal browser pages). On any page without `#swagger-ui` the script does nothing and its bootstrap observer disconnects automatically after the page loads.

---

## Browser support

Requires Chrome 88+ or Microsoft Edge 88+, which are the minimum versions that support Manifest V3.

---

## File overview

```
manifest.json   MV3 manifest — permissions, content script declaration
content.js      All shortcut logic (single IIFE, no build step required)
content.css     Focus ring and in-page help overlay styles
popup.html      Shortcut reference card shown when you click the toolbar icon
popup.css       Popup styles
popup.js        Pings the content script to detect whether the tab is a Swagger page
icons/          PNG icons at 16 × 16, 48 × 48, and 128 × 128
DESIGN.md       Detailed rationale for every architectural decision
```

There is no build step, no `node_modules`, and no bundler. The files you see are the files the browser loads.

---

## Contributing

The codebase is intentionally small and dependency-free so it's easy to read and change without any toolchain setup.

1. Make your changes to the relevant file(s).
2. Reload the extension at `chrome://extensions` (click the refresh icon on the Swaggrr card).
3. Refresh the Swagger tab you're testing against.

Before submitting a pull request, check `DESIGN.md` to understand the reasoning behind the current approach — it may save you time if your change touches one of the documented trade-off areas (e.g. why we click `.opblock-summary` instead of toggling `.is-open` directly, or why we use `outline` rather than `border` for the focus ring).

---

## Licence

[The Unlicense](UNLICENSE) — public domain. No attribution required, no conditions, no strings attached. Do whatever you want with it.
