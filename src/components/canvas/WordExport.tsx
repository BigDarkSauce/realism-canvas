import { useState } from 'react';
import { Block, Connection, Group } from '@/types/canvas';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Download } from 'lucide-react';
import { toast } from 'sonner';

interface WordExportState {
  blocks: Block[];
  connections: Connection[];
  groups: Group[];
}

interface WordExportProps {
  open: boolean;
  onClose: () => void;
  getState: () => WordExportState;
}

export default function WordExport({ open, onClose, getState }: WordExportProps) {
  const [title, setTitle] = useState('Canvas Structure');
  const [includeConnections, setIncludeConnections] = useState(true);
  const [includeFiles, setIncludeFiles] = useState(true);

  const handleExport = () => {
    const state = getState();
    const html = generateWordHtml(state, { title, includeConnections, includeFiles });
    const blob = new Blob(
      ['\ufeff', html],
      { type: 'application/msword' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9 ]/g, '_')}.doc`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Word document exported!');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Word Document Export</DialogTitle>
          <DialogDescription>Export canvas structure as a Word document with clickable links to attached files.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="word-title">Document Title</Label>
            <Input id="word-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="My Canvas" />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="word-connections">Include Connections Map</Label>
            <Switch id="word-connections" checked={includeConnections} onCheckedChange={setIncludeConnections} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="word-files">Include File Links</Label>
            <Switch id="word-files" checked={includeFiles} onCheckedChange={setIncludeFiles} />
          </div>
        </div>
        <Button onClick={handleExport} className="w-full gap-2">
          <Download className="h-4 w-4" /> Export Word Document
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function shapeIcon(shape?: string): string {
  switch (shape) {
    case 'circle': return '⬤';
    case 'diamond': return '◆';
    case 'sticky': return '📝';
    case 'text': return '𝐓';
    default: return '▬';
  }
}

function generateWordHtml(
  state: WordExportState,
  opts: { title: string; includeConnections: boolean; includeFiles: boolean }
): string {
  const { blocks, connections, groups } = state;
  const blockMap = new Map<string, Block>();
  blocks.forEach(b => blockMap.set(b.id, b));

  const groupMap = new Map<string, Group>();
  groups.forEach(g => groupMap.set(g.id, g));

  // Organize blocks by group
  const groupedBlocks = new Map<string, Block[]>();
  const ungrouped: Block[] = [];
  blocks.forEach(b => {
    if (b.groupId && groupMap.has(b.groupId)) {
      const arr = groupedBlocks.get(b.groupId) || [];
      arr.push(b);
      groupedBlocks.set(b.groupId, arr);
    } else {
      ungrouped.push(b);
    }
  });

  let body = '';

  // Title
  body += `<h1 style="color:#1a1a2e;border-bottom:3px solid #6ee7b7;padding-bottom:8px;">${esc(opts.title)}</h1>`;
  body += `<p style="color:#666;font-size:11px;margin-bottom:24px;">Exported on ${new Date().toLocaleString()} &bull; ${blocks.length} blocks, ${connections.length} connections, ${groups.length} groups</p>`;

  // Table of Contents
  body += `<h2 style="color:#2d3748;margin-top:24px;">Table of Contents</h2>`;
  body += `<ul style="list-style:none;padding-left:0;">`;
  groups.forEach(g => {
    body += `<li style="margin:4px 0;"><a href="#group-${esc(g.id)}" style="color:#2563eb;text-decoration:none;">📁 ${esc(g.label)}</a></li>`;
  });
  if (ungrouped.length > 0) {
    body += `<li style="margin:4px 0;"><a href="#ungrouped" style="color:#2563eb;text-decoration:none;">📄 Ungrouped Blocks</a></li>`;
  }
  if (opts.includeConnections && connections.length > 0) {
    body += `<li style="margin:4px 0;"><a href="#connections" style="color:#2563eb;text-decoration:none;">🔗 Connections</a></li>`;
  }
  body += `</ul>`;

  // Groups
  groups.forEach(g => {
    const gBlocks = groupedBlocks.get(g.id) || [];
    body += `<h2 id="group-${esc(g.id)}" style="color:#1a1a2e;margin-top:32px;border-left:4px solid #6ee7b7;padding-left:12px;">📁 ${esc(g.label)}</h2>`;
    body += `<p style="color:#888;font-size:11px;">${gBlocks.length} blocks in this group</p>`;
    body += renderBlocksTable(gBlocks, opts.includeFiles);
  });

  // Ungrouped
  if (ungrouped.length > 0) {
    body += `<h2 id="ungrouped" style="color:#1a1a2e;margin-top:32px;border-left:4px solid #94a3b8;padding-left:12px;">📄 Ungrouped Blocks</h2>`;
    body += renderBlocksTable(ungrouped, opts.includeFiles);
  }

  // Connections map
  if (opts.includeConnections && connections.length > 0) {
    body += `<h2 id="connections" style="color:#1a1a2e;margin-top:32px;border-left:4px solid #f59e0b;padding-left:12px;">🔗 Connections</h2>`;
    body += `<table style="width:100%;border-collapse:collapse;margin-top:12px;">`;
    body += `<tr style="background:#f1f5f9;"><th style="padding:8px 12px;border:1px solid #e2e8f0;text-align:left;">From</th><th style="padding:8px 12px;border:1px solid #e2e8f0;text-align:left;">→</th><th style="padding:8px 12px;border:1px solid #e2e8f0;text-align:left;">To</th></tr>`;
    connections.forEach(c => {
      const from = blockMap.get(c.fromId);
      const to = blockMap.get(c.toId);
      if (!from || !to) return;
      body += `<tr>`;
      body += `<td style="padding:8px 12px;border:1px solid #e2e8f0;">${shapeIcon(from.shape)} ${esc(from.label)}</td>`;
      body += `<td style="padding:8px 12px;border:1px solid #e2e8f0;text-align:center;color:#6ee7b7;">→</td>`;
      body += `<td style="padding:8px 12px;border:1px solid #e2e8f0;">${shapeIcon(to.shape)} ${esc(to.label)}</td>`;
      body += `</tr>`;
    });
    body += `</table>`;
  }

  return `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
<meta charset="utf-8">
<style>
  body { font-family: Calibri, Arial, sans-serif; font-size: 12pt; color: #1a1a2e; margin: 40px; line-height: 1.6; }
  h1 { font-size: 22pt; }
  h2 { font-size: 16pt; }
  h3 { font-size: 13pt; }
  a { color: #2563eb; }
  table { border-collapse: collapse; }
  td, th { vertical-align: top; }
</style>
</head>
<body>${body}</body>
</html>`;
}

function renderBlocksTable(blocks: Block[], includeFiles: boolean): string {
  let html = `<table style="width:100%;border-collapse:collapse;margin-top:12px;">`;
  html += `<tr style="background:#f1f5f9;">`;
  html += `<th style="padding:8px 12px;border:1px solid #e2e8f0;text-align:left;width:30px;">Type</th>`;
  html += `<th style="padding:8px 12px;border:1px solid #e2e8f0;text-align:left;">Block Name</th>`;
  html += `<th style="padding:8px 12px;border:1px solid #e2e8f0;text-align:left;">Notes / Content</th>`;
  if (includeFiles) {
    html += `<th style="padding:8px 12px;border:1px solid #e2e8f0;text-align:left;">Attached File</th>`;
  }
  html += `</tr>`;

  blocks.forEach(b => {
    const notes = b.markdown || b.comment || '';
    const fileUrl = b.fileStorageUrl || b.fileUrl || '';
    const fileName = b.fileName || 'Open file';

    html += `<tr>`;
    html += `<td style="padding:8px 12px;border:1px solid #e2e8f0;text-align:center;font-size:16px;">${shapeIcon(b.shape)}</td>`;
    html += `<td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;">${esc(b.label)}</td>`;
    html += `<td style="padding:8px 12px;border:1px solid #e2e8f0;color:#555;font-size:10pt;">${notes ? esc(notes) : '<span style="color:#ccc;">—</span>'}</td>`;
    if (includeFiles) {
      if (fileUrl) {
        html += `<td style="padding:8px 12px;border:1px solid #e2e8f0;"><a href="${esc(fileUrl)}" target="_blank" style="color:#2563eb;text-decoration:none;">📎 ${esc(fileName)}</a></td>`;
      } else {
        html += `<td style="padding:8px 12px;border:1px solid #e2e8f0;color:#ccc;">—</td>`;
      }
    }
    html += `</tr>`;
  });

  html += `</table>`;
  return html;
}
