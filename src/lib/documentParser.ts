import mammoth from 'mammoth';

export interface DocumentSection {
  heading: string;
  content: string; // plain text content of the section
}

/**
 * Parse a DOCX file and split into sections by heading tags
 */
export async function parseDocxSections(file: File): Promise<DocumentSection[]> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const html = result.value;

  // Parse HTML and split by headings
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const elements = Array.from(doc.body.children);

  const sections: DocumentSection[] = [];
  let currentHeading = '';
  let currentContent: string[] = [];

  const isHeading = (tag: string) => /^H[1-6]$/.test(tag);

  for (const el of elements) {
    if (isHeading(el.tagName)) {
      // Save previous section
      if (currentHeading || currentContent.length > 0) {
        sections.push({
          heading: currentHeading || 'Introduction',
          content: currentContent.join('\n').trim(),
        });
      }
      currentHeading = el.textContent?.trim() || 'Untitled Section';
      currentContent = [];
    } else {
      currentContent.push(el.textContent?.trim() || '');
    }
  }

  // Push last section
  if (currentHeading || currentContent.length > 0) {
    sections.push({
      heading: currentHeading || 'Introduction',
      content: currentContent.join('\n').trim(),
    });
  }

  return sections;
}

/**
 * Parse a PDF file and split into sections by detecting heading-like lines.
 * Heuristic: lines that are short, often uppercase or title-case, preceded by blank lines.
 */
export async function parsePdfSections(file: File): Promise<DocumentSection[]> {
  const arrayBuffer = await file.arrayBuffer();

  // Dynamic import for pdfjs-dist
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const allLines: { text: string; fontSize: number }[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    // Group items by Y position to form lines
    const lineMap = new Map<number, { text: string; maxFontSize: number }>();

    for (const item of textContent.items) {
      if (!('str' in item)) continue;
      const y = Math.round((item as any).transform[5]);
      const fontSize = (item as any).transform[0] || 12;
      const existing = lineMap.get(y);
      if (existing) {
        existing.text += item.str;
        existing.maxFontSize = Math.max(existing.maxFontSize, fontSize);
      } else {
        lineMap.set(y, { text: item.str, maxFontSize: fontSize });
      }
    }

    // Sort by Y descending (PDF coordinates go bottom-up)
    const sorted = Array.from(lineMap.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([, v]) => v);

    allLines.push(...sorted.map(l => ({ text: l.text.trim(), fontSize: l.maxFontSize })));
  }

  if (allLines.length === 0) return [];

  // Determine median font size to detect headings (larger than median)
  const fontSizes = allLines.filter(l => l.text.length > 0).map(l => l.fontSize);
  fontSizes.sort((a, b) => a - b);
  const medianFontSize = fontSizes[Math.floor(fontSizes.length / 2)] || 12;
  const headingThreshold = medianFontSize * 1.15;

  const sections: DocumentSection[] = [];
  let currentHeading = '';
  let currentContent: string[] = [];

  for (const line of allLines) {
    const isHeading = line.text.length > 0 &&
      line.text.length < 120 &&
      line.fontSize >= headingThreshold;

    if (isHeading) {
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
