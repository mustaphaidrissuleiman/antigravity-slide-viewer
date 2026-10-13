import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Response, SidecarApp } from 'sidecar_sdk';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR || join(HERE, '.data');
const STATE_FILE = join(DATA_DIR, 'state.json');

const app = new SidecarApp();

// ---------------------------------------------------------------------------
// Static Files & Page Routes
// ---------------------------------------------------------------------------

const readLocal = (name) => readFileSync(join(HERE, name), 'utf8');

const serveIndex = () => readLocal('index.html');
const serveAppJs = () => readLocal('app.js');
const serveStyles = () => new Response(readLocal('styles.css'), { contentType: 'text/css' });

let cachedJsZip = null;
const serveJsZip = () => {
  if (!cachedJsZip) cachedJsZip = readLocal('lib/jszip.min.js');
  return cachedJsZip;
};

// HTML Pages
app.page('/', serveIndex);
app.page('/index.html', serveIndex);
app.page('/open', serveIndex);
app.page('/viewer', serveIndex);
app.page('/panel', serveIndex);
app.page('/panel/', serveIndex);
app.page('/panel/index.html', serveIndex);

// Client App Script & CSS
app.page('/app.js', serveAppJs);
app.page('/panel/app.js', serveAppJs);

app.api('/styles.css', serveStyles, 'GET');
app.api('/panel/styles.css', serveStyles, 'GET');

// Vendored Libraries
app.page('/lib/jszip.min.js', serveJsZip);
app.page('/panel/lib/jszip.min.js', serveJsZip);

// ---------------------------------------------------------------------------
// Supported File Extensions
// ---------------------------------------------------------------------------

const PPTX_EXTS = new Set(['.pptx', '.ppt', '.potx', '.pptm']);
const MD_EXTS = new Set(['.md', '.markdown', '.slide', '.slides', '.deck']);

function isPresentationFile(filename) {
  if (!filename || typeof filename !== 'string') return false;
  const lower = filename.toLowerCase();
  const ext = extname(lower);
  if (PPTX_EXTS.has(ext)) return true;
  if (lower.endsWith('.slides.md') || lower.endsWith('.slide.md') || lower.endsWith('.deck.md')) return true;
  if (MD_EXTS.has(ext)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Path Resolution
// ---------------------------------------------------------------------------

function searchForSlideByName(dirPath, targetName, maxDepth = 4, currentDepth = 0) {
  if (currentDepth > maxDepth || !existsSync(dirPath)) return null;
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'vendor') continue;
      const full = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const found = searchForSlideByName(full, targetName, maxDepth, currentDepth + 1);
        if (found) return found;
      } else if (entry.isFile() && entry.name.toLowerCase() === targetName.toLowerCase()) {
        return full;
      }
    }
  } catch {}
  return null;
}

function resolveSlidePath(inputPath, workspaceUris = []) {
  if (!inputPath || typeof inputPath !== 'string') return null;

  let cleaned = inputPath.trim();

  // Strip wrapping quotes
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'")) ||
      (cleaned.startsWith('`') && cleaned.endsWith('`'))) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // Handle file:// URIs
  if (cleaned.startsWith('file://')) {
    try {
      cleaned = fileURLToPath(cleaned);
    } catch {
      cleaned = cleaned.replace(/^file:\/\//, '');
    }
  }

  // Handle tilde ~
  if (cleaned === '~' || cleaned.startsWith('~/')) {
    cleaned = join(homedir(), cleaned.slice(2));
  }

  // 1. Direct path
  if (existsSync(cleaned) && statSync(cleaned).isFile()) {
    return cleaned;
  }

  // 2. URL-decoded path
  try {
    const decoded = decodeURIComponent(cleaned);
    if (existsSync(decoded) && statSync(decoded).isFile()) {
      return decoded;
    }
  } catch {}

  // 3. Candidate base directories
  const candidateBases = [];

  if (Array.isArray(workspaceUris)) {
    for (const uri of workspaceUris) {
      try {
        const p = uri.startsWith('file://') ? fileURLToPath(uri) : decodeURIComponent(uri);
        if (existsSync(p)) candidateBases.push(p);
      } catch {}
    }
  }

  candidateBases.push(process.cwd());
  candidateBases.push(join(homedir(), '.gemini/antigravity/scratch'));
  candidateBases.push(join(homedir(), 'Downloads'));
  candidateBases.push(join(homedir(), 'Documents'));
  candidateBases.push(join(homedir(), 'Desktop'));

  // Test joining with candidate bases
  for (const base of candidateBases) {
    if (!existsSync(base)) continue;
    try {
      const candidate = join(base, cleaned);
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        return candidate;
      }
      const decodedCandidate = join(base, decodeURIComponent(cleaned));
      if (existsSync(decodedCandidate) && statSync(decodedCandidate).isFile()) {
        return decodedCandidate;
      }
    } catch {}
  }

  // 4. Fuzzy fallback: search by basename in candidate bases
  const targetBaseName = basename(cleaned);
  if (targetBaseName && isPresentationFile(targetBaseName)) {
    for (const base of candidateBases) {
      if (!existsSync(base)) continue;
      const found = searchForSlideByName(base, targetBaseName, 4);
      if (found) return found;
    }
  }

  return null;
}

function findPresentationFiles(dirPath, maxDepth = 4, currentDepth = 0) {
  const list = [];
  if (currentDepth > maxDepth || !existsSync(dirPath)) return list;

  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'vendor') {
        continue;
      }
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        list.push(...findPresentationFiles(fullPath, maxDepth, currentDepth + 1));
      } else if (entry.isFile() && isPresentationFile(entry.name)) {
        const s = statSync(fullPath);
        const lower = entry.name.toLowerCase();
        let fileType = 'pptx';
        if (lower.endsWith('.md') || lower.endsWith('.markdown') || lower.endsWith('.slide') || lower.endsWith('.slides')) {
          fileType = 'markdown';
        }
        list.push({
          name: entry.name,
          path: fullPath,
          size: s.size,
          mtime: s.mtimeMs,
          extension: extname(entry.name).toLowerCase(),
          fileType,
        });
      }
    }
  } catch {}
  return list;
}

// ---------------------------------------------------------------------------
// APIs
// ---------------------------------------------------------------------------

app.api('/api/status', () => ({ ok: true, version: '1.0.0', type: 'slide-viewer' }), 'GET');

app.api('/api/get-state', () => {
  if (!existsSync(STATE_FILE)) return { lastOpenedPath: null, lastSlideIndex: 0 };
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { lastOpenedPath: null, lastSlideIndex: 0 };
  }
}, 'GET');

const handleSaveState = (data) => {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const state = {
      lastOpenedPath: data?.lastOpenedPath || null,
      lastSlideIndex: typeof data?.lastSlideIndex === 'number' ? data.lastSlideIndex : 0,
      theme: data?.theme || 'default',
      savedAt: Date.now(),
    };
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    return state;
  } catch (err) {
    return { ok: false, error: err.message };
  }
};
app.api('/api/save-state', handleSaveState, 'POST');
app.api('/api/save-state', handleSaveState, 'GET');

const handleWorkspaceSlides = (data) => {
  const uris = Array.isArray(data?.workspaceUris) ? data.workspaceUris : [];
  const folders = [];

  for (const uri of uris) {
    try {
      const folderPath = uri.startsWith('file://') ? fileURLToPath(uri) : decodeURIComponent(uri);
      if (existsSync(folderPath)) folders.push(folderPath);
    } catch {}
  }

  // Include known project & scratch folders
  folders.push(join(homedir(), '.gemini/antigravity/scratch'));
  folders.push(join(homedir(), 'Documents'));
  folders.push(join(homedir(), 'Downloads'));

  const results = [];
  const checkedFolders = new Set();
  for (const folder of folders) {
    if (checkedFolders.has(folder) || !existsSync(folder)) continue;
    checkedFolders.add(folder);
    results.push(...findPresentationFiles(folder, 3, 0));
  }

  const seen = new Set();
  const unique = [];
  for (const item of results) {
    if (!seen.has(item.path)) {
      seen.add(item.path);
      unique.push(item);
    }
  }
  unique.sort((a, b) => b.mtime - a.mtime);
  return { slides: unique };
};
app.api('/api/workspace-slides', handleWorkspaceSlides, 'POST');
app.api('/api/workspace-slides', handleWorkspaceSlides, 'GET');

app.api('/api/raw-slide', (data) => {
  const resolved = resolveSlidePath(data?.path, data?.workspaceUris);
  if (!resolved) {
    return new Response(JSON.stringify({ error: `File not found: ${data?.path || ''}` }), {
      contentType: 'application/json',
      status: 404,
    });
  }

  const buffer = readFileSync(resolved);
  const ext = extname(resolved).toLowerCase();
  const contentType = PPTX_EXTS.has(ext)
    ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    : 'text/markdown; charset=utf-8';

  return new Response(buffer, {
    contentType,
    headers: {
      'Content-Disposition': `inline; filename="${basename(resolved)}"`,
    },
  });
}, 'GET');

const handleLoadSlideFile = (data) => {
  const inputPath = data?.path;
  if (!inputPath) return { success: false, error: 'No path specified' };

  try {
    const resolved = resolveSlidePath(inputPath, data?.workspaceUris);
    if (!resolved) {
      return { success: false, error: `File not found: ${inputPath}` };
    }

    const stat = statSync(resolved);
    if (!stat.isFile()) {
      return { success: false, error: 'Path is not a regular file' };
    }

    const ext = extname(resolved).toLowerCase();
    const isPptx = PPTX_EXTS.has(ext);

    if (isPptx) {
      // PowerPoint file: Return base64 for JSZip parsing
      if (stat.size > 50 * 1024 * 1024) {
        return { success: false, error: 'File is too large for side panel preview (>50MB)' };
      }
      const buffer = readFileSync(resolved);
      return {
        success: true,
        type: 'pptx',
        name: basename(resolved),
        path: resolved,
        extension: ext,
        size: stat.size,
        mtime: stat.mtimeMs,
        base64: buffer.toString('base64'),
      };
    } else {
      // Markdown presentation file
      const content = readFileSync(resolved, 'utf8');
      return {
        success: true,
        type: 'markdown',
        name: basename(resolved),
        path: resolved,
        extension: ext,
        size: stat.size,
        mtime: stat.mtimeMs,
        content,
      };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
};
app.api('/api/load-slide-file', handleLoadSlideFile, 'POST');
app.api('/api/load-slide-file', handleLoadSlideFile, 'GET');

// Built-in starter decks so users can immediately demo and present
app.api('/api/sample-decks', () => {
  return {
    decks: [
      {
        id: 'antigravity-pitch',
        title: 'Antigravity 2.0: The Future of Agentic Development',
        author: 'Antigravity Team',
        type: 'markdown',
        content: `# Antigravity 2.0
## The Future of Agentic Development & Pair Programming

<!-- note: Welcome everyone. Today we are walking through the core paradigm shifts in Antigravity 2.0 and how agents integrate natively into developer workflows. -->

---

## ⚡ What is Antigravity 2.0?

Antigravity 2.0 is an advanced agentic coding environment built for deep pair programming:

- **Autonomous Multi-Agent Orchestration**: Specialized subagents collaborate on complex refactors and architecture.
- **Sidecar UI Extension System**: Interactive rich panels rendered in the side pane with live agent control.
- **Deep Code Intelligence**: Real-time context sharing, semantic tools, and bidirectional messaging.

<!-- note: Highlight that Antigravity is not just a chat box—it is a live pair-programming environment with rich visual side panels. -->

---

## 🏗️ Architecture: Host & Sidecars

\`\`\`
+---------------------+         +---------------------+
|   Antigravity IDE   | <=====> |   Sidecar Plugins   |
|   (Chat & Editor)   |  JSON   | (Slides, PDF, Docs) |
+---------------------+  Bridge +---------------------+
           |                               |
           v                               v
+---------------------+         +---------------------+
| Autonomous Subagent |         |  Interactive Panel  |
+---------------------+         +---------------------+
\`\`\`

- **Bi-directional Bridge**: Panels can query file systems, trigger agents, and update state.
- **Zero-Config SDK**: Built-in runtime without node_modules overhead.

<!-- note: Point out how the Sidecar SDK runs sandboxed inside an iframe with full theme token synchronization. -->

---

## 🎨 Slide Viewer Features

Key capabilities built into this presentation plugin:

1. **Dual Format Engine**: Native support for PowerPoint (\`.pptx\`) and Markdown (\`.slides.md\`).
2. **Present & Overview Modes**: Single slide theater view, thumbnail strip, and bird's eye grid.
3. **Presenter Tools**: Live speaker notes, presentation timer, and slide search.
4. **Agent Co-Pilot**: One-click slide explanation, note generation, and slide critique!

<!-- note: We will now demonstrate how easy it is to ask the agent to generate notes or critique slides in real time. -->

---

## 🚀 Getting Started

To view any presentation in your workspace:

- Use \`sidecar://slide-viewer/panel/?file=deck.pptx\`
- Drop any \`.pptx\` or \`.slides.md\` file right into this panel.
- Click **Ask Agent** to generate talking points or summarize the deck!

> *"The best presentations tell a clear story with actionable takeaways."*

<!-- note: Encourage questions and show how the agent responds to the presentation context. -->`
      },
      {
        id: 'ai-architecture',
        title: 'Enterprise AI Systems Architecture',
        author: 'AI Engineering',
        type: 'markdown',
        content: `# Enterprise AI Systems
## Building Scalable, Reliable LLM Workflows

<!-- note: Good morning. This deck outlines best practices for designing production-ready AI applications. -->

---

## 🎯 Core Requirements for Enterprise AI

- **Reliability & Determinism**: Guardrails, structured JSON outputs, and validation.
- **Observability**: End-to-end tracing, token metrics, and latency percentiles.
- **Latency Optimization**: Semantic caching, speculative decoding, and streaming.
- **Security & Privacy**: Zero data retention guarantees, PII redaction, and IAM attribution.

<!-- note: Emphasize that reliability is the number one hurdle when transitioning from prototype to production. -->

---

## 🔄 The Retrieval-Augmented Generation (RAG) Loop

1. **Ingestion**: Chunking, metadata tagging, and vector embedding.
2. **Retrieval**: Hybrid dense + sparse search with re-ranking.
3. **Synthesis**: Context injection, system prompt grounding, and citations.
4. **Evaluation**: Hallucination scoring and factual precision metrics.

<!-- note: Detail why hybrid search outperforms purely vector search in enterprise codebases. -->

---

## 💡 Summary & Next Steps

- Adopt modular microservices for agent reasoning.
- Maintain human-in-the-loop controls for high-stakes decisions.
- Instrument telemetry at every pipeline boundary.

<!-- note: Open the floor to Q&A. -->`
      }
    ]
  };
}, 'GET');

app.run();
