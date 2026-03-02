/**
 * Artifact Visualization — HTML Report Generator (issue #71)
 *
 * Renders DependencyGraph.json and RiskAssessment.json into
 * self-contained HTML reports (inline CSS / JS, no external deps).
 */

// ── Schema-aligned input types ──────────────────────────────────

export interface DependencyGraphNode {
  path: string;
  type: string;
  language: string;
  loc: number;
}

export interface DependencyGraphEdge {
  source: string;
  target: string;
  type: string;
}

export interface DependencyGraph {
  nodes: DependencyGraphNode[];
  edges: DependencyGraphEdge[];
}

export interface RiskFactors {
  churn: number;
  complexity: number;
  safetyPath: number;
  docCoverage: number;
  testCoverage: number;
}

export interface RiskItem {
  filePath: string;
  riskScore: number;
  factors: RiskFactors;
  safetyFlags?: string[];
}

export interface RiskAssessment {
  items: RiskItem[];
}

// ── Helpers ─────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Dependency-graph report ─────────────────────────────────────

/**
 * Produce a self-contained HTML page that renders a force-directed
 * dependency graph using vanilla JS + inline SVG.  Cycle edges are
 * highlighted in red.
 */
export function generateDependencyGraphReport(graph: object): string {
  const { nodes, edges } = graph as DependencyGraph;

  // Detect cycles via DFS so we can colour those edges red.
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }

  const cycleEdges = new Set<string>();
  const visited = new Set<string>();
  const stack = new Set<string>();

  function dfs(node: string): void {
    visited.add(node);
    stack.add(node);
    for (const neighbour of adj.get(node) ?? []) {
      if (stack.has(neighbour)) {
        cycleEdges.add(`${node}|${neighbour}`);
      } else if (!visited.has(neighbour)) {
        dfs(neighbour);
      }
    }
    stack.delete(node);
  }

  for (const n of nodes) {
    if (!visited.has(n.path)) dfs(n.path);
  }

  // Build JSON payloads to embed in the page.
  const nodesJson = JSON.stringify(
    nodes.map((n) => ({ id: n.path, type: n.type, language: n.language, loc: n.loc })),
  );
  const edgesJson = JSON.stringify(
    edges.map((e) => ({
      source: e.source,
      target: e.target,
      type: e.type,
      cycle: cycleEdges.has(`${e.source}|${e.target}`),
    })),
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Dependency Graph</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: system-ui, sans-serif; background:#1e1e2e; color:#cdd6f4; }
svg { display:block; width:100vw; height:100vh; }
.edge { stroke:#585b70; stroke-width:1.2; fill:none; marker-end:url(#arrow); }
.edge.cycle { stroke:#f38ba8; stroke-width:2; marker-end:url(#arrow-cycle); }
.node circle { fill:#89b4fa; stroke:#cdd6f4; stroke-width:1; cursor:grab; }
.node text { font-size:10px; fill:#cdd6f4; pointer-events:none; }
h1 { position:fixed; top:12px; left:16px; font-size:16px; color:#cdd6f4; z-index:10; }
.legend { position:fixed; bottom:12px; left:16px; font-size:12px; z-index:10; }
.legend span { margin-right:14px; }
.legend .cycle-label { color:#f38ba8; }
</style>
</head>
<body>
<h1>Dependency Graph</h1>
<div class="legend">
  <span>&#9679; Node (file)</span>
  <span>&#8594; Dependency</span>
  <span class="cycle-label">&#8594; Cycle edge</span>
</div>
<svg id="graph"></svg>
<script>
(function(){
  var nodes = ${nodesJson};
  var edges = ${edgesJson};

  var width = window.innerWidth, height = window.innerHeight;
  var svg = document.getElementById('graph');
  svg.setAttribute('viewBox', '0 0 '+width+' '+height);

  // Arrow markers
  var defs = document.createElementNS('http://www.w3.org/2000/svg','defs');
  function makeMarker(id, color){
    var m = document.createElementNS('http://www.w3.org/2000/svg','marker');
    m.setAttribute('id',id); m.setAttribute('viewBox','0 0 10 10');
    m.setAttribute('refX','20'); m.setAttribute('refY','5');
    m.setAttribute('markerWidth','6'); m.setAttribute('markerHeight','6');
    m.setAttribute('orient','auto-start-reverse');
    var p = document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('d','M 0 0 L 10 5 L 0 10 z'); p.setAttribute('fill',color);
    m.appendChild(p); defs.appendChild(m);
  }
  makeMarker('arrow','#585b70');
  makeMarker('arrow-cycle','#f38ba8');
  svg.appendChild(defs);

  // Index map
  var idx = {}; nodes.forEach(function(n,i){ idx[n.id]=i; });

  // Init positions randomly
  nodes.forEach(function(n){
    n.x = width/2 + (Math.random()-0.5)*width*0.6;
    n.y = height/2 + (Math.random()-0.5)*height*0.6;
    n.vx = 0; n.vy = 0;
  });

  // Draw edges
  var edgeEls = edges.map(function(e){
    var line = document.createElementNS('http://www.w3.org/2000/svg','line');
    line.classList.add('edge');
    if(e.cycle) line.classList.add('cycle');
    svg.appendChild(line);
    return line;
  });

  // Draw nodes
  var nodeEls = nodes.map(function(n){
    var g = document.createElementNS('http://www.w3.org/2000/svg','g');
    g.classList.add('node');
    var c = document.createElementNS('http://www.w3.org/2000/svg','circle');
    c.setAttribute('r', Math.max(4, Math.min(Math.sqrt(n.loc||10), 14)));
    var t = document.createElementNS('http://www.w3.org/2000/svg','text');
    var label = n.id.split('/').pop() || n.id;
    t.textContent = label;
    t.setAttribute('dx','10'); t.setAttribute('dy','4');
    g.appendChild(c); g.appendChild(t);
    svg.appendChild(g);
    return g;
  });

  // Simple force simulation
  var alpha = 1, alphaDecay = 0.005, velDecay = 0.6;
  var repulsion = 800, linkDist = 90, linkStrength = 0.05;
  var centerX = width/2, centerY = height/2, gravity = 0.01;

  function tick(){
    // Repulsion (all pairs, skip simulation for oversized graphs)
    var maxPairs = 250000;
    var nNodes = nodes.length;
    if(nNodes * (nNodes - 1) / 2 > maxPairs){
      // For huge graphs, only apply repulsion to a random sample
      for(var p=0;p<maxPairs;p++){
        var i=Math.floor(Math.random()*nNodes), j=Math.floor(Math.random()*nNodes);
        if(i===j) continue;
        var dx=nodes[j].x-nodes[i].x, dy=nodes[j].y-nodes[i].y;
        var d2=dx*dx+dy*dy||1; var d=Math.sqrt(d2);
        var f=alpha*repulsion/d2;
        var fx=dx/d*f, fy=dy/d*f;
        nodes[i].vx-=fx; nodes[i].vy-=fy;
        nodes[j].vx+=fx; nodes[j].vy+=fy;
      }
    } else {
    for(var i=0;i<nodes.length;i++){
      for(var j=i+1;j<nodes.length;j++){
        var dx=nodes[j].x-nodes[i].x, dy=nodes[j].y-nodes[i].y;
        var d2=dx*dx+dy*dy||1; var d=Math.sqrt(d2);
        var f=alpha*repulsion/d2;
        var fx=dx/d*f, fy=dy/d*f;
        nodes[i].vx-=fx; nodes[i].vy-=fy;
        nodes[j].vx+=fx; nodes[j].vy+=fy;
      }
    }
    }
    // Link attraction
    edges.forEach(function(e){
      var si=idx[e.source], ti=idx[e.target];
      if(si===undefined||ti===undefined) return;
      var s=nodes[si], t=nodes[ti];
      var dx=t.x-s.x, dy=t.y-s.y;
      var d=Math.sqrt(dx*dx+dy*dy)||1;
      var f=(d-linkDist)*linkStrength*alpha;
      var fx=dx/d*f, fy=dy/d*f;
      s.vx+=fx; s.vy+=fy;
      t.vx-=fx; t.vy-=fy;
    });
    // Gravity toward centre
    nodes.forEach(function(n){
      n.vx+=(centerX-n.x)*gravity*alpha;
      n.vy+=(centerY-n.y)*gravity*alpha;
    });
    // Integrate
    nodes.forEach(function(n){
      n.vx*=velDecay; n.vy*=velDecay;
      n.x+=n.vx; n.y+=n.vy;
    });
    alpha=Math.max(alpha-alphaDecay,0);
  }

  function render(){
    edges.forEach(function(e,i){
      var si=idx[e.source], ti=idx[e.target];
      if(si===undefined||ti===undefined) return;
      edgeEls[i].setAttribute('x1',nodes[si].x);
      edgeEls[i].setAttribute('y1',nodes[si].y);
      edgeEls[i].setAttribute('x2',nodes[ti].x);
      edgeEls[i].setAttribute('y2',nodes[ti].y);
    });
    nodeEls.forEach(function(g,i){
      g.setAttribute('transform','translate('+nodes[i].x+','+nodes[i].y+')');
    });
  }

  // Drag support
  var dragNode=null, dragOff={x:0,y:0};
  svg.addEventListener('mousedown',function(ev){
    var t=ev.target;
    if(t.tagName==='circle'){
      var gi=Array.prototype.indexOf.call(svg.querySelectorAll('.node'),t.parentNode);
      if(gi>=0){ dragNode=gi; dragOff.x=nodes[gi].x-ev.clientX; dragOff.y=nodes[gi].y-ev.clientY; alpha=0.3; }
    }
  });
  window.addEventListener('mousemove',function(ev){
    if(dragNode!==null){ nodes[dragNode].x=ev.clientX+dragOff.x; nodes[dragNode].y=ev.clientY+dragOff.y; nodes[dragNode].vx=0; nodes[dragNode].vy=0; }
  });
  window.addEventListener('mouseup',function(){ dragNode=null; });

  function loop(){ tick(); render(); requestAnimationFrame(loop); }
  loop();
})();
</script>
</body>
</html>`;
}

// ── Risk heatmap report ─────────────────────────────────────────

interface TreeNode {
  name: string;
  fullPath: string;
  children: Map<string, TreeNode>;
  item?: RiskItem;
}

function buildTree(items: RiskItem[]): TreeNode {
  const root: TreeNode = { name: "", fullPath: "", children: new Map() };
  for (const item of items) {
    const parts = item.filePath.replace(/\\/g, "/").split("/");
    let cur = root;
    let pathSoFar = "";
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      pathSoFar += (pathSoFar ? "/" : "") + part;
      if (!cur.children.has(part)) {
        cur.children.set(part, { name: part, fullPath: pathSoFar, children: new Map() });
      }
      cur = cur.children.get(part)!;
    }
    cur.item = item;
  }
  return root;
}

function riskColor(score: number): string {
  if (score < 0.3) return "#a6e3a1"; // green
  if (score <= 0.6) return "#f9e2af"; // yellow
  return "#f38ba8"; // red
}

function renderTreeHtml(node: TreeNode, depth: number): string {
  const children = [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name));
  let html = "";

  for (const child of children) {
    const isLeaf = child.children.size === 0 && child.item;
    if (isLeaf) {
      const item = child.item!;
      const bg = riskColor(item.riskScore);
      const factors = item.factors;
      const tooltip =
        `Risk: ${(item.riskScore * 100).toFixed(0)}%` +
        `&#10;Churn: ${(factors.churn * 100).toFixed(0)}%` +
        `&#10;Complexity: ${(factors.complexity * 100).toFixed(0)}%` +
        `&#10;Safety path: ${(factors.safetyPath * 100).toFixed(0)}%` +
        `&#10;Doc coverage gap: ${(factors.docCoverage * 100).toFixed(0)}%` +
        `&#10;Test coverage gap: ${(factors.testCoverage * 100).toFixed(0)}%` +
        (item.safetyFlags?.length ? `&#10;Safety flags: ${item.safetyFlags.join(", ")}` : "");

      html += `<div class="leaf" style="margin-left:${depth * 18}px" title="${tooltip}">`;
      html += `<span class="swatch" style="background:${bg}"></span>`;
      html += `<span class="name">${escapeHtml(child.name)}</span>`;
      html += `<span class="score" style="color:${bg}">${(item.riskScore * 100).toFixed(0)}%</span>`;
      html += `</div>\n`;
    } else {
      html += `<details open style="margin-left:${depth * 18}px">`;
      html += `<summary class="dir">${escapeHtml(child.name)}/</summary>\n`;
      html += renderTreeHtml(child, depth + 1);
      html += `</details>\n`;
    }
  }
  return html;
}

/**
 * Produce a self-contained HTML heatmap of per-file risk scores.
 * Files are colored green / yellow / red and tooltips show factor
 * breakdowns.
 */
export function generateRiskHeatmapReport(assessment: object): string {
  const { items } = assessment as RiskAssessment;
  const sorted = [...items].sort((a, b) => b.riskScore - a.riskScore);
  const tree = buildTree(sorted);
  const treeHtml = renderTreeHtml(tree, 0);

  const total = items.length;
  const high = items.filter((i) => i.riskScore > 0.6).length;
  const med = items.filter((i) => i.riskScore >= 0.3 && i.riskScore <= 0.6).length;
  const low = items.filter((i) => i.riskScore < 0.3).length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Risk Heatmap</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: system-ui, sans-serif; background:#1e1e2e; color:#cdd6f4; padding:24px; }
h1 { font-size:20px; margin-bottom:8px; }
.summary { font-size:13px; margin-bottom:16px; color:#a6adc8; }
.summary span { margin-right:16px; }
.legend { font-size:12px; margin-bottom:20px; }
.legend .chip { display:inline-block; width:12px; height:12px; border-radius:2px; margin-right:4px; vertical-align:middle; }
.legend span { margin-right:16px; }
details { margin:0; }
summary { cursor:pointer; list-style:none; }
summary::-webkit-details-marker { display:none; }
.dir { font-size:13px; padding:3px 0; color:#89b4fa; }
.leaf { display:flex; align-items:center; gap:6px; padding:2px 0; font-size:13px; cursor:default; }
.swatch { display:inline-block; width:10px; height:10px; border-radius:2px; flex-shrink:0; }
.name { flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.score { font-variant-numeric:tabular-nums; font-size:12px; flex-shrink:0; width:40px; text-align:right; }
</style>
</head>
<body>
<h1>Risk Heatmap</h1>
<div class="summary">
  <span>Total files: ${total}</span>
  <span style="color:#f38ba8">High risk: ${high}</span>
  <span style="color:#f9e2af">Medium: ${med}</span>
  <span style="color:#a6e3a1">Low: ${low}</span>
</div>
<div class="legend">
  <span><span class="chip" style="background:#a6e3a1"></span>&lt; 30 %</span>
  <span><span class="chip" style="background:#f9e2af"></span>30–60 %</span>
  <span><span class="chip" style="background:#f38ba8"></span>&gt; 60 %</span>
</div>
<div id="tree">
${treeHtml}
</div>
</body>
</html>`;
}
