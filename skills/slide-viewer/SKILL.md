---
name: slide-viewer
description: Open, preview, and interact with presentation slide decks (PowerPoint .pptx and Markdown .slides.md, .md) in the Antigravity side panel. Trigger when the user wants to view, open, preview, present, or create presentation slides.
---

# Presentation Slide Viewer in Side Panel

Whenever the user asks to view, open, inspect, present, or display presentation slides or pitch decks (.pptx, .ppt, .slides.md, or .md slides):

1. **Surface the clickable sidecar link** to open the presentation in the Auxiliary Side Panel:
   - For a specific file:
     `[Open <filename> in Slide Viewer](sidecar://slide-viewer/panel/?file=<encoded_path>)`
     *(Ensure paths with spaces or parentheses are URL-encoded, e.g. `%20`)*
   - For the general Slide Viewer:
     `[Open Presentation Slide Viewer](sidecar://slide-viewer/panel/)`

2. **Display the link prominently** so the user can open it with a single click.

3. **Writing Markdown Presentation Slides**:
   When generating presentation decks in Markdown, separate each slide using horizontal rules (`---`) and include speaker notes in HTML comments (`<!-- note: your speaker talking points -->`):

   ```markdown
   # Presentation Title
   ## Subtitle or Presenter Name

   <!-- note: Welcome everyone. Today we are exploring the architecture of Antigravity 2.0. -->

   ---

   ## Problem Statement
   - Point 1: Context and challenge
   - Point 2: Current bottleneck
   - Point 3: Business impact

   <!-- note: Emphasize point 2 as the primary driver for our solution. -->

   ---

   ## Proposed Architecture
   ```mermaid
   flowchart LR
     User --> SidePanel
     SidePanel --> Agent
   ```

   <!-- note: Walk through how user inputs route to the agent. -->
   ```
