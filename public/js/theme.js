// Applies the saved colour theme before first paint (loaded synchronously in <head>).
(function () {
  try {
    var saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.setAttribute('data-theme', saved);
    }
  } catch (e) {
    /* storage unavailable: follow the system preference */
  }
})();
