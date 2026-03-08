import { useState, useCallback, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface UnicodeMathEditorProps {
  onInsert: (html: string) => void;
  onClose: () => void;
}

// LaTeX-like command → Unicode/HTML mapping
const UNICODE_MAP: Record<string, string> = {
  // Greek lowercase
  '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ',
  '\\epsilon': 'ε', '\\varepsilon': 'ε', '\\zeta': 'ζ', '\\eta': 'η',
  '\\theta': 'θ', '\\iota': 'ι', '\\kappa': 'κ', '\\lambda': 'λ',
  '\\mu': 'μ', '\\nu': 'ν', '\\xi': 'ξ', '\\pi': 'π',
  '\\rho': 'ρ', '\\sigma': 'σ', '\\tau': 'τ', '\\upsilon': 'υ',
  '\\phi': 'φ', '\\varphi': 'φ', '\\chi': 'χ', '\\psi': 'ψ', '\\omega': 'ω',
  // Greek uppercase
  '\\Gamma': 'Γ', '\\Delta': 'Δ', '\\Theta': 'Θ', '\\Lambda': 'Λ',
  '\\Xi': 'Ξ', '\\Pi': 'Π', '\\Sigma': 'Σ', '\\Phi': 'Φ',
  '\\Psi': 'Ψ', '\\Omega': 'Ω',
  // Operators
  '\\pm': '±', '\\mp': '∓', '\\times': '×', '\\div': '÷', '\\cdot': '·',
  '\\ast': '∗', '\\star': '⋆', '\\circ': '∘', '\\bullet': '∙',
  '\\oplus': '⊕', '\\otimes': '⊗', '\\odot': '⊙',
  // Relations
  '\\leq': '≤', '\\le': '≤', '\\geq': '≥', '\\ge': '≥',
  '\\neq': '≠', '\\ne': '≠', '\\approx': '≈', '\\equiv': '≡',
  '\\sim': '∼', '\\simeq': '≃', '\\cong': '≅', '\\propto': '∝',
  '\\ll': '≪', '\\gg': '≫', '\\prec': '≺', '\\succ': '≻',
  '\\preceq': '⪯', '\\succeq': '⪰',
  // Set theory
  '\\in': '∈', '\\notin': '∉', '\\ni': '∋', '\\subset': '⊂',
  '\\supset': '⊃', '\\subseteq': '⊆', '\\supseteq': '⊇',
  '\\cup': '∪', '\\cap': '∩', '\\emptyset': '∅', '\\varnothing': '∅',
  // Logic
  '\\forall': '∀', '\\exists': '∃', '\\nexists': '∄',
  '\\neg': '¬', '\\lnot': '¬', '\\land': '∧', '\\lor': '∨',
  '\\implies': '⟹', '\\iff': '⟺', '\\to': '→', '\\gets': '←',
  '\\Rightarrow': '⇒', '\\Leftarrow': '⇐', '\\Leftrightarrow': '⇔',
  '\\rightarrow': '→', '\\leftarrow': '←', '\\leftrightarrow': '↔',
  '\\uparrow': '↑', '\\downarrow': '↓',
  // Calculus & analysis
  '\\partial': '∂', '\\nabla': '∇', '\\infty': '∞',
  '\\int': '∫', '\\iint': '∬', '\\iiint': '∭', '\\oint': '∮',
  '\\sum': '∑', '\\prod': '∏', '\\coprod': '∐',
  // Misc
  '\\sqrt': '√', '\\surd': '√', '\\angle': '∠', '\\measuredangle': '∡',
  '\\perp': '⊥', '\\parallel': '∥', '\\triangle': '△',
  '\\degree': '°', '\\prime': '′', '\\dprime': '″',
  '\\hbar': 'ℏ', '\\ell': 'ℓ', '\\wp': '℘', '\\Re': 'ℜ', '\\Im': 'ℑ',
  '\\aleph': 'ℵ',
  // Number sets (double-struck)
  '\\mathbb{R}': 'ℝ', '\\mathbb{C}': 'ℂ', '\\mathbb{Z}': 'ℤ',
  '\\mathbb{N}': 'ℕ', '\\mathbb{Q}': 'ℚ', '\\mathbb{P}': 'ℙ',
  '\\R': 'ℝ', '\\C': 'ℂ', '\\Z': 'ℤ', '\\N': 'ℕ', '\\Q': 'ℚ',
  // Brackets
  '\\langle': '⟨', '\\rangle': '⟩', '\\lceil': '⌈', '\\rceil': '⌉',
  '\\lfloor': '⌊', '\\rfloor': '⌋', '\\|': '‖',
  // Dots
  '\\ldots': '…', '\\cdots': '⋯', '\\vdots': '⋮', '\\ddots': '⋱',
};

// Structural commands that produce HTML
function processStructuralCommands(input: string): string {
  let result = input;

  // \frac{a}{b} → fraction HTML
  result = result.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, (_, num, den) =>
    `<span class="math-template" style="display:inline-block;text-align:center;vertical-align:middle;font-family:'Cambria Math',serif"><span style="display:block;border-bottom:1px solid currentColor;padding:0 4px">${num}</span><span style="display:block;padding:0 4px">${den}</span></span>`
  );

  // \sqrt{x} → square root
  result = result.replace(/\\sqrt\{([^}]*)\}/g, (_, content) =>
    `<span class="math-template" style="font-family:'Cambria Math',serif">√<span style="text-decoration:overline;padding:0 2px">${content}</span></span>`
  );

  // \sqrt[n]{x} → nth root
  result = result.replace(/\\sqrt\[([^\]]*)\]\{([^}]*)\}/g, (_, n, content) =>
    `<span class="math-template" style="font-family:'Cambria Math',serif"><sup style="font-size:0.7em">${n}</sup>√<span style="text-decoration:overline;padding:0 2px">${content}</span></span>`
  );

  // \int_{a}^{b} or \int_a^b → definite integral
  result = result.replace(/\\int_\{?([^}^{]*)\}?\^\{?([^}^{]*)\}?/g, (_, lower, upper) =>
    `<span class="math-template" style="display:inline-block;text-align:center;vertical-align:middle;font-family:'Cambria Math',serif"><span style="display:block;font-size:0.65em;line-height:1">${upper}</span><span style="display:block;font-size:1.5em;line-height:1">∫</span><span style="display:block;font-size:0.65em;line-height:1">${lower}</span></span>`
  );

  // \sum_{i=1}^{n} → summation with bounds
  result = result.replace(/\\sum_\{?([^}^{]*)\}?\^\{?([^}^{]*)\}?/g, (_, lower, upper) =>
    `<span class="math-template" style="display:inline-block;text-align:center;vertical-align:middle;font-family:'Cambria Math',serif"><span style="display:block;font-size:0.65em;line-height:1">${upper}</span><span style="display:block;font-size:1.4em;line-height:1">∑</span><span style="display:block;font-size:0.65em;line-height:1">${lower}</span></span>`
  );

  // \prod_{i=1}^{n} → product with bounds
  result = result.replace(/\\prod_\{?([^}^{]*)\}?\^\{?([^}^{]*)\}?/g, (_, lower, upper) =>
    `<span class="math-template" style="display:inline-block;text-align:center;vertical-align:middle;font-family:'Cambria Math',serif"><span style="display:block;font-size:0.65em;line-height:1">${upper}</span><span style="display:block;font-size:1.4em;line-height:1">∏</span><span style="display:block;font-size:0.65em;line-height:1">${lower}</span></span>`
  );

  // \lim_{x \to a} → limit
  result = result.replace(/\\lim_\{?([^}]*)\}?/g, (_, sub) => {
    const processed = sub.replace(/\\to/g, '→').replace(/\\infty/g, '∞');
    return `<span class="math-template" style="display:inline-block;text-align:center;vertical-align:middle;font-family:'Cambria Math',serif"><span style="display:block;font-size:0.9em;line-height:1">lim</span><span style="display:block;font-size:0.65em;line-height:1">${processed}</span></span>`;
  });

  // \binom{n}{k} → binomial
  result = result.replace(/\\binom\{([^}]*)\}\{([^}]*)\}/g, (_, n, k) =>
    `<span class="math-template" style="font-family:'Cambria Math',serif">(</span><span style="display:inline-block;text-align:center;vertical-align:middle;font-family:'Cambria Math',serif"><span style="display:block;padding:0 4px">${n}</span><span style="display:block;padding:0 4px">${k}</span></span><span style="font-family:'Cambria Math',serif">)</span>`
  );

  // \vec{x} → vector with arrow
  result = result.replace(/\\vec\{([^}]*)\}/g, (_, content) =>
    `<span class="math-template" style="font-family:'Cambria Math',serif;position:relative;display:inline-block"><span style="position:absolute;top:-0.4em;left:0;right:0;text-align:center;font-size:0.7em">→</span>${content}</span>`
  );

  // \hat{x} → hat accent
  result = result.replace(/\\hat\{([^}]*)\}/g, (_, content) =>
    `<span class="math-template" style="font-family:'Cambria Math',serif;position:relative;display:inline-block"><span style="position:absolute;top:-0.5em;left:0;right:0;text-align:center;font-size:0.7em">^</span>${content}</span>`
  );

  // \bar{x} → overline
  result = result.replace(/\\bar\{([^}]*)\}/g, (_, content) =>
    `<span class="math-template" style="font-family:'Cambria Math',serif;text-decoration:overline">${content}</span>`
  );

  // \dot{x} → dot above
  result = result.replace(/\\dot\{([^}]*)\}/g, (_, content) =>
    `<span class="math-template" style="font-family:'Cambria Math',serif;position:relative;display:inline-block"><span style="position:absolute;top:-0.5em;left:0;right:0;text-align:center">·</span>${content}</span>`
  );

  // \matrix{a & b \\ c & d} → 2D matrix
  result = result.replace(/\\matrix\{([^}]*)\}/g, (_, content) => {
    const rows = content.split('\\\\').map((row: string) => {
      const cells = row.split('&').map((c: string) => `<td style="border:none;padding:2px 6px">${c.trim()}</td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    return `<span class="math-template" style="font-family:'Cambria Math',serif">⎡<span style="display:inline-block;text-align:center;vertical-align:middle"><table style="display:inline-table;border:none;border-collapse:collapse">${rows}</table></span>⎤</span>`;
  });

  // x^{n} or x^n → superscript
  result = result.replace(/\^{([^}]*)}/g, '<sup style="font-family:\'Cambria Math\',serif">$1</sup>');
  result = result.replace(/\^([a-zA-Z0-9αβγδεζηθικλμνξπρστυφχψω])/g, '<sup style="font-family:\'Cambria Math\',serif">$1</sup>');

  // x_{n} or x_n → subscript
  result = result.replace(/_{([^}]*)}/g, '<sub style="font-family:\'Cambria Math\',serif">$1</sub>');
  result = result.replace(/_([a-zA-Z0-9αβγδεζηθικλμνξπρστυφχψω])/g, '<sub style="font-family:\'Cambria Math\',serif">$1</sub>');

  return result;
}

// Replace all simple Unicode commands
function replaceUnicodeCommands(input: string): string {
  let result = input;
  // Sort by length descending so longer commands match first
  const sorted = Object.entries(UNICODE_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [cmd, char] of sorted) {
    // Use word boundary-like matching for backslash commands
    const escaped = cmd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped + '(?![a-zA-Z{])', 'g'), char);
  }
  return result;
}

function convertMathInput(input: string): string {
  // First handle structural commands (frac, sqrt, int bounds, etc.)
  let result = processStructuralCommands(input);
  // Then replace remaining Unicode symbol commands
  result = replaceUnicodeCommands(result);
  return result;
}

// Live preview: render converted math as HTML
function MathPreview({ input }: { input: string }) {
  if (!input.trim()) return <span className="text-muted-foreground text-xs italic">Type math here…</span>;
  const html = convertMathInput(input);
  return (
    <span
      className="text-base"
      style={{ fontFamily: "'Cambria Math', 'Cambria', serif" }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

const EXAMPLES = [
  { label: 'Fraction', code: '\\frac{a}{b}' },
  { label: 'Integral', code: '\\int_{0}^{\\infty} f(x)dx' },
  { label: 'Sum', code: '\\sum_{i=1}^{n} x_i' },
  { label: 'Limit', code: '\\lim_{x \\to 0} \\frac{\\sin x}{x}' },
  { label: 'Sqrt', code: '\\sqrt{x^2 + y^2}' },
  { label: 'Matrix', code: '\\matrix{a & b \\\\ c & d}' },
  { label: 'Greek', code: '\\alpha + \\beta = \\gamma' },
  { label: 'Binomial', code: '\\binom{n}{k}' },
  { label: 'Product', code: '\\prod_{i=1}^{n} a_i' },
  { label: 'Partial', code: '\\frac{\\partial f}{\\partial x}' },
];

export default function UnicodeMathEditor({ onInsert, onClose }: UnicodeMathEditorProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleInsert = useCallback(() => {
    if (!input.trim()) return;
    const html = `<span class="math-unicode" style="font-family:'Cambria Math','Cambria',serif">${convertMathInput(input)}</span>`;
    onInsert(html);
    setInput('');
  }, [input, onInsert]);

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
    <div className="bg-card border border-border rounded-lg shadow-lg p-3 w-[480px] space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <span style={{ fontFamily: "'Cambria Math', serif" }} className="text-sm">𝑓</span>
          Unicode Math Editor
        </h3>
        <button onClick={onClose} className="h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground">
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Input area */}
      <textarea
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type LaTeX-like math: \frac{a}{b}, \int_{0}^{1}, \alpha, x^2..."
        className="w-full h-16 text-sm font-mono bg-background border border-border rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
        spellCheck={false}
      />

      {/* Live preview */}
      <div className="bg-background border border-border rounded px-3 py-2 min-h-[36px] flex items-center">
        <MathPreview input={input} />
      </div>

      {/* Quick examples */}
      <div className="flex flex-wrap gap-1">
        {EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            onClick={() => setInput((prev) => prev + (prev ? ' ' : '') + ex.code)}
            className="px-1.5 py-0.5 text-[10px] rounded border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title={ex.code}
          >
            {ex.label}
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">Ctrl+Enter to insert</span>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" onClick={onClose} className="h-6 text-[10px] px-2">
            Cancel
          </Button>
          <Button size="sm" onClick={handleInsert} disabled={!input.trim()} className="h-6 text-[10px] px-3">
            Insert
          </Button>
        </div>
      </div>
    </div>
  );
}
