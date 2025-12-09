
(async function(){

  // Load data (relative path)
  const data = await fetch('data/authors.json').then(r => r.json());

  // If data already has nodes/links use them, otherwise attempt to create links by co-affiliation or co-authorship
  let nodes = data.nodes || data.authors || data;
  let links = data.links || data.edges || [];

  // If links missing, create simple links by shared papers or affiliations if available
  if (!links || links.length === 0) {
    // try to create links by shared 'coauthors' field or 'affiliation'
    const idIndex = new Map(nodes.map((d,i) => [d.id || d.name || i, d]));
    // create small rule: connect nodes that share affiliation or coauthors array
    const tmpLinks = [];
    for (let i=0;i<nodes.length;i++){
      for (let j=i+1;j<nodes.length;j++){
        const a = nodes[i], b = nodes[j];
        let score = 0;
        if (a.affiliation && b.affiliation && a.affiliation === b.affiliation) score += 1;
        if (a.coauthors && Array.isArray(a.coauthors) && a.coauthors.includes(b.id)) score += 1;
        if (b.coauthors && Array.isArray(b.coauthors) && b.coauthors.includes(a.id)) score += 1;
        if (score>0) tmpLinks.push({source: a.id || i, target: b.id || j, value: score});
      }
    }
    links = tmpLinks;
  }

  // Basic dimensions
  const svg = d3.select('#canvas');
  const container = svg.node().parentNode;
  const width = Math.max(600, container.clientWidth - 40);
  const height = 720;
  svg.attr('viewBox', [0,0,width,height]).attr('preserveAspectRatio','xMidYMid meet');

  // color scale by affiliation
  const affiliations = Array.from(new Set(nodes.map(d=>d.affiliation || 'Unknown'))).slice(0,20);
  const color = d3.scaleOrdinal(d3.schemeTableau10).domain(affiliations);

  // map id to node object (force needs object refs)
  const nodeById = new Map();
  nodes.forEach(n => {
    n.id = n.id ?? n.name ?? (Math.random().toString(36).slice(2,9));
    nodeById.set(n.id, n);
  });
  links.forEach(l => {
    l.source = nodeById.get(l.source) || l.source;
    l.target = nodeById.get(l.target) || l.target;
  });

  // Tooltip
  const tooltip = d3.select('#tooltip');

  // Create links and nodes groups
  svg.selectAll('*').remove(); // clear
  const gLinks = svg.append('g').attr('class','links');
  const gNodes = svg.append('g').attr('class','nodes');

  // default params
  let params = {
    charge: -120,
    collide: 8,
    linkStrength: 0.7
  };

  // create simulation
  const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d=>d.id).strength(params.linkStrength).distance(60))
    .force('charge', d3.forceManyBody().strength(params.charge))
    .force('center', d3.forceCenter(width/2, height/2))
    .force('collide', d3.forceCollide().radius(d => (d.radius || 6) + params.collide));

  // render links
  const link = gLinks.selectAll('line')
    .data(links, d => (d.source.id || d.source) + '--' + (d.target.id || d.target))
    .join('line')
      .attr('stroke', '#9fb0bf')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', d => Math.max(1, (d.value||1)));

  // render nodes
  const node = gNodes.selectAll('g.node')
    .data(nodes, d=>d.id)
    .join(enter => {
      const g = enter.append('g').attr('class','node').call(drag(simulation));
      g.append('circle').attr('r', d => d.radius || 6).attr('fill', d => color(d.affiliation || 'Unknown')).attr('stroke', '#fff').attr('stroke-width',1.15);
      g.append('title').text(d => d.name || d.id);
      g.append('text').attr('x',10).attr('y',4).text(d=>d.name?d.name.split(' ')[0]:'').attr('font-size',11).attr('fill','#2d3b45').style('pointer-events','none');
      return g;
    });

  // hover to highlight same affiliation
  node.on('mouseover', function(event, d){
    // bring to front
    d3.select(this).raise();
    const aff = d.affiliation || 'Unknown';
    node.select('circle').attr('opacity', n => (n.affiliation===aff ? 1 : 0.15));
    link.attr('stroke-opacity', l => (l.source.affiliation===aff || l.target.affiliation===aff ? 0.9 : 0.05));
  }).on('mouseout', function(){
    node.select('circle').attr('opacity', 1);
    link.attr('stroke-opacity', 0.6);
  }).on('click', function(event,d){
    // show tooltip near mouse
    const html = `<div style="font-weight:700;margin-bottom:6px;">${d.name||d.id}</div>
                  <div style="font-size:13px;">Affiliation: ${d.affiliation||'Unknown'}</div>
                  ${d.title?`<div style="font-size:13px;">Title: ${d.title}</div>`:''}`;
    tooltip.html(html).style('display','block');
    const [mx,my] = d3.pointer(event);
    tooltip.style('left', (mx + 18)+'px').style('top', (my + 18)+'px');
  });

  // hide tooltip on background click
  svg.on('click', () => tooltip.style('display','none'));

  // tick handler
  simulation.on('tick', () => {
    link.attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

    node.attr('transform', d => `translate(${d.x},${d.y})`);
  });

  // controls bindings
  function updateParams(){
    // update simulation forces based on inputs
    const c = +document.getElementById('charge').value;
    const coll = +document.getElementById('collide').value;
    const ls = +document.getElementById('link').value;
    params.charge = c;
    params.collide = coll;
    params.linkStrength = ls;

    document.getElementById('chargeVal').textContent = c;
    document.getElementById('collideVal').textContent = coll;
    document.getElementById('linkVal').textContent = ls.toFixed(2);

    simulation.force('charge').strength(c);
    simulation.force('collide').radius(d => (d.radius || 6) + coll);
    simulation.force('link').strength(ls);
    simulation.alpha(0.7).restart();
  }

  document.getElementById('charge').addEventListener('input', updateParams);
  document.getElementById('collide').addEventListener('input', updateParams);
  document.getElementById('link').addEventListener('input', updateParams);

  document.getElementById('resetBtn').addEventListener('click', () => {
    // reset to defaults and restart
    document.getElementById('charge').value = -120;
    document.getElementById('collide').value = 8;
    document.getElementById('link').value = 0.7;
    updateParams();
    simulation.nodes(nodes);
    simulation.alpha(1).restart();
  });

  // legend
  const legend = d3.select('#legend');
  const uniqAff = Array.from(new Set(nodes.map(d=>d.affiliation||'Unknown')));
  uniqAff.forEach(a => {
    const item = legend.append('div').attr('class','legend-item');
    item.append('div').style('width','14px').style('height','14px').style('border-radius','3px').style('background', color(a)).style('box-shadow','0 1px 2px rgba(0,0,0,0.08)');
    item.append('div').text(a);
  });

  // drag behavior
  function drag(simulation){
    function started(event,d){
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x; d.fy = d.y;
    }
    function dragged(event,d){
      d.fx = event.x; d.fy = event.y;
    }
    function ended(event,d){
      if (!event.active) simulation.alphaTarget(0);
      // comment out to make nodes fixed after drag? we release them:
      d.fx = null; d.fy = null;
    }
    return d3.drag().on('start', started).on('drag', dragged).on('end', ended);
  }

  // make visualization responsive on resize
  window.addEventListener('resize', () => {
    const w = Math.max(600, container.clientWidth - 40);
    svg.attr('viewBox', [0,0,w,height]);
    simulation.force('center', d3.forceCenter(w/2, height/2));
    simulation.alpha(0.3).restart();
  });

})();