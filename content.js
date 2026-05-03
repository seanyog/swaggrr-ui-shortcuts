(() => {
  'use strict';

  // ── State ─────────────────────────────────────────────────────────────────
  let focusedIndex = -1;
  let focusedId    = null;  // block's id attr — stable across React re-renders
  let helpVisible  = false;
  let swaggerRoot  = null;
  let helpOverlay  = null;

  // ── Help card DOM builder ─────────────────────────────────────────────────

  function el(tag, cls) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    return node;
  }

  function kbd(label) {
    const k = document.createElement('kbd');
    k.textContent = label;
    return k;
  }

  function row(keys, desc) {
    const div = el('div');
    const dt  = el('dt');
    const dd  = el('dd');
    keys.forEach((part, i) => {
      if (i > 0) dt.append(document.createTextNode(' / '));
      dt.append(kbd(part));
    });
    dd.textContent = desc;
    div.append(dt, dd);
    return div;
  }

  function section(title, rows) {
    const sec = document.createElement('section');
    const h3  = document.createElement('h3');
    const dl  = document.createElement('dl');
    h3.textContent = title;
    rows.forEach(([keys, desc]) => dl.append(row(keys, desc)));
    sec.append(h3, dl);
    return sec;
  }

  function buildHelpCard() {
    const card     = el('div', 'swaggrr-card');
    card.id        = 'swaggrr-card';
    const header   = el('div', 'swaggrr-header');
    const logo     = el('span', 'swaggrr-logo');
    const subtitle = el('span', 'swaggrr-subtitle');
    logo.textContent     = 'Swaggrr';
    subtitle.textContent = 'keyboard shortcuts';
    header.append(logo, subtitle);

    const sections = el('div', 'swaggrr-sections');
    sections.append(
      section('Navigate', [
        [['↓'],        'Next endpoint'],
        [['↑'],        'Previous endpoint'],
        [['PageDown'], 'Next tag section'],
        [['PageUp'],   'Previous tag section'],
      ]),
      section('Operations', [
        [['→'],                    'Expand focused endpoint'],
        [['←'],                    'Collapse focused endpoint'],
        [['Enter', 'Space'],       'Expand / collapse focused'],
        [['Shift+Enter', 'l'],     'Enter form (focus first field)'],
        [['o'],                    'Expand all endpoints'],
        [['c'],                    'Collapse all endpoints'],
        [['t'],                    'Try it out + focus first field'],
        [['Ctrl+Enter', '⌘+Enter'], 'Execute (when try-it-out active)'],
      ]),
      section('Global', [
        [['f'],   'Focus filter input'],
        [['a'],   'Open Authorize dialog'],
        [['?'],   'Toggle this help'],
        [['Esc'], 'Close help or Authorize dialog'],
      ]),
    );

    const hint = el('p', 'swaggrr-hint');
    hint.textContent = 'Shortcuts are disabled while typing in any input field.';
    card.append(header, sections, hint);
    return card;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function getOpblocks() {
    return swaggerRoot
      ? Array.from(swaggerRoot.querySelectorAll('.opblock'))
      : [];
  }

  function getTags() {
    return swaggerRoot
      ? Array.from(swaggerRoot.querySelectorAll('.opblock-tag'))
      : [];
  }

  function isInputFocused() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      el.isContentEditable
    );
  }

  function clampIndex(n, length) {
    if (length === 0) return -1;
    return ((n % length) + length) % length;
  }

  // Swagger UI's toggle onClick is on .opblock-summary-control (the inner button),
  // not on .opblock-summary (the outer div).
  function getToggleBtn(block) {
    return block.querySelector('.opblock-summary-control')
      || block.querySelector('.opblock-summary');
  }

  function setFocus(n) {
    const blocks = getOpblocks();
    if (blocks.length === 0) return;

    // Remove focus marker from old element
    if (focusedIndex >= 0 && focusedIndex < blocks.length) {
      blocks[focusedIndex].classList.remove('swaggrr-focus');
    }

    focusedIndex = clampIndex(n, blocks.length);
    const target = blocks[focusedIndex];
    focusedId = target.id || null;

    target.classList.add('swaggrr-focus');
    target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // Re-sync focus state after React re-renders DOM nodes.
  // Prioritises the stable block id over the array index — React replaces the
  // DOM node (losing the CSS class) but preserves the id attribute.
  function onDomChanged() {
    if (focusedIndex < 0 && !focusedId) return;

    const blocks = getOpblocks();

    if (focusedId) {
      const idx = blocks.findIndex(b => b.id === focusedId);
      if (idx >= 0) {
        focusedIndex = idx;
      } else {
        // Block is no longer visible (section collapsed / filtered out)
        focusedIndex = -1;
        focusedId    = null;
        return;
      }
    } else if (focusedIndex >= blocks.length) {
      focusedIndex = -1;
      return;
    }

    blocks.forEach((b, i) => {
      b.classList.toggle('swaggrr-focus', i === focusedIndex);
    });
  }

  // Jump to a tag section, expanding it first if it is currently collapsed.
  function jumpToSection(tag) {
    tag.scrollIntoView({ block: 'start', behavior: 'smooth' });

    const section   = tag.closest('.opblock-tag-section');
    const firstBlock = section?.querySelector('.opblock');

    if (firstBlock) {
      const idx = getOpblocks().indexOf(firstBlock);
      if (idx >= 0) setFocus(idx);
      return;
    }

    // Section is collapsed — no .opblock children in DOM yet.
    // Click the expand button (prefer the <button> child, fall back to the h4).
    const expandBtn = tag.querySelector('button') || tag;
    expandBtn.click();

    // Wait for React to render the opblock children, then focus the first one.
    const observer = new MutationObserver(() => {
      const b = section?.querySelector('.opblock');
      if (!b) return;
      observer.disconnect();
      const idx = getOpblocks().indexOf(b);
      if (idx >= 0) setFocus(idx);
    });
    observer.observe(swaggerRoot, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 2000);
  }

  function toggleHelp() {
    helpVisible = !helpVisible;
    helpOverlay.style.display = helpVisible ? 'flex' : 'none';
  }

  function closeHelp() {
    helpVisible = false;
    helpOverlay.style.display = 'none';
  }

  // Focus the first param input in a block after try-it-out renders.
  // Takes a block index (not a reference) so re-renders don't stale it out.
  function focusFirstInputWhenReady(blockIdx) {
    const sel = '.opblock-body input:not([disabled]), .opblock-body select:not([disabled]):not(.content-type), .opblock-body textarea:not([disabled])';
    const current = () => getOpblocks()[blockIdx];
    const now = current()?.querySelector(sel);
    if (now) { now.focus(); return; }
    const obs = new MutationObserver(() => {
      const el = current()?.querySelector(sel);
      if (el) { obs.disconnect(); el.focus(); }
    });
    obs.observe(swaggerRoot, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), 2000);
  }

  // Shift focus into the body of the currently focused opblock.
  // If the block is collapsed, expand it first. Either way, wait for the body
  // to render (React renders it async after .is-open is set) before focusing.
  function enterForm() {
    if (focusedIndex < 0) return;
    const idx = focusedIndex;

    const tryFocus = () => {
      const current = getOpblocks()[idx];
      if (!current) return false;
      // Prefer param inputs (when try-it-out is active), then the Try-it-out button.
      const target =
        current.querySelector('.opblock-body input:not([disabled]), .opblock-body select:not([disabled]):not(.content-type), .opblock-body textarea:not([disabled])') ||
        current.querySelector('.try-out__btn:not([disabled])');
      if (!target) return false;
      target.focus();
      return true;
    };

    if (tryFocus()) return;

    const block = getOpblocks()[idx];
    if (!block.classList.contains('is-open')) {
      getToggleBtn(block)?.click();
    }
    const obs = new MutationObserver(() => {
      if (tryFocus()) obs.disconnect();
    });
    obs.observe(swaggerRoot, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), 2000);
  }

  // Click the Execute button on the focused block — only when try-it-out is active.
  function executeEndpoint() {
    if (focusedIndex < 0) return;
    const block = getOpblocks()[focusedIndex];
    if (!block?.classList.contains('is-open')) return;
    if (!block.querySelector('.try-out__btn.cancel')) return;
    block.querySelector('.btn.execute')?.click();
  }

  // ── Keyboard handler ──────────────────────────────────────────────────────

  function onKeyDown(e) {
    // Escape always closes our overlays and Swagger's Authorize modal, even in inputs
    if (e.key === 'Escape') {
      if (helpVisible) {
        closeHelp();
        e.preventDefault();
        return;
      }
      // Swagger UI doesn't wire Escape to its own Authorize modal — do it for them
      const authCloseBtn = document.querySelector('.dialog-ux .close-modal');
      if (authCloseBtn) {
        authCloseBtn.click();
        e.preventDefault();
      }
      return;
    }

    // Ctrl+Enter / Cmd+Enter executes even while a form input has focus — checked
    // before isInputFocused() so the user can submit by pressing it mid-fill.
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key === 'Enter') {
      e.preventDefault();
      executeEndpoint();
      return;
    }

    // All other shortcuts suppressed while typing
    if (isInputFocused()) return;

    // Ignore if any modifier (besides Shift) is held — don't shadow browser shortcuts
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const blocks = getOpblocks();

    switch (e.key) {
      // ── Navigation ────────────────────────────────────────────────────────
      case 'ArrowDown': {
        e.preventDefault();
        setFocus(focusedIndex < 0 ? 0 : focusedIndex + 1);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        setFocus(focusedIndex <= 0 ? blocks.length - 1 : focusedIndex - 1);
        break;
      }
      case 'ArrowRight': {
        if (focusedIndex < 0) break;
        e.preventDefault();
        const blockR = blocks[focusedIndex];
        if (!blockR.classList.contains('is-open')) getToggleBtn(blockR)?.click();
        break;
      }
      case 'ArrowLeft': {
        if (focusedIndex < 0) break;
        e.preventDefault();
        const blockL = blocks[focusedIndex];
        if (blockL.classList.contains('is-open')) getToggleBtn(blockL)?.click();
        break;
      }
      case 'PageDown': {
        e.preventDefault();
        const tags = getTags();
        if (tags.length === 0) break;
        const focused = focusedIndex >= 0 ? blocks[focusedIndex] : null;
        let nextTag = null;
        if (!focused) {
          nextTag = tags[0];
        } else {
          for (const tag of tags) {
            // DOCUMENT_POSITION_PRECEDING: `focused` comes before `tag` → tag is a later section
            if (tag.compareDocumentPosition(focused) & Node.DOCUMENT_POSITION_PRECEDING) {
              nextTag = tag;
              break;
            }
          }
          if (!nextTag) nextTag = tags[0]; // wrap around
        }
        jumpToSection(nextTag);
        break;
      }
      case 'PageUp': {
        e.preventDefault();
        const tags = getTags();
        if (tags.length === 0) break;
        const focused = focusedIndex >= 0 ? blocks[focusedIndex] : null;
        let prevTag = null;
        if (!focused) {
          prevTag = tags[tags.length - 1];
        } else {
          // Find the last tag that precedes focused — that is the current section.
          // Then step back one index to get the previous section.
          let currentIdx = -1;
          for (let i = 0; i < tags.length; i++) {
            // DOCUMENT_POSITION_FOLLOWING: focused comes after tags[i] → tags[i] is before focused
            if (tags[i].compareDocumentPosition(focused) & Node.DOCUMENT_POSITION_FOLLOWING) {
              currentIdx = i;
            }
          }
          prevTag = currentIdx <= 0
            ? tags[tags.length - 1]   // at first section — wrap around
            : tags[currentIdx - 1];
        }
        jumpToSection(prevTag);
        break;
      }

      // ── Enter form ────────────────────────────────────────────────────────
      case 'l': {
        e.preventDefault();
        enterForm();
        break;
      }

      // ── Expand / collapse focused ─────────────────────────────────────────
      case 'Enter': {
        if (e.shiftKey) {
          e.preventDefault();
          enterForm();
          break;
        }
        if (focusedIndex < 0) break;
        // If the focused block's toggle button already has real browser focus,
        // yield — the browser will synthesise a click natively on Enter/Space.
        const ae = document.activeElement;
        const focusedBlock = blocks[focusedIndex];
        if (ae && focusedBlock.contains(ae) &&
            (ae.tagName === 'BUTTON' || ae.getAttribute('role') === 'button')) {
          break;
        }
        e.preventDefault();
        const btn = getToggleBtn(focusedBlock);
        if (btn) btn.click();
        break;
      }
      case ' ': {
        if (focusedIndex < 0) break;
        const ae2 = document.activeElement;
        const focusedBlock2 = blocks[focusedIndex];
        if (ae2 && focusedBlock2.contains(ae2) &&
            (ae2.tagName === 'BUTTON' || ae2.getAttribute('role') === 'button')) {
          break;
        }
        e.preventDefault();
        const btn2 = getToggleBtn(focusedBlock2);
        if (btn2) btn2.click();
        break;
      }

      // ── Expand / collapse all ─────────────────────────────────────────────
      case 'o': {
        e.preventDefault();
        swaggerRoot.querySelectorAll('.opblock:not(.is-open)').forEach(block => {
          const btn = getToggleBtn(block);
          if (btn) btn.click();
        });
        break;
      }
      case 'c': {
        e.preventDefault();
        swaggerRoot.querySelectorAll('.opblock.is-open').forEach(block => {
          const btn = getToggleBtn(block);
          if (btn) btn.click();
        });
        break;
      }

      // ── Try it out ────────────────────────────────────────────────────────
      case 't': {
        if (focusedIndex < 0) break;
        e.preventDefault();
        // Capture the index now; after any async re-render the `blocks` array
        // reference is stale, so re-query via getOpblocks() inside callbacks.
        const idx = focusedIndex;
        const block = blocks[idx];

        // If the button is already rendered, click it straight away.
        const tryBtnNow = block.querySelector('.try-out__btn');
        if (tryBtnNow) {
          const activating = !tryBtnNow.classList.contains('cancel');
          tryBtnNow.click();
          if (activating) focusFirstInputWhenReady(idx);
          break;
        }

        // Button not rendered yet. Two sub-cases:
        //   1. Block is collapsed → expand it; mutations will follow.
        //   2. Block has .is-open but body not painted yet (React does the class
        //      change and the child render in separate commits) → mutations still coming.
        // In both cases the MutationObserver will fire when the button appears.
        if (!block.classList.contains('is-open')) {
          getToggleBtn(block)?.click();
        }
        const observer = new MutationObserver(() => {
          const current = getOpblocks()[idx];
          const tryBtn = current?.querySelector('.try-out__btn');
          if (tryBtn) {
            observer.disconnect();
            tryBtn.click();
            focusFirstInputWhenReady(idx);
          }
        });
        observer.observe(swaggerRoot, { childList: true, subtree: true });
        setTimeout(() => observer.disconnect(), 2000);
        break;
      }

      // ── Filter ────────────────────────────────────────────────────────────
      case 'f': {
        e.preventDefault();
        const filterInput = swaggerRoot.querySelector('input.operation-filter-input');
        if (filterInput) filterInput.focus();
        break;
      }

      // ── Authorize ─────────────────────────────────────────────────────────
      case 'a': {
        e.preventDefault();
        const authBtn = swaggerRoot.querySelector('.auth-wrapper .btn.authorize');
        if (authBtn) authBtn.click();
        break;
      }

      // ── Help ──────────────────────────────────────────────────────────────
      case '?': {
        e.preventDefault();
        toggleHelp();
        break;
      }
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  function init(root) {
    if (swaggerRoot) return; // already initialised

    swaggerRoot = root;

    // Inject help overlay
    helpOverlay = document.createElement('div');
    helpOverlay.id = 'swaggrr-help';
    helpOverlay.setAttribute('role', 'dialog');
    helpOverlay.setAttribute('aria-modal', 'true');
    helpOverlay.setAttribute('aria-label', 'Swaggrr keyboard shortcuts');
    helpOverlay.appendChild(buildHelpCard());
    document.body.appendChild(helpOverlay);

    // Close help when clicking the backdrop (not the card itself)
    helpOverlay.addEventListener('click', e => {
      if (e.target === helpOverlay) closeHelp();
    });

    document.addEventListener('keydown', onKeyDown);

    // Watch for React re-renders that replace DOM nodes
    const domWatcher = new MutationObserver(onDomChanged);
    domWatcher.observe(swaggerRoot, { childList: true, subtree: true });
  }

  // ── Bootstrap: handle both static and SPA-rendered Swagger UI ─────────────

  const existing = document.getElementById('swagger-ui');
  if (existing) {
    init(existing);
  } else {
    // Swagger UI hasn't rendered yet (FastAPI, Spring Boot, etc.)
    const bodyWatcher = new MutationObserver((_mutations, observer) => {
      const root = document.getElementById('swagger-ui');
      if (root) {
        observer.disconnect();
        init(root);
      }
    });
    bodyWatcher.observe(document.body, { childList: true, subtree: true });

    // Stop watching once the page has fully loaded and given SPAs time to render.
    window.addEventListener('load', () => {
      setTimeout(() => bodyWatcher.disconnect(), 10000);
    }, { once: true });
  }

  // ── Message listener (popup ping — no scripting permission needed) ─────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return false;
    if (msg.action === 'ping') {
      sendResponse({ isSwagger: !!swaggerRoot });
    }
    return false;
  });

})();
