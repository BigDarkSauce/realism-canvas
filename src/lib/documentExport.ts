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
  '\\log': 'log', '\\ln': 'ln', '\\lg': 'lg',
  '\\sin': 'sin', '\\cos': 'cos', '\\tan': 'tan',
  '\\sec': 'sec', '\\csc': 'csc', '\\cot': 'cot',
  '\\arcsin': 'arcsin', '\\arccos': 'arccos', '\\arctan': 'arctan',
  '\\sinh': 'sinh', '\\cosh': 'cosh', '\\tanh': 'tanh',
  '\\lim': 'lim', '\\sup': 'sup', '\\inf': 'inf',
  '\\max': 'max', '\\min': 'min', '\\exp': 'exp',
  '\\det': 'det', '\\dim': 'dim', '\\ker': 'ker',
  '\\hom': 'hom', '\\deg': 'deg', '\\gcd': 'gcd',
  '\\bmod': 'mod',
  '\\left': '', '\\right': '', '\\displaystyle': '', '\\textstyle': '',
  '\\mathrm': '', '\\mathit': '', '\\mathbf': '', '\\text': '',
};

const SUPERSCRIPT_MAP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  'n': 'ⁿ', 'i': 'ⁱ', 'x': 'ˣ', 'y': 'ʸ',
  'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ',
  'f': 'ᶠ', 'g': 'ᵍ', 'h': 'ʰ', 'j': 'ʲ', 'k': 'ᵏ',
  'l': 'ˡ', 'm': 'ᵐ', 'o': 'ᵒ', 'p': 'ᵖ', 'r': 'ʳ',
  's': 'ˢ', 't': 'ᵗ', 'u': 'ᵘ', 'v': 'ᵛ', 'w': 'ʷ',
  'z': 'ᶻ',
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

function matchBalancedBrace(str: string, start: number): string {
  if (str[start] !== '{') return '';
  let depth = 0;
  for (let i = start; i < str.length; i++) {
    if (str[i] === '{') depth++;
    else if (str[i] === '}') { depth--; if (depth === 0) return str.slice(start + 1, i); }
  }
  return str.slice(start + 1);
}

function replaceBalancedPattern(str: string, prefix: string, replacer: (inner: string) => string): string {
  let result = str;
  let idx = 0;
  while ((idx = result.indexOf(prefix, idx)) !== -1) {
    const braceStart = idx + prefix.length;
    if (result[braceStart] !== '{') { idx++; continue; }
    const inner = matchBalancedBrace(result, braceStart);
    const end = braceStart + inner.length + 2; // +2 for { and }
    result = result.slice(0, idx) + replacer(inner) + result.slice(end);
  }
  return result;
}

function latexToUnicode(latex: string): string {
  let result = latex;

  try {
    result = decodeURIComponent(latex);
  } catch {
    result = latex;
  }

  // Handle nested structures with balanced brace matching
  result = replaceBalancedPattern(result, '\\frac', (inner) => {
    // \frac{a}{b} - need second arg
    const rest = result.slice(result.indexOf(inner) + inner.length + 1);
    return `(${latexToUnicode(inner)}`;
  });
  // Multi-pass for \frac{a}{b}
  let safety = 0;
  while (result.includes('\\frac{') && safety++ < 10) {
    result = result.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1/$2)');
  }

  // \sqrt with optional index
  while (result.includes('\\sqrt[') && safety++ < 20) {
    result = result.replace(/\\sqrt\[([^\]]*)\]\{([^{}]*)\}/g, '$1√($2)');
  }
  while (result.includes('\\sqrt{') && safety++ < 30) {
    result = result.replace(/\\sqrt\{([^{}]*)\}/g, '√($1)');
  }
  // Bare \sqrt followed by a single token
  result = result.replace(/\\sqrt\s+([a-zA-Z0-9])/g, '√$1');

  result = result.replace(/\\binom\{([^{}]*)\}\{([^{}]*)\}/g, 'C($1,$2)');

  // \log_{base}(arg) patterns
  result = result.replace(/\\log_\{([^{}]*)\}/g, 'log_$1');
  result = result.replace(/\\log_([a-zA-Z0-9])/g, 'log_$1');

  // Limits: \lim_{x \to a}
  result = result.replace(/\\lim_\{([^{}]*)\}/g, 'lim[$1]');

  // \int_{a}^{b}, \sum_{i=0}^{n}
  result = result.replace(/\\(int|iint|oint|sum|prod)_\{([^{}]*)\}\^\{([^{}]*)\}/g, (_, cmd, lo, hi) => {
    const sym = LATEX_TO_UNICODE[`\\${cmd}`] || cmd;
    return `${sym}[${lo}→${hi}]`;
  });
  result = result.replace(/\\(int|iint|oint|sum|prod)_\{([^{}]*)\}/g, (_, cmd, lo) => {
    const sym = LATEX_TO_UNICODE[`\\${cmd}`] || cmd;
    return `${sym}[${lo}]`;
  });

  // Superscripts: x^{abc} or x^n (handle nested braces)
  while (result.match(/\^\{[^{}]*\}/) && safety++ < 40) {
    result = result.replace(/\^\{([^{}]*)\}/g, (_, content) => {
      return [...content].map((char: string) => SUPERSCRIPT_MAP[char] || char).join('');
    });
  }
  result = result.replace(/\^([a-zA-Z0-9])/g, (_, c) => SUPERSCRIPT_MAP[c] || `^${c}`);

  // Subscripts: x_{abc} or x_n
  while (result.match(/_\{[^{}]*\}/) && safety++ < 50) {
    result = result.replace(/_\{([^{}]*)\}/g, (_, content) => {
      return [...content].map((char: string) => SUBSCRIPT_MAP[char] || char).join('');
    });
  }
  result = result.replace(/_([a-zA-Z0-9])/g, (_, c) => SUBSCRIPT_MAP[c] || `_${c}`);

  // Replace LaTeX commands with Unicode (longest first)
  const replacements = Object.entries(LATEX_TO_UNICODE).sort((a, b) => b[0].length - a[0].length);
  for (const [command, replacement] of replacements) {
    const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped + '(?![a-zA-Z{])', 'g'), replacement);
  }

  // Handle remaining \command{content} patterns - just extract content
  result = result.replace(/\\[a-zA-Z]+\{([^{}]*)\}/g, '$1');

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
    .math-export, [data-export-math="true"], math, mrow, mi, mn, mo, mtext, mfrac, msqrt, mroot, msub, msup, msubsup, munder, mover, munderover, mtable, mtr, mtd, .docx-math, .docx-cambria-math {
      font-family: 'Cambria Math', 'Cambria', serif !important;
      white-space: pre-wrap;
    }
    .docx-math-block, math[display="block"] {
      display: block;
      text-align: center;
      margin: 0.75em 0;
      overflow-x: auto;
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

async function tryServerPdf(preparedHtml: string, fileName: string): Promise<Uint8Array | null> {
  try {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    if (!projectId) return null;

    const url = `https://${projectId}.supabase.co/functions/v1/html-to-pdf`;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
        'apikey': anonKey,
      },
      body: JSON.stringify({ html: preparedHtml, filename: fileName }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (body.fallback) return null;
      console.warn('Server PDF failed:', res.status);
      return null;
    }

    const { pdf } = await res.json();
    if (!pdf) return null;

    const binary = atob(pdf);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch (err) {
    console.warn('Server PDF error, using client fallback:', err);
    return null;
  }
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