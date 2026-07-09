/**
 * Right panel: the call-stack visualization. A placeholder for now — the
 * toolbar, status badge, and frame rendering land in later issues
 * (DESIGN.md §6.1).
 */
export function StackPane() {
  return (
    <section className="pane stack-pane" aria-label="Stack">
      <div className="pane-header">stack</div>
      <div className="pane-body pane-placeholder">
        Call stack visualization goes here
      </div>
    </section>
  );
}
