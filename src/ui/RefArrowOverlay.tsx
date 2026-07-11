// SVG overlay drawing the arrow from a hovered reference slot to its
// pointee. Geometry is measured from the rendered slot rows (found by
// their data-slot-addr attribute) so the arrow tracks both detail modes;
// a dangling reference aims at the ghost target the stack pane renders
// in its place. The measurement writes SVG attributes directly in a
// layout effect: the ghost target mounts in the same commit as the
// hover, so it is only findable after the DOM has been updated.

import { useLayoutEffect, useRef } from 'react';
import type { RefHover } from './hover';

interface RefArrowOverlayProps {
  /** The scrolling stack body the overlay is positioned inside. */
  container: HTMLElement | null;
  refHover: RefHover | null;
}

function anchor(
  element: Element,
  containerRect: DOMRect,
  container: HTMLElement,
) {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left - containerRect.left + container.scrollLeft + 2,
    y: rect.top - containerRect.top + container.scrollTop + rect.height / 2,
  };
}

function draw(
  svg: SVGSVGElement,
  container: HTMLElement,
  refHover: RefHover,
): void {
  const source = container.querySelector(
    `[data-slot-addr="${refHover.fromAddress}"]`,
  );
  const target = refHover.dangling
    ? container.querySelector('[data-ghost-target]')
    : container.querySelector(`[data-slot-addr="${refHover.toAddress}"]`);
  if (!source || !target) {
    svg.style.display = 'none';
    return;
  }
  const containerRect = container.getBoundingClientRect();
  const from = anchor(source, containerRect, container);
  const to = anchor(target, containerRect, container);
  const bend = Math.max(2, Math.min(from.x, to.x) - 26);

  svg.style.display = '';
  svg.setAttribute('width', String(container.clientWidth));
  svg.setAttribute('height', String(container.scrollHeight));
  svg
    .querySelector('.ref-arrow')!
    .setAttribute(
      'd',
      `M ${from.x} ${from.y} C ${bend} ${from.y}, ${bend} ${to.y}, ${to.x} ${to.y}`,
    );
  const origin = svg.querySelector('.ref-arrow-origin')!;
  origin.setAttribute('cx', String(from.x));
  origin.setAttribute('cy', String(from.y));
}

export function RefArrowOverlay({ container, refHover }: RefArrowOverlayProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg || !container || !refHover) return;
    const update = () => draw(svg, container, refHover);
    update();
    container.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      container.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [container, refHover]);

  if (!refHover) return null;

  const tone = refHover.dangling ? 'dangling' : 'live';

  return (
    <svg
      ref={svgRef}
      className="ref-arrow-overlay"
      style={{ display: 'none' }}
      aria-hidden="true"
      data-testid="ref-arrow"
    >
      <defs>
        <marker
          id={`ref-arrow-head-${tone}`}
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
        >
          <path d="M 0 0 L 8 4 L 0 8 z" className={`ref-arrow-head-${tone}`} />
        </marker>
      </defs>
      <path
        className={`ref-arrow ref-arrow-${tone}`}
        markerEnd={`url(#ref-arrow-head-${tone})`}
      />
      <circle className={`ref-arrow-origin ref-arrow-${tone}`} r={3} />
    </svg>
  );
}
