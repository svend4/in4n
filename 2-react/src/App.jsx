import { useRef, useState, useEffect, useCallback } from 'react';
import { ForceGraph3D } from 'react-force-graph';
import * as THREE from 'three';
import { GRAPH_DATA, GROUP_COLORS, TIME_ERAS } from './data.js';
import InfoPanel from './components/InfoPanel.jsx';
import TerrainOverlay from './components/TerrainOverlay.jsx';

// ─── BFS path ─────────────────────────────────────────────────────────────────
function bfsPath(links, start, end) {
  const adj = {};
  links.forEach(({ source, target }) => {
    const s = typeof source === 'object' ? source.id : source;
    const t = typeof target === 'object' ? target.id : target;
    (adj[s] ||= []).push(t);
    (adj[t] ||= []).push(s);
  });
  if (start === end) return [start];
  const visited = new Set([start]);
  const queue = [[start, [start]]];
  while (queue.length) {
    const [cur, path] = queue.shift();
    for (const nb of (adj[cur] || [])) {
      if (nb === end) return [...path, nb];
      if (!visited.has(nb)) { visited.add(nb); queue.push([nb, [...path, nb]]); }
    }
  }
  return [start];
}

export default function App() {
  const fgRef = useRef();
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });

  // Graph state
  const [era, setEra] = useState(TIME_ERAS.length);
  const [currentNodeId, setCurrentNodeId] = useState(GRAPH_DATA.nodes[0].id);
  const [targetNodeId,  setTargetNodeId]  = useState(null);
  const [travelPath,    setTravelPath]    = useState([GRAPH_DATA.nodes[0].id]);
  const [nodePositions, setNodePositions] = useState([]);

  // Traveler position (interpolated along current edge)
  const travelerRef = useRef({
    from: GRAPH_DATA.nodes[0].id,
    to:   GRAPH_DATA.nodes[1].id,
    t: 0,
    mesh: null,
    plannedPath: [],
  });
  const travelerMeshRef = useRef(null);

  // Filtered graph by era
  const activeGroups = TIME_ERAS[Math.min(era, TIME_ERAS.length) - 1].activeGroups;
  const filteredNodes = GRAPH_DATA.nodes.filter(n => activeGroups.includes(n.group));
  const filteredIds   = new Set(filteredNodes.map(n => n.id));
  const filteredLinks = GRAPH_DATA.links.filter(l => {
    const s = typeof l.source === 'object' ? l.source.id : l.source;
    const t = typeof l.target === 'object' ? l.target.id : l.target;
    return filteredIds.has(s) && filteredIds.has(t);
  });
  const graphData = { nodes: filteredNodes, links: filteredLinks };

  // Window resize
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Custom node object: glowing transparent sphere
  const nodeThreeObject = useCallback(node => {
    const group = new THREE.Group();

    // Glow sphere
    const geo  = new THREE.SphereGeometry(node.val * 0.6, 20, 20);
    const col  = GROUP_COLORS[node.group] || '#ffffff';
    const mat  = new THREE.MeshPhongMaterial({
      color: col,
      emissive: col,
      emissiveIntensity: 0.4,
      transparent: true,
      opacity: 0.7,
    });
    group.add(new THREE.Mesh(geo, mat));

    // Wireframe shell
    const wmat = new THREE.MeshBasicMaterial({
      color: col, wireframe: true, transparent: true, opacity: 0.15,
    });
    group.add(new THREE.Mesh(
      new THREE.SphereGeometry(node.val * 0.65, 8, 8),
      wmat
    ));

    return group;
  }, []);

  // Build traveler mesh once
  useEffect(() => {
    if (!fgRef.current) return;
    const scene = fgRef.current.scene();
    if (!scene) return;

    const geo  = new THREE.SphereGeometry(4, 12, 12);
    const mat  = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const mesh = new THREE.Mesh(geo, mat);

    // glowing point light attached to traveler
    const light = new THREE.PointLight('#4fc3f7', 2, 80);
    mesh.add(light);

    scene.add(mesh);
    travelerMeshRef.current = mesh;
    travelerRef.current.mesh = mesh;

    return () => { scene.remove(mesh); };
  }, []);

  // Animate traveler each frame
  useEffect(() => {
    let raf;
    const SPEED = 0.012;

    function tick() {
      const tr   = travelerRef.current;
      const mesh = travelerMeshRef.current;
      const fg   = fgRef.current;
      if (!mesh || !fg) { raf = requestAnimationFrame(tick); return; }

      tr.t += SPEED;
      if (tr.t >= 1) {
        tr.t = 0;
        tr.from = tr.to;

        if (tr.plannedPath.length > 1 && tr.plannedPath[0] === tr.from) {
          tr.plannedPath.shift();
          tr.to = tr.plannedPath[0];
        } else {
          // wander along visible links
          const neighbors = filteredLinks
            .filter(l => {
              const s = typeof l.source === 'object' ? l.source.id : l.source;
              const t = typeof l.target === 'object' ? l.target.id : l.target;
              return s === tr.from || t === tr.from;
            })
            .map(l => {
              const s = typeof l.source === 'object' ? l.source.id : l.source;
              const t = typeof l.target === 'object' ? l.target.id : l.target;
              return s === tr.from ? t : s;
            });
          if (neighbors.length) {
            tr.to = neighbors[Math.floor(Math.random() * neighbors.length)];
          }
        }
        setCurrentNodeId(tr.from);
      }

      // interpolate in 3D
      const nodeA = fg.graphData().nodes.find(n => n.id === tr.from);
      const nodeB = fg.graphData().nodes.find(n => n.id === tr.to);
      if (nodeA && nodeB && nodeA.x !== undefined) {
        mesh.position.set(
          nodeA.x + (nodeB.x - nodeA.x) * tr.t,
          nodeA.y + (nodeB.y - nodeA.y) * tr.t,
          nodeA.z + (nodeB.z - nodeA.z) * tr.t,
        );
      }

      // collect projected positions for terrain overlay
      const camera = fg.camera();
      const renderer = fg.renderer();
      if (camera && renderer) {
        const projected = fg.graphData().nodes.map(n => {
          if (n.x === undefined) return null;
          const v = new THREE.Vector3(n.x, n.y, n.z ?? 0);
          v.project(camera);
          return {
            id: n.id,
            group: n.group,
            px: (v.x * 0.5 + 0.5) * size.w,
            py: (-v.y * 0.5 + 0.5) * size.h,
          };
        }).filter(Boolean);
        setNodePositions(projected);
      }

      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [filteredLinks, size]);

  // Click: send traveler to clicked node
  const handleNodeClick = useCallback(node => {
    const tr = travelerRef.current;
    const path = bfsPath(filteredLinks, tr.from, node.id);
    tr.plannedPath = path;
    setTargetNodeId(node.id);
    setTravelPath(path);

    // camera fly-to
    if (fgRef.current) {
      const dist = 120;
      fgRef.current.cameraPosition(
        { x: node.x * 1.5, y: node.y * 1.5, z: (node.z ?? 0) + dist },
        node, 1500
      );
    }
  }, [filteredLinks]);

  const currentNode = GRAPH_DATA.nodes.find(n => n.id === currentNodeId);
  const targetNode  = GRAPH_DATA.nodes.find(n => n.id === targetNodeId);

  return (
    <div style={{ position: 'relative', width: size.w, height: size.h }}>
      <ForceGraph3D
        ref={fgRef}
        graphData={graphData}
        width={size.w}
        height={size.h}
        backgroundColor="#070714"
        nodeLabel="id"
        nodeThreeObject={nodeThreeObject}
        nodeThreeObjectExtend={false}
        linkColor={link => {
          const col = GROUP_COLORS[
            (GRAPH_DATA.nodes.find(n => n.id === (typeof link.source === 'object' ? link.source.id : link.source)) || {}).group
          ] || '#ffffff';
          return col + '88';
        }}
        linkWidth={link => (link.value || 1) * 0.5}
        linkDirectionalParticles={2}
        linkDirectionalParticleSpeed={0.004}
        linkDirectionalParticleWidth={1.5}
        onNodeClick={handleNodeClick}
        enableNodeDrag={false}
      />

      {/* Delaunay terrain overlay */}
      <TerrainOverlay
        nodePositions={nodePositions}
        width={size.w}
        height={size.h}
        opacity={0.15}
      />

      <InfoPanel
        currentNode={currentNode}
        targetNode={targetNode}
        path={travelPath}
        era={era}
        onEraChange={setEra}
        maxEra={TIME_ERAS.length}
      />
    </div>
  );
}
