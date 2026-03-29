import { ItemView, Plugin, WorkspaceLeaf } from 'obsidian';
// @ts-ignore
import Delaunator from 'delaunator';

const VIEW_TYPE = 'info-aquarium';

const NODE_COLORS = ['#4fc3f7', '#ffd54f', '#c792ea'];

const AGENT_DEFS = [
  { color: '#4fc3f7', speed: 0.010 },
  { color: '#ff6b9d', speed: 0.007 },
  { color: '#c792ea', speed: 0.009 },
  { color: '#80cbc4', speed: 0.006 },
];

// ─── Types ───────────────────────────────────────────────────────────────────
interface NodeState {
  id: string; label: string;
  x: number; y: number; vx: number; vy: number;
  links: number;
  level?: number;   // 1=detail 2=strategy 3=archetype
  cat?:   number;   // category index for cluster force
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
    const rest = (nodes[a].level===3||nodes[b].level===3) ? 100 : SPRING_LEN;
    const s  = (d-rest)*SPRING_K;
    const fx = s*dx/d, fy = s*dy/d;
    nodes[a].vx += fx; nodes[a].vy += fy;
    nodes[b].vx -= fx; nodes[b].vy -= fy;
  });
  // Cluster force: archetypes pull same-cat nodes
  nodes.forEach((n,i) => {
    if (n.level !== 3 || n.cat === undefined) return;
    nodes.forEach((m,j) => {
      if (m.cat !== n.cat || i===j) return;
      const dx = nodes[i].x-nodes[j].x, dy = nodes[i].y-nodes[j].y;
      const d  = Math.sqrt(dx*dx+dy*dy)||1;
      const target = m.level===2 ? 110 : 180;
      const s  = (d-target)*0.012;
      const fx = s*dx/d, fy = s*dy/d;
      nodes[j].vx += fx; nodes[j].vy += fy;
      nodes[i].vx -= fx*0.08; nodes[i].vy -= fy*0.08;
    });
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

interface Agent {
  color:     string;
  speed:     number;
  from:      number;
  to:        number;
  t:         number;
  trail:     { x: number; y: number }[];
  pheromones: Float32Array;
  plannedPath: number[];
  score:     number;
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

  // agents
  private agents: Agent[] = [];

  // pheromone helpers
  private readonly EVAP    = 0.997;
  private readonly DEPOSIT = 0.28;

  // hyperbolic
  private hyperMode  = false;
  private hyperFocus = 0;

  // voronoi
  private voronoiMode = false;

  // ui
  private targetIdx: number|null = null;
  private statusEl!:  HTMLElement;
  private modeEl!:    HTMLElement;
  private agentHudEl!: HTMLElement;
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

    this.agentHudEl = containerEl.createEl('div');
    this.agentHudEl.style.cssText = `
      position:absolute; top:12px; right:14px; z-index:10; pointer-events:none;
      font-family:monospace; font-size:10px; line-height:1.8; text-align:right;`;

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

    // Init agents
    this.agents = AGENT_DEFS.map((def, i) => {
      const startNode = (i * 3) % this.nodes.length;
      const neighbors = this.adj.get(startNode) || [];
      return {
        ...def,
        from:        startNode,
        to:          neighbors[0] ?? 0,
        t:           Math.random(),
        trail:       [],
        pheromones:  new Float32Array(this.edges.length).fill(0.03),
        plannedPath: [],
        score:       0,
      };
    });

    this.hyperFocus = 0;
  }

  private loadDemo() {
    // level 2 strategies (0–11) + level 3 archetypes (12–15)
    const defs: { label:string; level:number; cat:number }[] = [
      { label:'Время',        level:2, cat:0 },
      { label:'Пространство', level:2, cat:1 },
      { label:'Движение',     level:1, cat:1 },
      { label:'Память',       level:1, cat:2 },
      { label:'Смысл',        level:2, cat:2 },
      { label:'Форма',        level:2, cat:3 },
      { label:'Связь',        level:1, cat:3 },
      { label:'Поиск',        level:1, cat:0 },
      { label:'Знание',       level:1, cat:2 },
      { label:'Вопрос',       level:1, cat:0 },
      { label:'Граница',      level:1, cat:3 },
      { label:'Путь',         level:1, cat:1 },
      { label:'Бытие',        level:3, cat:0 },
      { label:'Поток',        level:3, cat:1 },
      { label:'Познание',     level:3, cat:2 },
      { label:'Структура',    level:3, cat:3 },
    ];
    this.nodes = defs.map((d,i) => {
      const a = (i/defs.length)*Math.PI*2;
      const r = d.level===3 ? 280 : 180;
      return { id:d.label, label:d.label, x:Math.cos(a)*r, y:Math.sin(a)*r,
               vx:0, vy:0, links:0, level:d.level, cat:d.cat };
    });
    const raw: [number,number][] = [
      // original
      [0,1],[0,2],[0,3],[0,7],[0,9],[1,2],[1,5],[1,10],[1,11],
      [2,4],[2,6],[2,11],[3,4],[3,8],[3,9],[4,5],[4,7],[4,8],
      [5,6],[5,10],[6,7],[6,8],[6,11],[7,9],[8,9],[9,10],[10,11],
      // archetype → cluster
      [12,0],[12,7],[12,9],
      [13,1],[13,2],[13,11],
      [14,4],[14,3],[14,8],
      [15,5],[15,6],[15,10],
      // archetype ring
      [12,13],[13,14],[14,15],[15,12],
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
        this.agents[0].plannedPath = bfs(this.adj, this.agents[0].from, hit);
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

    // Keyboard shortcuts (canvas must be focused: click it first)
    c.setAttribute('tabindex','0');
    c.addEventListener('keydown', e => {
      if (e.key==='v'||e.key==='V') {
        this.voronoiMode = !this.voronoiMode;
        this.modeEl.textContent = this.voronoiMode ? 'VORONOI' : (this.hyperMode ? 'HYPER · POINCARÉ' : 'NORMAL');
      }
      if (e.key==='h'||e.key==='H') {
        this.hyperMode = !this.hyperMode;
        this.modeEl.textContent    = this.hyperMode ? 'HYPER · POINCARÉ' : (this.voronoiMode ? 'VORONOI' : 'NORMAL');
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
    this.stepAgents();
    this.draw();
    this.frame++;
  }

  private evaporate() {
    this.agents.forEach(ag => {
      for (let i = 0; i < ag.pheromones.length; i++)
        ag.pheromones[i] = Math.max(0.02, ag.pheromones[i] * this.EVAP);
    });
  }

  private depositPheromone(ag: Agent, from: number, to: number) {
    const idx = this.edges.findIndex(([a,b])=>(a===from&&b===to)||(a===to&&b===from));
    if (idx >= 0) ag.pheromones[idx] = Math.min(1, ag.pheromones[idx] + this.DEPOSIT);
  }

  // Combined pheromone for edge rendering (sum across agents, capped)
  private combinedPheromone(ei: number): number {
    return Math.min(1, this.agents.reduce((s, ag) => s + (ag.pheromones[ei] ?? 0), 0));
  }

  private stepAgents() {
    this.evaporate();
    this.agents.forEach((ag, ai) => {
      ag.t += ag.speed;
      if (ag.t >= 1) {
        this.depositPheromone(ag, ag.from, ag.to);
        ag.t    = 0;
        ag.from = ag.to;
        if (ai === 0) {
          this.hyperFocus = ag.from;
          this.statusEl.textContent = this.nodes[ag.from]?.label ?? '';
        }

        if (ag.plannedPath.length > 1 && ag.plannedPath[0] === ag.from) {
          ag.plannedPath.shift();
          ag.to = ag.plannedPath[0];
        } else {
          // ACO: choose next node by pheromone bias
          const nbs = this.adj.get(ag.from) || [];
          if (!nbs.length) return;
          const scores = nbs.map(nb => {
            const idx = this.edges.findIndex(([a,b])=>(a===ag.from&&b===nb)||(a===nb&&b===ag.from));
            return Math.pow(ag.pheromones[idx] ?? 0.03, 2) + 0.1;
          });
          const total = scores.reduce((s, x) => s + x, 0);
          let r = Math.random() * total, chosen = nbs[0];
          for (let k = 0; k < nbs.length; k++) { r -= scores[k]; if (r <= 0) { chosen = nbs[k]; break; } }
          ag.to = chosen;
        }
      }

      const a = this.nodes[ag.from], b = this.nodes[ag.to];
      if (a && b) {
        ag.trail.push({ x: a.x+(b.x-a.x)*ag.t, y: a.y+(b.y-a.y)*ag.t });
        if (ag.trail.length > 35) ag.trail.shift();
      }
    });

    // Update agent HUD
    this.agentHudEl.innerHTML = this.agents.map(ag =>
      `<span style="color:${ag.color}">${ag.color === this.agents[0].color ? '◆' : '◇'}</span> `
    ).join('');
  }

  // ── Draw ──────────────────────────────────────────────────────────────────
  private draw() {
    if (this.hyperMode) this.drawHyper();
    else               this.drawNormal();
  }

  private edgeStyle(ei: number) {
    const ph = this.combinedPheromone(ei);
    return { hue: 200-ph*180, alpha: 0.18+ph*0.68, width: 0.8+ph*4, blur: 4+ph*14 };
  }

  private drawNormal() {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0,0,W,H);
    ctx.save();
    ctx.translate(W/2,H/2);
    ctx.scale(this.camScale,this.camScale);
    ctx.translate(this.camX,this.camY);

    // Terrain (Delaunay triangles or Voronoi cells)
    if (this.nodes.length >= 3) {
      const pts = this.nodes.map(n => [n.x, n.y] as [number, number]);
      try {
        if (this.voronoiMode && (globalThis as any).d3?.Delaunay) {
          // Voronoi cells
          const xs = this.nodes.map(n=>n.x), ys = this.nodes.map(n=>n.y), pad=200;
          const del  = (globalThis as any).d3.Delaunay.from(pts);
          const voro = del.voronoi([Math.min(...xs)-pad,Math.min(...ys)-pad,Math.max(...xs)+pad,Math.max(...ys)+pad]);
          this.nodes.forEach((_,i) => {
            const hue   = ((i/this.nodes.length)*280+30)|0;
            const pulse = 0.07+0.02*Math.sin(this.frame*0.015+i*0.8);
            const path  = new Path2D(voro.renderCell(i));
            ctx.fillStyle  =`hsla(${hue},58%,26%,${pulse})`;
            ctx.strokeStyle=`hsla(${hue},65%,55%,0.28)`; ctx.lineWidth=1.5;
            ctx.fill(path); ctx.stroke(path);
          });
        } else {
          // Delaunay triangles
          const coords = this.nodes.flatMap(n=>[n.x,n.y]);
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
        }
      } catch { /* skip degenerate geometry */ }
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

    // Agents: trails + bodies
    this.agents.forEach(ag => this.drawAgent(ag, this.nodes));

    // Nodes
    this.nodes.forEach((n,i) => {
      const isTarget   = this.targetIdx===i;
      const isCurrent  = this.agents[0].from===i;
      const isArchetype = n.level===3;
      const baseR = Math.max(10, 10+n.links*1.5);
      const r = isArchetype ? baseR*1.7*(1+0.05*Math.sin(this.frame*0.04+i)) : baseR;
      const color = isCurrent ? '#ffd54f' : isTarget ? '#c792ea' : isArchetype ? '#ffe082' : '#4fc3f7';
      const glowR = r*(isArchetype ? 2.8 : 2.2);
      const grd=ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,glowR);
      grd.addColorStop(0,color+(isArchetype?'88':'aa')); grd.addColorStop(1,color+'00');
      ctx.beginPath(); ctx.arc(n.x,n.y,glowR,0,Math.PI*2); ctx.fillStyle=grd; ctx.fill();
      ctx.save();
      ctx.shadowColor=color; ctx.shadowBlur=isArchetype?30:isTarget?22:10;
      ctx.beginPath(); ctx.arc(n.x,n.y,r,0,Math.PI*2); ctx.fillStyle=color+'cc'; ctx.fill();
      if (isArchetype) {
        const ring1=r+5+3*Math.sin(this.frame*0.05+i);
        ctx.strokeStyle=color+'aa'; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.arc(n.x,n.y,ring1,0,Math.PI*2); ctx.stroke();
        const ring2=r+12+4*Math.sin(this.frame*0.03+i*1.4);
        ctx.strokeStyle=color+'44'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.arc(n.x,n.y,ring2,0,Math.PI*2); ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle= isArchetype ? 'rgba(255,240,180,0.95)' : 'rgba(220,235,255,0.82)';
      ctx.font=`${isArchetype||isCurrent?'bold ':''}${isArchetype?12:10}px monospace`;
      ctx.textAlign='center'; ctx.fillText(n.label,n.x,n.y+r+(isArchetype?14:11));
    });
    ctx.restore();
  }

  private drawAgent(ag: Agent, positions: { x:number; y:number }[]) {
    const ctx = this.ctx;
    ag.trail.forEach((pt,i) => {
      const al=(i/ag.trail.length)*0.6, sz=(i/ag.trail.length)*3.5;
      ctx.beginPath(); ctx.arc(pt.x,pt.y,sz,0,Math.PI*2);
      const alpha=Math.round(al*255).toString(16).padStart(2,'0');
      ctx.fillStyle=ag.color+alpha; ctx.fill();
    });
    const pa=positions[ag.from], pb=positions[ag.to];
    if (!pa||!pb) return;
    const tx=pa.x+(pb.x-pa.x)*ag.t, ty=pa.y+(pb.y-pa.y)*ag.t;
    const pr=5+2*Math.sin(this.frame*0.15+ag.from);
    ctx.save(); ctx.shadowColor=ag.color; ctx.shadowBlur=18;
    const grd=ctx.createRadialGradient(tx,ty,0,tx,ty,pr);
    grd.addColorStop(0,'rgba(255,255,255,1)');
    grd.addColorStop(0.4,ag.color+'dd');
    grd.addColorStop(1,ag.color+'00');
    ctx.beginPath(); ctx.arc(tx,ty,pr,0,Math.PI*2); ctx.fillStyle=grd; ctx.fill();
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

    // Agents: projected trails + bodies
    const maxR2=Math.max(...this.nodes.map(n=>Math.hypot(n.x,n.y)))||1, sc2=0.93/maxR2;
    const fa   = { x:this.nodes[this.hyperFocus].x*sc2, y:this.nodes[this.hyperFocus].y*sc2 };
    const norm2 = this.nodes.map(n=>({x:n.x*sc2,y:n.y*sc2}));

    this.agents.forEach(ag => {
      // projected trail
      ag.trail.forEach((pt,i) => {
        const mp=mobius(pt.x*sc2,pt.y*sc2,fa.x,fa.y), sp=d2s(mp.x,mp.y);
        const al=(i/ag.trail.length)*0.6, sz=(i/ag.trail.length)*3.5;
        const alpha=Math.round(al*255).toString(16).padStart(2,'0');
        ctx.beginPath(); ctx.arc(sp.x,sp.y,sz,0,Math.PI*2);
        ctx.fillStyle=ag.color+alpha; ctx.fill();
      });
      // projected body
      const ta=norm2[ag.from], tb=norm2[ag.to];
      const ti={x:ta.x+(tb.x-ta.x)*ag.t, y:ta.y+(tb.y-ta.y)*ag.t};
      const tMob=mobius(ti.x,ti.y,fa.x,fa.y), tSp=d2s(tMob.x,tMob.y);
      const pr=5+2*Math.sin(this.frame*0.15+ag.from);
      ctx.save(); ctx.shadowColor=ag.color; ctx.shadowBlur=18;
      const grd3=ctx.createRadialGradient(tSp.x,tSp.y,0,tSp.x,tSp.y,pr);
      grd3.addColorStop(0,'rgba(255,255,255,1)'); grd3.addColorStop(0.4,ag.color+'dd'); grd3.addColorStop(1,ag.color+'00');
      ctx.beginPath(); ctx.arc(tSp.x,tSp.y,pr,0,Math.PI*2); ctx.fillStyle=grd3; ctx.fill();
      ctx.restore();
    });

    // Nodes
    disk.forEach((p,i) => {
      const isTarget  = this.targetIdx===i;
      const isCurrent = this.agents[0].from===i;
      const isFocus   = this.hyperFocus===i;
      const sp        = d2s(p.x,p.y);
      const nr        = hyperNodeR(p.x,p.y);
      const color     = isCurrent ? '#ffd54f' : isFocus ? '#ff6b9d' : isTarget ? '#c792ea' : '#4fc3f7';

      const grd=ctx.createRadialGradient(sp.x,sp.y,0,sp.x,sp.y,nr*(isFocus?2.8:1.8));
      grd.addColorStop(0,color+(isFocus?'bb':'77')); grd.addColorStop(1,color+'00');
      ctx.beginPath(); ctx.arc(sp.x,sp.y,nr*(isFocus?2.8:1.8),0,Math.PI*2); ctx.fillStyle=grd; ctx.fill();

      ctx.save(); ctx.shadowColor=color; ctx.shadowBlur=isFocus?30:12;
      ctx.beginPath(); ctx.arc(sp.x,sp.y,nr,0,Math.PI*2); ctx.fillStyle=color+'cc'; ctx.fill();
      if (isTarget||isFocus) { ctx.strokeStyle=color; ctx.lineWidth=isFocus?2.5:1.5; ctx.stroke(); }
      ctx.restore();

      if (nr>9) {
        ctx.fillStyle=`rgba(220,235,255,${Math.min(1,nr/18)})`;
        ctx.font=`${isFocus||isCurrent?'bold ':''}${Math.max(8,nr*0.65)|0}px monospace`;
        ctx.textAlign='center'; ctx.fillText(this.nodes[i].label,sp.x,sp.y+nr+10);
      }
    });

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
