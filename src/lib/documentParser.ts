import mammoth from 'mammoth';

export interface DocumentSection {
  heading: string;
  content: string;
}

/**
 * Parse a DOCX file and split into sections by heading tags OR bold/large styled paragraphs
 */
export async function parseDocxSections(file: File): Promise<DocumentSection[]> {
  const arrayBuffer = await file.arrayBuffer();

  // First try HTML-based heading detection
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const html = result.value;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const elements = Array.from(doc.body.children);

  const isHeadingTag = (tag: string) => /^H[1-6]$/.test(tag);

  // Check if there are actual heading tags
  const hasHeadingTags = elements.some(el => isHeadingTag(el.tagName));

  if (hasHeadingTags) {
    return splitByHeadingTags(elements, isHeadingTag);
  }

  // No heading styles found in Word doc — fall back to simple chunk split
  // Do NOT use style heuristics for DOCX since Word heading styles are the
  // authoritative source; guessing from bold/short text creates false positives.
  const allText = elements.map(el => el.textContent?.trim() || '').filter(Boolean);
  if (allText.length === 0) return [];
  return fallbackChunkSplit(allText);
}

function splitByHeadingTags(
  elements: Element[],
  isHeadingTag: (tag: string) => boolean
): DocumentSection[] {
  const sections: DocumentSection[] = [];
  let currentHeading = '';
  let currentContent: string[] = [];

  for (const el of elements) {
    if (isHeadingTag(el.tagName)) {
      if (currentHeading || currentContent.length > 0) {
        sections.push({
          heading: currentHeading || 'Introduction',
          content: currentContent.join('\n').trim(),
        });
      }
      currentHeading = el.textContent?.trim() || 'Untitled Section';
      currentContent = [];
    } else {
      const text = el.textContent?.trim() || '';
      if (text) currentContent.push(text);
    }
  }

  if (currentHeading || currentContent.length > 0) {
    sections.push({
      heading: currentHeading || 'Introduction',
      content: currentContent.join('\n').trim(),
    });
  }

  return sections;
}

function splitByStyleHeuristics(elements: Element[]): DocumentSection[] {
  // Detect headings: paragraphs that are entirely bold/strong, short, and not part of body text
  const candidates: { index: number; text: string; score: number }[] = [];

  elements.forEach((el, i) => {
    const text = el.textContent?.trim() || '';
    if (!text || text.length > 150) return;

    let score = 0;

    // Entirely wrapped in <strong> or <b>
    const innerHtml = el.innerHTML;
    const isAllBold =
      el.querySelector('strong, b') !== null &&
      (el.querySelector('strong, b')?.textContent?.trim().length || 0) >= text.length * 0.8;
    if (isAllBold) score += 3;

    // Short text (likely a title)
    if (text.length < 80) score += 1;
    if (text.length < 40) score += 1;

    // No period at end (titles rarely end with periods)
    if (!text.endsWith('.')) score += 1;

    // All caps or title case
    if (text === text.toUpperCase() && text.length > 2) score += 2;

    // Numbered heading pattern like "1.", "1.1", "Chapter 1"
    if (/^(\d+\.?\d*\.?\s|chapter\s|section\s|part\s)/i.test(text)) score += 2;

    if (score >= 3) {
      candidates.push({ index: i, text, score });
    }
  });

  if (candidates.length === 0) {
    // Last resort: split by blank-line separated chunks or return as single section
    return splitByBlankLines(elements);
  }

  const sections: DocumentSection[] = [];
  let prevIdx = 0;

  for (let c = 0; c < candidates.length; c++) {
    const { index, text } = candidates[c];

    // Collect content between previous heading and this one
    if (index > prevIdx || (c === 0 && index > 0)) {
      const contentEls = Array.from(elements).slice(prevIdx, index);
      const contentText = contentEls.map(el => el.textContent?.trim() || '').filter(Boolean).join('\n');
      if (c === 0 && contentText) {
        sections.push({ heading: 'Introduction', content: contentText });
      } else if (sections.length > 0 && contentText) {
        sections[sections.length - 1].content = contentText;
      }
    }

    sections.push({ heading: text, content: '' });
    prevIdx = index + 1;
  }

  // Remaining content after last heading
  if (prevIdx < elements.length) {
    const contentEls = Array.from(elements).slice(prevIdx);
    const contentText = contentEls.map(el => el.textContent?.trim() || '').filter(Boolean).join('\n');
    if (sections.length > 0) {
      sections[sections.length - 1].content = contentText;
    }
  }

  // Remove empty sections
  return sections.filter(s => s.content.length > 0 || sections.indexOf(s) === 0);
}

function splitByBlankLines(elements: Element[]): DocumentSection[] {
  // Group consecutive non-empty paragraphs, use first line of each group as heading
  const allText = elements.map(el => el.textContent?.trim() || '');
  const sections: DocumentSection[] = [];
  let currentLines: string[] = [];

  for (const line of allText) {
    if (line === '' && currentLines.length > 0) {
      const heading = currentLines[0];
      const content = currentLines.slice(1).join('\n');
      sections.push({ heading, content });
      currentLines = [];
    } else if (line !== '') {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    sections.push({
      heading: currentLines[0],
      content: currentLines.slice(1).join('\n'),
    });
  }

  // If still just 1 section, try splitting by line count chunks
  if (sections.length <= 1) {
    return fallbackChunkSplit(allText.filter(Boolean));
  }

  return sections;
}

function fallbackChunkSplit(lines: string[]): DocumentSection[] {
  if (lines.length === 0) return [];
  // Split into roughly equal chunks of ~20 lines
  const chunkSize = Math.max(10, Math.ceil(lines.length / Math.min(lines.length / 5, 15)));
  const sections: DocumentSection[] = [];

  for (let i = 0; i < lines.length; i += chunkSize) {
    const chunk = lines.slice(i, i + chunkSize);
    sections.push({
      heading: chunk[0].slice(0, 80),
      content: chunk.slice(1).join('\n'),
    });
  }

  return sections;
}

/**
 * Parse a PDF file and split into sections by detecting heading-like lines.
 * Uses multiple heuristics: font size, bold weight, spacing gaps, text patterns.
 */
export async function parsePdfSections(file: File): Promise<DocumentSection[]> {
  const arrayBuffer = await file.arrayBuffer();

  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  interface PdfLine {
    text: string;
    fontSize: number;
    fontName: string;
    yGap: number; // gap from previous line
    pageNum: number;
  }

  const allLines: PdfLine[] = [];
  const Y_TOLERANCE = 3;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    // Group items by Y position with tolerance
    const lineMap = new Map<number, { text: string; maxFontSize: number; fontNames: Set<string> }>();

    for (const item of textContent.items) {
      if (!('str' in item) || !(item as any).str) continue;
      const rawY = (item as any).transform[5];
      const fontSize = Math.abs((item as any).transform[0]) || 12;
      const fontName: string = (item as any).fontName || '';

      // Find existing line within tolerance
      let matchedY: number | null = null;
      for (const [existingY] of lineMap) {
        if (Math.abs(existingY - rawY) <= Y_TOLERANCE) {
          matchedY = existingY;
          break;
        }
      }

      const y = matchedY ?? Math.round(rawY);
      const existing = lineMap.get(y);
      if (existing) {
        existing.text += (item as any).str;
        existing.maxFontSize = Math.max(existing.maxFontSize, fontSize);
        if (fontName) existing.fontNames.add(fontName);
      } else {
        const names = new Set<string>();
        if (fontName) names.add(fontName);
        lineMap.set(y, { text: (item as any).str, maxFontSize: fontSize, fontNames: names });
      }
    }

    // Sort by Y descending (PDF coordinates bottom-up)
    const sorted = Array.from(lineMap.entries())
      .sort((a, b) => b[0] - a[0]);

    let prevY: number | null = null;
    for (const [y, v] of sorted) {
      const text = v.text.trim();
      if (!text) continue;
      const yGap = prevY !== null ? Math.abs(prevY - y) : 0;
      const primaryFont = Array.from(v.fontNames)[0] || '';
      allLines.push({ text, fontSize: v.maxFontSize, fontName: primaryFont, yGap, pageNum: i });
      prevY = y;
    }
  }

  if (allLines.length === 0) return [];

  // Compute statistics
  const fontSizes = allLines.map(l => l.fontSize);
  fontSizes.sort((a, b) => a - b);
  const medianFontSize = fontSizes[Math.floor(fontSizes.length / 2)] || 12;

  // Compute body font size (most common font size)
  const fontSizeCount = new Map<number, number>();
  for (const fs of fontSizes) {
    const rounded = Math.round(fs * 10) / 10;
    fontSizeCount.set(rounded, (fontSizeCount.get(rounded) || 0) + 1);
  }
  let bodyFontSize = medianFontSize;
  let maxCount = 0;
  for (const [fs, count] of fontSizeCount) {
    if (count > maxCount) {
      maxCount = count;
      bodyFontSize = fs;
    }
  }

  // Detect bold font names
  const isBoldFont = (name: string) =>
    /bold|black|heavy|demi|semibold/i.test(name) && !/regular|light|thin/i.test(name);

  // Compute average line gap for body text
  const bodyGaps = allLines
    .filter(l => Math.abs(l.fontSize - bodyFontSize) < 1 && l.yGap > 0)
    .map(l => l.yGap);
  const avgBodyGap = bodyGaps.length > 0
    ? bodyGaps.reduce((a, b) => a + b, 0) / bodyGaps.length
    : 14;

  // Score each line as a potential heading
  const scored = allLines.map((line, idx) => {
    let score = 0;

    // Font size larger than body text (even slightly)
    const sizeRatio = line.fontSize / bodyFontSize;
    if (sizeRatio >= 1.05) score += 1;
    if (sizeRatio >= 1.15) score += 1;
    if (sizeRatio >= 1.3) score += 2;
    if (sizeRatio >= 1.6) score += 1;

    // Bold font
    if (isBoldFont(line.fontName)) score += 2;

    // Larger vertical gap before this line (section break)
    if (line.yGap > avgBodyGap * 1.5) score += 1;
    if (line.yGap > avgBodyGap * 2.5) score += 1;

    // Short text (headings are typically short)
    if (line.text.length < 100) score += 1;
    if (line.text.length < 50) score += 1;

    // Doesn't end with period/comma (body text does)
    if (!/[.,;:]$/.test(line.text)) score += 1;

    // All caps
    if (line.text === line.text.toUpperCase() && line.text.length > 2 && /[A-Z]/.test(line.text)) score += 1;

    // Numbered heading pattern
    if (/^(\d+\.?\d*\.?\s|chapter\s|section\s|part\s|appendix\s)/i.test(line.text)) score += 2;

    // Page start with larger gap (new page often starts a section)
    if (idx > 0 && allLines[idx - 1].pageNum < line.pageNum) score += 1;

    return { ...line, score };
  });

  // Dynamic threshold: find a reasonable cutoff
  const scores = scored.map(s => s.score).sort((a, b) => a - b);
  // Heading threshold: at least score 4, but adjust based on distribution
  let threshold = 4;

  // Count how many lines would be headings at different thresholds
  for (let t = 6; t >= 3; t--) {
    const count = scored.filter(s => s.score >= t).length;
    // We want at least 2 headings and at most ~30% of lines
    if (count >= 2 && count <= allLines.length * 0.3) {
      threshold = t;
      break;
    }
  }

  const sections: DocumentSection[] = [];
  let currentHeading = '';
  let currentContent: string[] = [];

  for (const line of scored) {
    if (line.score >= threshold && line.text.length < 150) {
      if (currentHeading || currentContent.length > 0) {
        sections.push({
          heading: currentHeading || 'Introduction',
          content: currentContent.join('\n').trim(),
        });
      }
      currentHeading = line.text;
      currentContent = [];
    } else if (line.text.length > 0) {
      currentContent.push(line.text);
    }
  }

  if (currentHeading || currentContent.length > 0) {
    sections.push({
      heading: currentHeading || 'Introduction',
      content: currentContent.join('\n').trim(),
    });
  }

  // If we got too few sections, try fallback
  if (sections.length <= 1 && allLines.length > 20) {
    return fallbackChunkSplit(allLines.map(l => l.text));
  }

  return sections;
}

/**
 * Create a text blob as a file for a section
 */
export function createSectionFile(section: DocumentSection, index: number, format: 'txt'): File {
  const content = `${section.heading}\n${'='.repeat(section.heading.length)}\n\n${section.content}`;
  const blob = new Blob([content], { type: 'text/plain' });
  const safeName = section.heading.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_').slice(0, 50);
  return new File([blob], `${String(index + 1).padStart(2, '0')}_${safeName}.txt`, { type: 'text/plain' });
}
