/**
 * Opens a payment page (NOWPayments) in a new tab, keeping the site open in this one. The tab has to be opened
 * straight away in the click (browsers block tabs opened later), so it starts blank and is sent to the payment page
 * once its link is ready. If the browser blocks it, this tab goes to the payment page instead.
 */
export function reserveTab(): Window | null {
  try {
    const tab = window.open("", "_blank");
    if (!tab) return null;
    tab.opener = null; // The payment page can't reach back into this one.
    tab.document.title = "Opening payment...";
    tab.document.body.style.cssText = "background:#0b0b0f;color:#ccc;font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0";
    tab.document.body.textContent = "Opening the payment page...";
    return tab;
  } catch {
    return null;
  }
}

/** Sends the reserved tab to the payment page. Returns "tab", or "here" if there was no tab and this page went instead. */
export function openPayment(tab: Window | null, url: string): "tab" | "here" {
  try {
    if (tab && !tab.closed) {
      tab.location.replace(url);
      return "tab";
    }
  } catch {
    // Fall through to opening a fresh tab.
  }
  // The reserved tab is gone (some browsers, e.g. ChromeOS, lose it); try a new one before leaving this page.
  const fresh = window.open(url, "_blank", "noopener");
  if (fresh) return "tab";
  window.location.href = url;
  return "here";
}

export function closeTab(tab: Window | null) {
  try {
    tab?.close();
  } catch {
    // Already closed.
  }
}
