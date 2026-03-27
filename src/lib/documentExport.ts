// PDF export uses html2pdf.js (dynamically imported), Word uses @turbodocx/html-to-docx

type ExportMode = 'pdf' | 'word';

const LATEX_TO_UNICODE: Record<string, string> = {
  '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ',
  '\\epsilon': 'ε', '\\zeta': 'ζ', '\\eta': 'η', '\\theta': 'θ',
  '\\lambda': 'λ', '\\mu': 'μ', '\\pi': 'π', '\\sigma': 'σ',
  '\\phi': 'φ', '\\psi': 'ψ', '\\omega': 'ω',
  '\\Gamma': 'Γ', '\\Delta': 'Δ', '\\Theta': 'Θ', '\\Lambda': 'Λ',
  '\\Sigma': 'Σ', '\\Phi': 'Φ', '\\Psi': 'Ψ', '\\Omega': 'Ω',
  '\\pm': '±', '\\times': '×', '\\div': '÷', '\\cdot': '·',
  '\\infty': '∞', '\\partial': '∂', '\\nabla': '∇',
  '\\leq': '≤', '\\geq': '≥', '\\neq': '≠', '\\approx': '≈',
  '\\equiv': '≡', '\\propto': '∝', '\\ll': '≪', '\\gg': '≫',
  '\\in': '∈', '\\notin': '∉', '\\subset': '⊂', '\\subseteq': '⊆',
  '\\cup': '∪', '\\cap': '∩', '\\emptyset': '∅',
  '\\forall': '∀', '\\exists': '∃', '\\neg': '¬',
  '\\land': '∧', '\\lor': '∨', '\\to': '→',
  '\\Rightarrow': '⇒', '\\Leftrightarrow': '⇔',
  '\\int': '∫', '\\iint': '∬', '\\oint': '∮',
  '\\sum': '∑', '\\prod': '∏',
  '\\sqrt': '√', '\\angle': '∠', '\\perp': '⊥',
  '\\mathbb{R}': 'ℝ', '\\mathbb{C}': 'ℂ', '\\mathbb{Z}': 'ℤ',
  '\\mathbb{N}': 'ℕ', '\\mathbb{Q}': 'ℚ',
  '\\ldots': '…', '\\cdots': '⋯',
  '\\langle': '⟨', '\\rangle': '⟩',
  '\\oplus': '⊕', '\\otimes': '⊗',
};

const SUPERSCRIPT_MAP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  'n': 'ⁿ', 'i': 'ⁱ',
};

const SUBSCRIPT_MAP: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  'a': 'ₐ', 'e': 'ₑ', 'i': 'ᵢ', 'j': 'ⱼ', 'k': 'ₖ',
  'n': 'ₙ', 'x': 'ₓ',
};

export function sanitizeDocumentName(value: string): string {
  return value.replace(/[^a-zA-Z0-9 _-]/g, '_').trim() || 'export';
}

export function downloadBytesAsFile(bytes: Uint8Array, fileName: string, mimeType: string): void {
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  const blob = new Blob([arrayBuffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function latexToUnicode(latex: string): string {
  let result = latex;

  try {
    result = decodeURIComponent(latex);
  } catch {
    result = latex;
  }

  result = result.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1/$2)');
  result = result.replace(/\\sqrt\[([^\]]*)\]\{([^}]*)\}/g, '$1√($2)');
  result = result.replace(/\\sqrt\{([^}]*)\}/g, '√($1)');
  result = result.replace(/\\binom\{([^}]*)\}\{([^}]*)\}/g, 'C($1,$2)');

  result = result.replace(/\^\{([^}]*)}/g, (_, content) => {
    return [...content].map((char: string) => SUPERSCRIPT_MAP[char] || char).join('');
  });
  result = result.replace(/\^([a-zA-Z0-9])/g, (_, char) => SUPERSCRIPT_MAP[char] || `^${char}`);

  result = result.replace(/_\{([^}]*)}/g, (_, content) => {
    return [...content].map((char: string) => SUBSCRIPT_MAP[char] || char).join('');
  });
  result = result.replace(/_([a-zA-Z0-9])/g, (_, char) => SUBSCRIPT_MAP[char] || `_${char}`);

  const replacements = Object.entries(LATEX_TO_UNICODE).sort((a, b) => b[0].length - a[0].length);
  for (const [command, replacement] of replacements) {
    const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`${escaped}(?![a-zA-Z{])`, 'g'), replacement);
  }

  return result.replace(/[{}]/g, '').replace(/\\\s/g, ' ').replace(/\u200B/g, '').trim();
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\u200B/g, '').replace(/\s+/g, ' ').trim();
}

function replaceMathMarkup(doc: Document): void {
  doc.querySelectorAll('.math-expression').forEach((node) => {
    const element = node as HTMLElement;
    const latex = element.getAttribute('data-latex');
    const text = latex ? latexToUnicode(latex) : normalizeWhitespace(element.textContent || '');
    const span = doc.createElement('span');
    span.textContent = text || normalizeWhitespace(element.textContent || '');
    span.className = 'math-export';
    span.setAttribute('data-export-math', 'true');
    element.replaceWith(span);
  });

  doc.querySelectorAll('.math-unicode, .math-template, .math-symbol').forEach((node) => {
    const element = node as HTMLElement;
    if (element.closest('[data-export-math="true"]')) return;

    const span = doc.createElement('span');
    span.textContent = normalizeWhitespace(element.textContent || '');
    span.className = 'math-export';
    span.setAttribute('data-export-math', 'true');
    element.replaceWith(span);
  });

  doc.querySelectorAll('[class*="ML__"]').forEach((node) => {
    const element = node as HTMLElement;
    if (element.closest('[data-export-math="true"]')) return;

    const text = normalizeWhitespace(element.textContent || '');
    if (!text) {
      element.remove();
      return;
    }

    const span = doc.createElement('span');
    span.textContent = text;
    span.className = 'math-export';
    span.setAttribute('data-export-math', 'true');
    element.replaceWith(span);
  });
}

function ensureExportStyles(doc: Document, mode: ExportMode): void {
  doc.querySelectorAll('script, noscript').forEach((node) => node.remove());
  doc.querySelectorAll('link[rel="preload"], link[rel="modulepreload"]').forEach((node) => node.remove());
  doc.getElementById('__viewer-theme')?.remove();

  // Math is now converted to Unicode for both modes — remove mathlive CSS
  doc.querySelectorAll('link[href*="mathlive"]').forEach((node) => node.remove());

  if (!doc.querySelector('meta[charset]')) {
    const meta = doc.createElement('meta');
    meta.setAttribute('charset', 'utf-8');
    doc.head.prepend(meta);
  }

  const styleId = '__document-export-style';
  doc.getElementById(styleId)?.remove();

  const style = doc.createElement('style');
  style.id = styleId;
  style.textContent = `
    @page { margin: 0.5in; }
    html, body {
      background: #ffffff !important;
      color: #000000 !important;
    }
    body {
      margin: 0;
      font-family: Calibri, Arial, sans-serif;
      font-size: 12pt;
      line-height: 1.5;
      overflow-wrap: anywhere;
      word-break: normal;
    }
    * { box-sizing: border-box; }
    body > *:first-child { margin-top: 0 !important; }
    img, svg, canvas {
      display: block;
      max-width: 100% !important;
      height: auto !important;
      margin: 0.75em 0;
      object-fit: contain;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    table, figure, pre, blockquote, ul, ol {
      max-width: 100% !important;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    table {
      width: 100% !important;
      border-collapse: collapse;
    }
    td, th { vertical-align: top; }
    pre {
      white-space: pre-wrap;
      word-break: break-word;
    }
    p, li, h1, h2, h3, h4, h5, h6 {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .math-export, [data-export-math="true"] {
      font-family: 'Cambria Math', 'Cambria', serif !important;
      white-space: pre-wrap;
    }
    ${mode === 'word' ? `
      body { margin: 0; }
      p, li { margin: 0 0 12pt; }
    ` : ''}
  `;
  doc.head.appendChild(style);
}

function prepareHtmlForDocumentExport(html: string, mode: ExportMode): string {
  const parser = new DOMParser();
  const documentHtml = /<html[\s>]/i.test(html)
    ? html
    : `<!DOCTYPE html><html><head></head><body>${html}</body></html>`;

  const doc = parser.parseFromString(documentHtml, 'text/html');

  // For both PDF and Word: convert math to Unicode text
  // html2canvas can't render MathLive elements properly, so we convert to Unicode
  replaceMathMarkup(doc);

  ensureExportStyles(doc, mode);

  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
}

async function waitForImages(doc: Document): Promise<void> {
  const images = Array.from(doc.images);
  await Promise.all(images.map((image) => {
    if (image.complete) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const done = () => {
        image.removeEventListener('load', done);
        image.removeEventListener('error', done);
        resolve();
      };

      image.addEventListener('load', done);
      image.addEventListener('error', done);
    });
  }));
}

async function withOffscreenDocument<T>(html: string, run: (doc: Document) => Promise<T>): Promise<T> {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-same-origin');
  iframe.style.position = 'fixed';
  iframe.style.top = '0';
  iframe.style.left = '0';
  iframe.style.width = '900px';
  iframe.style.height = '1200px';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.style.zIndex = '-1';

  const loaded = new Promise<void>((resolve) => {
    iframe.addEventListener('load', () => resolve(), { once: true });
  });

  document.body.appendChild(iframe);
  iframe.srcdoc = html;

  try {
    await loaded;
    const doc = iframe.contentDocument;
    if (!doc) throw new Error('Export preview failed to load');

    if (doc.fonts) {
      try {
        await doc.fonts.ready;
      } catch {
        // Ignore font readiness failures and continue.
      }
    }

    await waitForImages(doc);
    // Wait for external stylesheets (mathlive CSS) to load
    await waitForStylesheets(doc);
    await new Promise((resolve) => setTimeout(resolve, 300));
    return run(doc);
  } finally {
    document.body.removeChild(iframe);
  }
}

async function waitForStylesheets(doc: Document): Promise<void> {
  const links = Array.from(doc.querySelectorAll('link[rel="stylesheet"]')) as HTMLLinkElement[];
  await Promise.all(links.map((link) => {
    if (link.sheet) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const done = () => { resolve(); };
      link.addEventListener('load', done, { once: true });
      link.addEventListener('error', done, { once: true });
      // Timeout after 3s
      setTimeout(done, 3000);
    });
  }));
}

// Server-side PDF generation is disabled (no valid API key configured).
// Uses optimized client-side html2pdf.js rendering instead.
async function tryServerPdf(_preparedHtml: string, _fileName: string): Promise<Uint8Array | null> {
  return null;
}

export async function renderHtmlToPdfBytes(html: string, fileName: string): Promise<Uint8Array> {
  const preparedHtml = prepareHtmlForDocumentExport(html, 'pdf');

  // Try server-side headless Chrome first (if BROWSERLESS_API_KEY is configured)
  const serverResult = await tryServerPdf(preparedHtml, fileName);
  if (serverResult && serverResult.length > 500) {
    return serverResult;
  }

  // Fallback: high-quality client-side rendering
  return withOffscreenDocument(preparedHtml, async (doc) => {
    const element = doc.body;
    const html2pdf = (await import('html2pdf.js')).default;

    const pdfBlob = await (html2pdf() as any)
      .set({
        margin: [0.5, 0.5, 0.5, 0.5],
        filename: fileName,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 3,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
          windowWidth: 794,
          letterRendering: true,
          scrollX: 0,
          scrollY: 0,
        },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      })
      .from(element)
      .outputPdf('blob');

    return new Uint8Array(await pdfBlob.arrayBuffer());
  });
}

export async function renderHtmlToDocxBytes(html: string): Promise<Uint8Array> {
  const preparedHtml = prepareHtmlForDocumentExport(html, 'word');
  const htmlToDocxModule = await import('@turbodocx/html-to-docx') as any;
  const htmlToDocx = htmlToDocxModule.default || htmlToDocxModule;
  const output = await htmlToDocx(preparedHtml, null, {
    table: { row: { cantSplit: true } },
  });

  if (output instanceof Uint8Array) return output;
  if (output instanceof ArrayBuffer) return new Uint8Array(output);
  if (ArrayBuffer.isView(output)) return new Uint8Array(output.buffer, output.byteOffset, output.byteLength);
  if (typeof Blob !== 'undefined' && output instanceof Blob) return new Uint8Array(await output.arrayBuffer());

  throw new Error('Unsupported DOCX export output');
}