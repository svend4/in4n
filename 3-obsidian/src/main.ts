import { App, ItemView, Plugin, WorkspaceLeaf } from 'obsidian';
// @ts-ignore
import Delaunator from 'delaunator';

// ─── Constants ──────────────────────────────────────────────────────────────
const VIEW_TYPE = 'info-aquarium';

const CAT_PALETTE: Record<string, string> = {
  default:  '#4fc3f7',
  linked:   '#80cbc4',
  orphan:   '#ff6b9d',
  current:  '#ffd54f',
  target:   '#c792ea',
};

// ─── Force simulation (plain physics, no d3 dep) ────────────────────────────
interface NodeState {
  id: string;
  label: string;
  x: number; y: number;
  vx: number; vy: number;
  links: number; // link count
}

function buildForceLayout(nodes: NodeState[], edges: [number, number][]): void {
  const REPULSION   = 5000;
  const SPRING_K    = 0.035;
  const SPRING_LEN  = 140;
  const DAMPING     = 0.86;
  const CENTER      = 0.004;
  const n = nodes.length;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = nodes[j].x - nodes[i].x;
      const dy = nodes[j].y - nodes[i].y;
      const d2 = dx * dx + dy * dy + 1;
      const d  = Math.sqrt(d2);
      const f  = REPULSION / d2;
      const fx = f * dx / d, fy = f * dy / d;
      nodes[i].vx -= fx; nodes[i].vy -= fy;
      nodes[j].vx += fx; nodes[j].vy += fy;
    }
  }

  edges.forEach(([a, b]) => {
    const dx = nodes[b].x - nodes[a].x;
    const dy = nodes[b].y - nodes[a].y;
    const d  = Math.sqrt(dx * dx + dy * dy) || 1;
    const s  = (d - SPRING_LEN) * SPRING_K;
    const fx = s * dx / d, fy = s * dy / d;
    nodes[a].vx += fx; nodes[a].vy += fy;
    nodes[b].vx -= fx; nodes[b].vy -= fy;
  });

  for (let i = 0; i < n; i++) {
    nodes[i].vx = (nodes[i].vx - nodes[i].x * CENTER) * DAMPING;
    nodes[i].vy = (nodes[i].vy - nodes[i].y * CENTER) * DAMPING;
    nodes[i].x  += nodes[i].vx;
    nodes[i].y  += nodes[i].vy;
  }
}

// ─── BFS ────────────────────────────────────────────────────────────────────
function bfs(adj: Map<number, number[]>, start: number, end: number): number[] {
  if (start === end) return [start];
  const visited = new Set([start]);
  const queue: [number, number[]][] = [[start, [start]]];
  while (queue.length) {
    const [cur, path] = queue.shift()!;
    for (const nb of (adj.get(cur) || [])) {
      if (nb === end) return [...path, nb];
      if (!visited.has(nb)) { visited.add(nb); queue.push([nb, [...path, nb]]); }
    }
  }
  return [start];
}

// ─── Aquarium View ──────────────────────────────────────────────────────────
class AquariumView extends ItemView {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private nodes: NodeState[] = [];
  private edges: [number, number][] = [];
  private adj: Map<number, number[]> = new Map();
  private raf = 0;

  // camera
  private camX = 0; private camY = 0; private camScale = 1;
  private isDragging = false;
  private dragStart = { x: 0, y: 0 };
  private camStart  = { x: 0, y: 0 };

  // traveler
  private traveler = { from: 0, to: 1, t: 0, plannedPath: [] as number[] };
  private trail: { x: number; y: number }[] = [];

  // info
  private targetIdx: number | null = null;
  private statusEl!: HTMLElement;

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'InfoAquarium'; }
  getIcon() { return 'git-fork'; }

  async onOpen() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.style.cssText = 'padding:0; overflow:hidden; position:relative; background:#070714;';

    // status bar
    this.statusEl = containerEl.createEl('div', {
      cls: 'ia-status',
      text: '…',
    });
    this.statusEl.style.cssText = `
      position:absolute; top:12px; left:14px;
      font-family:monospace; font-size:13px; font-weight:bold;
      color:#4fc3f7; text-shadow:0 0 14px #4fc3f788;
      pointer-events:none; z-index:10;
    `;

    const hint = containerEl.createEl('div', { text: 'Клик — цель · Перетащить — панорама · Колесо — зум' });
    hint.style.cssText = `
      position:absolute; bottom:10px; left:50%; transform:translateX(-50%);
      font-family:monospace; font-size:10px; opacity:0.25; pointer-events:none;
      color:#fff; z-index:10;
    `;

    this.canvas = containerEl.createEl('canvas');
    this.ctx    = this.canvas.getContext('2d')!;
    this.sizeCanvas();

    this.loadGraph();
    this.bindEvents();
    this.loop();
  }

  async onClose() {
    cancelAnimationFrame(this.raf);
  }

  private sizeCanvas() {
    const { width, height } = this.containerEl.getBoundingClientRect();
    this.canvas.width  = width  || 800;
    this.canvas.height = height || 600;
  }

  // Build graph from vault metadata
  private loadGraph() {
    const cache = this.app.metadataCache;
    const files  = this.app.vault.getMarkdownFiles();

    const idxMap = new Map<string, number>();
    this.nodes = files.map((f, i) => {
      idxMap.set(f.path, i);
      const angle = (i / files.length) * Math.PI * 2;
      const r     = 180;
      return {
        id:    f.path,
        label: f.basename,
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
        vx: 0, vy: 0,
        links: 0,
      };
    });

    this.edges = [];
    this.adj   = new Map();
    this.nodes.forEach((_, i) => this.adj.set(i, []));

    files.forEach((f, i) => {
      const links = cache.getCache(f.path)?.links || [];
      links.forEach(link => {
        const target = cache.getFirstLinkpathDest(link.link, f.path);
        if (target) {
          const j = idxMap.get(target.path);
          if (j !== undefined && j !== i) {
            this.edges.push([i, j]);
            this.adj.get(i)!.push(j);
            this.adj.get(j)!.push(i);
            this.nodes[i].links++;
            this.nodes[j].links++;
          }
        }
      });
    });

    // fallback demo graph if vault is empty
    if (this.nodes.length < 3) {
      this.loadDemoGraph();
    }

    // init traveler
    if (this.nodes.length > 1) {
      this.traveler.from = 0;
      this.traveler.to   = this.adj.get(0)?.[0] ?? 1;
    }
  }

  private loadDemoGraph() {
    const labels = ['Время','Пространство','Движение','Память','Смысл','Форма','Связь','Поиск'];
    this.nodes = labels.map((label, i) => {
      const angle = (i / labels.length) * Math.PI * 2;
      return { id: label, label, x: Math.cos(angle)*180, y: Math.sin(angle)*180, vx:0,vy:0, links:0 };
    });
    const rawEdges: [number,number][] = [[0,1],[0,2],[1,3],[2,4],[3,5],[4,6],[5,7],[6,0],[7,1],[2,5],[3,6]];
    this.edges = rawEdges;
    this.adj = new Map(this.nodes.map((_,i) => [i, []]));
    rawEdges.forEach(([a,b]) => { this.adj.get(a)!.push(b); this.adj.get(b)!.push(a); });
  }

  // ── Interaction ──────────────────────────────────────────────────────────
  private bindEvents() {
    const c = this.canvas;
    c.addEventListener('mousedown', e => {
      const w   = this.toWorld(e.offsetX, e.offsetY);
      const hit = this.hitTest(w.x, w.y);
      if (hit !== null) {
        this.traveler.plannedPath = bfs(this.adj, this.traveler.from, hit);
        this.targetIdx = hit;
        this.statusEl.textContent = '→ ' + this.nodes[hit].label;
      } else {
        this.isDragging = true;
        this.dragStart  = { x: e.offsetX, y: e.offsetY };
        this.camStart   = { x: this.camX,  y: this.camY  };
      }
    });
    c.addEventListener('mousemove', e => {
      if (!this.isDragging) return;
      this.camX = this.camStart.x + (e.offsetX - this.dragStart.x) / this.camScale;
      this.camY = this.camStart.y + (e.offsetY - this.dragStart.y) / this.camScale;
    });
    c.addEventListener('mouseup', () => { this.isDragging = false; });
    c.addEventListener('wheel', e => {
      e.preventDefault();
      this.camScale = Math.max(0.15, Math.min(8, this.camScale * (e.deltaY < 0 ? 1.1 : 0.9)));
    }, { passive: false });

    // resize
    const ro = new ResizeObserver(() => { this.sizeCanvas(); });
    ro.observe(this.containerEl);
  }

  private toWorld(sx: number, sy: number) {
    const W = this.canvas.width, H = this.canvas.height;
    return {
      x: (sx - W / 2) / this.camScale - this.camX,
      y: (sy - H / 2) / this.camScale - this.camY,
    };
  }

  private hitTest(wx: number, wy: number): number | null {
    const R = 22 / this.camScale;
    let best: number | null = null, bestD = R;
    this.nodes.forEach((n, i) => {
      const d = Math.hypot(n.x - wx, n.y - wy);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  // ── Render loop ───────────────────────────────────────────────────────────
  private frame = 0;

  private loop() {
    this.raf = requestAnimationFrame(() => this.loop());
    buildForceLayout(this.nodes, this.edges);
    this.stepTraveler();
    this.draw();
    this.frame++;
  }

  private stepTraveler() {
    const tr = this.traveler;
    if (this.nodes.length < 2) return;
    tr.t += 0.01;
    if (tr.t >= 1) {
      tr.t = 0;
      tr.from = tr.to;
      if (tr.plannedPath.length > 1 && tr.plannedPath[0] === tr.from) {
        tr.plannedPath.shift();
        tr.to = tr.plannedPath[0];
      } else {
        const nbs = this.adj.get(tr.from) || [];
        tr.to = nbs.length ? nbs[Math.floor(Math.random() * nbs.length)] : tr.from;
      }
      if (tr.plannedPath.length <= 1) {
        this.statusEl.textContent = this.nodes[tr.from]?.label ?? '';
      }
    }
    const a = this.nodes[tr.from], b = this.nodes[tr.to];
    if (a && b) {
      const x = a.x + (b.x - a.x) * tr.t;
      const y = a.y + (b.y - a.y) * tr.t;
      this.trail.push({ x, y });
      if (this.trail.length > 45) this.trail.shift();
    }
  }

  private draw() {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);

    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(this.camScale, this.camScale);
    ctx.translate(this.camX, this.camY);

    // ── Terrain triangles ──
    if (this.nodes.length >= 3) {
      const coords = this.nodes.flatMap(n => [n.x, n.y]);
      try {
        const del  = new Delaunator(coords);
        const tris = del.triangles;
        for (let i = 0; i < tris.length; i += 3) {
          const a = this.nodes[tris[i]], b = this.nodes[tris[i+1]], c = this.nodes[tris[i+2]];
          if (!a || !b || !c) continue;
          const hue   = ((i / tris.length) * 280 + 30) | 0;
          const pulse = 0.1 + 0.04 * Math.sin(this.frame * 0.02 + i * 0.4);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y);
          ctx.closePath();
          ctx.fillStyle   = `hsla(${hue},65%,32%,${pulse})`;
          ctx.strokeStyle = `hsla(${hue},55%,65%,0.06)`;
          ctx.lineWidth = 0.5;
          ctx.fill(); ctx.stroke();
        }
      } catch { /* degenerate geometry — skip */ }
    }

    // ── Edges ──
    this.edges.forEach(([ai, bi]) => {
      const a = this.nodes[ai], b = this.nodes[bi];
      if (!a || !b) return;
      ctx.save();
      ctx.shadowColor = '#4fc3f766'; ctx.shadowBlur = 7;
      ctx.strokeStyle = 'rgba(100,180,255,0.28)';
      ctx.lineWidth   = 1.2;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.restore();
    });

    // ── Trail ──
    this.trail.forEach((pt, i) => {
      const a = (i / this.trail.length) * 0.7;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, (i / this.trail.length) * 4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(100,220,255,${a})`;
      ctx.fill();
    });

    // ── Nodes ──
    this.nodes.forEach((n, i) => {
      const isTarget  = this.targetIdx === i;
      const isCurrent = this.traveler.from === i;
      const r     = Math.max(10, 10 + n.links * 1.5);
      const color = isCurrent ? CAT_PALETTE.current : isTarget ? CAT_PALETTE.target : CAT_PALETTE.default;

      // glow
      const grd = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 2.2);
      grd.addColorStop(0, color + 'aa');
      grd.addColorStop(1, color + '00');
      ctx.beginPath(); ctx.arc(n.x, n.y, r * 2.2, 0, Math.PI * 2);
      ctx.fillStyle = grd; ctx.fill();

      // core
      ctx.save();
      ctx.shadowColor = color; ctx.shadowBlur = isTarget ? 22 : 10;
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = color + 'cc'; ctx.fill();
      ctx.restore();

      // label
      ctx.fillStyle = 'rgba(220,235,255,0.82)';
      ctx.font      = `${isCurrent ? 'bold ' : ''}10px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(n.label, n.x, n.y + r + 11);
    });

    // ── Traveler ──
    const tr  = this.traveler;
    const a   = this.nodes[tr.from], b = this.nodes[tr.to];
    if (a && b) {
      const tx = a.x + (b.x - a.x) * tr.t;
      const ty = a.y + (b.y - a.y) * tr.t;
      const pr = 5 + 2 * Math.sin(this.frame * 0.15);
      ctx.save();
      ctx.shadowColor = '#fff'; ctx.shadowBlur = 18;
      const grd = ctx.createRadialGradient(tx, ty, 0, tx, ty, pr);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.5, 'rgba(100,200,255,0.8)');
      grd.addColorStop(1, 'rgba(50,100,255,0)');
      ctx.beginPath(); ctx.arc(tx, ty, pr, 0, Math.PI * 2);
      ctx.fillStyle = grd; ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }
}

// ─── Plugin ──────────────────────────────────────────────────────────────────
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

  async onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }

  async activateView() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }
}
