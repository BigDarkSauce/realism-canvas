import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Bold, Italic, Underline, Strikethrough, Type, Palette,
  Search, X, ChevronDown, ChevronUp, Plus, Minus,
  Superscript, Subscript, AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, Undo2, Redo2,
} from 'lucide-react';
import UnicodeMathEditor from './UnicodeMathEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';

interface EditorToolbarProps {
  iframeRef: React.RefObject<HTMLIFrameElement>;
  onContentChange: () => void;
}

const FONTS = [
  'Arial', 'Times New Roman', 'Georgia', 'Courier New', 'Verdana',
  'Trebuchet MS', 'Palatino Linotype', 'Garamond', 'Comic Sans MS',
  'Cambria', 'Calibri', 'Tahoma', 'Lucida Console',
];

const FONT_SIZES = ['1', '2', '3', '4', '5', '6', '7'];
const FONT_SIZE_LABELS: Record<string, string> = {
  '1': '8pt', '2': '10pt', '3': '12pt', '4': '14pt', '5': '18pt', '6': '24pt', '7': '36pt',
};

const TEXT_COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#cccccc',
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6',
  '#8b5cf6', '#ec4899', '#14b8a6', '#a855f7', '#dc2626',
  '#ffffff',
];

const MATH_SYMBOLS = [
  { label: '±', char: '±' }, { label: '×', char: '×' }, { label: '÷', char: '÷' },
  { label: '≠', char: '≠' }, { label: '≈', char: '≈' }, { label: '≤', char: '≤' },
  { label: '≥', char: '≥' }, { label: '∞', char: '∞' }, { label: '√', char: '√' },
  { label: '∑', char: '∑' }, { label: '∏', char: '∏' }, { label: '∫', char: '∫' },
  { label: '∬', char: '∬' }, { label: '∭', char: '∭' }, { label: '∮', char: '∮' },
  { label: 'π', char: 'π' }, { label: 'θ', char: 'θ' }, { label: 'α', char: 'α' },
  { label: 'β', char: 'β' }, { label: 'γ', char: 'γ' }, { label: 'δ', char: 'δ' },
  { label: 'Δ', char: 'Δ' }, { label: 'λ', char: 'λ' }, { label: 'μ', char: 'μ' },
  { label: 'σ', char: 'σ' }, { label: 'φ', char: 'φ' }, { label: 'ω', char: 'ω' },
  { label: 'ε', char: 'ε' }, { label: 'ζ', char: 'ζ' }, { label: 'η', char: 'η' },
  { label: 'ι', char: 'ι' }, { label: 'κ', char: 'κ' }, { label: 'ν', char: 'ν' },
  { label: 'ξ', char: 'ξ' }, { label: 'ρ', char: 'ρ' }, { label: 'τ', char: 'τ' },
  { label: 'υ', char: 'υ' }, { label: 'χ', char: 'χ' }, { label: 'ψ', char: 'ψ' },
  { label: 'Γ', char: 'Γ' }, { label: 'Θ', char: 'Θ' }, { label: 'Λ', char: 'Λ' },
  { label: 'Ξ', char: 'Ξ' }, { label: 'Π', char: 'Π' }, { label: 'Σ', char: 'Σ' },
  { label: 'Φ', char: 'Φ' }, { label: 'Ψ', char: 'Ψ' }, { label: 'Ω', char: 'Ω' },
  { label: '∂', char: '∂' }, { label: '∇', char: '∇' }, { label: '∈', char: '∈' },
  { label: '∉', char: '∉' }, { label: '⊂', char: '⊂' }, { label: '⊃', char: '⊃' },
  { label: '⊆', char: '⊆' }, { label: '⊇', char: '⊇' }, { label: '∪', char: '∪' },
  { label: '∩', char: '∩' }, { label: '∅', char: '∅' }, { label: '∀', char: '∀' },
  { label: '∃', char: '∃' }, { label: '¬', char: '¬' }, { label: '∧', char: '∧' },
  { label: '∨', char: '∨' }, { label: '⊕', char: '⊕' }, { label: '⊗', char: '⊗' },
  { label: '⇒', char: '⇒' }, { label: '⇔', char: '⇔' }, { label: '→', char: '→' },
  { label: '←', char: '←' }, { label: '↑', char: '↑' }, { label: '↓', char: '↓' },
  { label: '↔', char: '↔' }, { label: '⟨', char: '⟨' }, { label: '⟩', char: '⟩' },
  { label: '‖', char: '‖' }, { label: '⌊', char: '⌊' }, { label: '⌋', char: '⌋' },
  { label: '⌈', char: '⌈' }, { label: '⌉', char: '⌉' }, { label: '°', char: '°' },
  { label: '′', char: '′' }, { label: '″', char: '″' }, { label: 'ℝ', char: 'ℝ' },
  { label: 'ℂ', char: 'ℂ' }, { label: 'ℤ', char: 'ℤ' }, { label: 'ℕ', char: 'ℕ' },
  { label: 'ℚ', char: 'ℚ' }, { label: '∝', char: '∝' }, { label: '⊥', char: '⊥' },
  { label: '∥', char: '∥' }, { label: '∠', char: '∠' }, { label: '△', char: '△' },
];

const MATH_TEMPLATES = [
  { label: 'Fraction', html: '<span class="math-template" style="display:inline-block;text-align:center;vertical-align:middle;font-family:Cambria Math,serif"><span style="display:block;border-bottom:1px solid currentColor;padding:0 4px" contenteditable="true">a</span><span style="display:block;padding:0 4px" contenteditable="true">b</span></span>' },
  { label: 'x²', html: '<span class="math-template" style="font-family:Cambria Math,serif">x<sup contenteditable="true">2</sup></span>' },
  { label: 'x₁', html: '<span class="math-template" style="font-family:Cambria Math,serif">x<sub contenteditable="true">1</sub></span>' },
  { label: 'xⁿ', html: '<span class="math-template" style="font-family:Cambria Math,serif" contenteditable="true">x</span><sup contenteditable="true" style="font-family:Cambria Math,serif">n</sup>' },
  { label: '√x', html: '<span class="math-template" style="font-family:Cambria Math,serif">√<span style="text-decoration:overline;padding:0 2px" contenteditable="true">x</span></span>' },
  { label: 'ⁿ√x', html: '<span class="math-template" style="font-family:Cambria Math,serif"><sup style="font-size:0.7em" contenteditable="true">n</sup>√<span style="text-decoration:overline;padding:0 2px" contenteditable="true">x</span></span>' },
  { label: '∑ᵢ₌₁ⁿ', html: '<span class="math-template" style="display:inline-block;text-align:center;vertical-align:middle;font-family:Cambria Math,serif"><span style="display:block;font-size:0.65em;line-height:1" contenteditable="true">n</span><span style="display:block;font-size:1.4em;line-height:1">∑</span><span style="display:block;font-size:0.65em;line-height:1" contenteditable="true">i=1</span></span>' },
  { label: '∏ᵢ₌₁ⁿ', html: '<span class="math-template" style="display:inline-block;text-align:center;vertical-align:middle;font-family:Cambria Math,serif"><span style="display:block;font-size:0.65em;line-height:1" contenteditable="true">n</span><span style="display:block;font-size:1.4em;line-height:1">∏</span><span style="display:block;font-size:0.65em;line-height:1" contenteditable="true">i=1</span></span>' },
  { label: '∫ₐᵇ', html: '<span class="math-template" style="display:inline-block;text-align:center;vertical-align:middle;font-family:Cambria Math,serif"><span style="display:block;font-size:0.65em;line-height:1" contenteditable="true">b</span><span style="display:block;font-size:1.5em;line-height:1">∫</span><span style="display:block;font-size:0.65em;line-height:1" contenteditable="true">a</span></span><span contenteditable="true" style="font-family:Cambria Math,serif"> f(x)dx</span>' },
  { label: '∫∫', html: '<span class="math-template" style="display:inline-block;text-align:center;vertical-align:middle;font-family:Cambria Math,serif"><span style="display:block;font-size:0.65em;line-height:1" contenteditable="true">&nbsp;</span><span style="display:block;font-size:1.5em;line-height:1">∬</span><span style="display:block;font-size:0.65em;line-height:1" contenteditable="true">D</span></span><span contenteditable="true" style="font-family:Cambria Math,serif"> f(x,y)dA</span>' },
  { label: '∮', html: '<span class="math-template" style="display:inline-block;text-align:center;vertical-align:middle;font-family:Cambria Math,serif"><span style="display:block;font-size:0.65em;line-height:1" contenteditable="true">&nbsp;</span><span style="display:block;font-size:1.5em;line-height:1">∮</span><span style="display:block;font-size:0.65em;line-height:1" contenteditable="true">C</span></span><span contenteditable="true" style="font-family:Cambria Math,serif"> F·dr</span>' },
  { label: 'lim', html: '<span class="math-template" style="display:inline-block;text-align:center;vertical-align:middle;font-family:Cambria Math,serif"><span style="display:block;font-size:0.9em;line-height:1">lim</span><span style="display:block;font-size:0.65em;line-height:1" contenteditable="true">x→∞</span></span>' },
  { label: 'lim₀', html: '<span class="math-template" style="display:inline-block;text-align:center;vertical-align:middle;font-family:Cambria Math,serif"><span style="display:block;font-size:0.9em;line-height:1">lim</span><span style="display:block;font-size:0.65em;line-height:1" contenteditable="true">x→0</span></span>' },
  { label: 'Matrix 2×2', html: '<span class="math-template" style="font-family:Cambria Math,serif">⎡<span style="display:inline-block;text-align:center;vertical-align:middle"><table style="display:inline-table;border:none;border-collapse:collapse"><tr><td style="border:none;padding:2px 6px" contenteditable="true">a</td><td style="border:none;padding:2px 6px" contenteditable="true">b</td></tr><tr><td style="border:none;padding:2px 6px" contenteditable="true">c</td><td style="border:none;padding:2px 6px" contenteditable="true">d</td></tr></table></span>⎤</span>' },
  { label: 'Vector', html: '<span class="math-template" style="font-family:Cambria Math,serif">⟨<span contenteditable="true">x</span>, <span contenteditable="true">y</span>, <span contenteditable="true">z</span>⟩</span>' },
  { label: '|x|', html: '<span class="math-template" style="font-family:Cambria Math,serif">|<span contenteditable="true">x</span>|</span>' },
  { label: '‖x‖', html: '<span class="math-template" style="font-family:Cambria Math,serif">‖<span contenteditable="true">x</span>‖</span>' },
  { label: 'dy/dx', html: '<span class="math-template" style="display:inline-block;text-align:center;vertical-align:middle;font-family:Cambria Math,serif"><span style="display:block;border-bottom:1px solid currentColor;padding:0 4px" contenteditable="true">dy</span><span style="display:block;padding:0 4px" contenteditable="true">dx</span></span>' },
  { label: '∂f/∂x', html: '<span class="math-template" style="display:inline-block;text-align:center;vertical-align:middle;font-family:Cambria Math,serif"><span style="display:block;border-bottom:1px solid currentColor;padding:0 4px" contenteditable="true">∂f</span><span style="display:block;padding:0 4px" contenteditable="true">∂x</span></span>' },
  { label: 'Binomial', html: '<span class="math-template" style="font-family:Cambria Math,serif">(</span><span style="display:inline-block;text-align:center;vertical-align:middle;font-family:Cambria Math,serif"><span style="display:block;padding:0 4px" contenteditable="true">n</span><span style="display:block;padding:0 4px" contenteditable="true">k</span></span><span style="font-family:Cambria Math,serif">)</span>' },
];

function execCmd(iframe: HTMLIFrameElement | null, cmd: string, value?: string) {
  if (!iframe?.contentDocument) return;
  iframe.contentDocument.execCommand(cmd, false, value);
  iframe.contentWindow?.focus();
}

export default function EditorToolbar({ iframeRef, onContentChange }: EditorToolbarProps) {
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const cmd = useCallback((command: string, value?: string) => {
    execCmd(iframeRef.current, command, value);
    onContentChange();
  }, [iframeRef, onContentChange]);

  const insertHtml = useCallback((html: string) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    doc.execCommand('insertHTML', false, html);
    iframeRef.current?.contentWindow?.focus();
    onContentChange();
  }, [iframeRef, onContentChange]);

  // Find & highlight
  const handleFind = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win || !searchQuery) return;
    // Use window.find for simple highlight
    (win as any).find(searchQuery, false, false, true, false, false, false);
  }, [iframeRef, searchQuery]);

  const handleReplace = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    const win = iframeRef.current?.contentWindow;
    if (!doc || !win || !searchQuery) return;
    // Find current selection
    const sel = doc.getSelection();
    if (sel && sel.toString() === searchQuery) {
      doc.execCommand('insertText', false, replaceQuery);
      onContentChange();
    }
    // Find next
    (win as any).find(searchQuery, false, false, true, false, false, false);
  }, [iframeRef, searchQuery, replaceQuery, onContentChange]);

  const handleReplaceAll = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body || !searchQuery) return;
    const html = doc.body.innerHTML;
    const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    doc.body.innerHTML = html.replace(new RegExp(escaped, 'g'), replaceQuery);
    onContentChange();
  }, [iframeRef, searchQuery, replaceQuery, onContentChange]);

  useEffect(() => {
    if (showSearch) searchInputRef.current?.focus();
  }, [showSearch]);

  const ToolBtn = ({ onClick, active, title, children }: {
    onClick: () => void; active?: boolean; title: string; children: React.ReactNode;
  }) => (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={`h-7 w-7 flex items-center justify-center rounded text-xs transition-colors
        ${active ? 'bg-primary/20 text-primary' : 'text-foreground hover:bg-muted'}`}
    >
      {children}
    </button>
  );

  const Divider = () => <div className="w-px h-5 bg-border mx-0.5" />;

  return (
    <div className="bg-card border-b border-border px-2 py-1 space-y-0.5">
      {/* Main toolbar row */}
      <div className="flex items-center gap-0.5 flex-wrap">
        {/* Undo / Redo */}
        <ToolBtn onClick={() => cmd('undo')} title="Undo"><Undo2 className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn onClick={() => cmd('redo')} title="Redo"><Redo2 className="h-3.5 w-3.5" /></ToolBtn>

        <Divider />

        {/* Font family */}
        <Select onValueChange={(v) => cmd('fontName', v)}>
          <SelectTrigger className="h-7 w-[120px] text-xs border-border">
            <SelectValue placeholder="Font" />
          </SelectTrigger>
          <SelectContent className="z-[200]">
            {FONTS.map((f) => (
              <SelectItem key={f} value={f} className="text-xs" style={{ fontFamily: f }}>
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Font size */}
        <Select onValueChange={(v) => cmd('fontSize', v)}>
          <SelectTrigger className="h-7 w-[70px] text-xs border-border">
            <SelectValue placeholder="Size" />
          </SelectTrigger>
          <SelectContent className="z-[200]">
            {FONT_SIZES.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                {FONT_SIZE_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Divider />

        {/* Basic formatting */}
        <ToolBtn onClick={() => cmd('bold')} title="Bold"><Bold className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn onClick={() => cmd('italic')} title="Italic"><Italic className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn onClick={() => cmd('underline')} title="Underline"><Underline className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn onClick={() => cmd('strikeThrough')} title="Strikethrough"><Strikethrough className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn onClick={() => cmd('superscript')} title="Superscript"><Superscript className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn onClick={() => cmd('subscript')} title="Subscript"><Subscript className="h-3.5 w-3.5" /></ToolBtn>

        <Divider />

        {/* Text color */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              onMouseDown={(e) => e.preventDefault()}
              title="Text color"
              className="h-7 w-7 flex items-center justify-center rounded text-foreground hover:bg-muted"
            >
              <Palette className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2 z-[200]" align="start">
            <div className="grid grid-cols-8 gap-1">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c}
                  className="h-5 w-5 rounded border border-border hover:scale-110 transition-transform"
                  style={{ backgroundColor: c }}
                  onClick={() => cmd('foreColor', c)}
                  title={c}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center gap-1">
              <label className="text-[10px] text-muted-foreground">Custom:</label>
              <input
                type="color"
                className="h-5 w-8 cursor-pointer border-0"
                onChange={(e) => cmd('foreColor', e.target.value)}
              />
            </div>
          </PopoverContent>
        </Popover>

        <Divider />

        {/* Alignment */}
        <ToolBtn onClick={() => cmd('justifyLeft')} title="Align left"><AlignLeft className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn onClick={() => cmd('justifyCenter')} title="Align center"><AlignCenter className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn onClick={() => cmd('justifyRight')} title="Align right"><AlignRight className="h-3.5 w-3.5" /></ToolBtn>

        <Divider />

        {/* Lists */}
        <ToolBtn onClick={() => cmd('insertUnorderedList')} title="Bullet list"><List className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn onClick={() => cmd('insertOrderedList')} title="Numbered list"><ListOrdered className="h-3.5 w-3.5" /></ToolBtn>

        <Divider />

        {/* Math symbols & formulas */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              onMouseDown={(e) => e.preventDefault()}
              title="Math symbols & formulas"
              className="h-7 px-1.5 flex items-center gap-0.5 rounded text-foreground hover:bg-muted text-xs font-medium"
            >
              <span className="text-sm">∑</span>
              <span className="text-[10px]">Math</span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[380px] p-3 z-[200]" align="start">
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground">Symbols</p>
              <div className="grid grid-cols-12 gap-0.5 max-h-[160px] overflow-y-auto">
                {MATH_SYMBOLS.map((s) => (
                  <button
                    key={s.char}
                    className="h-7 w-7 flex items-center justify-center rounded text-sm hover:bg-muted transition-colors"
                    onClick={() => insertHtml(`<span class="math-symbol" style="font-family:Cambria Math,serif">${s.char}</span>`)}
                    title={s.label}
                  >
                    {s.char}
                  </button>
                ))}
              </div>
              <div className="border-t border-border pt-2">
                <p className="text-[11px] font-medium text-muted-foreground mb-1">Templates (editable bounds)</p>
                <div className="flex flex-wrap gap-1 max-h-[140px] overflow-y-auto">
                  {MATH_TEMPLATES.map((t) => (
                    <button
                      key={t.label}
                      className="px-2 py-1 rounded border border-border text-xs hover:bg-muted transition-colors"
                      onClick={() => insertHtml(t.html)}
                      title={t.label}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Divider />

        {/* Find & Replace toggle */}
        <ToolBtn
          onClick={() => setShowSearch((p) => !p)}
          active={showSearch}
          title="Find & Replace"
        >
          <Search className="h-3.5 w-3.5" />
        </ToolBtn>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="flex items-center gap-1.5 py-1">
          <Input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleFind(); }}
            placeholder="Find…"
            className="h-6 text-xs w-[140px]"
          />
          <Input
            value={replaceQuery}
            onChange={(e) => setReplaceQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleReplace(); }}
            placeholder="Replace…"
            className="h-6 text-xs w-[140px]"
          />
          <Button variant="outline" size="sm" onClick={handleFind} className="h-6 text-[10px] px-2">
            Find
          </Button>
          <Button variant="outline" size="sm" onClick={handleReplace} className="h-6 text-[10px] px-2">
            Replace
          </Button>
          <Button variant="outline" size="sm" onClick={handleReplaceAll} className="h-6 text-[10px] px-2">
            All
          </Button>
          <button onClick={() => setShowSearch(false)} className="h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
