import { useState } from 'react';
import { Block, Connection, Group, DrawingStroke, CanvasBackground } from '@/types/canvas';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Download, Presentation } from 'lucide-react';
import { toast } from 'sonner';

interface ExportState {
  blocks: Block[];
  connections: Connection[];
  groups: Group[];
  strokes: DrawingStroke[];
  background: CanvasBackground;
  canvasSize: { width: number; height: number };
}

interface InteractiveExportProps {
  open: boolean;
  onClose: () => void;
  getState: () => ExportState;
}

export default function InteractiveExport({ open, onClose, getState }: InteractiveExportProps) {
  const [includePresentation, setIncludePresentation] = useState(true);
  const [includeLayers, setIncludeLayers] = useState(true);
  const [title, setTitle] = useState('Canvas Export');

  const handleExport = () => {
    const state = getState();
    const html = generateInteractiveHTML(state, { title, includePresentation, includeLayers });
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Interactive HTML exported!');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Meeting-Ready Export</DialogTitle>
          <DialogDescription>Export as an interactive HTML file with zoom, pan, clickable nodes, and presentation mode.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="export-title">Export Title</Label>
            <Input id="export-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="My Canvas" />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="layers">Toggleable Layers</Label>
            <Switch id="layers" checked={includeLayers} onCheckedChange={setIncludeLayers} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="presentation">Presentation Mode</Label>
            <Switch id="presentation" checked={includePresentation} onCheckedChange={setIncludePresentation} />
          </div>
        </div>
        <Button onClick={handleExport} className="w-full gap-2">
          <Download className="h-4 w-4" /> Export Interactive HTML
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function generateInteractiveHTML(
  state: ExportState,
  opts: { title: string; includePresentation: boolean; includeLayers: boolean }
): string {
  const { blocks, connections, groups, strokes, canvasSize } = state;

  const groupMap = new Map<string, Group>();
  groups.forEach(g => groupMap.set(g.id, g));

  // Determine cluster labels for layers
  const clusterNames = new Set<string>();
  clusterNames.add('Ungrouped');
  blocks.forEach(b => {
    if (b.groupId && groupMap.has(b.groupId)) {
      clusterNames.add(groupMap.get(b.groupId)!.label);
    }
  });

  // Build groups sequence for presentation
  const presentationOrder = groups.length > 0
    ? groups.map(g => ({ label: g.label, blockIds: g.blockIds }))
    : [{ label: 'All Blocks', blockIds: blocks.map(b => b.id) }];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(opts.title)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;background:#111;color:#eee;overflow:hidden;height:100vh}
#viewport{position:relative;width:100%;height:100%;overflow:hidden;cursor:grab}
#viewport.grabbing{cursor:grabbing}
#canvas{position:absolute;transform-origin:0 0}
.block{position:absolute;border:2px solid #555;border-radius:8px;background:#1e1e2e;padding:12px 16px;
  cursor:pointer;transition:box-shadow .2s,border-color .2s;font-size:14px;overflow:hidden;
  display:flex;align-items:center;justify-content:center;text-align:center;word-break:break-word}
.block:hover{border-color:#6ee7b7;box-shadow:0 0 20px rgba(110,231,183,.3)}
.block.expanded{z-index:100;border-color:#6ee7b7;box-shadow:0 0 30px rgba(110,231,183,.4)}
.block-detail{display:none;margin-top:8px;font-size:12px;color:#aaa;border-top:1px solid #333;padding-top:8px;text-align:left}
.block.expanded .block-detail{display:block}
.block.circle{border-radius:50%}
.block.diamond{transform:rotate(45deg);border-radius:4px}
.block.diamond .block-inner{transform:rotate(-45deg)}
.block.sticky{background:#fef3c7;color:#92400e;border-color:#f59e0b}
svg.arrows{position:absolute;top:0;left:0;pointer-events:none}
.stroke{fill:none;stroke-linecap:round;stroke-linejoin:round}

/* Toolbar */
#toolbar{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:200;
  display:flex;gap:6px;padding:8px 16px;background:rgba(30,30,46,.95);border:1px solid #333;
  border-radius:12px;backdrop-filter:blur(12px)}
#toolbar button{background:none;border:1px solid #444;color:#ccc;padding:6px 14px;border-radius:8px;
  cursor:pointer;font-size:13px;transition:all .15s}
#toolbar button:hover,#toolbar button.active{background:#6ee7b7;color:#111;border-color:#6ee7b7}

/* Layer panel */
#layers{position:fixed;top:70px;right:16px;z-index:200;background:rgba(30,30,46,.95);
  border:1px solid #333;border-radius:12px;padding:12px;min-width:180px;backdrop-filter:blur(12px);display:none}
#layers.show{display:block}
#layers h3{font-size:13px;margin-bottom:8px;color:#6ee7b7}
.layer-item{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px;cursor:pointer}
.layer-item input{accent-color:#6ee7b7}

/* Presentation overlay */
#pres-overlay{position:fixed;inset:0;z-index:300;background:rgba(0,0,0,.92);display:none;flex-direction:column;align-items:center;justify-content:center}
#pres-overlay.show{display:flex}
#pres-title{font-size:28px;font-weight:700;color:#6ee7b7;margin-bottom:24px}
#pres-canvas{position:relative;width:80vw;height:60vh;overflow:hidden;border:1px solid #333;border-radius:12px;background:#111}
#pres-canvas .block{pointer-events:none}
#pres-nav{display:flex;gap:12px;margin-top:20px}
#pres-nav button{background:#6ee7b7;color:#111;border:none;padding:8px 20px;border-radius:8px;font-size:14px;cursor:pointer;font-weight:600}
#pres-nav button:disabled{opacity:.3;cursor:default}
#pres-counter{color:#888;font-size:13px;margin-top:8px}
#pres-note{color:#aaa;font-size:14px;margin-top:8px;max-width:60vw;text-align:center}

/* Zoom controls */
#zoom-ctrl{position:fixed;bottom:16px;right:16px;z-index:200;display:flex;gap:4px;
  background:rgba(30,30,46,.95);border:1px solid #333;border-radius:10px;padding:4px;backdrop-filter:blur(12px)}
#zoom-ctrl button{background:none;border:none;color:#ccc;width:32px;height:32px;font-size:18px;cursor:pointer;border-radius:6px}
#zoom-ctrl button:hover{background:#333}
#zoom-level{color:#888;font-size:12px;display:flex;align-items:center;padding:0 8px}
</style>
</head>
<body>
<div id="toolbar">
  <button onclick="resetView()">Reset View</button>
  <button onclick="fitAll()">Fit All</button>
  ${opts.includeLayers ? '<button onclick="toggleLayers()">Layers</button>' : ''}
  ${opts.includePresentation ? '<button onclick="startPresentation()">▶ Present</button>' : ''}
</div>

${opts.includeLayers ? `<div id="layers">
<h3>Layers</h3>
${Array.from(clusterNames).map(name => `<label class="layer-item"><input type="checkbox" checked onchange="toggleLayer('${escHtml(name)}')" />${escHtml(name)}</label>`).join('')}
<label class="layer-item"><input type="checkbox" checked onchange="toggleConnections(this.checked)" />Connections</label>
<label class="layer-item"><input type="checkbox" checked onchange="toggleDrawings(this.checked)" />Drawings</label>
</div>` : ''}

<div id="viewport">
<div id="canvas" style="width:${canvasSize.width}px;height:${canvasSize.height}px">
  <svg class="arrows" width="${canvasSize.width}" height="${canvasSize.height}" id="arrows-svg">
    <defs>
      <marker id="ah" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="#6ee7b7"/>
      </marker>
    </defs>
    ${connections.map(c => {
      const from = blocks.find(b => b.id === c.fromId);
      const to = blocks.find(b => b.id === c.toId);
      if (!from || !to) return '';
      const x1 = from.x + from.width / 2, y1 = from.y + from.height / 2;
      const x2 = to.x + to.width / 2, y2 = to.y + to.height / 2;
      const color = c.color || '#6ee7b7';
      const sw = c.strokeWidth || 2;
      const dash = c.arrowStyle === 'dashed' ? 'stroke-dasharray="8 4"' : c.arrowStyle === 'dotted' ? 'stroke-dasharray="2 4"' : '';
      if (c.cpX != null && c.cpY != null) {
        return `<path d="M${x1},${y1} Q${c.cpX},${c.cpY} ${x2},${y2}" stroke="${color}" stroke-width="${sw}" fill="none" marker-end="url(#ah)" ${dash} class="conn-line"/>`;
      }
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${sw}" marker-end="url(#ah)" ${dash} class="conn-line"/>`;
    }).join('\n    ')}
  </svg>

  ${strokes.map(s => {
    if (s.points.length < 2) return '';
    const d = s.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
    return `<svg class="arrows drawing-line" width="${canvasSize.width}" height="${canvasSize.height}"><path d="${d}" class="stroke" stroke="${s.color}" stroke-width="${s.width}"/></svg>`;
  }).join('\n  ')}

  ${blocks.map(b => {
    const clusterLabel = b.groupId && groupMap.has(b.groupId) ? groupMap.get(b.groupId)!.label : 'Ungrouped';
    const shapeClass = b.shape === 'circle' ? 'circle' : b.shape === 'sticky' ? 'sticky' : '';
    const bgStyle = b.bgColor ? `background:${b.bgColor};` : '';
    const borderStyle = b.borderColor ? `border-color:${b.borderColor};` : '';
    const textStyle = b.textColor ? `color:${b.textColor};` : '';
    const comment = b.comment || b.markdown || '';
    return `<div class="block ${shapeClass}" data-id="${b.id}" data-cluster="${escHtml(clusterLabel)}"
      style="left:${b.x}px;top:${b.y}px;width:${b.width}px;height:${b.height}px;${bgStyle}${borderStyle}${textStyle}"
      onclick="toggleExpand(this)">
      <div class="block-inner">
        <div>${escHtml(b.label)}</div>
        ${comment ? `<div class="block-detail">${escHtml(comment)}</div>` : ''}
        ${b.fileStorageUrl ? `<div class="block-detail">📎 <a href="${escHtml(b.fileStorageUrl)}" target="_blank" style="color:#6ee7b7">${escHtml(b.fileName || 'Attached file')}</a></div>` : ''}
      </div>
    </div>`;
  }).join('\n  ')}
</div>
</div>

${opts.includePresentation ? `<div id="pres-overlay">
  <div id="pres-title"></div>
  <div id="pres-canvas"></div>
  <div id="pres-note"></div>
  <div id="pres-nav">
    <button onclick="presStep(-1)" id="pres-prev">← Previous</button>
    <button onclick="presStep(1)" id="pres-next">Next →</button>
    <button onclick="exitPresentation()">✕ Exit</button>
  </div>
  <div id="pres-counter"></div>
</div>` : ''}

<div id="zoom-ctrl">
  <button onclick="zoomBy(-0.1)">−</button>
  <span id="zoom-level">100%</span>
  <button onclick="zoomBy(0.1)">+</button>
</div>

<script>
const VP=document.getElementById('viewport'),CV=document.getElementById('canvas');
let scale=1,panX=0,panY=0,dragging=false,dragStart={x:0,y:0,px:0,py:0};

function applyTransform(){CV.style.transform='translate('+panX+'px,'+panY+'px) scale('+scale+')';
  document.getElementById('zoom-level').textContent=Math.round(scale*100)+'%'}

VP.addEventListener('pointerdown',e=>{if(e.target.closest('.block'))return;dragging=true;VP.classList.add('grabbing');
  dragStart={x:e.clientX,y:e.clientY,px:panX,py:panY}});
window.addEventListener('pointermove',e=>{if(!dragging)return;panX=dragStart.px+(e.clientX-dragStart.x);
  panY=dragStart.py+(e.clientY-dragStart.y);applyTransform()});
window.addEventListener('pointerup',()=>{dragging=false;VP.classList.remove('grabbing')});
VP.addEventListener('wheel',e=>{e.preventDefault();const r=VP.getBoundingClientRect();
  const mx=e.clientX-r.left,my=e.clientY-r.top;const d=e.deltaY>0?-0.08:0.08;const ns=Math.max(0.05,Math.min(3,scale+d));
  panX=mx-(mx-panX)*(ns/scale);panY=my-(my-panY)*(ns/scale);scale=ns;applyTransform()},{passive:false});

function zoomBy(d){const r=VP.getBoundingClientRect();const mx=r.width/2,my=r.height/2;
  const ns=Math.max(0.05,Math.min(3,scale+d));panX=mx-(mx-panX)*(ns/scale);panY=my-(my-panY)*(ns/scale);
  scale=ns;applyTransform()}

function resetView(){scale=1;panX=0;panY=0;applyTransform()}

function fitAll(){const bs=document.querySelectorAll('.block');if(!bs.length)return resetView();
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  bs.forEach(b=>{const l=parseFloat(b.style.left),t=parseFloat(b.style.top),w=parseFloat(b.style.width),h=parseFloat(b.style.height);
    if(l<minX)minX=l;if(t<minY)minY=t;if(l+w>maxX)maxX=l+w;if(t+h>maxY)maxY=t+h});
  const r=VP.getBoundingClientRect();const pad=60;const cw=maxX-minX+pad*2,ch=maxY-minY+pad*2;
  scale=Math.min(r.width/cw,r.height/ch,1.5);panX=r.width/2-(minX+maxX)/2*scale;panY=r.height/2-(minY+maxY)/2*scale;applyTransform()}

function toggleExpand(el){el.classList.toggle('expanded')}

// Layers
function toggleLayers(){document.getElementById('layers')?.classList.toggle('show')}
function toggleLayer(name){document.querySelectorAll('.block').forEach(b=>{
  if(b.dataset.cluster===name)b.style.display=b.style.display==='none'?'':'none'})}
function toggleConnections(v){document.querySelectorAll('.conn-line').forEach(l=>l.style.display=v?'':'none')}
function toggleDrawings(v){document.querySelectorAll('.drawing-line').forEach(l=>l.style.display=v?'':'none')}

// Presentation
const presData=${JSON.stringify(presentationOrder)};
const allBlocks=${JSON.stringify(blocks.map(b => ({ id: b.id, x: b.x, y: b.y, w: b.width, h: b.height, label: b.label, comment: b.comment || b.markdown || '' })))};
let presIdx=0;
function startPresentation(){document.getElementById('pres-overlay')?.classList.add('show');presIdx=0;renderPresStep()}
function exitPresentation(){document.getElementById('pres-overlay')?.classList.remove('show')}
function presStep(d){presIdx=Math.max(0,Math.min(presData.length-1,presIdx+d));renderPresStep()}
function renderPresStep(){
  const s=presData[presIdx];if(!s)return;
  document.getElementById('pres-title').textContent=s.label;
  document.getElementById('pres-counter').textContent=(presIdx+1)+' / '+presData.length;
  document.getElementById('pres-prev').disabled=presIdx===0;
  document.getElementById('pres-next').disabled=presIdx===presData.length-1;
  const sBlocks=allBlocks.filter(b=>s.blockIds.includes(b.id));
  const notes=sBlocks.filter(b=>b.comment).map(b=>b.label+': '+b.comment).join(' — ');
  document.getElementById('pres-note').textContent=notes||'';
  // Render blocks into pres canvas
  const pc=document.getElementById('pres-canvas');pc.innerHTML='';
  if(!sBlocks.length)return;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  sBlocks.forEach(b=>{if(b.x<minX)minX=b.x;if(b.y<minY)minY=b.y;if(b.x+b.w>maxX)maxX=b.x+b.w;if(b.y+b.h>maxY)maxY=b.y+b.h});
  const pw=pc.clientWidth,ph=pc.clientHeight,pad=40;
  const cw=maxX-minX+pad*2,ch=maxY-minY+pad*2;const sc=Math.min(pw/cw,ph/ch,2);
  const ox=(pw-(maxX-minX)*sc)/2,oy=(ph-(maxY-minY)*sc)/2;
  sBlocks.forEach(b=>{const d=document.createElement('div');d.className='block';d.textContent=b.label;
    d.style.cssText='left:'+(ox+(b.x-minX)*sc)+'px;top:'+(oy+(b.y-minY)*sc)+'px;width:'+(b.w*sc)+'px;height:'+(b.h*sc)+'px;font-size:'+(13*sc)+'px';
    pc.appendChild(d)})
}
document.addEventListener('keydown',e=>{if(!document.getElementById('pres-overlay')?.classList.contains('show'))return;
  if(e.key==='ArrowRight'||e.key===' ')presStep(1);if(e.key==='ArrowLeft')presStep(-1);if(e.key==='Escape')exitPresentation()});

fitAll();
</script>
</body>
</html>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
