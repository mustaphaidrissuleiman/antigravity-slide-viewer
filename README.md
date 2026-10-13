# Presentation Slide Viewer Plugin for Antigravity 2.0

An interactive, responsive presentation slide viewer extension designed for Google Antigravity 2.0. Render PowerPoint (`.pptx`) and Markdown (`.slides.md`, `.md`) presentation decks directly inside the Antigravity Auxiliary Side Panel with presentation mode, thumbnail filmstrips, speaker notes, live presentation timers, and AI agent integration.

![Presentation Slide Viewer](assets/logo.svg)

---

## 🚀 Key Features

- **Dual-Engine Slide Support**:
  - **PowerPoint (`.pptx`)**: Direct client-side parsing of OpenXML shapes, formatted text blocks, embedded media pictures, and slide dimensions.
  - **Markdown Slides (`.slides.md`, `.md`)**: Standard presentation deck formatting with slides separated by `---`, YAML frontmatter, headers, syntax-highlighted code blocks, tables, lists, and speaker notes in `<!-- note: ... -->`.
- **Side Panel Optimized Layout**:
  - Auto-scaling 16:9 widescreen canvas fitting any auxiliary panel width.
  - Smooth slide transitions and responsive typography.
- **Presenter & Rehearsal Tools**:
  - **Speaker Notes Drawer**: Live slide-by-slide speaker notes extracted from PPTX notes slides or Markdown comments.
  - **Presentation Timer**: Stop-watch timer for rehearsing talks and pacing presentations.
  - **Thumbnail Filmstrip**: Miniature live previews of all slides for fast navigation.
  - **Grid Overview ("Slide Sorter")**: Bird's-eye matrix of all slides with live text search and keyword filtering.
- **Antigravity 2.0 Agent Co-Pilot**:
  - Dedicated **Ask Agent** modal connecting directly to your active conversation via `window.sidecar.agent.sendMessage`.
  - 1-click prompts:
    - 💡 **Explain Slide**: Deep conceptual breakdown and key takeaways.
    - 🎙️ **Generate Speaker Notes**: Automatic talking points and speech script.
    - 🎯 **Critique & Improve**: Visual hierarchy, readability, and brevity analysis.
    - ➕ **Suggest Next Slide**: Strategic recommendations for follow-up slides.
    - 📊 **Summarize Entire Deck**: Executive summary and outline of the deck.
- **Deep Workspace Integration**:
  - Automatically discovers presentation files across active workspace folders.
  - Drag-and-drop any presentation file right into the panel.
  - One-click sidecar links: `sidecar://slide-viewer/panel/?file=<encoded_path>`.
  - Built-in starter decks for immediate testing.

---

## 📁 Plugin Structure

```text
slide-viewer/
├── plugin.json                 # Antigravity plugin manifest
├── README.md                   # Documentation
├── assets/
│   └── logo.svg                # Vector logo for the customizations UI
├── rules/
│   └── AGENTS.md               # Agent rule to link presentation files with sidecar://
├── skills/
│   └── slide-viewer/
│       └── SKILL.md            # Skill instructions for Antigravity agents
└── sidecars/
    └── panel/
        ├── sidecar.json        # Sidecar process & UI configuration
        ├── package.json        # ES module declaration
        ├── main.mjs            # Backend server & file resolution APIs
        ├── index.html          # HTML view & UI structure
        ├── styles.css          # Theme-aware CSS (light/dark host support)
        ├── app.js              # Slide rendering & agent interaction logic
        └── lib/
            └── jszip.min.js    # Vendored JSZip for PPTX unpacking
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `→` / `Space` / `PageDown` | Next slide |
| `←` / `PageUp` | Previous slide |
| `Home` / `End` | First slide / Last slide |
| `N` | Toggle Speaker Notes & Timer drawer |
| `G` | Toggle between Slide View and Grid Overview |
| `F` | Toggle Fullscreen presentation mode |

---

## 💡 Markdown Slide Format Example

```markdown
# Antigravity 2.0 Pitch
## Pair Programming with Autonomous Agents

<!-- note: Welcome everyone. Today we are presenting Antigravity 2.0. -->

---

## Key Capabilities
- Multi-agent orchestration
- Interactive sidecar panels
- Real-time workspace intelligence

<!-- note: Focus on the sidecar panel architecture. -->

---

## Summary
> "The best presentations tell a clear story with actionable takeaways."
```
