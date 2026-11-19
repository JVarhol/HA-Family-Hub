/**
 * Family Hub dashboard ribbon. UI-only: no HA service calls.
 * Emits "family-hub-ribbon-change" with {pinned, expanded, tab}.
 */
const STORAGE_KEY = "family-hub.dashboard.ribbon.v1";

export class FamilyHubRibbon extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._state = { pinned: false, expanded: false, tab: "widgets" };
    this._onClick = this._onClick.bind(this);
  }

  connectedCallback() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      this._state.pinned = saved.pinned === true;
      this._state.expanded = saved.expanded === true;
    } catch (_) {
      // Storage can be unavailable in kiosk or private browsing.
    }
    this.shadowRoot.addEventListener("click", this._onClick);
    this.render();
  }

  disconnectedCallback() {
    this.shadowRoot.removeEventListener("click", this._onClick);
  }

  get state() {
    return { ...this._state };
  }

  _onClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const { action, tab } = button.dataset;
    if (action === "pin") {
      this._state.pinned = !this._state.pinned;
      if (this._state.pinned) this._state.expanded = true;
    } else if (action === "toggle") {
      this._state.expanded = !this._state.expanded;
      if (!this._state.expanded) this._state.pinned = false;
    } else if (action === "tab" && ["widgets", "layout"].includes(tab)) {
      this._state.tab = tab;
      this._state.expanded = true;
    } else {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        pinned: this._state.pinned,
        expanded: this._state.expanded
      }));
    } catch (_) {
      // Persistence is best-effort.
    }
    this.render();
    this.dispatchEvent(new CustomEvent("family-hub-ribbon-change", {
      detail: this.state, bubbles: true, composed: true
    }));
  }

  render() {
    const { pinned, expanded, tab } = this._state;
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; font:inherit; color:var(--primary-text-color, #222); }
        .ribbon { background:var(--card-background-color, #fff);
          border:1px solid var(--divider-color, #ddd); border-radius:12px; overflow:hidden; }
        .toolbar { display:flex; align-items:center; gap:8px; padding:8px; flex-wrap:wrap; }
        .title { font-weight:650; margin-right:auto; padding:0 8px; }
        button { font:inherit; cursor:pointer; min-height:44px; min-width:44px;
          border:0; border-radius:8px; padding:8px 12px;
          background:transparent; color:inherit; }
        button:hover, button:focus-visible { background:var(--secondary-background-color, #eee); }
        button[aria-pressed="true"] { background:var(--secondary-background-color, #eee); font-weight:650; }
        .icon-button { display:inline-flex; align-items:center; justify-content:center; padding:8px; }
        .icon-button svg { width:19px; height:19px; fill:none; stroke:currentColor; stroke-width:1.9; stroke-linecap:round; stroke-linejoin:round; pointer-events:none; }
        .icon-button[aria-pressed="true"] { background:var(--secondary-background-color, #eee); }
        .panel { padding:12px 16px; border-top:1px solid var(--divider-color, #ddd); }
        .hint { opacity:.7; font-size:.9em; }
      </style>
      <section class="ribbon" aria-label="Family Hub command ribbon">
        <div class="toolbar">
          <span class="title">Family Hub</span>
          <button data-action="tab" data-tab="widgets" aria-pressed="${tab === "widgets"}">Widgets</button>
          <button data-action="tab" data-tab="layout" aria-pressed="${tab === "layout"}">Layout</button>
          <button class="icon-button" data-action="pin" aria-pressed="${pinned}" aria-label="${pinned ? "Unpin ribbon" : "Pin ribbon"}" title="${pinned ? "Unpin ribbon" : "Pin ribbon"}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 3H8l1.5 5L6 11v2h5v8l2-8h5v-2l-3.5-3L16 3Z" fill="${pinned ? "currentColor" : "none"}"/></svg></button>
          <button class="icon-button" data-action="toggle" aria-expanded="${expanded}" aria-label="${expanded ? "Collapse ribbon" : "Expand ribbon"}" title="${expanded ? "Collapse ribbon" : "Expand ribbon"}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${expanded ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"}"/></svg></button>
        </div>
        ${expanded ? `<div class="panel" role="region" aria-label="${tab} settings">
          <span class="hint">${tab === "widgets"
            ? "Widget picker will connect here."
            : "Layout presets will connect here."}</span>
        </div>` : ""}
      </section>`;
  }
}

if (!customElements.get("family-hub-ribbon")) {
  customElements.define("family-hub-ribbon", FamilyHubRibbon);
}
