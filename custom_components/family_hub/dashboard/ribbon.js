/**
 * Family Hub everyday ribbon. Configuration is managed by the host dashboard,
 * never by this component. No Home Assistant service calls or external requests.
 *
 * Set ribbon.widgets to an array of {id, label, icon, visible}.
 * Emits family-hub-widget-toggle {id, visible} and
 * family-hub-ribbon-change {pinned, expanded}.
 */
const STORAGE_KEY = "family-hub.dashboard.ribbon.v2";
const ICONS = {
  weather: '<circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5 13 13"/><path d="M13 19h7a3 3 0 0 0-.7-5.9 5 5 0 0 0-9.5 1.5A2.5 2.5 0 0 0 13 19Z"/>',
  light: '<path d="M9 18h6m-5 3h4M9 14a6 6 0 1 1 6 0l-1 3h-4l-1-3Z"/>',
  climate: '<path d="M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0Z"/><path d="M12 10v7"/>',
  garage: '<path d="m3 10 9-7 9 7v11H3V10Z"/><path d="M7 21v-9h10v9M7 15h10M7 18h10"/>',
  sensor: '<path d="M3 17 8 12l4 4 8-9"/><path d="M17 7h3v3"/>',
  generic: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  pin: '<path d="M16 3H8l1.5 5L6 11v2h5v8l2-8h5v-2l-3.5-3L16 3Z"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>'
};
const svg = (icon, filled = false) =>
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="' + (filled ? 'currentColor' : 'none') +
  '" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
  (ICONS[icon] || ICONS.generic) + '</svg>';
const escapeHtml = value => String(value).replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export class FamilyHubRibbon extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: "open"});
    this._state = {pinned: false, expanded: true};
    this._widgets = [];
    this._onClick = this._onClick.bind(this);
  }
  connectedCallback() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      this._state.pinned = saved.pinned === true;
      this._state.expanded = saved.expanded !== false;
    } catch (_) { /* Optional browser persistence. */ }
    this.shadowRoot.addEventListener("click", this._onClick);
    this.render();
  }
  disconnectedCallback() {
    this.shadowRoot.removeEventListener("click", this._onClick);
  }
  set widgets(value) {
    this._widgets = Array.isArray(value) ? value.map(w => ({...w})) : [];
    this.render();
  }
  get widgets() { return this._widgets.map(w => ({...w})); }
  get state() { return {...this._state}; }
  _onClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "widget") {
      const widget = this._widgets.find(w => w.id === button.dataset.id);
      if (!widget) return;
      this.dispatchEvent(new CustomEvent("family-hub-widget-toggle", {
        detail: {id: widget.id, visible: !widget.visible}, bubbles: true, composed: true
      }));
      return;
    }
    if (action === "pin") {
      this._state.pinned = !this._state.pinned;
      if (this._state.pinned) this._state.expanded = true;
    } else if (action === "toggle") {
      this._state.expanded = !this._state.expanded;
      if (!this._state.expanded) this._state.pinned = false;
    } else return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this._state)); }
    catch (_) { /* Storage is best effort. */ }
    this.render();
    this.dispatchEvent(new CustomEvent("family-hub-ribbon-change", {
      detail: this.state, bubbles: true, composed: true
    }));
  }
  render() {
    const {pinned, expanded} = this._state;
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block;font:inherit;color:var(--primary-text-color,#223047)}
        .ribbon{background:var(--card-background-color,#fff);border:1px solid var(--divider-color,#ddd);border-radius:12px;overflow:hidden}
        .bar{display:flex;align-items:center;gap:8px;padding:8px 12px}
        .title{font-weight:650;margin-right:auto}
        button{font:inherit;cursor:pointer;border:0;border-radius:9px;color:inherit;background:transparent;min-width:44px;min-height:44px;padding:8px}
        button:hover,button:focus-visible{background:var(--secondary-background-color,#eef2f7)}
        button[aria-pressed=true]{background:var(--secondary-background-color,#e4ebf6)}
        svg{width:20px;height:20px;pointer-events:none}
        .controls{display:flex;gap:8px;flex-wrap:wrap;padding:10px 12px;border-top:1px solid var(--divider-color,#ddd)}
        .widget{display:flex;align-items:center;gap:8px;padding:8px 13px}
        .widget[aria-pressed=true]{outline:1px solid var(--primary-color,#507cb5)}
        .empty{opacity:.65;font-size:.9em;padding:10px}
      </style>
      <section class="ribbon" aria-label="Family Hub quick controls">
        <div class="bar"><span class="title">Quick view</span>
          <button data-action="pin" aria-pressed="${pinned}" aria-label="${pinned?'Unpin':'Pin'} ribbon" title="${pinned?'Unpin':'Pin'} ribbon">${svg('pin',pinned)}</button>
          <button data-action="toggle" aria-expanded="${expanded}" aria-label="${expanded?'Collapse':'Expand'} ribbon" title="${expanded?'Collapse':'Expand'} ribbon">${svg(expanded?'up':'down')}</button>
        </div>
        ${expanded ? '<div class="controls" aria-label="Show or hide configured widgets">' +
          (this._widgets.length ? this._widgets.map(w =>
            '<button class="widget" data-action="widget" data-id="' + escapeHtml(w.id) +
            '" aria-pressed="' + Boolean(w.visible) + '" title="' + escapeHtml((w.visible?'Hide ':'Show ') + w.label) + '">' +
            svg(w.icon) + '<span>' + escapeHtml(w.label) + '</span></button>'
          ).join('') : '<span class="empty">No widgets configured yet.</span>') + '</div>' : ''}
      </section>`;
  }
}
if (!customElements.get("family-hub-ribbon")) customElements.define("family-hub-ribbon", FamilyHubRibbon);
