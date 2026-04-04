import JSZip from 'jszip';
import omml2mathml from 'omml2mathml';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const MATH_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

export interface DocxRichParagraph {
  text: string;
  html: string;
  isLikelyHeading: boolean;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wordChildren(element: Element, localName: string): Element[] {
  return Array.from(element.childNodes).filter(
    (node): node is Element =>
      node.nodeType === Node.ELEMENT_NODE &&
      (node as Element).namespaceURI === WORD_NS &&
      (node as Element).localName === localName
  );
}

function firstWordChild(element: Element, localName: string): Element | null {
  return wordChildren(element, localName)[0] || null;
}

function hasWordDescendant(element: Element, localName: string): boolean {
  return element.getElementsByTagNameNS(WORD_NS, localName).length > 0;
}

function getRunFormatting(run: Element): { bold: boolean; italic: boolean; sub: boolean; sup: boolean; cambriaMath: boolean } {
  const rPr = firstWordChild(run, 'rPr');
  const verticalAlign = firstWordChild(rPr || run, 'vertAlign')?.getAttributeNS(WORD_NS, 'val')
    || firstWordChild(rPr || run, 'vertAlign')?.getAttribute('w:val')
    || firstWordChild(rPr || run, 'vertAlign')?.getAttribute('val')
    || '';
  const rFonts = firstWordChild(rPr || run, 'rFonts');
  const fontHints = [
    rFonts?.getAttributeNS(WORD_NS, 'ascii'),
    rFonts?.getAttributeNS(WORD_NS, 'hAnsi'),
    rFonts?.getAttributeNS(WORD_NS, 'cs'),
    rFonts?.getAttribute('w:ascii'),
    rFonts?.getAttribute('w:hAnsi'),
    rFonts?.getAttribute('w:cs'),
  ].filter(Boolean).join(' ');

  return {
    bold: !!firstWordChild(rPr || run, 'b'),
    italic: !!firstWordChild(rPr || run, 'i'),
    sub: verticalAlign === 'subscript',
    sup: verticalAlign === 'superscript',
    cambriaMath: /cambria math/i.test(fontHints),
  };
}

function wrapFormattedHtml(html: string, format: ReturnType<typeof getRunFormatting>): string {
  let result = html;
  if (!result) return result;
  if (format.bold) result = `<strong>${result}</strong>`;
  if (format.italic) result = `<em>${result}</em>`;
  if (format.sup) result = `<sup>${result}</sup>`;
  if (format.sub) result = `<sub>${result}</sub>`;
  if (format.cambriaMath) {
    result = `<span class="docx-cambria-math" style="font-family:'Cambria Math','Cambria',serif;">${result}</span>`;
  }
  return result;
}

function renderRun(run: Element, imageDataUrls?: Map<string, string>): { html: string; text: string } {
  const format = getRunFormatting(run);
  const parts: string[] = [];
  const textParts: string[] = [];

  for (const node of Array.from(run.childNodes)) {
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const element = node as Element;

    if (element.namespaceURI !== WORD_NS) continue;

    if (element.localName === 't' || element.localName === 'delText') {
      const value = element.textContent || '';
      if (value) {
        parts.push(escapeHtml(value));
        textParts.push(value);
      }
    } else if (element.localName === 'tab') {
      parts.push('&emsp;');
      textParts.push('\t');
    } else if (element.localName === 'br' || element.localName === 'cr') {
      parts.push('<br/>');
      textParts.push('\n');
    } else if (element.localName === 'drawing' || element.localName === 'object' || element.localName === 'pict') {
      // Try to extract embedded image reference
      const embedEl = element.querySelector('[*|embed]') ||
        element.querySelector('*[r\\:embed]');
      const embedId = embedEl?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed')
        || embedEl?.getAttribute('r:embed')
        || '';
      const dataUrl = embedId && imageDataUrls?.get(embedId);
      if (dataUrl) {
        parts.push(`<img src="${dataUrl}" style="max-width:100%;height:auto;display:block;margin:0.5em auto;" />`);
        textParts.push('[Image]');
      } else {
        parts.push('<span class="docx-media-placeholder">[Image]</span>');
        textParts.push('[Image]');
      }
    }
  }

  return {
    html: wrapFormattedHtml(parts.join(''), format),
    text: textParts.join(''),
  };
}

function renderMathElement(mathElement: Element): { html: string; text: string } {
  const mathml = omml2mathml(mathElement);
  mathml.setAttribute('xmlns', 'http://www.w3.org/1998/Math/MathML');
  const existingClass = mathml.getAttribute('class') || '';
  const isBlock = mathElement.localName === 'oMathPara' || mathml.getAttribute('display') === 'block';
  mathml.setAttribute('class', `${existingClass} docx-math${isBlock ? ' docx-math-block' : ''}`.trim());
  if (isBlock) {
    mathml.setAttribute('display', 'block');
  }

  return {
    html: new XMLSerializer().serializeToString(mathml),
    text: (mathml.textContent || '').replace(/\s+/g, ' ').trim(),
  };
}

function renderHyperlink(link: Element, relationships: Map<string, string>, imageDataUrls?: Map<string, string>): { html: string; text: string } {
  const relId = link.getAttributeNS(REL_NS, 'id') || link.getAttribute('r:id') || '';
  const href = relationships.get(relId) || '#';
  const parts: string[] = [];
  const textParts: string[] = [];

  for (const child of Array.from(link.childNodes)) {
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const element = child as Element;
    if (element.namespaceURI === WORD_NS && element.localName === 'r') {
      const rendered = renderRun(element, imageDataUrls);
      parts.push(rendered.html);
      textParts.push(rendered.text);
    }
  }

  const inner = parts.join('') || escapeHtml(link.textContent || href);
  return {
    html: `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${inner}</a>`,
    text: textParts.join('') || href,
  };
}

function paragraphTag(paragraph: Element): 'h1' | 'h2' | 'h3' | 'p' {
  const pPr = firstWordChild(paragraph, 'pPr');
  const style = firstWordChild(pPr || paragraph, 'pStyle');
  const styleVal = style?.getAttributeNS(WORD_NS, 'val') || style?.getAttribute('w:val') || style?.getAttribute('val') || '';
  if (/heading ?1/i.test(styleVal) || /title/i.test(styleVal)) return 'h1';
  if (/heading ?2/i.test(styleVal)) return 'h2';
  if (/heading ?[3-6]/i.test(styleVal)) return 'h3';
  return 'p';
}

function isLikelyHeadingParagraph(paragraph: Element, text: string): boolean {
  const tag = paragraphTag(paragraph);
  if (tag !== 'p') return true;
  const pPr = firstWordChild(paragraph, 'pPr');
  if (hasWordDescendant(pPr || paragraph, 'outlineLvl')) return true;
  const boldRuns = wordChildren(paragraph, 'r').filter((run) => getRunFormatting(run).bold).length;
  const totalRuns = wordChildren(paragraph, 'r').length;
  return !!text && text.length < 120 && totalRuns > 0 && boldRuns === totalRuns && !/[.,;:]$/.test(text);
}

function parseRelationships(xml: string): Map<string, string> {
  const map = new Map<string, string>();
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const rels = Array.from(doc.getElementsByTagName('Relationship'));
  for (const rel of rels) {
    const id = rel.getAttribute('Id');
    const target = rel.getAttribute('Target');
    const type = rel.getAttribute('Type') || '';
    if (id && target && /hyperlink/i.test(type)) map.set(id, target);
  }
  return map;
}

function parseImageRelationships(xml: string): Map<string, string> {
  const map = new Map<string, string>();
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const rels = Array.from(doc.getElementsByTagName('Relationship'));
  for (const rel of rels) {
    const id = rel.getAttribute('Id');
    const target = rel.getAttribute('Target');
    const type = rel.getAttribute('Type') || '';
    if (id && target && /image/i.test(type)) map.set(id, target);
  }
  return map;
}

async function loadImages(zip: JSZip, imageRels: Map<string, string>): Promise<Map<string, string>> {
  const dataUrls = new Map<string, string>();
  for (const [relId, target] of imageRels) {
    const path = target.startsWith('/') ? target.slice(1) : `word/${target}`;
    const entry = zip.file(path);
    if (!entry) continue;
    const data = await entry.async('base64');
    const ext = target.split('.').pop()?.toLowerCase() || 'png';
    const mimeMap: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', emf: 'image/x-emf', wmf: 'image/x-wmf', tiff: 'image/tiff', tif: 'image/tiff', bmp: 'image/bmp' };
    const mime = mimeMap[ext] || 'image/png';
    dataUrls.set(relId, `data:${mime};base64,${data}`);
  }
  return dataUrls;
}

export async function extractDocxRichParagraphs(arrayBuffer: ArrayBuffer): Promise<DocxRichParagraph[]> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const documentXml = await zip.file('word/document.xml')?.async('string');
  if (!documentXml) return [];

  const relsXml = await zip.file('word/_rels/document.xml.rels')?.async('string');
  const relationships = relsXml ? parseRelationships(relsXml) : new Map<string, string>();
  const imageRels = relsXml ? parseImageRelationships(relsXml) : new Map<string, string>();
  const imageDataUrls = await loadImages(zip, imageRels);
  const xmlDoc = new DOMParser().parseFromString(documentXml, 'application/xml');
  const paragraphs = Array.from(xmlDoc.getElementsByTagNameNS(WORD_NS, 'p'));

  return paragraphs
    .map((paragraph) => {
      const htmlParts: string[] = [];
      const textParts: string[] = [];

      for (const child of Array.from(paragraph.childNodes)) {
        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        const element = child as Element;

        if (element.namespaceURI === WORD_NS && element.localName === 'r') {
          const rendered = renderRun(element, imageDataUrls);
          htmlParts.push(rendered.html);
          textParts.push(rendered.text);
        } else if (element.namespaceURI === WORD_NS && element.localName === 'hyperlink') {
          const rendered = renderHyperlink(element, relationships, imageDataUrls);
          htmlParts.push(rendered.html);
          textParts.push(rendered.text);
        } else if (element.namespaceURI === MATH_NS && (element.localName === 'oMath' || element.localName === 'oMathPara')) {
          const rendered = renderMathElement(element);
          htmlParts.push(rendered.html);
          textParts.push(rendered.text);
        }
      }

      const text = textParts.join('').replace(/\s+/g, ' ').trim();
      const html = htmlParts.join('').trim();
      const tag = paragraphTag(paragraph);
      if (!text && !html) return null;

      return {
        text: text || '[Equation]',
        html: `<${tag}>${html || escapeHtml(text || '[Equation]')}</${tag}>`,
        isLikelyHeading: isLikelyHeadingParagraph(paragraph, text),
      } satisfies DocxRichParagraph;
    })
    .filter((paragraph): paragraph is DocxRichParagraph => Boolean(paragraph));
}