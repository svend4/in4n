import { ItemView, Plugin, WorkspaceLeaf } from 'obsidian';
// @ts-ignore
import Delaunator from 'delaunator';

const VIEW_TYPE = 'info-aquarium';

const CAT_PALETTE: Record<string, string> = {
  default: '#4fc3f7',
  current: '#ffd54f',
  target:  '#c792ea',
  focus:   '#ff6b9d',
};

// ─── Types ───────────────────────────────────────────────────────────────────
interface NodeState {
  id: string; label: string;
  x: number; y: number; vx: number; vy: number;
  links: number;
}

// ─── Physics ─────────────────────────────────────────────────────────────────
function physicsStep(nodes: NodeState[], edges: [number, number][]): void {
  const REPULSION = 5000, SPRING_K = 0.035, SPRING_LEN = 140, DAMPING = 0.86, CENTER = 0.004;
  const n = nodes.length;
  for (let i = 0; i < n; i++) {
    for (let j = i+1; j < n; j++) {
      const dx = nodes[j].x-nodes[i].x, dy = nodes[j].y-nodes[i].y;
      const d2 = dx*dx+dy*dy+1, d = Math.sqrt(d2);
      const f  = REPULSION/d2, fx = f*dx/d, fy = f*dy/d;
      nodes[i].vx -= fx; nodes[i].vy -= fy;
      nodes[j].vx += fx; nodes[j].vy += fy;
    }
  }
  edges.forEach(([a,b]) => {
    const dx = nodes[b].x-nodes[a].x, dy = nodes[b].y-nodes[a].y;
    const d  = Math.sqrt(dx*dx+dy*dy)||1;
    const s  = (d-SPRING_LEN)*SPRING_K;
    const fx = s*dx/d, fy = s*dy/d;
    nodes[a].vx += fx; nodes[a].vy += fy;
    nodes[b].vx -= fx; nodes[b].vy -= fy;
  });
  for (let i = 0; i < n; i++) {
    nodes[i].vx = (nodes[i].vx - nodes[i].x*CENTER)*DAMPING;
    nodes[i].vy = (nodes[i].vy - nodes[i].y*CENTER)*DAMPING;
    nodes[i].x += nodes[i].vx; nodes[i].y += nodes[i].vy;
  }
}

// ─── BFS ─────────────────────────────────────────────────────────────────────
function bfs(adj: Map<number,number[]>, start: number, end: number): number[] {
  if (start===end) return [start];
  const visited = new Set([start]);
  const queue: [number, number[]][] = [[start,[start]]];
  while (queue.length) {
    const [cur,path] = queue.shift()!;
    for (const nb of (adj.get(cur)||[])) {
      if (nb===end) return [...path,nb];
      if (!visited.has(nb)) { visited.add(nb); queue.push([nb,[...path,nb]]); }
    }
  }
  return [start];
}

// ─── Hyperbolic (Poincaré disk) ───────────────────────────────────────────────
// Möbius transform: move point (ax,ay) to origin
function mobius(px: number, py: number, ax: number, ay: number) {
  const nr = px-ax, ni = py-ay;
  const dr = 1-(ax*px+ay*py), di = -(ax*py-ay*px);
  const d2 = dr*dr+di*di+1e-12;
  return { x:(nr*dr+ni*di)/d2, y:(ni*dr-nr*di)/d2 };
}

function projectToDisk(nodes: NodeState[], focusIdx: number) {
  const maxR = Math.max(...nodes.map(n => Math.hypot(n.x,n.y)))||1;
  const sc   = 0.93/maxR;
  const norm = nodes.map(n => ({ x:n.x*sc, y:n.y*sc }));
  const fa   = norm[focusIdx];
  return norm.map(p => mobius(p.x,p.y,fa.x,fa.y));
}

function hyperNodeR(hx: number, hy: number): number {
  return Math.max(5, 22*(1-Math.hypot(hx,hy)*0.75));
}

// ─── AquariumView ─────────────────────────────────────────────────────────────
class AquariumView extends ItemView {
  private canvas!: HTMLCanvasElement;
  private ctx!:    CanvasRenderingContext2D;
  private nodes:   NodeState[]          = [];
  private edges:   [number,number][]    = [];
  private adj:     Map<number,number[]> = new Map();
  private raf = 0;

  // camera (normal mode)
  private camX = 0; private camY = 0; private camScale = 1;
  private isDragging = false;
  private dragStart  = {x:0,y:0};
  private camStart   = {x:0,y:0};

  // traveler
  private traveler = { from:0, to:1, t:0, plannedPath:[] as number[] };
  private trail:    { x:number; y:number }[] = [];

  // pheromones
  private pheromones: Float32Array = new Float32Array(0);
  private readonly EVAP    = 0.997;
  private readonly DEPOSIT = 0.28;

  // hyperbolic
  private hyperMode  = false;
  private hyperFocus = 0;

  // ui
  private targetIdx: number|null = null;
  private statusEl!:  HTMLElement;
  private modeEl!:    HTMLElement;
  private frame = 0;

  getViewType()   { return VIEW_TYPE; }
  getDisplayText(){ return 'InfoAquarium'; }
  getIcon()       { return 'git-fork'; }

  async onOpen() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.style.cssText = 'padding:0; overflow:hidden; position:relative; background:#070714;';

    this.statusEl = containerEl.createEl('div');
    this.statusEl.style.cssText = `
      position:absolute; top:12px; left:14px; z-index:10; pointer-events:none;
      font-family:monospace; font-size:13px; font-weight:bold;
      color:#4fc3f7; text-shadow:0 0 14px #4fc3f788;`;

    this.modeEl = containerEl.createEl('div');
    this.modeEl.style.cssText = `
      position:absolute; top:38px; left:14px; z-index:10; pointer-events:none;
      font-family:monospace; font-size:9px; letter-spacing:2px;
      padding:2px 8px; border-radius:10px;
      background:rgba(79,195,247,0.12); color:#4fc3f7;
      border:1px solid #4fc3f744;`;
    this.modeEl.textContent = 'NORMAL';

    const hint = containerEl.createEl('div');
    hint.style.cssText = `
      position:absolute; bottom:10px; left:50%; transform:translateX(-50%); z-index:10;
      font-family:monospace; font-size:10px; opacity:0.22; pointer-events:none; color:#fff;`;
    hint.textContent = 'Клик — цель · Перетащить — панорама · Колесо — зум · H — гиперболический режим';

    this.canvas = containerEl.createEl('canvas');
    this.ctx    = this.canvas.getContext('2d')!;
    this.sizeCanvas();
    this.loadGraph();
    this.bindEvents();
    this.loop();
  }

  async onClose() { cancelAnimationFrame(this.raf); }

  private sizeCanvas() {
    const { width, height } = this.containerEl.getBoundingClientRect();
    this.canvas.width  = width  || 800;
    this.canvas.height = height || 600;
  }

  private loadGraph() {
    const cache = this.app.metadataCache;
    const files = this.app.vault.getMarkdownFiles();
    const idxMap = new Map<string,number>();

    this.nodes = files.map((f,i) => {
      idxMap.set(f.path, i);
      const a = (i/files.length)*Math.PI*2;
      return { id:f.path, label:f.basename, x:Math.cos(a)*180, y:Math.sin(a)*180, vx:0,vy:0, links:0 };
    });
    this.edges = [];
    this.adj   = new Map(this.nodes.map((_,i)=>[i,[]]));

    files.forEach((f,i) => {
      (cache.getCache(f.path)?.links || []).forEach(link => {
        const tgt = cache.getFirstLinkpathDest(link.link, f.path);
        if (tgt) {
          const j = idxMap.get(tgt.path);
          if (j !== undefined && j !== i) {
            this.edges.push([i,j]);
            this.adj.get(i)!.push(j); this.adj.get(j)!.push(i);
            this.nodes[i].links++; this.nodes[j].links++;
          }
        }
      });
    });

    if (this.nodes.length < 3) this.loadDemo();

    this.pheromones = new Float32Array(this.edges.length).fill(0.05);

    if (this.nodes.length > 1) {
      this.traveler.from = 0;
      this.traveler.to   = this.adj.get(0)?.[0] ?? 1;
      this.hyperFocus    = 0;
    }
  }

  private loadDemo() {
    const labels = ['Время','Пространство','Движение','Память','Смысл','Форма','Связь','Поиск','Знание','Вопрос','Граница','Путь'];
    this.nodes = labels.map((label,i) => {
      const a = (i/labels.length)*Math.PI*2;
      return { id:label, label, x:Math.cos(a)*180, y:Math.sin(a)*180, vx:0,vy:0, links:0 };
    });
    const raw: [number,number][] = [
      [0,1],[0,2],[0,3],[0,7],[0,9],[1,2],[1,5],[1,10],[1,11],
      [2,4],[2,6],[2,11],[3,4],[3,8],[3,9],[4,5],[4,7],[4,8],
      [5,6],[5,10],[6,7],[6,8],[6,11],[7,9],[8,9],[9,10],[10,11],
    ];
    this.edges = raw;
    this.adj   = new Map(this.nodes.map((_,i)=>[i,[]]));
    raw.forEach(([a,b]) => {
      this.adj.get(a)!.push(b); this.adj.get(b)!.push(a);
      this.nodes[a].links++; this.nodes[b].links++;
    });
  }

  // ── Interaction ──────────────────────────────────────────────────────────
  private bindEvents() {
    const c = this.canvas;

    c.addEventListener('mousedown', e => {
      const hit = this.hyperMode
        ? this.hitTestHyper(e.offsetX, e.offsetY)
        : this.hitTestNormal(e.offsetX, e.offsetY);

      if (hit !== null) {
        this.traveler.plannedPath = bfs(this.adj, this.traveler.from, hit);
        this.targetIdx  = hit;
        this.hyperFocus = hit;
        this.statusEl.textContent = '→ ' + this.nodes[hit].label;
      } else if (!this.hyperMode) {
        this.isDragging = true;
        this.dragStart  = { x:e.offsetX, y:e.offsetY };
        this.camStart   = { x:this.camX,  y:this.camY  };
      }
    });
    c.addEventListener('mousemove', e => {
      if (!this.isDragging) return;
      this.camX = this.camStart.x + (e.offsetX-this.dragStart.x)/this.camScale;
      this.camY = this.camStart.y + (e.offsetY-this.dragStart.y)/this.camScale;
    });
    c.addEventListener('mouseup',   () => { this.isDragging = false; });
    c.addEventListener('wheel', e => {
      e.preventDefault();
      this.camScale = Math.max(0.15, Math.min(8, this.camScale*(e.deltaY<0?1.1:0.9)));
    }, { passive:false });

    // 'H' key to toggle hyper mode (when canvas is focused)
    c.setAttribute('tabindex','0');
    c.addEventListener('keydown', e => {
      if (e.key==='h'||e.key==='H') {
        this.hyperMode = !this.hyperMode;
        this.modeEl.textContent    = this.hyperMode ? 'HYPER · POINCARÉ' : 'NORMAL';
        this.modeEl.style.color    = this.hyperMode ? '#ce93d8' : '#4fc3f7';
        this.modeEl.style.background = this.hyperMode
          ? 'rgba(171,71,188,0.18)' : 'rgba(79,195,247,0.12)';
        this.modeEl.style.border   = this.hyperMode
          ? '1px solid #ab47bc88' : '1px solid #4fc3f744';
      }
    });

    const ro = new ResizeObserver(() => this.sizeCanvas());
    ro.observe(this.containerEl);
  }

  private toWorld(sx: number, sy: number) {
    const W = this.canvas.width, H = this.canvas.height;
    return { x:(sx-W/2)/this.camScale-this.camX, y:(sy-H/2)/this.camScale-this.camY };
  }

  private get diskR() { return Math.min(this.canvas.width, this.canvas.height)*0.44*this.camScale; }

  private hitTestNormal(sx: number, sy: number): number|null {
    const w = this.toWorld(sx,sy), R = 22/this.camScale;
    let best: number|null = null, bestD = R;
    this.nodes.forEach((n,i) => { const d=Math.hypot(n.x-w.x,n.y-w.y); if(d<bestD){bestD=d;best=i;} });
    return best;
  }

  private hitTestHyper(sx: number, sy: number): number|null {
    const W = this.canvas.width, H = this.canvas.height;
    const R = this.diskR;
    const hx = (sx-W/2)/R, hy = (sy-H/2)/R;
    const disk = projectToDisk(this.nodes, this.hyperFocus);
    let best: number|null = null, bestD = 0.12;
    disk.forEach((p,i) => { const d=Math.hypot(p.x-hx,p.y-hy); if(d<bestD){bestD=d;best=i;} });
    return best;
  }

  // ── Loop ──────────────────────────────────────────────────────────────────
  private loop() {
    this.raf = requestAnimationFrame(() => this.loop());
    physicsStep(this.nodes, this.edges);
    this.stepTraveler();
    this.evaporate();
    this.draw();
    this.frame++;
  }

  private evaporate() {
    for (let i = 0; i < this.pheromones.length; i++)
      this.pheromones[i] = Math.max(0.02, this.pheromones[i]*this.EVAP);
  }

  private depositPheromone(from: number, to: number) {
    const idx = this.edges.findIndex(([a,b])=>(a===from&&b===to)||(a===to&&b===from));
    if (idx>=0) this.pheromones[idx] = Math.min(1, this.pheromones[idx]+this.DEPOSIT);
  }

  private stepTraveler() {
    const tr = this.traveler;
    if (this.nodes.length < 2) return;
    tr.t += 0.01;
    if (tr.t >= 1) {
      this.depositPheromone(tr.from, tr.to);
      tr.t    = 0;
      tr.from = tr.to;
      this.hyperFocus = tr.from;

      if (tr.plannedPath.length>1 && tr.plannedPath[0]===tr.from) {
        tr.plannedPath.shift();
        tr.to = tr.plannedPath[0];
      } else {
        const nbs = this.adj.get(tr.from)||[];
        tr.to = nbs.length ? nbs[Math.floor(Math.random()*nbs.length)] : tr.from;
      }
      if (tr.plannedPath.length<=1) this.statusEl.textContent = this.nodes[tr.from]?.label??'';
    }
    const a = this.nodes[tr.from], b = this.nodes[tr.to];
    if (a&&b) {
      this.trail.push({ x:a.x+(b.x-a.x)*tr.t, y:a.y+(b.y-a.y)*tr.t });
      if (this.trail.length>45) this.trail.shift();
    }
  }

  // ── Draw ──────────────────────────────────────────────────────────────────
  private draw() {
    if (this.hyperMode) this.drawHyper();
    else               this.drawNormal();
  }

  private edgeStyle(ei: number) {
    const ph   = this.pheromones[ei] ?? 0.02;
    return {
      hue:   200 - ph*180,
      alpha: 0.18 + ph*0.68,
      width: 0.8 + ph*4,
      blur:  4 + ph*14,
    };
  }

  private drawNormal() {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0,0,W,H);
    ctx.save();
    ctx.translate(W/2,H/2);
    ctx.scale(this.camScale,this.camScale);
    ctx.translate(this.camX,this.camY);

    // Terrain
    if (this.nodes.length >= 3) {
      const coords = this.nodes.flatMap(n=>[n.x,n.y]);
      try {
        const del=new Delaunator(coords), tris=del.triangles;
        for (let i=0;i<tris.length;i+=3) {
          const a=this.nodes[tris[i]], b=this.nodes[tris[i+1]], c=this.nodes[tris[i+2]];
          if (!a||!b||!c) continue;
          const hue   = ((i/tris.length)*280+30)|0;
          const pulse = 0.1+0.04*Math.sin(this.frame*0.02+i*0.4);
          ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.lineTo(c.x,c.y); ctx.closePath();
          ctx.fillStyle=`hsla(${hue},65%,32%,${pulse})`; ctx.fill();
          ctx.strokeStyle=`hsla(${hue},55%,65%,0.06)`; ctx.lineWidth=0.5; ctx.stroke();
        }
      } catch { /* skip */ }
    }

    // Edges with pheromone heat
    this.edges.forEach(([ai,bi],ei) => {
      const a=this.nodes[ai], b=this.nodes[bi];
      if (!a||!b) return;
      const { hue,alpha,width,blur } = this.edgeStyle(ei);
      ctx.save();
      ctx.shadowColor=`hsl(${hue},85%,65%)`; ctx.shadowBlur=blur;
      ctx.strokeStyle=`hsla(${hue},75%,65%,${alpha})`; ctx.lineWidth=width;
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
      ctx.restore();
    });

    // Trail
    this.trail.forEach((pt,i) => {
      const al=(i/this.trail.length)*0.7;
      ctx.beginPath(); ctx.arc(pt.x,pt.y,(i/this.trail.length)*4,0,Math.PI*2);
      ctx.fillStyle=`rgba(100,220,255,${al})`; ctx.fill();
    });

    // Nodes
    this.nodes.forEach((n,i) => {
      const isTarget  = this.targetIdx===i;
      const isCurrent = this.traveler.from===i;
      const r = Math.max(10,10+n.links*1.5);
      const color = isCurrent ? CAT_PALETTE.current : isTarget ? CAT_PALETTE.target : CAT_PALETTE.default;

      const grd=ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,r*2.2);
      grd.addColorStop(0,color+'aa'); grd.addColorStop(1,color+'00');
      ctx.beginPath(); ctx.arc(n.x,n.y,r*2.2,0,Math.PI*2); ctx.fillStyle=grd; ctx.fill();

      ctx.save();
      ctx.shadowColor=color; ctx.shadowBlur=isTarget?22:10;
      ctx.beginPath(); ctx.arc(n.x,n.y,r,0,Math.PI*2); ctx.fillStyle=color+'cc'; ctx.fill();
      ctx.restore();

      ctx.fillStyle='rgba(220,235,255,0.82)';
      ctx.font=`${isCurrent?'bold ':''}10px monospace`;
      ctx.textAlign='center'; ctx.fillText(n.label,n.x,n.y+r+11);
    });

    // Traveler
    const tr=this.traveler, a=this.nodes[tr.from], b=this.nodes[tr.to];
    if (a&&b) {
      const tx=a.x+(b.x-a.x)*tr.t, ty=a.y+(b.y-a.y)*tr.t;
      const pr=5+2*Math.sin(this.frame*0.15);
      ctx.save(); ctx.shadowColor='#fff'; ctx.shadowBlur=18;
      const grd2=ctx.createRadialGradient(tx,ty,0,tx,ty,pr);
      grd2.addColorStop(0,'rgba(255,255,255,1)'); grd2.addColorStop(0.5,'rgba(100,200,255,0.8)'); grd2.addColorStop(1,'rgba(50,100,255,0)');
      ctx.beginPath(); ctx.arc(tx,ty,pr,0,Math.PI*2); ctx.fillStyle=grd2; ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  private drawHyper() {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0,0,W,H);

    const R    = this.diskR;
    const disk = projectToDisk(this.nodes, this.hyperFocus);

    // Background gradient
    const bg=ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,R);
    bg.addColorStop(0,'rgba(14,10,40,0.9)'); bg.addColorStop(0.7,'rgba(8,6,25,0.95)'); bg.addColorStop(1,'rgba(2,2,8,1)');
    ctx.beginPath(); ctx.arc(W/2,H/2,R,0,Math.PI*2);
    ctx.fillStyle=bg; ctx.fill();
    ctx.save();
    ctx.shadowColor='#ab47bc'; ctx.shadowBlur=20;
    ctx.strokeStyle='rgba(171,71,188,0.4)'; ctx.lineWidth=2; ctx.stroke();
    ctx.restore();

    // Clip
    ctx.save();
    ctx.beginPath(); ctx.arc(W/2,H/2,R-1,0,Math.PI*2); ctx.clip();

    const d2s = (hx: number, hy: number) => ({ x:W/2+hx*R, y:H/2+hy*R });

    // Terrain
    const coords = disk.flatMap(p=>[p.x,p.y]);
    try {
      const del=new Delaunator(coords), tris=del.triangles;
      for (let i=0;i<tris.length;i+=3) {
        const a=disk[tris[i]], b=disk[tris[i+1]], c=disk[tris[i+2]];
        if (!a||!b||!c) continue;
        const pa=d2s(a.x,a.y), pb=d2s(b.x,b.y), pc=d2s(c.x,c.y);
        const hue=((i/tris.length)*280+30)|0, pulse=0.1+0.035*Math.sin(this.frame*0.02+i*0.3);
        ctx.beginPath(); ctx.moveTo(pa.x,pa.y); ctx.lineTo(pb.x,pb.y); ctx.lineTo(pc.x,pc.y); ctx.closePath();
        ctx.fillStyle=`hsla(${hue},65%,30%,${pulse})`; ctx.fill();
        ctx.strokeStyle=`hsla(${hue},55%,65%,0.07)`; ctx.lineWidth=0.5; ctx.stroke();
      }
    } catch { /* skip */ }

    // Edges
    this.edges.forEach(([ai,bi],ei) => {
      const pa=d2s(disk[ai].x,disk[ai].y), pb=d2s(disk[bi].x,disk[bi].y);
      const { hue,alpha,width,blur } = this.edgeStyle(ei);
      ctx.save();
      ctx.shadowColor=`hsl(${hue},85%,65%)`; ctx.shadowBlur=blur;
      ctx.strokeStyle=`hsla(${hue},75%,65%,${alpha})`; ctx.lineWidth=width;
      ctx.beginPath(); ctx.moveTo(pa.x,pa.y); ctx.lineTo(pb.x,pb.y); ctx.stroke();
      ctx.restore();
    });

    // Trail (projected)
    const maxR2=Math.max(...this.nodes.map(n=>Math.hypot(n.x,n.y)))||1, sc2=0.93/maxR2;
    const fa   = { x:this.nodes[this.hyperFocus].x*sc2, y:this.nodes[this.hyperFocus].y*sc2 };
    this.trail.forEach((pt,i) => {
      const mp=mobius(pt.x*sc2,pt.y*sc2,fa.x,fa.y), sp=d2s(mp.x,mp.y);
      const al=(i/this.trail.length)*0.65, sz=(i/this.trail.length)*3.5;
      ctx.beginPath(); ctx.arc(sp.x,sp.y,sz,0,Math.PI*2);
      ctx.fillStyle=`rgba(100,220,255,${al})`; ctx.fill();
    });

    // Nodes
    disk.forEach((p,i) => {
      const isTarget  = this.targetIdx===i;
      const isCurrent = this.traveler.from===i;
      const isFocus   = this.hyperFocus===i;
      const sp        = d2s(p.x,p.y);
      const nr        = hyperNodeR(p.x,p.y);
      const color     = isCurrent ? CAT_PALETTE.current : isFocus ? CAT_PALETTE.focus : isTarget ? CAT_PALETTE.target : CAT_PALETTE.default;

      const grd=ctx.createRadialGradient(sp.x,sp.y,0,sp.x,sp.y,nr*(isFocus?2.8:1.8));
      grd.addColorStop(0,color+(isFocus?'bb':'77')); grd.addColorStop(1,color+'00');
      ctx.beginPath(); ctx.arc(sp.x,sp.y,nr*(isFocus?2.8:1.8),0,Math.PI*2); ctx.fillStyle=grd; ctx.fill();

      ctx.save();
      ctx.shadowColor=color; ctx.shadowBlur=isFocus?30:12;
      ctx.beginPath(); ctx.arc(sp.x,sp.y,nr,0,Math.PI*2);
      ctx.fillStyle=color+'cc'; ctx.fill();
      if (isTarget||isFocus) { ctx.strokeStyle=color; ctx.lineWidth=isFocus?2.5:1.5; ctx.stroke(); }
      ctx.restore();

      if (nr>9) {
        ctx.fillStyle=`rgba(220,235,255,${Math.min(1,nr/18)})`;
        ctx.font=`${isFocus||isCurrent?'bold ':''}${Math.max(8,nr*0.65)|0}px monospace`;
        ctx.textAlign='center'; ctx.fillText(this.nodes[i].label,sp.x,sp.y+nr+10);
      }
    });

    // Traveler
    const tr=this.traveler;
    const norm2=this.nodes.map(n=>({x:n.x*sc2,y:n.y*sc2}));
    const ta=norm2[tr.from], tb=norm2[tr.to];
    const ti={x:ta.x+(tb.x-ta.x)*tr.t, y:ta.y+(tb.y-ta.y)*tr.t};
    const tMob=mobius(ti.x,ti.y,fa.x,fa.y), tSp=d2s(tMob.x,tMob.y);
    const pr=5+2*Math.sin(this.frame*0.15);
    ctx.save(); ctx.shadowColor='#fff'; ctx.shadowBlur=22;
    const grd3=ctx.createRadialGradient(tSp.x,tSp.y,0,tSp.x,tSp.y,pr);
    grd3.addColorStop(0,'rgba(255,255,255,1)'); grd3.addColorStop(0.5,'rgba(100,200,255,0.8)'); grd3.addColorStop(1,'rgba(50,100,255,0)');
    ctx.beginPath(); ctx.arc(tSp.x,tSp.y,pr,0,Math.PI*2); ctx.fillStyle=grd3; ctx.fill();
    ctx.restore();

    ctx.restore(); // end clip
  }
}

// ─── Plugin ───────────────────────────────────────────────────────────────────
export default class InfoAquariumPlugin extends Plugin {
  async onload() {
    this.registerView(VIEW_TYPE, leaf => new AquariumView(leaf, this.app));
    this.addRibbonIcon('git-fork', 'InfoAquarium', () => this.activateView());
    this.addCommand({
      id: 'open-info-aquarium',
      name: 'Open InfoAquarium graph',
      callback: () => this.activateView(),
    });
  }

  async onunload() { this.app.workspace.detachLeavesOfType(VIEW_TYPE); }

  async activateView() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }
}
