// Small helper for defining Web Components once, useful during hot reload or repeated script execution.
export function defineComponent(name, componentClass) {
  if (!customElements.get(name)) {
    customElements.define(name, componentClass);
  }
}

// Escapes text inserted into templates where the source is data, not hand-written markup.
export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
