'use client';
// Converted SessionTopology.jsx → .tsx; uses buildSessionTree from SessionFactory

import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { Session, TreeNode } from '@/lib/types';
import { buildSessionTree, nodeLabel } from '@/lib/patterns/SessionFactory';

interface SessionTopologyProps {
  sessions: Session[];
  filter: string;
  onNodeClick: (sessionId: string) => void;
}

function formatCost(value: number | null | undefined): string {
  return `$${Number(value ?? 0).toFixed(4)}`;
}

export default function SessionTopology({ sessions, filter, onNodeClick }: SessionTopologyProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [isTouch, setIsTouch] = useState(false);

  const treeData = useMemo(() => buildSessionTree(sessions, filter), [sessions, filter]);

  useEffect(() => {
    const check = () => {
      const coarse = window.matchMedia?.('(pointer: coarse)')?.matches;
      setIsTouch(Boolean(coarse || window.innerWidth < 768));
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    const svgEl = svgRef.current;
    const tooltipEl = tooltipRef.current;
    if (!svgEl) return;

    const width = svgEl.clientWidth || 900;
    const height = svgEl.clientHeight || 480;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const g = svg.append('g').attr('transform', 'translate(40,20)');

    const root = d3.hierarchy<TreeNode>(treeData);
    const treeLayout = d3.tree<TreeNode>().size([height - 40, width - 120]);
    treeLayout(root);

    const linkGen = d3
      .linkHorizontal<d3.HierarchyPointLink<TreeNode>, d3.HierarchyPointNode<TreeNode>>()
      .x((d) => d.y)
      .y((d) => d.x);

    g.selectAll('.link')
      .data(root.links())
      .join('path')
      .attr('class', 'link')
      .attr('d', linkGen)
      .attr('fill', 'none');

    let lastActivation = { id: '', ts: 0 };
    const activateNode = (d: d3.HierarchyPointNode<TreeNode>) => {
      const id = d.data.session_id;
      if (!id || d.data._virtualRoot || d.data._agentNode) return;
      const now = Date.now();
      if (lastActivation.id === id && now - lastActivation.ts < 250) return;
      lastActivation = { id, ts: now };
      onNodeClick(id);
    };

    const node = g
      .selectAll<SVGGElement, d3.HierarchyPointNode<TreeNode>>('.node')
      .data(root.descendants())
      .join('g')
      .attr('class', (d) => `node ${d.data._virtualRoot ? 'idle' : (d.data.status ?? 'idle')}`)
      .attr('transform', (d) => `translate(${d.y},${d.x})`)
      .on('mousemove', (event: MouseEvent, d) => {
        if (isTouch || !tooltipEl) return;
        tooltipEl.style.display = 'block';
        tooltipEl.style.left = `${event.offsetX + 18}px`;
        tooltipEl.style.top = `${event.offsetY + 18}px`;
        tooltipEl.innerHTML = [
          `<div><strong>${nodeLabel(d.data)}</strong></div>`,
          `<div>model: ${d.data.model ?? '-'}</div>`,
          `<div>cost: ${formatCost(d.data.cost_usd)}</div>`,
          `<div>status: ${d.data.status ?? 'idle'}</div>`,
        ].join('');
      })
      .on('mouseleave', () => {
        if (tooltipEl) tooltipEl.style.display = 'none';
      })
      .on('pointerup', (_: PointerEvent, d) => activateNode(d))
      .on('click', (_: MouseEvent, d) => activateNode(d));

    node
      .filter((d) => d.data.status === 'working' || d.data.status === 'active')
      .append('circle')
      .attr('class', 'pulse-ring')
      .attr('r', 10);

    node.append('circle').attr('r', (d) => (d.data._virtualRoot ? 11 : 8));

    node
      .append('text')
      .text((d) => nodeLabel(d.data))
      .attr('dy', 22)
      .attr('text-anchor', 'middle')
      .style('font-size', '10px')
      .style('fill', '#d6e2e8');

    node
      .filter((d) => !d.data._virtualRoot && Number(d.data.cost_usd ?? 0) > 0)
      .append('text')
      .text((d) => formatCost(d.data.cost_usd))
      .attr('dy', 34)
      .attr('text-anchor', 'middle')
      .style('font-size', '10px')
      .style('fill', '#89a1ad');
  }, [isTouch, treeData, onNodeClick]);

  return (
    <div className="graph-shell">
      <svg
        ref={svgRef}
        id="graph-svg"
        style={{ width: '100%', height: isTouch ? '380px' : '460px' }}
      />
      <div ref={tooltipRef} className="graph-tooltip" />
    </div>
  );
}
