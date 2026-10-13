# Presentation Slide Viewing in Side Panel

Whenever you generate, create, export, build, or reference a PowerPoint presentation (.pptx, .ppt) or Markdown presentation slide deck (.slides.md, .slide.md, .md):

1. **Always provide a clickable link to open the presentation directly in the side panel** using the `sidecar://` scheme:
   ```markdown
   [Open <filename> in Slide Viewer](sidecar://slide-viewer/panel/?file=<encoded_path>)
   ```
   *(Pass the absolute path or workspace path in the `?file=` query parameter. If the path contains spaces or parentheses, URL-encode them — e.g. `%20`, `%28`, `%29` — so markdown parsers do not truncate the link).*

2. **Display this link prominently** in your response right after creating, modifying, or discussing any presentation slide deck, allowing the user to click it and inspect the interactive slides in the side pane immediately.
