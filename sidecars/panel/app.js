/**
 * Presentation Slide Viewer - Antigravity 2.0 Frontend Controller
 */

// ---------------------------------------------------------------------------
// Global State
// ---------------------------------------------------------------------------
const state = {
  deck: null,            // { title, type, path, slides: [] }
  currentSlideIndex: 0,
  viewMode: 'slide',     // 'slide' | 'grid'
  filmstripVisible: true,
  notesVisible: false,
  deckTheme: 'auto',
  workspaceUris: [],
  sampleDecks: [],
  timer: {
    seconds: 0,
    running: false,
    intervalId: null,
  },
};

// ---------------------------------------------------------------------------
// DOM Elements
// ---------------------------------------------------------------------------
const el = {
  app: document.getElementById('app'),
  fileInput: document.getElementById('fileInput'),
  toolbar: document.getElementById('toolbar'),
  openDeckBtn: document.getElementById('openDeckBtn'),
  deckBadge: document.getElementById('deckBadge'),
  deckTitle: document.getElementById('deckTitle'),
  
  viewSlideBtn: document.getElementById('viewSlideBtn'),
  viewGridBtn: document.getElementById('viewGridBtn'),
  
  prevSlideBtn: document.getElementById('prevSlideBtn'),
  nextSlideBtn: document.getElementById('nextSlideBtn'),
  slideIndexInput: document.getElementById('slideIndexInput'),
  totalSlidesCount: document.getElementById('totalSlidesCount'),
  toggleFilmstripBtn: document.getElementById('toggleFilmstripBtn'),
  
  toggleNotesBtn: document.getElementById('toggleNotesBtn'),
  deckThemeSelect: document.getElementById('deckThemeSelect'),
  fullscreenBtn: document.getElementById('fullscreenBtn'),
  askAgentBtn: document.getElementById('askAgentBtn'),
  
  deckProgressBar: document.getElementById('deckProgressBar'),
  deckProgressFill: document.getElementById('deckProgressFill'),
  
  mainContainer: document.getElementById('mainContainer'),
  filmstrip: document.getElementById('filmstrip'),
  filmstripCount: document.getElementById('filmstripCount'),
  filmstripList: document.getElementById('filmstripList'),
  
  slideViewport: document.getElementById('slideViewport'),
  floatPrevBtn: document.getElementById('floatPrevBtn'),
  floatNextBtn: document.getElementById('floatNextBtn'),
  slideStage: document.getElementById('slideStage'),
  slideCanvas: document.getElementById('slideCanvas'),
  
  notesDrawer: document.getElementById('notesDrawer'),
  notesContent: document.getElementById('notesContent'),
  timerDisplay: document.getElementById('timerDisplay'),
  timerToggleBtn: document.getElementById('timerToggleBtn'),
  timerResetBtn: document.getElementById('timerResetBtn'),
  generateNotesBtn: document.getElementById('generateNotesBtn'),
  closeNotesBtn: document.getElementById('closeNotesBtn'),
  
  gridView: document.getElementById('gridView'),
  gridSearchInput: document.getElementById('gridSearchInput'),
  gridMatchCount: document.getElementById('gridMatchCount'),
  gridCards: document.getElementById('gridCards'),
  
  welcomeScreen: document.getElementById('welcomeScreen'),
  dropZone: document.getElementById('dropZone'),
  browseFileBtn: document.getElementById('browseFileBtn'),
  sampleDeckList: document.getElementById('sampleDeckList'),
  refreshWorkspaceBtn: document.getElementById('refreshWorkspaceBtn'),
  workspaceDeckList: document.getElementById('workspaceDeckList'),
  
  fileModal: document.getElementById('fileModal'),
  closeFileModalBtn: document.getElementById('closeFileModalBtn'),
  manualPathInput: document.getElementById('manualPathInput'),
  loadManualPathBtn: document.getElementById('loadManualPathBtn'),
  modalWorkspaceList: document.getElementById('modalWorkspaceList'),
  
  agentModal: document.getElementById('agentModal'),
  closeAgentModalBtn: document.getElementById('closeAgentModalBtn'),
  agentSlideLabel: document.getElementById('agentSlideLabel'),
  agentCustomPrompt: document.getElementById('agentCustomPrompt'),
  sendCustomPromptBtn: document.getElementById('sendCustomPromptBtn'),
  
  toast: document.getElementById('toast'),
};

// ---------------------------------------------------------------------------
// Notifications & Toast
// ---------------------------------------------------------------------------
let toastTimer = null;
function showToast(message, duration = 3000) {
  if (!el.toast) return;
  el.toast.textContent = message;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.hidden = true;
  }, duration);
}

// ---------------------------------------------------------------------------
// Markdown Presentation Parser
// ---------------------------------------------------------------------------
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseMarkdownToHtml(markdown) {
  if (!markdown) return '';
  
  const lines = markdown.split(/\r?\n/);
  const out = [];
  let inCodeBlock = false;
  let codeLang = '';
  let codeBuffer = [];
  let inList = false;
  let listType = 'ul';
  let inTable = false;
  let tableRows = [];

  function flushList() {
    if (inList) {
      out.push(`</${listType}>`);
      inList = false;
    }
  }

  function flushTable() {
    if (inTable && tableRows.length > 0) {
      let tableHtml = '<table>';
      tableRows.forEach((row, idx) => {
        const cells = row.split('|').map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
        if (idx === 0) {
          tableHtml += '<thead><tr>' + cells.map(c => `<th>${formatInline(c)}</th>`).join('') + '</tr></thead><tbody>';
        } else if (idx === 1 && cells.every(c => /^[-:]+$/.test(c))) {
          // Separator row: ignore
        } else {
          tableHtml += '<tr>' + cells.map(c => `<td>${formatInline(c)}</td>`).join('') + '</tr>';
        }
      });
      tableHtml += '</tbody></table>';
      out.push(tableHtml);
      inTable = false;
      tableRows = [];
    }
  }

  function formatInline(text) {
    let s = escapeHtml(text);
    // Bold & Italic
    s = s.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    s = s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Inline code
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Links (strictly enforce safe protocols)
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, linkUrl) => {
      const cleanUrl = linkUrl.trim();
      if (/^(https?:|file:|sidecar:|\/|#)/i.test(cleanUrl) && !/^(javascript|data|vbscript):/i.test(cleanUrl)) {
        return `<a href="${cleanUrl}" target="_blank" rel="noopener">${linkText}</a>`;
      }
      return linkText;
    });
    return s;
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    // Code blocks
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        out.push(`<pre><code class="lang-${codeLang}">${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        flushList();
        flushTable();
        inCodeBlock = true;
        codeLang = line.slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(rawLine);
      continue;
    }

    // Tables
    if (line.startsWith('|') && line.endsWith('|')) {
      flushList();
      inTable = true;
      tableRows.push(line);
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Headings
    if (/^#{1,6}\s+/.test(line)) {
      flushList();
      const level = line.match(/^#+/)[0].length;
      const text = line.replace(/^#+\s*/, '');
      out.push(`<h${level}>${formatInline(text)}</h${level}>`);
      continue;
    }

    // Bullet list
    if (/^[-*+]\s+/.test(line)) {
      if (!inList || listType !== 'ul') {
        flushList();
        inList = true;
        listType = 'ul';
        out.push('<ul>');
      }
      const itemText = line.replace(/^[-*+]\s+/, '');
      out.push(`<li>${formatInline(itemText)}</li>`);
      continue;
    }

    // Numbered list
    if (/^\d+\.\s+/.test(line)) {
      if (!inList || listType !== 'ol') {
        flushList();
        inList = true;
        listType = 'ol';
        out.push('<ol>');
      }
      const itemText = line.replace(/^\d+\.\s+/, '');
      out.push(`<li>${formatInline(itemText)}</li>`);
      continue;
    }

    flushList();

    // Blockquote
    if (line.startsWith('>')) {
      const quoteText = line.replace(/^>\s*/, '');
      out.push(`<blockquote>${formatInline(quoteText)}</blockquote>`);
      continue;
    }

    // Empty line
    if (!line) {
      continue;
    }

    // Paragraph
    out.push(`<p>${formatInline(line)}</p>`);
  }

  flushList();
  flushTable();

  return out.join('\n');
}

function parseMarkdownDeck(content, deckName = 'Presentation') {
  // Strip YAML frontmatter if present
  let cleanContent = content;
  let title = deckName;
  if (cleanContent.startsWith('---')) {
    const endMatch = cleanContent.indexOf('\n---', 3);
    if (endMatch !== -1) {
      const frontmatter = cleanContent.slice(3, endMatch);
      const titleMatch = frontmatter.match(/title:\s*["']?([^"'\n\r]+)["']?/);
      if (titleMatch) title = titleMatch[1].trim();
      cleanContent = cleanContent.slice(endMatch + 4);
    }
  }

  // Split slides by horizontal rule delimiters: ---
  const rawSlideChunks = cleanContent.split(/(?:^|\n|\r\n)---\s*(?:\n|\r\n|$)/);
  const slides = [];

  rawSlideChunks.forEach((chunk, index) => {
    const trimmed = chunk.trim();
    if (!trimmed && rawSlideChunks.length > 1 && index === 0) return;
    if (!trimmed) return;

    // Extract speaker notes: <!-- note: ... --> or <!-- notes: ... -->
    let notes = '';
    const noteRegex = /<!--\s*notes?:\s*([\s\S]*?)-->/gi;
    let match;
    while ((match = noteRegex.exec(trimmed)) !== null) {
      notes += (notes ? '\n\n' : '') + match[1].trim();
    }
    const cleanSlideText = trimmed.replace(noteRegex, '').trim();

    // Detect slide title
    let slideTitle = `Slide ${slides.length + 1}`;
    const headingMatch = cleanSlideText.match(/^#+\s*(.+)$/m);
    if (headingMatch) {
      slideTitle = headingMatch[1].replace(/[*_`]/g, '').trim();
    }

    const htmlContent = parseMarkdownToHtml(cleanSlideText);

    slides.push({
      index: slides.length,
      title: slideTitle,
      contentHtml: htmlContent,
      notes: notes,
      rawText: cleanSlideText,
    });
  });

  if (slides.length === 0) {
    slides.push({
      index: 0,
      title: deckName,
      contentHtml: '<h1>' + escapeHtml(deckName) + '</h1><p>Empty presentation slide deck.</p>',
      notes: '',
      rawText: '',
    });
  }

  return {
    title: title,
    type: 'markdown',
    slides: slides,
  };
}

// ---------------------------------------------------------------------------
// PPTX Presentation Parser (Using JSZip + XML DOM)
// ---------------------------------------------------------------------------
async function parsePptxDeck(zipData, deckName = 'Presentation.pptx') {
  if (!window.JSZip) {
    throw new Error('JSZip library not available for PPTX parsing');
  }

  const zip = await window.JSZip.loadAsync(zipData);
  const parser = new DOMParser();

  // Read presentation.xml to get slide size and slide order
  let slideWidthEmu = 12192000;
  let slideHeightEmu = 6858000;
  const slideRIds = [];

  const presXmlFile = zip.file('ppt/presentation.xml');
  if (presXmlFile) {
    const presXmlStr = await presXmlFile.async('string');
    const presDoc = parser.parseFromString(presXmlStr, 'text/xml');
    
    // Slide size
    const sldSz = presDoc.querySelector('sldSz');
    if (sldSz) {
      const cx = parseInt(sldSz.getAttribute('cx'), 10);
      const cy = parseInt(sldSz.getAttribute('cy'), 10);
      if (cx && cy) {
        slideWidthEmu = cx;
        slideHeightEmu = cy;
      }
    }

    // Slide IDs
    const sldIdNodes = presDoc.querySelectorAll('sldId');
    sldIdNodes.forEach(node => {
      const rId = node.getAttribute('r:id') || node.getAttribute('id');
      if (rId) slideRIds.push(rId);
    });
  }

  // Read presentation rels to map r:id to slide file path
  const rIdMap = new Map();
  const presRelsFile = zip.file('ppt/_rels/presentation.xml.rels');
  if (presRelsFile) {
    const presRelsStr = await presRelsFile.async('string');
    const relsDoc = parser.parseFromString(presRelsStr, 'text/xml');
    const relNodes = relsDoc.querySelectorAll('Relationship');
    relNodes.forEach(r => {
      const id = r.getAttribute('Id');
      const target = r.getAttribute('Target');
      if (id && target) {
        // Resolve target relative to ppt/
        const normalized = target.startsWith('/') ? target.slice(1) : (target.startsWith('ppt/') ? target : 'ppt/' + target);
        rIdMap.set(id, normalized);
      }
    });
  }

  // Determine slide file list in order
  let slideFilePaths = [];
  slideRIds.forEach(rId => {
    const path = rIdMap.get(rId);
    if (path && zip.file(path)) {
      slideFilePaths.push(path);
    }
  });

  // Fallback: search all slides in ppt/slides/
  if (slideFilePaths.length === 0) {
    zip.forEach((relPath) => {
      if (/^ppt\/slides\/slide\d+\.xml$/i.test(relPath)) {
        slideFilePaths.push(relPath);
      }
    });
    slideFilePaths.sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] || '0', 10);
      const numB = parseInt(b.match(/\d+/)?.[0] || '0', 10);
      return numA - numB;
    });
  }

  const slides = [];

  for (let idx = 0; idx < slideFilePaths.length; idx++) {
    const slidePath = slideFilePaths[idx];
    const slideXmlStr = await zip.file(slidePath).async('string');
    const slideDoc = parser.parseFromString(slideXmlStr, 'text/xml');

    // Slide relationships (for images, notes)
    const slideRelPath = slidePath.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels');
    const slideRelFile = zip.file(slideRelPath);
    const slideRels = new Map();
    let notesSlidePath = null;

    if (slideRelFile) {
      const relStr = await slideRelFile.async('string');
      const relDoc = parser.parseFromString(relStr, 'text/xml');
      const rels = relDoc.querySelectorAll('Relationship');
      rels.forEach(r => {
        const id = r.getAttribute('Id');
        const target = r.getAttribute('Target');
        const type = r.getAttribute('Type') || '';
        if (id && target) {
          slideRels.set(id, target);
          if (type.includes('notesSlide')) {
            notesSlidePath = target.startsWith('..') ? 'ppt/' + target.replace(/^\.\.\//, '') : target;
          }
        }
      });
    }

    // Extract speaker notes if available
    let speakerNotes = '';
    if (notesSlidePath && zip.file(notesSlidePath)) {
      try {
        const notesXml = await zip.file(notesSlidePath).async('string');
        const notesDoc = parser.parseFromString(notesXml, 'text/xml');
        const noteTexts = [];
        notesDoc.querySelectorAll('a\\:t, t').forEach(tNode => {
          const txt = tNode.textContent?.trim();
          if (txt) noteTexts.push(txt);
        });
        speakerNotes = noteTexts.join(' ');
      } catch {}
    }

    // Parse elements in slide
    let slideTitle = `Slide ${idx + 1}`;
    const htmlElements = [];

    // Shapes & Text
    const spNodes = slideDoc.querySelectorAll('p\\:sp, sp');
    spNodes.forEach(sp => {
      // Position
      const xfrm = sp.querySelector('a\\:xfrm, xfrm');
      let x = 0, y = 0, cx = 0, cy = 0;
      if (xfrm) {
        const off = xfrm.querySelector('a\\:off, off');
        const ext = xfrm.querySelector('a\\:ext, ext');
        if (off) {
          x = parseInt(off.getAttribute('x') || '0', 10);
          y = parseInt(off.getAttribute('y') || '0', 10);
        }
        if (ext) {
          cx = parseInt(ext.getAttribute('cx') || '0', 10);
          cy = parseInt(ext.getAttribute('cy') || '0', 10);
        }
      }

      // Check for Title placeholder
      const ph = sp.querySelector('p\\:ph, ph');
      const phType = ph ? ph.getAttribute('type') : null;
      const isTitle = phType === 'title' || phType === 'ctrTitle';

      // Text paragraphs
      const pNodes = sp.querySelectorAll('a\\:p, p');
      const textParagraphs = [];
      pNodes.forEach(pNode => {
        const rNodes = pNode.querySelectorAll('a\\:r, r');
        let pText = '';
        let isBold = false;
        rNodes.forEach(r => {
          const tNode = r.querySelector('a\\:t, t');
          if (tNode) {
            pText += tNode.textContent;
            const rPr = r.querySelector('a\\:rPr, rPr');
            if (rPr && rPr.getAttribute('b') === '1') isBold = true;
          }
        });
        if (pText.trim()) {
          textParagraphs.push({ text: pText.trim(), bold: isBold });
          if (isTitle && slideTitle === `Slide ${idx + 1}`) {
            slideTitle = pText.trim();
          }
        }
      });

      if (textParagraphs.length > 0) {
        let textBlockHtml = '';
        if (isTitle) {
          textBlockHtml = `<h1 class="pptx-title">${escapeHtml(textParagraphs.map(tp => tp.text).join(' '))}</h1>`;
        } else {
          textBlockHtml = textParagraphs.map(tp => {
            const content = escapeHtml(tp.text);
            return `<p class="pptx-para">${tp.bold ? `<strong>${content}</strong>` : content}</p>`;
          }).join('');
        }

        // Percentage bounding box
        const leftPct = (x / slideWidthEmu) * 100;
        const topPct = (y / slideHeightEmu) * 100;
        const widthPct = cx > 0 ? (cx / slideWidthEmu) * 100 : 80;
        const heightPct = cy > 0 ? (cy / slideHeightEmu) * 100 : 'auto';

        htmlElements.push(`
          <div class="pptx-element" style="left: ${leftPct.toFixed(2)}%; top: ${topPct.toFixed(2)}%; width: ${widthPct.toFixed(2)}%; min-height: ${typeof heightPct === 'number' ? heightPct.toFixed(2) + '%' : heightPct};">
            ${textBlockHtml}
          </div>
        `);
      }
    });

    // Embedded Images
    const picNodes = slideDoc.querySelectorAll('p\\:pic, pic');
    for (const pic of picNodes) {
      const blip = pic.querySelector('a\\:blip, blip');
      if (blip) {
        const rEmbed = blip.getAttribute('r:embed');
        const targetPath = slideRels.get(rEmbed);
        if (targetPath) {
          const fullImgPath = targetPath.startsWith('..') ? 'ppt/' + targetPath.replace(/^\.\.\//, '') : targetPath;
          const imgZipFile = zip.file(fullImgPath);
          if (imgZipFile) {
            const base64Img = await imgZipFile.async('base64');
            const mime = fullImgPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
            const dataUri = `data:${mime};base64,${base64Img}`;

            // Image coords
            const xfrm = pic.querySelector('a\\:xfrm, xfrm');
            let ix = 0, iy = 0, icx = 0, icy = 0;
            if (xfrm) {
              const off = xfrm.querySelector('a\\:off, off');
              const ext = xfrm.querySelector('a\\:ext, ext');
              if (off) {
                ix = parseInt(off.getAttribute('x') || '0', 10);
                iy = parseInt(off.getAttribute('y') || '0', 10);
              }
              if (ext) {
                icx = parseInt(ext.getAttribute('cx') || '0', 10);
                icy = parseInt(ext.getAttribute('cy') || '0', 10);
              }
            }

            const leftPct = (ix / slideWidthEmu) * 100;
            const topPct = (iy / slideHeightEmu) * 100;
            const widthPct = (icx / slideWidthEmu) * 100;
            const heightPct = (icy / slideHeightEmu) * 100;

            htmlElements.push(`
              <div class="pptx-element" style="left: ${leftPct.toFixed(2)}%; top: ${topPct.toFixed(2)}%; width: ${widthPct.toFixed(2)}%; height: ${heightPct.toFixed(2)}%;">
                <img src="${dataUri}" class="pptx-image" alt="Slide Image" />
              </div>
            `);
          }
        }
      }
    }

    const slideCanvasHtml = `
      <div class="pptx-slide-canvas">
        ${htmlElements.join('\n')}
      </div>
    `;

    slides.push({
      index: idx,
      title: slideTitle,
      contentHtml: slideCanvasHtml,
      notes: speakerNotes,
      rawText: slideTitle,
    });
  }

  return {
    title: deckName,
    type: 'pptx',
    slides: slides,
  };
}

// ---------------------------------------------------------------------------
// Slide Deck Display & Navigation
// ---------------------------------------------------------------------------
function loadDeckIntoViewer(deck, initialIndex = 0) {
  state.deck = deck;
  state.currentSlideIndex = Math.max(0, Math.min(initialIndex, deck.slides.length - 1));

  // Update Toolbar
  el.deckBadge.textContent = deck.type.toUpperCase();
  el.deckTitle.textContent = deck.title || 'Presentation';
  el.deckTitle.title = deck.title;
  el.totalSlidesCount.textContent = deck.slides.length;
  el.filmstripCount.textContent = deck.slides.length;

  // Show UI
  el.welcomeScreen.hidden = true;
  el.toolbar.hidden = false;
  el.deckProgressBar.hidden = false;
  el.mainContainer.hidden = false;

  // Render subviews
  renderFilmstrip();
  renderGridView();
  goToSlide(state.currentSlideIndex, false);

  showToast(`Loaded ${deck.slides.length} slides: ${deck.title}`);
}

function goToSlide(index, saveState = true) {
  if (!state.deck || !state.deck.slides.length) return;
  const clampedIndex = Math.max(0, Math.min(index, state.deck.slides.length - 1));
  state.currentSlideIndex = clampedIndex;

  const currentSlide = state.deck.slides[clampedIndex];

  // Update counter & progress
  el.slideIndexInput.value = clampedIndex + 1;
  const progressPct = ((clampedIndex + 1) / state.deck.slides.length) * 100;
  el.deckProgressFill.style.width = `${progressPct}%`;

  // Render slide canvas
  if (state.deck.type === 'markdown') {
    el.slideCanvas.innerHTML = `
      <div class="slide-inner">
        <div class="slide-body">
          ${currentSlide.contentHtml}
        </div>
        <div class="slide-footer">
          <span>${escapeHtml(state.deck.title)}</span>
          <span>Slide ${clampedIndex + 1} of ${state.deck.slides.length}</span>
        </div>
      </div>
    `;
  } else {
    // PPTX canvas
    el.slideCanvas.innerHTML = currentSlide.contentHtml;
  }

  // Update speaker notes
  if (currentSlide.notes) {
    el.notesContent.innerHTML = `<p>${escapeHtml(currentSlide.notes).replace(/\n/g, '<br>')}</p>`;
  } else {
    el.notesContent.innerHTML = `<p class="notes-empty">No speaker notes recorded for this slide.</p>`;
  }

  // Highlight active thumbnail in filmstrip
  const thumbCards = el.filmstripList.querySelectorAll('.filmstrip-thumb-card');
  thumbCards.forEach((card, idx) => {
    if (idx === clampedIndex) {
      card.classList.add('active');
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      card.classList.remove('active');
    }
  });

  // Highlight in grid
  const gridCards = el.gridCards.querySelectorAll('.grid-card');
  gridCards.forEach((card, idx) => {
    if (idx === clampedIndex) {
      card.classList.add('active');
    } else {
      card.classList.remove('active');
    }
  });

  if (saveState && window.sidecar?.fetch) {
    window.sidecar.fetch('/api/save-state', {
      method: 'POST',
      body: JSON.stringify({
        lastOpenedPath: state.deck.path,
        lastSlideIndex: clampedIndex,
        theme: state.deckTheme,
      }),
    }).catch(() => {});
  }
}

function prevSlide() {
  if (state.currentSlideIndex > 0) {
    goToSlide(state.currentSlideIndex - 1);
  }
}

function nextSlide() {
  if (state.deck && state.currentSlideIndex < state.deck.slides.length - 1) {
    goToSlide(state.currentSlideIndex + 1);
  }
}

// ---------------------------------------------------------------------------
// Filmstrip & Grid Rendering
// ---------------------------------------------------------------------------
function renderFilmstrip() {
  if (!state.deck) return;
  el.filmstripList.innerHTML = '';

  state.deck.slides.forEach((slide, idx) => {
    const card = document.createElement('div');
    card.className = `filmstrip-thumb-card ${idx === state.currentSlideIndex ? 'active' : ''}`;
    card.innerHTML = `
      <div class="thumb-preview-box">
        <span class="thumb-num-badge">${idx + 1}</span>
        <div class="thumb-title">${escapeHtml(slide.title)}</div>
        <div class="thumb-snippet">${escapeHtml(slide.rawText?.slice(0, 70) || '')}</div>
      </div>
    `;
    card.addEventListener('click', () => {
      goToSlide(idx);
    });
    el.filmstripList.appendChild(card);
  });
}

function renderGridView(query = '') {
  if (!state.deck) return;
  el.gridCards.innerHTML = '';
  const filter = query.toLowerCase().trim();
  let matchCount = 0;

  state.deck.slides.forEach((slide, idx) => {
    const textMatch = !filter ||
      slide.title.toLowerCase().includes(filter) ||
      (slide.rawText && slide.rawText.toLowerCase().includes(filter));

    if (textMatch) {
      matchCount++;
      const card = document.createElement('div');
      card.className = `grid-card ${idx === state.currentSlideIndex ? 'active' : ''}`;
      card.innerHTML = `
        <div class="grid-thumb-box">
          <div class="thumb-title" style="font-size:10px;">${escapeHtml(slide.title)}</div>
          <div class="thumb-snippet" style="font-size:8px;">${escapeHtml(slide.rawText?.slice(0, 100) || '')}</div>
        </div>
        <div class="grid-card-footer">
          <span class="grid-card-num">Slide ${idx + 1}</span>
          <span class="grid-card-title">${escapeHtml(slide.title)}</span>
        </div>
      `;
      card.addEventListener('click', () => {
        setViewMode('slide');
        goToSlide(idx);
      });
      el.gridCards.appendChild(card);
    }
  });

  el.gridMatchCount.textContent = filter ? `${matchCount} of ${state.deck.slides.length} slides` : '';
}

function setViewMode(mode) {
  state.viewMode = mode;
  if (mode === 'grid') {
    el.viewGridBtn.classList.add('active');
    el.viewSlideBtn.classList.remove('active');
    el.slideViewport.hidden = true;
    el.gridView.hidden = false;
    renderGridView(el.gridSearchInput.value);
  } else {
    el.viewSlideBtn.classList.add('active');
    el.viewGridBtn.classList.remove('active');
    el.gridView.hidden = true;
    el.slideViewport.hidden = false;
    goToSlide(state.currentSlideIndex, false);
  }
}

// ---------------------------------------------------------------------------
// Speaker Notes & Timer
// ---------------------------------------------------------------------------
function toggleNotes() {
  state.notesVisible = !state.notesVisible;
  el.notesDrawer.hidden = !state.notesVisible;
  el.toggleNotesBtn.classList.toggle('active', state.notesVisible);
}

function startTimer() {
  if (state.timer.running) return;
  state.timer.running = true;
  el.timerToggleBtn.textContent = '⏸';
  state.timer.intervalId = setInterval(() => {
    state.timer.seconds++;
    updateTimerDisplay();
  }, 1000);
}

function pauseTimer() {
  if (!state.timer.running) return;
  state.timer.running = false;
  el.timerToggleBtn.textContent = '▶';
  clearInterval(state.timer.intervalId);
}

function resetTimer() {
  pauseTimer();
  state.timer.seconds = 0;
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const m = Math.floor(state.timer.seconds / 60).toString().padStart(2, '0');
  const s = (state.timer.seconds % 60).toString().padStart(2, '0');
  el.timerDisplay.textContent = `${m}:${s}`;
}

// ---------------------------------------------------------------------------
// Network Helpers
// ---------------------------------------------------------------------------
async function apiFetch(endpoint, data = {}, method = 'POST') {
  if (window.sidecar && typeof window.sidecar.fetch === 'function') {
    try {
      const res = await window.sidecar.fetch(endpoint, {
        method,
        body: method === 'GET' ? undefined : JSON.stringify(data),
      });
      return await res.json();
    } catch (e) {
      console.warn('sidecar.fetch error, falling back to window.fetch:', e);
    }
  }
  const queryStr = method === 'GET' && Object.keys(data).length > 0
    ? '?' + new URLSearchParams(data).toString()
    : '';
  const res = await fetch(endpoint + queryStr, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(data),
  });
  return await res.json();
}

async function safeGetWorkspaceUris() {
  if (!window.sidecar || typeof window.sidecar.getWorkspaceUris !== 'function') {
    return [];
  }
  try {
    return await Promise.race([
      window.sidecar.getWorkspaceUris(),
      new Promise((resolve) => setTimeout(() => resolve([]), 350)),
    ]);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// File Loading (Local, Upload, Workspace)
// ---------------------------------------------------------------------------
async function loadSlideFile(filePath) {
  try {
    showToast('Loading presentation...');
    const data = await apiFetch('/api/load-slide-file', { path: filePath, workspaceUris: state.workspaceUris });
    if (!data.success) {
      throw new Error(data.error || 'Failed to load presentation file');
    }

    if (data.type === 'pptx') {
      const binaryStr = atob(data.base64);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const deck = await parsePptxDeck(bytes.buffer, data.name);
      deck.path = data.path;
      loadDeckIntoViewer(deck);
    } else {
      const deck = parseMarkdownDeck(data.content, data.name);
      deck.path = data.path;
      loadDeckIntoViewer(deck);
    }
  } catch (err) {
    showToast(`Error: ${err.message}`);
    console.error('File load error:', err);
  }
}

async function handleNativeFileInput(file) {
  try {
    showToast(`Opening ${file.name}...`);
    const isPptx = /\.pptx?$/i.test(file.name);
    if (isPptx) {
      const arrayBuffer = await file.arrayBuffer();
      const deck = await parsePptxDeck(arrayBuffer, file.name);
      deck.path = file.name;
      loadDeckIntoViewer(deck);
    } else {
      const text = await file.text();
      const deck = parseMarkdownDeck(text, file.name);
      deck.path = file.name;
      loadDeckIntoViewer(deck);
    }
  } catch (err) {
    showToast(`Failed to parse file: ${err.message}`);
    console.error(err);
  }
}

// ---------------------------------------------------------------------------
// Workspace & Sample Decks
// ---------------------------------------------------------------------------
async function refreshWorkspaceSlides() {
  if (!el.workspaceDeckList) return;
  el.workspaceDeckList.innerHTML = '<div class="deck-list-loading">Scanning workspace...</div>';
  try {
    const data = await apiFetch('/api/workspace-slides', { workspaceUris: state.workspaceUris });
    const slides = data.slides || [];

    if (slides.length === 0) {
      el.workspaceDeckList.innerHTML = '<div class="deck-list-empty">No presentation decks found in workspace.</div>';
      el.modalWorkspaceList.innerHTML = '<div class="deck-list-empty">No presentation decks found in workspace.</div>';
      return;
    }

    const renderList = (container) => {
      container.innerHTML = '';
      slides.forEach(item => {
        const row = document.createElement('div');
        row.className = 'workspace-deck-item';
        row.innerHTML = `
          <div class="workspace-item-info">
            <span class="workspace-item-badge">${item.fileType.toUpperCase()}</span>
            <span class="workspace-item-name" title="${escapeHtml(item.path)}">${escapeHtml(item.name)}</span>
          </div>
          <span style="font-size:10px; color:var(--muted-fg);">${(item.size / 1024).toFixed(0)} KB</span>
        `;
        row.addEventListener('click', () => {
          el.fileModal.hidden = true;
          loadSlideFile(item.path);
        });
        container.appendChild(row);
      });
    };

    renderList(el.workspaceDeckList);
    renderList(el.modalWorkspaceList);
  } catch (err) {
    el.workspaceDeckList.innerHTML = '<div class="deck-list-empty">Could not load workspace presentations.</div>';
  }
}

async function loadSampleDecks() {
  try {
    const data = await apiFetch('/api/sample-decks', {}, 'GET');
    state.sampleDecks = data?.decks || [];
    if (!el.sampleDeckList) return;
    el.sampleDeckList.innerHTML = '';

    state.sampleDecks.forEach(deckItem => {
      const card = document.createElement('div');
      card.className = 'sample-deck-card';
      card.innerHTML = `
        <div class="sample-deck-title">${escapeHtml(deckItem.title)}</div>
        <div class="sample-deck-author">${escapeHtml(deckItem.author)}</div>
      `;
      card.addEventListener('click', () => {
        const deck = parseMarkdownDeck(deckItem.content, deckItem.title);
        deck.path = `sample://${deckItem.id}`;
        loadDeckIntoViewer(deck);
      });
      el.sampleDeckList.appendChild(card);
    });
  } catch {}
}

// ---------------------------------------------------------------------------
// Agent Co-Pilot Integration
// ---------------------------------------------------------------------------
function openAgentModal() {
  if (!state.deck || !state.deck.slides.length) {
    showToast('Please open a presentation first');
    return;
  }
  const currentSlide = state.deck.slides[state.currentSlideIndex];
  el.agentSlideLabel.textContent = `Slide ${state.currentSlideIndex + 1} ("${currentSlide.title}")`;
  el.agentModal.hidden = false;
}

function sendAgentPrompt(customPrompt = null, actionType = null) {
  if (!window.sidecar?.agent?.sendMessage) {
    showToast('Agent messaging bridge is not active');
    return;
  }

  const currentSlide = state.deck.slides[state.currentSlideIndex];
  let promptText = '';

  if (customPrompt) {
    promptText = `${customPrompt}\n\n[Context: Slide #${state.currentSlideIndex + 1} of "${state.deck.title}"]\nTitle: ${currentSlide.title}\nContent:\n${currentSlide.rawText}`;
  } else if (actionType === 'explain') {
    promptText = `Please explain and elaborate on Slide #${state.currentSlideIndex + 1} ("${currentSlide.title}") of the presentation "${state.deck.title}":\n\nSlide content:\n${currentSlide.rawText}\n\nProvide deep conceptual context, practical significance, and key talking points.`;
  } else if (actionType === 'notes') {
    promptText = `Generate compelling, professional speaker notes and talking points for Slide #${state.currentSlideIndex + 1} ("${currentSlide.title}") from my presentation "${state.deck.title}":\n\nSlide content:\n${currentSlide.rawText}\n\nFormat the notes with: 1) Opening hook, 2) Core narrative explanation, 3) Seamless bridge to next slide.`;
  } else if (actionType === 'critique') {
    promptText = `Please review and critique Slide #${state.currentSlideIndex + 1} ("${currentSlide.title}") of my presentation "${state.deck.title}":\n\nSlide content:\n${currentSlide.rawText}\n\nAnalyze clarity, typography, cognitive load, and suggest 3 concrete improvements.`;
  } else if (actionType === 'next-slide') {
    promptText = `Based on Slide #${state.currentSlideIndex + 1} ("${currentSlide.title}") of my deck "${state.deck.title}", what should the next slide cover? Suggest the title, 3 key bullet points, and an impactful visual idea.`;
  } else if (actionType === 'summarize-deck') {
    const outline = state.deck.slides.map(s => `Slide ${s.index + 1}: ${s.title}`).join('\n');
    promptText = `Provide an executive summary and narrative walkthrough of this entire presentation deck ("${state.deck.title}"):\n\n${outline}`;
  }

  try {
    const convId = window.sidecar.conversationId || undefined;
    window.sidecar.agent.sendMessage(promptText, convId);
    showToast('Sent prompt to Antigravity Agent!');
    el.agentModal.hidden = true;
  } catch (err) {
    showToast(`Failed to send message: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Event Listeners & Keyboard Navigation
// ---------------------------------------------------------------------------
function setupEventListeners() {
  // Navigation
  el.prevSlideBtn.addEventListener('click', prevSlide);
  el.nextSlideBtn.addEventListener('click', nextSlide);
  el.floatPrevBtn.addEventListener('click', prevSlide);
  el.floatNextBtn.addEventListener('click', nextSlide);

  el.slideIndexInput.addEventListener('change', (e) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) goToSlide(val - 1);
  });

  // View modes
  el.viewSlideBtn.addEventListener('click', () => setViewMode('slide'));
  el.viewGridBtn.addEventListener('click', () => setViewMode('grid'));

  // Filmstrip
  el.toggleFilmstripBtn.addEventListener('click', () => {
    state.filmstripVisible = !state.filmstripVisible;
    el.filmstrip.classList.toggle('collapsed', !state.filmstripVisible);
    el.toggleFilmstripBtn.classList.toggle('active', state.filmstripVisible);
  });

  // Notes
  el.toggleNotesBtn.addEventListener('click', toggleNotes);
  el.closeNotesBtn.addEventListener('click', toggleNotes);

  // Timer
  el.timerToggleBtn.addEventListener('click', () => {
    if (state.timer.running) pauseTimer();
    else startTimer();
  });
  el.timerResetBtn.addEventListener('click', resetTimer);

  // Theme Select
  el.deckThemeSelect.addEventListener('change', (e) => {
    state.deckTheme = e.target.value;
    el.slideCanvas.setAttribute('data-deck-theme', state.deckTheme);
  });

  // Fullscreen
  el.fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      el.app.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  // Modals
  el.openDeckBtn.addEventListener('click', () => {
    el.fileModal.hidden = false;
  });
  el.closeFileModalBtn.addEventListener('click', () => {
    el.fileModal.hidden = true;
  });
  el.loadManualPathBtn.addEventListener('click', () => {
    const p = el.manualPathInput.value.trim();
    if (p) {
      el.fileModal.hidden = true;
      loadSlideFile(p);
    }
  });

  // Agent
  el.askAgentBtn.addEventListener('click', openAgentModal);
  el.generateNotesBtn.addEventListener('click', () => {
    sendAgentPrompt(null, 'notes');
  });
  el.closeAgentModalBtn.addEventListener('click', () => {
    el.agentModal.hidden = true;
  });

  document.querySelectorAll('.agent-action-card').forEach(card => {
    card.addEventListener('click', () => {
      const action = card.dataset.action;
      sendAgentPrompt(null, action);
    });
  });

  el.sendCustomPromptBtn.addEventListener('click', () => {
    const custom = el.agentCustomPrompt.value.trim();
    if (custom) {
      sendAgentPrompt(custom);
      el.agentCustomPrompt.value = '';
    }
  });

  // Grid search
  el.gridSearchInput.addEventListener('input', (e) => {
    renderGridView(e.target.value);
  });

  // File drop & Browse
  el.browseFileBtn.addEventListener('click', () => el.fileInput.click());
  el.fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleNativeFileInput(file);
  });

  el.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    el.dropZone.classList.add('drag-over');
  });
  el.dropZone.addEventListener('dragleave', () => {
    el.dropZone.classList.remove('drag-over');
  });
  el.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    el.dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleNativeFileInput(file);
  });

  el.refreshWorkspaceBtn.addEventListener('click', refreshWorkspaceSlides);

  // Global Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
      e.preventDefault();
      nextSlide();
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      prevSlide();
    } else if (e.key === 'Home') {
      e.preventDefault();
      goToSlide(0);
    } else if (e.key === 'End' && state.deck) {
      e.preventDefault();
      goToSlide(state.deck.slides.length - 1);
    } else if (e.key === 'f' || e.key === 'F') {
      el.fullscreenBtn.click();
    } else if (e.key === 'n' || e.key === 'N') {
      toggleNotes();
    } else if (e.key === 'g' || e.key === 'G') {
      setViewMode(state.viewMode === 'slide' ? 'grid' : 'slide');
    }
  });
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------
async function init() {
  setupEventListeners();

  // 1. Check URL parameters immediately so the requested presentation loads first
  const params = new URLSearchParams(window.location.search);
  const fileParam = params.get('file') || params.get('path');
  if (fileParam) {
    loadSlideFile(fileParam);
  }

  // 2. Load sample starter decks
  loadSampleDecks();

  // 3. Resolve workspace URIs safely with timeout protection
  try {
    state.workspaceUris = await safeGetWorkspaceUris();
  } catch {}

  // 4. Scan workspace presentations
  refreshWorkspaceSlides();

  // 5. Listen for workspace folder changes
  if (window.sidecar?.onWorkspaceChange) {
    window.sidecar.onWorkspaceChange((uris) => {
      state.workspaceUris = uris || [];
      refreshWorkspaceSlides();
    });
  }

  // 6. If no file was passed in URL, restore last opened presentation
  if (!fileParam) {
    try {
      const savedState = await apiFetch('/api/get-state', {}, 'GET');
      if (savedState?.lastOpenedPath) {
        loadSlideFile(savedState.lastOpenedPath);
      }
    } catch {}
  }
}

document.addEventListener('DOMContentLoaded', init);
