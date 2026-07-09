/** Recursively remove `span` properties so ASTs can be compared structurally. */
export function stripSpans(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripSpans);
  if (node !== null && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (key !== 'span') out[key] = stripSpans(value);
    }
    return out;
  }
  return node;
}
