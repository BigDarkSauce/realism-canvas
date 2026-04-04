import { useState } from 'react';
import { Block, Connection, Group, DrawingStroke, CanvasBackground } from '@/types/canvas';
import { getCenter as getBlockCenter, getControlPoints as getConnCPs } from '@/components/canvas/ConnectionArrows';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import { extractStoragePath, getSignedUrl } from '@/lib/storage';
import {
  renderHtmlToDocxBytes as renderStructuredDocxBytes,
  renderHtmlToPdfBytes as renderStructuredPdfBytes,
} from '@/lib/documentExport';

export interface CanvasExportState {
  blocks: Block[];
  connections: Connection[];
  groups: Group[];
  strokes: DrawingStroke[];
  background: CanvasBackground;
  backgroundImage: string | null;
  canvasElement: HTMLElement | null;
}

interface CanvasExportProps {
  open: boolean;
  onClose: () => void;
  getState: () => CanvasExportState;
}

type ExportFormat = 'pdf' | 'word';

export default function CanvasExport({ open, onClose, getState }: CanvasExportProps) {
  const [title, setTitle] = useState('Canvas Export');
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const state = getState();
      const zip = new JSZip();

      // 1. Generate visual canvas map PDF
      const { pdfBytes: mapPdf, blockLinks } = await generateCanvasMapPdf(state, format);

      // 2. Build the block files (for attachment embedding only, not written to ZIP folders)
      const blockFiles = await collectBlockFiles(state, format);

      // 3. Embed file attachments into the canvas map PDF
      // Attachments reference filenames as if in group folders so manual placement works
      const mapPdfWithAttachments = await embedFileAttachments(mapPdf, blockLinks, blockFiles, format, state);
      zip.file('canvas-map.pdf', mapPdfWithAttachments, { binary: true });

      // No block files are written to ZIP - user exports them individually via group export

      // 4. Download ZIP
      const zipData = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });
      saveAs(zipData, `${sanitize(title)}.zip`);
      toast.success('Canvas exported successfully!');
      onClose();
    } catch (err) {
      console.error('Export failed:', err);
      toast.error('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Canvas</DialogTitle>
          <DialogDescription>
            Export a PDF canvas map plus attached block files organized by group folders.
            The canvas map is always PDF; choose the format for attached block documents.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="export-title">Export Name</Label>
            <Input id="export-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="My Canvas" />
          </div>
          <div className="space-y-2">
            <Label>Attached File Format</Label>
            <RadioGroup value={format} onValueChange={v => setFormat(v as ExportFormat)} className="flex gap-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="pdf" id="fmt-pdf" />
                <Label htmlFor="fmt-pdf" className="cursor-pointer">PDF</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="word" id="fmt-word" />
                <Label htmlFor="fmt-word" className="cursor-pointer">Word (.docx)</Label>
              </div>
            </RadioGroup>
          </div>
        </div>
        <Button onClick={handleExport} disabled={exporting} className="w-full gap-2">
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {exporting ? 'Exporting…' : 'Export ZIP'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// ─── Utilities ──────────────────────────────────────────────

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9 _-]/g, '_').trim() || 'export';
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function parseColor(color: string | undefined, fallback: [number, number, number]): [number, number, number] {
  if (!color) return fallback;
  const s = color.trim();
  const hexMatch = s.match(/^#([0-9a-f]{3,8})$/i);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    if (hex.length >= 6) return [parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16)];
  }
  const rgbMatch = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) return [+rgbMatch[1], +rgbMatch[2], +rgbMatch[3]];
  const hslMatch = s.match(/^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/);
  if (hslMatch) {
    const h = +hslMatch[1] / 360, sat = +hslMatch[2] / 100, l = +hslMatch[3] / 100;
    if (sat === 0) { const v = Math.round(l * 255); return [v, v, v]; }
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
    const p = 2 * l - q;
    return [Math.round(hue2rgb(p, q, h + 1/3) * 255), Math.round(hue2rgb(p, q, h) * 255), Math.round(hue2rgb(p, q, h - 1/3) * 255)];
  }
  const named: Record<string, [number,number,number]> = {
    white:[255,255,255], black:[0,0,0], red:[255,0,0], green:[0,128,0], blue:[0,0,255],
    yellow:[255,255,0], orange:[255,165,0], purple:[128,0,128], pink:[255,192,203],
    gray:[128,128,128], grey:[128,128,128], transparent:[255,255,255],
  };
  if (named[s.toLowerCase()]) return named[s.toLowerCase()];
  return fallback;
}

function parseFontSize(fs: string | undefined, defaultPt: number): number {
  if (!fs) return defaultPt;
  const n = parseFloat(fs);
  if (isNaN(n)) return defaultPt;
  if (fs.includes('rem')) return n * 12;
  if (fs.includes('em')) return n * 12;
  return n;
}

// ─── LaTeX → Unicode mapping for math export ────────

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

function latexToUnicode(latex: string): string {
  let result = latex;

  try {
    result = decodeURIComponent(latex);
  } catch {
    result = latex;
  }

  let safety = 0;

  // Multi-pass for \frac{a}{b}
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

  // Superscripts: x^{abc} or x^n
  while (result.match(/\^\{[^{}]*\}/) && safety++ < 40) {
    result = result.replace(/\^\{([^{}]*)\}/g, (_, content) => {
      return [...content].map((c: string) => SUPERSCRIPT_MAP[c] || c).join('');
    });
  }
  result = result.replace(/\^([a-zA-Z0-9])/g, (_, c) => SUPERSCRIPT_MAP[c] || `^${c}`);

  // Subscripts: x_{abc} or x_n
  while (result.match(/_\{[^{}]*\}/) && safety++ < 50) {
    result = result.replace(/_\{([^{}]*)\}/g, (_, content) => {
      return [...content].map((c: string) => SUBSCRIPT_MAP[c] || c).join('');
    });
  }
  result = result.replace(/_([a-zA-Z0-9])/g, (_, c) => SUBSCRIPT_MAP[c] || `_${c}`);

  // Replace LaTeX commands with Unicode (longest first)
  const sorted = Object.entries(LATEX_TO_UNICODE).sort((a, b) => b[0].length - a[0].length);
  for (const [cmd, char] of sorted) {
    const escaped = cmd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped + '(?![a-zA-Z{])', 'g'), char);
  }

  // Handle remaining \command{content} patterns
  result = result.replace(/\\[a-zA-Z]+\{([^{}]*)\}/g, '$1');

  // Clean up remaining braces and backslashes
  result = result.replace(/[{}]/g, '').replace(/\\\s/g, ' ');

  return result;
}

/**
 * Convert math HTML (with data-latex attributes or math-unicode spans) to Unicode text,
 * then strip remaining HTML tags for plain text export (PDF).
 */
function convertMathHtmlToUnicode(html: string): string {
  let result = html;

  // Convert <span class="math-expression" data-latex="...">...</span> to Unicode
  result = result.replace(/<span[^>]*class="math-expression"[^>]*data-latex="([^"]*)"[^>]*>[\s\S]*?<\/span>/gi,
    (_, latex) => ` ${latexToUnicode(latex)} `
  );

  // For math-unicode spans, the inner text already has Unicode chars — just strip wrapping
  // but keep inner content (the Unicode is already there from the editor)

  // Standard HTML to text conversion
  result = result
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<sup[^>]*>/gi, '').replace(/<\/sup>/gi, '')
    .replace(/<sub[^>]*>/gi, '').replace(/<\/sub>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\u200B/g, '')
    .replace(/\n{3,}/g, '\n\n');

  return result;
}

/**
 * Ensure math expressions in HTML have explicit Cambria Math font for Word rendering.
 * Also convert MathLive static markup <span class="ML__..."> to Word-friendly HTML.
 */
function ensureMathFontsForWord(html: string): string {
  const isFullDocument = /<html[\s>]/i.test(html);
  const parser = new DOMParser();
  const doc = parser.parseFromString(
    isFullDocument ? html : `<!DOCTYPE html><html><head></head><body>${html}</body></html>`,
    'text/html'
  );

  doc.querySelectorAll('.math-expression, .math-unicode, .math-template').forEach((node) => {
    const el = node as HTMLElement;
    const currentStyle = el.getAttribute('style')?.trim() || '';
    const stylePrefix = currentStyle && !currentStyle.endsWith(';') ? `${currentStyle};` : currentStyle;
    const extraStyle = el.classList.contains('math-expression')
      ? "font-family:'Cambria Math','Cambria',serif;display:inline-block;vertical-align:middle;"
      : "font-family:'Cambria Math','Cambria',serif;";
    el.setAttribute('style', `${stylePrefix}${extraStyle}`);
  });

  return isFullDocument ? '<!DOCTYPE html>\n' + doc.documentElement.outerHTML : doc.body.innerHTML;
}

// ─── Helpers ────────

// ─── Canvas Map PDF (multi-page tiled, visual reference) ─────

interface BlockLinkInfo { blockId: string; mapPage: number; x: number; y: number; w: number; h: number; }

async function generateCanvasMapPdf(state: CanvasExportState, exportFormat: ExportFormat = 'pdf'): Promise<{ pdfBytes: Uint8Array; blockLinks: BlockLinkInfo[] }> {
  const { blocks, connections, groups, strokes, background, backgroundImage } = state;
  if (blocks.length === 0) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFontSize(16);
    doc.text('Canvas Map - No blocks', 40, 40);
    return { pdfBytes: new Uint8Array(doc.output('arraybuffer')), blockLinks: [] };
  }

  // Compute bounding box including strokes
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of blocks) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  for (const group of groups) {
    const gBlocks = blocks.filter(b => b.groupId === group.id);
    if (gBlocks.length === 0) continue;
    for (const b of gBlocks) {
      minY = Math.min(minY, b.y - 40);
    }
  }
  for (const stroke of strokes) {
    for (const pt of stroke.points) {
      minX = Math.min(minX, pt.x);
      minY = Math.min(minY, pt.y);
      maxX = Math.max(maxX, pt.x);
      maxY = Math.max(maxY, pt.y);
    }
  }

  const padding = 40;
  const contentW = maxX - minX + padding * 2;
  const contentH = maxY - minY + padding * 2;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 30;
  const availW = pageW - margin * 2;
  const availH = pageH - margin * 2;

  const singlePageScale = Math.min(availW / contentW, availH / contentH);
  const minBlockSize = 35;
  const avgBlockW = blocks.reduce((s, b) => s + b.width, 0) / blocks.length;
  const minScale = minBlockSize / avgBlockW;
  const scale = Math.max(singlePageScale, minScale, 0.15);
  const isSinglePage = contentW * scale <= availW && contentH * scale <= availH;

  const tilesX = isSinglePage ? 1 : Math.ceil((contentW * scale) / availW);
  const tilesY = isSinglePage ? 1 : Math.ceil((contentH * scale) / availH);
  const totalMapPages = tilesX * tilesY;

  // Try to load background image if present
  let bgImgData: string | null = null;
  if (background === 'image' && backgroundImage) {
    try {
      const resp = await fetch(backgroundImage);
      const blob = await resp.blob();
      bgImgData = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch { /* ignore */ }
  }

  const groupMap = new Map<string, Group>();
  groups.forEach(g => groupMap.set(g.id, g));
  const blockMap = new Map<string, Block>();
  blocks.forEach(b => blockMap.set(b.id, b));

  // Collect block link rects for file attachment annotations
  const blockLinks: BlockLinkInfo[] = [];

  for (let tileY = 0; tileY < tilesY; tileY++) {
    for (let tileX = 0; tileX < tilesX; tileX++) {
      if (tileX > 0 || tileY > 0) doc.addPage();
      const currentMapPage = tileY * tilesX + tileX + 1; // 1-indexed

      const vpLeft = minX - padding + (tileX * availW) / scale;
      const vpTop = minY - padding + (tileY * availH) / scale;
      const vpRight = vpLeft + availW / scale;
      const vpBottom = vpTop + availH / scale;

      const tx = (x: number) => margin + (x - vpLeft) * scale;
      const ty = (y: number) => margin + (y - vpTop) * scale;

      doc.saveGraphicsState();
      doc.rect(margin, margin, availW, availH);
      (doc as any).internal.write('W n');

      // Background
      drawBackground(doc, background, bgImgData, margin, margin, availW, availH, scale);

      // Drawing strokes
      for (const stroke of strokes) {
        if (stroke.points.length < 2) continue;
        const strokeMinX = Math.min(...stroke.points.map(p => p.x));
        const strokeMaxX = Math.max(...stroke.points.map(p => p.x));
        const strokeMinY = Math.min(...stroke.points.map(p => p.y));
        const strokeMaxY = Math.max(...stroke.points.map(p => p.y));
        if (strokeMaxX < vpLeft || strokeMinX > vpRight || strokeMaxY < vpTop || strokeMinY > vpBottom) continue;

        const col = parseColor(stroke.color, [0, 0, 0]);
        doc.setDrawColor(col[0], col[1], col[2]);
        doc.setLineWidth(Math.max(0.5, stroke.width * scale));
        doc.setLineDashPattern([], 0);
        const pts = stroke.points;
        for (let i = 0; i < pts.length - 1; i++) {
          doc.line(tx(pts[i].x), ty(pts[i].y), tx(pts[i+1].x), ty(pts[i+1].y));
        }
      }

      // Group rects
      interface GroupRect { group: Group; rx: number; ry: number; rw: number; rh: number; isTransparent: boolean; groupBg: [number,number,number]; }
      const groupRects: GroupRect[] = [];
      for (const group of groups) {
        const gBlocks = blocks.filter(b => b.groupId === group.id);
        if (gBlocks.length === 0) continue;
        let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
        for (const b of gBlocks) {
          gMinX = Math.min(gMinX, b.x);
          gMinY = Math.min(gMinY, b.y);
          gMaxX = Math.max(gMaxX, b.x + b.width);
          gMaxY = Math.max(gMaxY, b.y + b.height);
        }
        if (gMaxX < vpLeft || gMinX > vpRight || gMaxY < vpTop || gMinY > vpBottom) continue;
        const gPad = 20;
        const labelScale = group.labelScale ?? 1;
        const groupFontSize = parseFontSize(group.fontSize, 10) * scale * labelScale;
        const labelAreaH = groupFontSize + 16;
        const rx = tx(gMinX - gPad);
        const ry = ty(gMinY - gPad) - labelAreaH;
        const rw = (gMaxX - gMinX + gPad * 2) * scale;
        const rh = (gMaxY - gMinY + gPad * 2) * scale + labelAreaH;
        const isTransparent = !group.bgColor || group.bgColor === 'transparent';
        const groupBg = parseColor(isTransparent ? undefined : group.bgColor, [100, 149, 237]);
        groupRects.push({ group, rx, ry, rw, rh, isTransparent, groupBg });
      }

      // Draw group fills with overlap clipping
      for (let gi = 0; gi < groupRects.length; gi++) {
        const { group, rx, ry, rw, rh, isTransparent, groupBg } = groupRects[gi];
        if (!isTransparent) {
          doc.saveGraphicsState();
          const internal = (doc as any).internal;
          const f = (n: number) => n.toFixed(4);
          internal.write(`${f(rx)} ${f(pageH - ry)} m`);
          internal.write(`${f(rx + rw)} ${f(pageH - ry)} l`);
          internal.write(`${f(rx + rw)} ${f(pageH - (ry + rh))} l`);
          internal.write(`${f(rx)} ${f(pageH - (ry + rh))} l`);
          internal.write('h');
          for (let gj = 0; gj < groupRects.length; gj++) {
            if (gi === gj) continue;
            const other = groupRects[gj];
            const ox1 = Math.max(rx, other.rx);
            const oy1 = Math.max(ry, other.ry);
            const ox2 = Math.min(rx + rw, other.rx + other.rw);
            const oy2 = Math.min(ry + rh, other.ry + other.rh);
            if (ox1 < ox2 && oy1 < oy2) {
              const inset = 2;
              internal.write(`${f(ox1 + inset)} ${f(pageH - (oy1 + inset))} m`);
              internal.write(`${f(ox1 + inset)} ${f(pageH - (oy2 - inset))} l`);
              internal.write(`${f(ox2 - inset)} ${f(pageH - (oy2 - inset))} l`);
              internal.write(`${f(ox2 - inset)} ${f(pageH - (oy1 + inset))} l`);
              internal.write('h');
            }
          }
          internal.write('W n');
          doc.setFillColor(
            Math.min(255, groupBg[0] + Math.round((255 - groupBg[0]) * 0.88)),
            Math.min(255, groupBg[1] + Math.round((255 - groupBg[1]) * 0.88)),
            Math.min(255, groupBg[2] + Math.round((255 - groupBg[2]) * 0.88))
          );
          doc.rect(rx, ry, rw, rh, 'F');
          doc.restoreGraphicsState();
        }

        const borderCol = isTransparent ? [150, 150, 170] as [number,number,number] : groupBg;
        doc.setDrawColor(borderCol[0], borderCol[1], borderCol[2]);
        doc.setLineWidth(1.5);
        doc.setLineDashPattern([4, 3], 0);
        doc.roundedRect(rx, ry, rw, rh, 6, 6, 'S');
        doc.setLineDashPattern([], 0);

        // Group label
        const labelScale2 = group.labelScale ?? 1;
        const groupFontSize = parseFontSize(group.fontSize, 10) * scale * labelScale2;
        const fontSize = Math.max(6, groupFontSize);
        doc.setFontSize(fontSize);
        doc.setFont('helvetica', 'bold');
        const txtColor = parseColor(group.textColor, isTransparent ? [80,80,100] : [groupBg[0], groupBg[1], groupBg[2]]);
        const labelX = rx + rw / 2 + (group.labelOffsetX ?? 0) * scale;
        const labelY = ry + fontSize + 6;
        const labelW = doc.getTextWidth(group.label) + 14;
        const labelH = fontSize + 10;
        doc.setDrawColor(borderCol[0], borderCol[1], borderCol[2]);
        doc.setFillColor(255, 255, 255);
        doc.setLineWidth(1.2);
        doc.roundedRect(labelX - labelW / 2, labelY - fontSize * 0.75 - 4, labelW, labelH, 3, 3, 'FD');
        doc.setTextColor(txtColor[0], txtColor[1], txtColor[2]);
        doc.text(group.label, labelX, labelY, { align: 'center' });
      }

      // Blocks
      for (const b of blocks) {
        if (b.x + b.width < vpLeft || b.x > vpRight || b.y + b.height < vpTop || b.y > vpBottom) continue;
        const bx = tx(b.x);
        const by = ty(b.y);
        const bw = b.width * scale;
        const bh = b.height * scale;
        const bgCol = parseColor(b.bgColor, b.shape === 'sticky' ? [255, 249, 196] : [245, 245, 250]);
        const borderCol = parseColor(b.borderColor, [80, 80, 100]);
        const textCol = parseColor(b.textColor, [20, 20, 40]);
        doc.setFillColor(bgCol[0], bgCol[1], bgCol[2]);
        doc.setDrawColor(borderCol[0], borderCol[1], borderCol[2]);
        doc.setLineWidth(1);
        if (b.borderStyle === 'dashed') doc.setLineDashPattern([4, 3], 0);
        else if (b.borderStyle === 'dotted') doc.setLineDashPattern([1.5, 2], 0);
        else doc.setLineDashPattern([], 0);

        const rotation = b.rotation ?? 0;
        const cx = bx + bw / 2;
        const cy = by + bh / 2;
        const needsRotation = Math.abs(rotation) > 0.5;
        const cornerR = b.shape === 'circle'
          ? Math.min(bw, bh) / 2
          : b.shape === 'sticky' ? 2 : Math.min(8 * scale, Math.min(bw, bh) / 3);

        if (needsRotation) {
          doc.saveGraphicsState();
          const rad = (rotation * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          const internal = (doc as any).internal;
          const f2 = (n: number) => n.toFixed(4);
          internal.write(`${f2(cos)} ${f2(sin)} ${f2(-sin)} ${f2(cos)} ${f2(cx)} ${f2(pageH - cy)} cm`);
          doc.roundedRect(-bw / 2, -bh / 2, bw, bh, cornerR, cornerR, 'FD');
          if (b.shape === 'sticky') {
            const foldSize = 10 * scale;
            doc.setFillColor(Math.max(0, bgCol[0] - 30), Math.max(0, bgCol[1] - 30), Math.max(0, bgCol[2] - 30));
            doc.triangle(bw / 2 - foldSize, -bh / 2, bw / 2, -bh / 2, bw / 2, -bh / 2 + foldSize, 'F');
          }
          const fSize = Math.max(5, Math.min(parseFontSize(b.fontSize, 10), 14) * scale);
          doc.setFontSize(fSize);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(textCol[0], textCol[1], textCol[2]);
          const labelLines = doc.splitTextToSize(b.label, bw - 8);
          const textStartY = -(labelLines.length - 1) * (fSize * 0.6);
          for (let i = 0; i < Math.min(labelLines.length, 4); i++) {
            doc.text(labelLines[i], 0, textStartY + i * (fSize * 1.2), { align: 'center' });
          }
          doc.restoreGraphicsState();
        } else {
          doc.roundedRect(bx, by, bw, bh, cornerR, cornerR, 'FD');
          if (b.shape === 'sticky') {
            const foldSize = 10 * scale;
            doc.setFillColor(Math.max(0, bgCol[0] - 30), Math.max(0, bgCol[1] - 30), Math.max(0, bgCol[2] - 30));
            doc.triangle(bx + bw - foldSize, by, bx + bw, by, bx + bw, by + foldSize, 'F');
          }
          const fSize = Math.max(5, Math.min(parseFontSize(b.fontSize, 10), 14) * scale);
          doc.setFontSize(fSize);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(textCol[0], textCol[1], textCol[2]);
          const labelLines = doc.splitTextToSize(b.label, bw - 8);
          const textStartY = by + bh / 2 - (labelLines.length - 1) * (fSize * 0.6);
          for (let i = 0; i < Math.min(labelLines.length, 4); i++) {
            doc.text(labelLines[i], cx, textStartY + i * (fSize * 1.2), { align: 'center' });
          }
        }
        doc.setLineDashPattern([], 0);

        // Record link rect for later (we'll add internal links after appending detail pages)
        const linkX = needsRotation ? cx - bw / 2 : bx;
        const linkY = needsRotation ? cy - bh / 2 : by;
        blockLinks.push({ blockId: b.id, mapPage: currentMapPage, x: linkX, y: linkY, w: bw, h: bh });
      }

      // Connections
      const getEdgePointPdf = (fromPt: {x:number,y:number}, toPt: {x:number,y:number}, block: Block) => {
        const bcx = tx(block.x + block.width / 2);
        const bcy = ty(block.y + block.height / 2);
        const hw = (block.width * scale) / 2;
        const hh = (block.height * scale) / 2;
        const dx = toPt.x - fromPt.x;
        const dy = toPt.y - fromPt.y;
        const angle = Math.atan2(dy, dx);
        const absCos = Math.abs(Math.cos(angle));
        const absSin = Math.abs(Math.sin(angle));
        let px: number, py: number;
        if (hw * absSin < hh * absCos) {
          const sign = Math.cos(angle) > 0 ? 1 : -1;
          px = bcx + sign * hw;
          py = bcy + sign * hw * Math.tan(angle);
        } else {
          const sign = Math.sin(angle) > 0 ? 1 : -1;
          px = bcx + sign * hh / Math.tan(angle);
          py = bcy + sign * hh;
        }
        return { x: px, y: py };
      };

      for (const conn of connections) {
        const fromBlock = blockMap.get(conn.fromId);
        const toBlock = blockMap.get(conn.toId);
        if (!fromBlock || !toBlock) continue;
        const fCenterX = fromBlock.x + fromBlock.width / 2;
        const fCenterY = fromBlock.y + fromBlock.height / 2;
        const tCenterX = toBlock.x + toBlock.width / 2;
        const tCenterY = toBlock.y + toBlock.height / 2;
        const connMinX = Math.min(fCenterX, tCenterX) - 100;
        const connMaxX = Math.max(fCenterX, tCenterX) + 100;
        const connMinY = Math.min(fCenterY, tCenterY) - 100;
        const connMaxY = Math.max(fCenterY, tCenterY) + 100;
        if (connMaxX < vpLeft || connMinX > vpRight || connMaxY < vpTop || connMinY > vpBottom) continue;

        const fromCenter = { x: tx(fCenterX), y: ty(fCenterY) };
        const toCenter = { x: tx(tCenterX), y: ty(tCenterY) };
        const midX = (fromCenter.x + toCenter.x) / 2 + (conn.cpX || 0) * scale;
        const midY = (fromCenter.y + toCenter.y) / 2 + (conn.cpY || 0) * scale;
        const hasBend = conn.cpX !== undefined && conn.cpY !== undefined && (Math.abs(conn.cpX) > 2 || Math.abs(conn.cpY) > 2);
        const aimPoint = hasBend ? { x: midX, y: midY } : toCenter;
        const aimPointReverse = hasBend ? { x: midX, y: midY } : fromCenter;
        const from = getEdgePointPdf(fromCenter, aimPoint, fromBlock);
        const to = getEdgePointPdf(toCenter, aimPointReverse, toBlock);
        const connColor = parseColor(conn.color, [60, 60, 80]);
        doc.setDrawColor(connColor[0], connColor[1], connColor[2]);
        doc.setFillColor(connColor[0], connColor[1], connColor[2]);
        const connWidth = Math.max(0.5, (conn.strokeWidth ?? 2) * scale * 0.5);
        doc.setLineWidth(connWidth);
        if (conn.arrowStyle === 'dashed') doc.setLineDashPattern([4, 3], 0);
        else if (conn.arrowStyle === 'dotted') doc.setLineDashPattern([1.5, 2], 0);
        else doc.setLineDashPattern([], 0);

        if (hasBend) {
          const cp1x = from.x + (2/3) * (midX - from.x);
          const cp1y = from.y + (2/3) * (midY - from.y);
          const cp2x = to.x + (2/3) * (midX - to.x);
          const cp2y = to.y + (2/3) * (midY - to.y);
          const internal = (doc as any).internal;
          const f = (n: number) => n.toFixed(4);
          internal.write(`${f(from.x)} ${f(pageH - from.y)} m`);
          internal.write(`${f(cp1x)} ${f(pageH - cp1y)} ${f(cp2x)} ${f(pageH - cp2y)} ${f(to.x)} ${f(pageH - to.y)} c`);
          internal.write('S');
        } else {
          doc.line(from.x, from.y, to.x, to.y);
        }
        doc.setLineDashPattern([], 0);

        let angle: number;
        if (hasBend) {
          angle = Math.atan2(to.y - midY, to.x - midX);
        } else {
          angle = Math.atan2(to.y - from.y, to.x - from.x);
        }
        const aLen = Math.max(6, 8 * scale);
        const aW = Math.PI / 7;
        doc.triangle(
          to.x, to.y,
          to.x - aLen * Math.cos(angle - aW), to.y - aLen * Math.sin(angle - aW),
          to.x - aLen * Math.cos(angle + aW), to.y - aLen * Math.sin(angle + aW),
          'F'
        );
      }

      doc.restoreGraphicsState(); // end clip

      if (totalMapPages > 1) {
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(150, 150, 150);
        doc.text(`Page ${currentMapPage}/${totalMapPages} (${tileX + 1},${tileY + 1})`, margin, pageH - 10);
      }
    }
  }

  return { pdfBytes: new Uint8Array(doc.output('arraybuffer')), blockLinks };
}

function drawBackground(
  doc: jsPDF, bg: CanvasBackground, bgImgData: string | null,
  x: number, y: number, w: number, h: number, scale: number
) {
  // Fill the ENTIRE page first to eliminate any white gaps
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  if (bg === 'image' && bgImgData) {
    try {
      doc.addImage(bgImgData, 'JPEG', 0, 0, pageW, pageH);
    } catch { /* fallback to white */ }
    return;
  }
  if (bg === 'blueprint') {
    doc.setFillColor(17, 42, 75);
    doc.rect(0, 0, pageW, pageH, 'F');
    const step = 20 * scale;
    doc.setDrawColor(30, 70, 120);
    doc.setLineWidth(0.3);
    for (let gx = x; gx <= x + w; gx += step) doc.line(gx, y, gx, y + h);
    for (let gy = y; gy <= y + h; gy += step) doc.line(x, gy, x + w, gy);
  } else if (bg === 'grid') {
    doc.setFillColor(250, 250, 252);
    doc.rect(0, 0, pageW, pageH, 'F');
    const step = 20 * scale;
    doc.setDrawColor(230, 230, 235);
    doc.setLineWidth(0.2);
    for (let gx = x; gx <= x + w; gx += step) doc.line(gx, y, gx, y + h);
    for (let gy = y; gy <= y + h; gy += step) doc.line(x, gy, x + w, gy);
  } else if (bg === 'dots') {
    doc.setFillColor(250, 250, 252);
    doc.rect(0, 0, pageW, pageH, 'F');
    const step = 20 * scale;
    doc.setFillColor(210, 210, 215);
    for (let gx = x; gx <= x + w; gx += step) {
      for (let gy = y; gy <= y + h; gy += step) {
        doc.circle(gx, gy, 0.6, 'F');
      }
    }
  } else {
    doc.setFillColor(252, 252, 254);
    doc.rect(0, 0, pageW, pageH, 'F');
  }
}

// ─── Block Document Generators (for ZIP files) ─────────────

interface BlockSourceFile {
  bytes: Uint8Array;
  contentType: string;
  ext: string;
  fileName: string;
  html: string | null;
  text: string | null;
}

function getFileExtension(nameOrUrl?: string | null): string {
  if (!nameOrUrl) return '';
  const clean = nameOrUrl.split('?')[0].split('#')[0];
  return clean.split('.').pop()?.toLowerCase() || '';
}

function isHtmlLike(contentType: string, ext: string): boolean {
  return ['html', 'htm'].includes(ext) || /html/i.test(contentType);
}

function isTextLike(contentType: string, ext: string): boolean {
  return isHtmlLike(contentType, ext) || contentType.startsWith('text/') || ['txt', 'md', 'csv', 'json', 'xml'].includes(ext);
}

function toUint8Array(data: unknown): Uint8Array | null {
  if (!data) return null;
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return null;
}

async function normalizeBinaryOutput(data: unknown): Promise<Uint8Array> {
  const bytes = toUint8Array(data);
  if (bytes) return bytes;
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer());
  }
  throw new Error('Unsupported binary output format');
}

async function fetchBlockSourceFile(block: Block): Promise<BlockSourceFile | null> {
  const originalUrl = block.fileStorageUrl || block.fileUrl;
  if (!originalUrl) return null;

  const storagePath = extractStoragePath(originalUrl);
  const fetchUrl = storagePath ? await getSignedUrl(storagePath) : originalUrl;
  const response = await fetch(fetchUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch source file: ${response.status}`);
  }

  const contentType = response.headers.get('content-type')?.split(';')[0] || '';
  const bytes = new Uint8Array(await response.arrayBuffer());
  const fileName = block.fileName || storagePath?.split('/').pop() || `${sanitize(block.label)}`;
  const ext = getFileExtension(fileName || fetchUrl);
  const text = isTextLike(contentType, ext) ? new TextDecoder().decode(bytes) : null;

  return {
    bytes,
    contentType,
    ext,
    fileName,
    html: text && isHtmlLike(contentType, ext) ? text : null,
    text,
  };
}

function createFallbackBlockHtml(block: Block, source: BlockSourceFile | null): string {
  const notes = block.markdown || block.comment || '';
  const sourceName = source?.fileName || block.fileName || 'Attached file';
  const content = source?.text
    ? `<pre style="white-space:pre-wrap;font-family:Calibri,Arial,sans-serif;">${esc(source.text)}</pre>`
    : source
      ? `<p>This attachment was exported from <strong>${esc(sourceName)}</strong>.</p>`
      : '<p>No attached file was found for this block.</p>';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${esc(block.label)}</title>
  <style>
    body { font-family: Calibri, Arial, sans-serif; font-size: 12pt; color: #1a1a2e; margin: 40px; line-height: 1.6; }
    h1 { font-size: 18pt; margin: 0 0 10px; }
    h2 { font-size: 14pt; margin: 24px 0 10px; }
    p, pre { margin: 0 0 12px; }
    pre { overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <h1>${esc(block.label)}</h1>
  ${notes ? `<h2>Notes</h2><div style="white-space:pre-wrap;">${esc(notes)}</div>` : ''}
  <h2>Document Content</h2>
  ${content}
</body>
</html>`;
}

function createViewerEquivalentHtml(block: Block, source: BlockSourceFile | null): string {
  const baseHtml = source?.html || createFallbackBlockHtml(block, source);
  const parser = new DOMParser();
  const doc = parser.parseFromString(
    /<html[\s>]/i.test(baseHtml)
      ? baseHtml
      : `<!DOCTYPE html><html><head></head><body>${baseHtml}</body></html>`,
    'text/html'
  );

  if (!doc.querySelector('meta[charset]')) {
    const meta = doc.createElement('meta');
    meta.setAttribute('charset', 'utf-8');
    doc.head.prepend(meta);
  }

  const themeStyle = doc.getElementById('__viewer-theme');
  themeStyle?.remove();

  // Remove scripts/preloads that interfere with rendering
  doc.querySelectorAll('script, noscript, link[rel="preload"], link[rel="modulepreload"]').forEach(n => n.remove());

  if (!doc.querySelector('link[href*="mathlive-static.css"]')) {
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/mathlive/mathlive-static.css';
    doc.head.appendChild(link);
  }

  // Apply the same print-quality styles used by the native print-to-PDF in FileViewer
  const existingExportStyle = doc.querySelector('style[data-export-base="true"]');
  if (existingExportStyle) existingExportStyle.remove();

  const style = doc.createElement('style');
  style.setAttribute('data-export-base', 'true');
  style.textContent = `
    html, body {
      background: #ffffff !important;
      color: #000000 !important;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: Calibri, Arial, sans-serif;
      font-size: 12pt;
      line-height: 1.5;
      padding: 0.4in;
      overflow-wrap: anywhere;
      word-break: normal;
    }
    * { box-sizing: border-box; color: #000000 !important; }
    a { color: #1a0dab !important; }
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
    .math-expression, .math-unicode, .math-template, .math-symbol,
    [class*="ML__"] {
      font-family: 'Cambria Math', Cambria, serif !important;
    }
    .math-export, [data-export-math="true"] {
      font-family: 'Cambria Math', Cambria, serif !important;
      white-space: pre-wrap;
    }
  `;
  doc.head.appendChild(style);

  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
}

async function renderHtmlToPdfBytes(html: string, fileName: string): Promise<Uint8Array> {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-same-origin');
  iframe.style.position = 'fixed';
  iframe.style.top = '0';
  iframe.style.left = '0';
  iframe.style.width = '794px';
  iframe.style.height = '1123px';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.style.zIndex = '-1';
  iframe.srcdoc = html;
  document.body.appendChild(iframe);

  try {
    await new Promise<void>((resolve) => {
      iframe.onload = () => resolve();
    });

    // Wait for stylesheets (mathlive CSS) and images
    const doc = iframe.contentDocument;
    if (doc) {
      const links = Array.from(doc.querySelectorAll('link[rel="stylesheet"]')) as HTMLLinkElement[];
      await Promise.all(links.map(link => {
        if (link.sheet) return Promise.resolve();
        return new Promise<void>(resolve => {
          link.addEventListener('load', () => resolve(), { once: true });
          link.addEventListener('error', () => resolve(), { once: true });
          setTimeout(resolve, 3000);
        });
      }));
      const images = Array.from(doc.images);
      await Promise.all(images.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise<void>(resolve => {
          img.addEventListener('load', () => resolve(), { once: true });
          img.addEventListener('error', () => resolve(), { once: true });
        });
      }));
      if (doc.fonts) {
        try { await doc.fonts.ready; } catch {}
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 400));

    const html2pdf = (await import('html2pdf.js')).default;
    const docBody = iframe.contentDocument?.body;
    if (!docBody) throw new Error('Export view failed to load');

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
        },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      })
      .from(docBody)
      .outputPdf('blob');

    return new Uint8Array(await pdfBlob.arrayBuffer());
  } finally {
    document.body.removeChild(iframe);
  }
}

async function renderHtmlToDocxBytes(html: string): Promise<Uint8Array> {
  const htmlToDocxModule = await import('@turbodocx/html-to-docx');
  const htmlToDocx = htmlToDocxModule.default;
  const docxOutput = await htmlToDocx(ensureMathFontsForWord(html), null, {
    table: { row: { cantSplit: true } },
    footer: true,
    pageNumber: true,
  });
  return normalizeBinaryOutput(docxOutput);
}

async function exportBlockFile(
  block: Block,
  format: ExportFormat
): Promise<{ data: Uint8Array; fileName: string }> {
  let source: BlockSourceFile | null = null;
  try {
    source = await fetchBlockSourceFile(block);
  } catch (error) {
    console.warn('Failed to fetch block source for export:', block.label, error);
  }

  if (format === 'pdf' && source?.ext === 'pdf') {
    return { data: source.bytes, fileName: `${sanitize(block.label)}.pdf` };
  }

  if (format === 'word' && source?.ext === 'docx') {
    return { data: source.bytes, fileName: `${sanitize(block.label)}.docx` };
  }

  const viewerHtml = createViewerEquivalentHtml(block, source);
  const data = format === 'pdf'
    ? await renderStructuredPdfBytes(viewerHtml, `${sanitize(block.label)}.pdf`)
    : await renderStructuredDocxBytes(viewerHtml);

  return {
    data,
    fileName: `${sanitize(block.label)}${format === 'pdf' ? '.pdf' : '.docx'}`,
  };
}

// ─── Collect block file data for PDF attachment embedding ────────

async function collectBlockFiles(
  state: CanvasExportState,
  format: ExportFormat
): Promise<Map<string, { data: Uint8Array; fileName: string }>> {
  const { blocks } = state;
  const result = new Map<string, { data: Uint8Array; fileName: string }>();

  const entries = await Promise.all(
    blocks.map(async (block) => {
      const file = await exportBlockFile(block, format);
      return { id: block.id, data: file.data, fileName: file.fileName };
    })
  );
  for (const e of entries) result.set(e.id, { data: e.data, fileName: e.fileName });
  return result;
}

// ─── Embed files as PDF FileAttachment annotations (Acrobat-only) ────────

async function embedFileAttachments(
  pdfBytes: Uint8Array,
  blockLinks: BlockLinkInfo[],
  blockFiles: Map<string, { data: Uint8Array; fileName: string }>,
  format: ExportFormat
): Promise<Uint8Array> {
  const { PDFDocument, PDFName, PDFDict, PDFArray, PDFString, PDFStream, PDFHexString } = await import('pdf-lib');

  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();

  for (const link of blockLinks) {
    const file = blockFiles.get(link.blockId);
    if (!file) continue;

    const pageIndex = link.mapPage - 1; // 0-indexed
    if (pageIndex < 0 || pageIndex >= pages.length) continue;
    const page = pages[pageIndex];
    const pageHeight = page.getHeight();

    // Create embedded file stream
    const mimeType = format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const embeddedFileStream = pdfDoc.context.stream(file.data, {
      Type: PDFName.of('EmbeddedFile'),
      Subtype: PDFName.of(mimeType),
      Length: file.data.length,
    });
    const embeddedFileStreamRef = pdfDoc.context.register(embeddedFileStream);

    // Create EF dict
    const efDict = pdfDoc.context.obj({
      F: embeddedFileStreamRef,
    });

    // Create file specification
    const fileSpecDict = pdfDoc.context.obj({
      Type: PDFName.of('Filespec'),
      F: PDFString.of(file.fileName),
      UF: PDFHexString.fromText(file.fileName),
      EF: efDict,
      Desc: PDFString.of(`Block: ${file.fileName}`),
    });
    const fileSpecRef = pdfDoc.context.register(fileSpecDict);

    // Convert jsPDF coords (origin top-left, pt) to PDF coords (origin bottom-left)
    const x1 = link.x;
    const y1 = pageHeight - link.y - link.h; // bottom
    const x2 = link.x + link.w;
    const y2 = pageHeight - link.y; // top

    // Create FileAttachment annotation
    const annotDict = pdfDoc.context.obj({
      Type: PDFName.of('Annot'),
      Subtype: PDFName.of('FileAttachment'),
      Rect: pdfDoc.context.obj([x1, y1, x2, y2]),
      FS: fileSpecRef,
      Name: PDFName.of('PushPin'),
      C: pdfDoc.context.obj([0.15, 0.45, 0.75]), // blue-ish color
      Contents: PDFString.of(`Open ${file.fileName}`),
      F: 4, // Print flag
    });
    const annotRef = pdfDoc.context.register(annotDict);

    // Add annotation to page
    const existingAnnots = page.node.lookup(PDFName.of('Annots'));
    if (existingAnnots instanceof PDFArray) {
      existingAnnots.push(annotRef);
    } else {
      page.node.set(PDFName.of('Annots'), pdfDoc.context.obj([annotRef]));
    }
  }

  return pdfDoc.save();
}

function generateBlockDocuments(
  state: CanvasExportState,
  zip: JSZip,
  blockFiles: Map<string, { data: Uint8Array; fileName: string }>
): void {
  const { blocks, groups } = state;
  const groupMap = new Map<string, Group>();
  groups.forEach(g => groupMap.set(g.id, g));

  const grouped = new Map<string, Block[]>();
  const ungrouped: Block[] = [];

  blocks.forEach(b => {
    if (b.groupId && groupMap.has(b.groupId)) {
      const arr = grouped.get(b.groupId) || [];
      arr.push(b);
      grouped.set(b.groupId, arr);
    } else {
      ungrouped.push(b);
    }
  });

  for (const [gId, gBlocks] of grouped.entries()) {
    const group = groupMap.get(gId)!;
    const folderName = sanitize(group.label);
    const folder = zip.folder(folderName)!;
    for (const block of gBlocks) {
      const file = blockFiles.get(block.id);
      if (!file) continue;
      folder.file(file.fileName, file.data, { binary: true });
    }
  }

  if (ungrouped.length > 0) {
    const folder = zip.folder('Ungrouped')!;
    for (const block of ungrouped) {
      const file = blockFiles.get(block.id);
      if (!file) continue;
      folder.file(file.fileName, file.data, { binary: true });
    }
  }
}
