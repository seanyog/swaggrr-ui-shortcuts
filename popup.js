(() => {
  'use strict';

  const indicator = document.getElementById('status-indicator');

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab?.id) {
      setStatus('inactive');
      return;
    }

    // Ping the content script — it responds with { isSwagger: bool }.
    // Uses message passing instead of scripting.executeScript so we don't
    // need the `scripting` permission (which would allow arbitrary injection).
    chrome.tabs.sendMessage(tab.id, { action: 'ping' }, response => {
      if (chrome.runtime.lastError || !response) {
        // Content script not present on this page (not a web page, or
        // extension was just installed and the tab hasn't been refreshed).
        setStatus('inactive');
        return;
      }
      setStatus(response.isSwagger ? 'active' : 'inactive');
    });
  });

  function setStatus(state) {
    indicator.className = 'status';
    if (state === 'active') {
      indicator.classList.add('status--active');
      indicator.textContent = 'Active on this page ✓';
    } else {
      indicator.classList.add('status--inactive');
      indicator.textContent = 'Not a Swagger UI page';
    }
  }
})();
