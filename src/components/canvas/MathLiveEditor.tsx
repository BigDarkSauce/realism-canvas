import { useState, useCallback, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import 'mathlive';
import { convertLatexToMarkup } from 'mathlive';
import type { MathfieldElement } from 'mathlive';

// Extend JSX for math-field web component
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'math-field': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          'virtual-keyboard-mode'?: string;
          'smart-mode'?: boolean | string;
          'smart-fence'?: boolean | string;
          'smart-superscript'?: boolean | string;
          'fonts-directory'?: string;
          'sounds-directory'?: string;
          ref?: React.Ref<any>;
        },
        HTMLElement
      >;
    }
  }
}

interface MathLiveEditorProps {
  onInsert: (html: string) => void;
  onClose: () => void;
}

const QUICK_TEMPLATES = [
  { label: 'Fraction', latex: '\\frac{a}{b}' },
  { label: 'Square Root', latex: '\\sqrt{x}' },
  { label: 'nth Root', latex: '\\sqrt[n]{x}' },
  { label: 'Power', latex: 'x^{n}' },
  { label: 'Subscript', latex: 'x_{i}' },
  { label: 'Sum', latex: '\\sum_{i=1}^{n}' },
  { label: 'Product', latex: '\\prod_{i=1}^{n}' },
  { label: 'Integral', latex: '\\int_{a}^{b}' },
  { label: 'Double Int', latex: '\\iint_{D}' },
  { label: 'Limit', latex: '\\lim_{x\\to 0}' },
  { label: 'Matrix 2×2', latex: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}' },
  { label: 'Matrix 3×3', latex: '\\begin{pmatrix} a & b & c \\\\ d & e & f \\\\ g & h & i \\end{pmatrix}' },
  { label: 'Binomial', latex: '\\binom{n}{k}' },
  { label: 'Partial', latex: '\\frac{\\partial f}{\\partial x}' },
  { label: 'dy/dx', latex: '\\frac{dy}{dx}' },
  { label: 'Vector', latex: '\\vec{v}' },
  { label: 'Hat', latex: '\\hat{x}' },
  { label: 'Bar', latex: '\\bar{x}' },
  { label: 'Abs', latex: '|x|' },
  { label: 'Norm', latex: '\\|x\\|' },
];

const SYMBOL_GROUPS = [
  {
    label: 'Greek',
    symbols: [
      { l: 'α', v: '\\alpha' }, { l: 'β', v: '\\beta' }, { l: 'γ', v: '\\gamma' },
      { l: 'δ', v: '\\delta' }, { l: 'ε', v: '\\epsilon' }, { l: 'ζ', v: '\\zeta' },
      { l: 'η', v: '\\eta' }, { l: 'θ', v: '\\theta' }, { l: 'λ', v: '\\lambda' },
      { l: 'μ', v: '\\mu' }, { l: 'π', v: '\\pi' }, { l: 'σ', v: '\\sigma' },
      { l: 'φ', v: '\\phi' }, { l: 'ω', v: '\\omega' }, { l: 'Δ', v: '\\Delta' },
      { l: 'Σ', v: '\\Sigma' }, { l: 'Ω', v: '\\Omega' }, { l: 'Γ', v: '\\Gamma' },
    ],
  },
  {
    label: 'Operators',
    symbols: [
      { l: '±', v: '\\pm' }, { l: '×', v: '\\times' }, { l: '÷', v: '\\div' },
      { l: '·', v: '\\cdot' }, { l: '∘', v: '\\circ' }, { l: '⊕', v: '\\oplus' },
      { l: '⊗', v: '\\otimes' }, { l: '∞', v: '\\infty' },
    ],
  },
  {
    label: 'Relations',
    symbols: [
      { l: '≤', v: '\\leq' }, { l: '≥', v: '\\geq' }, { l: '≠', v: '\\neq' },
      { l: '≈', v: '\\approx' }, { l: '≡', v: '\\equiv' }, { l: '∝', v: '\\propto' },
      { l: '≪', v: '\\ll' }, { l: '≫', v: '\\gg' },
    ],
  },
  {
    label: 'Sets & Logic',
    symbols: [
      { l: '∈', v: '\\in' }, { l: '∉', v: '\\notin' }, { l: '⊂', v: '\\subset' },
      { l: '⊆', v: '\\subseteq' }, { l: '∪', v: '\\cup' }, { l: '∩', v: '\\cap' },
      { l: '∅', v: '\\emptyset' }, { l: '∀', v: '\\forall' }, { l: '∃', v: '\\exists' },
      { l: '¬', v: '\\neg' }, { l: '∧', v: '\\land' }, { l: '∨', v: '\\lor' },
      { l: '⇒', v: '\\Rightarrow' }, { l: '⇔', v: '\\Leftrightarrow' },
    ],
  },
  {
    label: 'Sets',
    symbols: [
      { l: 'ℝ', v: '\\mathbb{R}' }, { l: 'ℂ', v: '\\mathbb{C}' },
      { l: 'ℤ', v: '\\mathbb{Z}' }, { l: 'ℕ', v: '\\mathbb{N}' },
      { l: 'ℚ', v: '\\mathbb{Q}' },
    ],
  },
];

export default function MathLiveEditor({ onInsert, onClose }: MathLiveEditorProps) {
  const mathFieldRef = useRef<MathfieldElement | null>(null);
  const readyRef = useRef(false);
  const [activeTab, setActiveTab] = useState<'editor' | 'symbols'>('editor');

  useEffect(() => {
    const mf = mathFieldRef.current;
    if (!mf) return;

    let cancelled = false;

    const tryFocus = (attempt = 0) => {
      if (cancelled) return;
      const el = mathFieldRef.current;
      if (!el || typeof (el as any).focus !== 'function') return;

      try {
        (el as any).focus();
        readyRef.current = true;
      } catch {
        // MathLive can throw "options undefined" if focused before it's fully mounted.
        // Retry for a short time; if it never becomes ready, we just skip autofocus.
        if (attempt < 60) requestAnimationFrame(() => tryFocus(attempt + 1));
      }
    };

    const onMount = () => {
      readyRef.current = true;
      tryFocus();
    };

    // Prefer the MathLive "mount" event, but also attempt a best-effort focus.
    mf.addEventListener('mount', onMount as any, { once: true } as any);
    window.setTimeout(() => tryFocus(), 0);

    return () => {
      cancelled = true;
      mf.removeEventListener('mount', onMount as any);
    };
  }, []);

  const handleInsert = useCallback(() => {
    const mf = mathFieldRef.current;
    if (!mf) return;
    const latex = mf.value;
    if (!latex.trim()) return;

    // Convert LaTeX to static HTML markup that renders without MathLive JS
    let markup = '';
    try {
      markup = convertLatexToMarkup(latex);
    } catch {
      // fallback: wrap in a styled span
      markup = `<span style="font-family:'Cambria Math','Cambria',serif">${latex}</span>`;
    }

    // Wrap in a span with data-latex for potential re-editing, plus the static rendered HTML
    const html = `<span class="math-expression" data-latex="${encodeURIComponent(latex)}" style="display:inline-block;vertical-align:middle">${markup}</span>\u200B`;
    
    onInsert(html);
    mf.value = '';
  }, [onInsert]);

  const insertLatex = useCallback((latex: string) => {
    const mf = mathFieldRef.current;
    if (!mf) return;

    const run = () => {
      try {
        mf.executeCommand(['insert', latex]);
      } catch {
        // Not ready yet
      }
      try {
        mf.focus();
      } catch {
        // ignore
      }
    };

    if (!readyRef.current) {
      window.setTimeout(run, 150);
      return;
    }

    run();
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleInsert();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  }, [handleInsert, onClose]);

  return (
    <div
      className="bg-card border border-border rounded-lg shadow-lg p-3 w-[520px] space-y-2"
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <span style={{ fontFamily: "'Cambria Math', serif" }} className="text-sm">∫</span>
          Equation Editor
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('editor')}
            className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
              activeTab === 'editor' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Editor
          </button>
          <button
            onClick={() => setActiveTab('symbols')}
            className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
              activeTab === 'symbols' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Symbols
          </button>
          <button onClick={onClose} className="h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground ml-1">
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* MathLive field */}
      <div className="bg-background border border-border rounded px-2 py-1.5 min-h-[48px]">
        <math-field
          ref={mathFieldRef}
          virtual-keyboard-mode="manual"
          smart-mode="true"
          smart-fence="true"
          smart-superscript="true"
          style={{
            width: '100%',
            fontSize: '18px',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontFamily: "'Cambria Math', 'Cambria', serif",
            minHeight: '36px',
            display: 'block',
          }}
        />
      </div>

      {/* Quick templates */}
      {activeTab === 'editor' && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium text-muted-foreground">Templates</p>
          <div className="flex flex-wrap gap-1 max-h-[100px] overflow-y-auto">
            {QUICK_TEMPLATES.map((t) => (
              <button
                key={t.label}
                onClick={() => insertLatex(t.latex)}
                className="px-1.5 py-0.5 text-[10px] rounded border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title={t.latex}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Symbol palette */}
      {activeTab === 'symbols' && (
        <div className="space-y-2 max-h-[200px] overflow-y-auto">
          {SYMBOL_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="text-[10px] font-medium text-muted-foreground mb-0.5">{group.label}</p>
              <div className="flex flex-wrap gap-0.5">
                {group.symbols.map((s) => (
                  <button
                    key={s.v}
                    onClick={() => insertSymbol(s.v)}
                    className="h-7 w-7 flex items-center justify-center rounded text-sm hover:bg-muted transition-colors"
                    title={s.v}
                  >
                    {s.l}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">Ctrl+Enter to insert · Type LaTeX naturally</span>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" onClick={onClose} className="h-6 text-[10px] px-2">
            Cancel
          </Button>
          <Button size="sm" onClick={handleInsert} className="h-6 text-[10px] px-3">
            Insert
          </Button>
        </div>
      </div>
    </div>
  );
}
