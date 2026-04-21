import * as d3 from 'd3';

const WIDTH = 1200;
const HEIGHT = 1000;
const MARGIN = { top: 40, right: 260, bottom: 40, left: 80 };

const toneColors = ['#8ad9ff', '#c6b0ff', '#ff9ac8', '#ff6b9d', '#ff4e7c', '#ff2a5f', '#ff0040'];

let rendered = false;

export function renderTree(bundle, onLeafClick) {
  if (!bundle.tree) {
    document.getElementById('tree-view').innerHTML =
      '<div style="color:#6b7f99;padding:40px;text-align:center">No tree data — run `python pipeline.py --stage tree` first.</div>';
    return;
  }
  if (rendered) return;  // SVG already built; D3 is expensive so we keep it
  rendered = true;

  const container = d3.select('#tree-view');
  container.selectAll('*').remove();

  const svg = container.append('svg')
    .attr('width', WIDTH)
    .attr('height', HEIGHT)
    .attr('viewBox', [0, 0, WIDTH, HEIGHT]);

  const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

  const root = d3.hierarchy(bundle.tree);
  const leaves = root.leaves().length;

  // Cluster layout: x = depth (height normalised), y = leaf index
  const cluster = d3.cluster().size([HEIGHT - MARGIN.top - MARGIN.bottom,
                                       WIDTH - MARGIN.left - MARGIN.right]);
  cluster(root);

  // Override x-positions to reflect clustering distance (like a phylogenetic tree)
  const maxHeight = root.data.height || 1;
  const xScale = d3.scaleLinear()
    .domain([0, maxHeight])
    .range([WIDTH - MARGIN.left - MARGIN.right, 0]);
  root.each((d) => { d._origY = d.y; d.y = xScale(d.data.height || 0); });

  // Links — use orthogonal (elbow) paths
  g.append('g')
    .attr('class', 'links')
    .selectAll('path')
    .data(root.links())
    .enter().append('path')
    .attr('class', 'link')
    .attr('d', (d) => {
      return `M${d.source.y},${d.source.x}` +
             `H${d.target.y}` +
             `V${d.target.x}`;
    });

  // Nodes
  const profiles = bundle.profiles;
  const nodes = g.append('g')
    .attr('class', 'nodes')
    .selectAll('g')
    .data(root.descendants())
    .enter().append('g')
    .attr('class', 'node')
    .attr('transform', (d) => `translate(${d.y},${d.x})`);

  nodes.filter((d) => !d.data.leaf)
    .append('circle')
    .attr('r', 2)
    .attr('fill', '#3a4a6a');

  const leafNodes = nodes.filter((d) => d.data.leaf);

  leafNodes.append('circle')
    .attr('r', 4)
    .attr('fill', (d) => {
      const prof = profiles[d.data.name];
      if (!prof) return '#6b7f99';
      return toneColors[Math.min(prof.tone_count, toneColors.length - 1)];
    })
    .on('click', (_, d) => onLeafClick && onLeafClick(d.data.name));

  leafNodes.append('text')
    .attr('dx', 8)
    .attr('dy', 3)
    .text((d) => {
      const prof = profiles[d.data.name];
      const syll = prof?.syllable_structure ?? '?';
      return `${d.data.name}  ${syll}`;
    })
    .on('click', (_, d) => onLeafClick && onLeafClick(d.data.name));

  // Caption
  svg.append('text')
    .attr('x', MARGIN.left)
    .attr('y', 20)
    .attr('fill', '#8ad9ff')
    .attr('font-size', 14)
    .text(`語言家譜樹 — Ward linkage,Euclidean distance on 5-D 音系特徵  (${leaves} leaves)`);

  svg.append('text')
    .attr('x', MARGIN.left)
    .attr('y', 36)
    .attr('fill', '#6b7f99')
    .attr('font-size', 12)
    .text('左側=較遠古共同祖先 · 右側=葉節點(實際語言) · 顏色=聲調數 · 點擊可回跳 3D 星圖');
}
