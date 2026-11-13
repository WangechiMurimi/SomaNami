/* global document */
// Apply a saved theme before first paint so the page never flashes the wrong
// one. Mirrors readSavedTheme() in src/lib/theme/use-theme.ts. It is a separate
// file, not inline in index.html, so the Content Security Policy can forbid
// inline scripts. Load it with a plain blocking <script> in <head>.
// Wrapped so a classic script leaves no globals behind.
;(function () {
  try {
    var t = localStorage.getItem('somanami-theme')
    if (t === 'light' || t === 'dark')
      document.documentElement.dataset.theme = t
  } catch {
    // Storage can be blocked (private browsing); the CSS then follows the system.
  }
})()
