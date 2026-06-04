// @ts-nocheck
'use client';

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as d3 from 'd3';
import type { Session, TreeNode } from '@/lib/types';
import { buildSessionTree } from '@/lib/patterns/SessionFactory';
import { nodeLabel } from '@/lib/patterns/sessionPresentation';

interface SessionTopologyProps {
  sessions: Session[];
  filter: string;
  onNodeClick: (sessionId: string) => void;
  emptyMessage?: string;
}

export interface SessionTopologyHandle {
  resetView: () => void;
}

function formatCost(value: number | null | undefined): string {
  return `$${Number(value ?? 0).toFixed(4)}`;
}

function draw(
  svgEl: SVGSVGElement,
  tooltipEl: HTMLDivElement | null,
  width: number,
  height: number,
  treeData: TreeNode,
  isTouch: boolean,
  onNodeClick: (id: string) => void,
  registerReset: (reset: () => void) => void,
  autoReset: boolean,
) {
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();
  svg.attr('viewBox', `0 0 ${width} ${height}`);

  const g = svg.append('g');
  const content = g.append('g').attr('transform', 'translate(40,20)');

  const zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.2, 5])
    .on('zoom', (event) => g.attr('transform', event.transform));
  svg.call(zoom).on('dblclick.zoom', null);

  const root = d3.hierarchy<TreeNode>(treeData);
  const treeLayout = d3.tree<TreeNode>().size([height - 40, width - 120]);
  treeLayout(root);

  const linkGen = d3
    .linkHorizontal<d3.HierarchyPointLink<TreeNode>, d3.HierarchyPointNode<TreeNode>>()
    .x((d) => d.y)
    .y((d) => d.x);

  content
    .selectAll('.link')
    .data(root.links().filter((l) => !l.source.data._virtualRoot))
    .join('path')
    .attr('class', 'link')
    .attr('d', linkGen as any)
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

  const node = content
    .selectAll<SVGGElement, d3.HierarchyPointNode<TreeNode>>('.node')
    .data(root.descendants().filter((d) => !d.data._virtualRoot))
    .join('g')
    .attr('class', (d) => `node ${d.data.status ?? 'idle'}`)
    .attr('transform', (d) => `translate(${d.y},${d.x})`)
    .on('mousemove', (event: MouseEvent, d) => {
      if (isTouch || !tooltipEl) return;
      tooltipEl.style.display = 'block';
      const tx = event.clientX + 18;
      const ty = event.clientY + 18;
      // Keep tooltip inside viewport
      const tw = tooltipEl.offsetWidth || 200;
      const th = tooltipEl.offsetHeight || 80;
      tooltipEl.style.left = `${Math.min(tx, window.innerWidth - tw - 8)}px`;
      tooltipEl.style.top = `${Math.min(ty, window.innerHeight - th - 8)}px`;
      tooltipEl.innerHTML = [
        `<div><strong>${nodeLabel(d.data)}</strong></div>`,
        `<div>modello: ${d.data.model ?? '-'}</div>`,
        `<div>costo: ${formatCost(d.data.cost_usd)}</div>`,
        `<div>stato: ${d.data.status ?? 'idle'}</div>`,
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

  node.append('circle').attr('r', 8);

  node
    .append('text')
    .text((d) => nodeLabel(d.data))
    .attr('dy', 22)
    .attr('text-anchor', 'middle')
    .style('font-size', '10px')
    .style('fill', '#d6e2e8');

  node
    .filter((d) => Number(d.data.cost_usd ?? 0) > 0)
    .append('text')
    .text((d) => formatCost(d.data.cost_usd))
    .attr('dy', 34)
    .attr('text-anchor', 'middle')
    .style('font-size', '10px')
    .style('fill', '#89a1ad');

  const resetView = () => {
    const contentNode = content.node();
    if (!contentNode) return;

    const bbox = contentNode.getBBox();
    if (!bbox.width || !bbox.height) {
      svg.transition().duration(250).call(zoom.transform, d3.zoomIdentity.translate(40, 20));
      return;
    }

    const padX = isTouch ? 24 : 48;
    const padY = isTouch ? 24 : 36;
    const scale = Math.max(
      0.2,
      Math.min(
        1.5,
        (width - padX * 2) / bbox.width,
        (height - padY * 2) / bbox.height,
      ),
    );
    const tx = width / 2 - (bbox.x + bbox.width / 2) * scale;
    const ty = height / 2 - (bbox.y + bbox.height / 2) * scale;

    svg
      .transition()
      .duration(250)
      .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  };

  registerReset(resetView);
  if (autoReset) requestAnimationFrame(resetView);
}

const SessionTopology = forwardRef<SessionTopologyHandle, SessionTopologyProps>(function SessionTopology(
  { sessions, filter, onNodeClick, emptyMessage = 'No sessions visible' },
  ref,
) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const resetRef = useRef<() => void>(() => {});
  const prevTopologyRef = useRef<string>('');
  const [isTouch, setIsTouch] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const treeData = useMemo(() => buildSessionTree(sessions, filter), [sessions, filter]);
  const hasVisibleNodes = useMemo(() => (treeData.children ?? []).some((node) => node._agentNode ? (node.children?.length ?? 0) > 0 : true), [treeData]);

  useImperativeHandle(ref, () => ({
    resetView: () => resetRef.current(),
  }), []);

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
    if (!hasVisibleNodes) {
      resetRef.current = () => {};
    }
  }, [hasVisibleNodes]);

  useEffect(() => {
    const svgEl = svgRef.current;
    const tooltipEl = tooltipRef.current;
    if (!svgEl || !hasVisibleNodes) return;

    // Topology fingerprint: node ids + parent links. Position/layout only changes when topology changes.
    const topologyKey = JSON.stringify(
      (treeData.children ?? []).flatMap((n) =>
        [n.session_id, ...(n.children ?? []).map((c) => c.session_id)]
      )
    );
    const topologyChanged = topologyKey !== prevTopologyRef.current;
    prevTopologyRef.current = topologyKey;

    const render = (autoReset: boolean) => {
      const width = svgEl.clientWidth || 900;
      const height = svgEl.clientHeight || 480;
      draw(svgEl, tooltipEl, width, height, treeData, isTouch, onNodeClick, (reset) => {
        resetRef.current = reset;
      }, autoReset);
    };

    render(topologyChanged);
    const ro = new ResizeObserver(() => render(false));
    ro.observe(svgEl);
    return () => ro.disconnect();
  }, [hasVisibleNodes, isTouch, treeData, onNodeClick]);

  return (
    <>
      <div className="graph-shell">
        {hasVisibleNodes ? (
          <svg ref={svgRef} id="graph-svg" />
        ) : (
          <div className="empty-state">
            <span className="empty-state-icon">◎</span>
            <span className="empty-state-msg">{emptyMessage}</span>
          </div>
        )}
      </div>
      {mounted && createPortal(
        <div ref={tooltipRef} className="graph-tooltip" />,
        document.body
      )}
    </>
  );
});

export default SessionTopology;
