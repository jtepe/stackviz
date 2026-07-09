/**
 * Left panel: the source editor. A placeholder for now — CodeMirror 6 and the
 * language integration land in a later issue (DESIGN.md §6.2).
 */
export function EditorPane() {
  return (
    <section className="pane editor-pane" aria-label="Editor">
      <div className="pane-header">editor</div>
      <div className="pane-body pane-placeholder">
        Editor goes here (CodeMirror 6)
      </div>
    </section>
  );
}
