#!/usr/bin/env python3
"""Bundle LinkShield into a single self-contained index.html."""
import pathlib

root = pathlib.Path(__file__).parent
css = (root / "css" / "styles.css").read_text(encoding="utf-8")
icons_js = (root / "js" / "icons.js").read_text(encoding="utf-8")
engine_js = (root / "js" / "engine.js").read_text(encoding="utf-8")
app_js = (root / "js" / "app.js").read_text(encoding="utf-8")

# Remove the DOMContentLoaded init line from app_js (we'll use a robust init instead)
app_js_clean = app_js.replace(
    "document.addEventListener('DOMContentLoaded', () => App.init());",
    "/* expose App + init handled by robust bootstrap below */\nwindow.App = App;"
)

favicon = (
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' "
    "fill='%23DC143C'%3E%3Cpath d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'/%3E%3C/svg%3E"
)

html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="theme-color" content="#0a0708" />
  <title>LinkShield \u2014 Phishing Link Scanner</title>
  <meta name="description" content="LinkShield scans any URL before you access it, protecting you from phishing threats in real time." />
  <link rel="icon" href="{favicon}" />
  <style>
{css}
  </style>
</head>
<body>
  <div id="app">Loading LinkShield\u2026</div>
  <script>
/* ===== icons.js ===== */
{icons_js}

/* ===== engine.js ===== */
{engine_js}

/* ===== app.js ===== */
{app_js_clean}

/* ===== Robust bootstrap: run app as soon as the DOM is ready, with fallbacks ===== */
(function bootstrap() {{
  "use strict";
  function start() {{
    try {{
      const A = (typeof App !== 'undefined') ? App : window.App;
      if (A && typeof A.init === 'function') {{
        A.init();
      }} else {{
        console.error("[LinkShield] App object not found at init time");
      }}
    }} catch (err) {{
      console.error("[LinkShield] Init failed:", err);
    }}
  }}
  if (document.readyState === 'loading') {{
    document.addEventListener('DOMContentLoaded', start);
  }} else {{
    // DOM already parsed (or 'interactive'/'complete') -> start immediately
    start();
  }}
}})();
  </script>
</body>
</html>
"""

(root / "index.html").write_text(html, encoding="utf-8")
print("Bundled index.html written:", len(html), "bytes")
