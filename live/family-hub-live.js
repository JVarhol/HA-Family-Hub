const CARD = 'family-hub-live';
const MAX_ITEMS = 4;
const ACTIONS = {
  light: 'toggle', switch: 'toggle', input_boolean: 'toggle',
  script: 'turn_on', button: 'press', input_button: 'press', cover: 'open_cover'
};
const domainOf = id => typeof id === 'string' ? id.split('.')[0] : '';
const escapeText = value => String(value ?? '').replace(/[&<>"']/g, character =>
  ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[character]);
const addDays = (date, count) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + count);
const endpoint = value => value.dateTime ? new Date(value.dateTime) : new Date(value.date + 'T00:00:00');
const clock = new Intl.DateTimeFormat(undefined, {hour:'numeric', minute:'2-digit'});
const when = (start, end, date, allDay) => {
  if (allDay) return 'All day';
  const onDay = t => t.toDateString() === date.toDateString();
  return onDay(start) && onDay(end) ? clock.format(start) + ' – ' + clock.format(end)
    : [start, end].map(t => t.toLocaleString(undefined, {month:'short', day:'numeric', hour:'numeric', minute:'2-digit'})).join(' – ');
};

const markup = `<style>
:host{font-family:system-ui,sans-serif;color:#223047;background:#f1f4f8}
*{box-sizing:border-box}main{max-width:1500px;margin:auto;padding:20px}
header{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
small,.muted{color:#627083}.notice{padding:10px 14px;background:#e6f3ff;border-radius:9px;margin:14px 0}
.layout{display:grid;gap:14px;margin-top:16px}
.quick-actions{background:white;border:1px solid #dce2e9;border-radius:12px}
.quick-actions.pinned{position:sticky;top:var(--header-height,56px);z-index:2}
.quick-header{display:flex;align-items:center;gap:8px;padding:0 10px}
.quick-header button{min-height:44px;border:0;background:transparent;color:inherit}
#quick-toggle{flex:1;text-align:left;font-weight:600}
#quick-pin[aria-pressed="true"]{background:#dceafb}
.action-grid,.widget-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,175px),1fr));gap:12px}
.action-grid{padding:12px;border-top:1px solid #dce2e9}
.quick-control{display:flex;align-items:center;gap:10px;min-height:64px;padding:10px;border:1px solid #cbd5e1;border-radius:9px;background:#f4f7fb;text-align:left;color:inherit}
.quick-control[aria-pressed="true"]{background:#fff1bf}
.quick-control small,.device strong{display:block}
.toolbar-top{display:flex;align-items:center;justify-content:flex-end;margin:14px 0 8px}
.settings-button,.action-button{border:1px solid #cbd5e1;border-radius:9px;background:white;padding:10px 14px;min-height:44px}
.settings-button{display:flex;align-items:center;gap:8px}
.settings{background:white;border:1px solid #cbd5e1;border-radius:12px;padding:18px;margin:12px 0}
.settings[hidden],.device[hidden],.side[hidden],.action-grid[hidden],.quick-control[hidden]{display:none!important}
.settings-head{display:flex;align-items:center;justify-content:space-between}
.settings-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
.settings fieldset{border:1px solid #dbe2ea;border-radius:9px;padding:14px}
.settings label{display:flex;align-items:center;gap:8px;margin:10px 0}
.settings select{max-width:100%;padding:8px;border-radius:6px}
.settings .helper{font-size:.85rem;color:#627083}

.calendar,.side{background:white;border-radius:12px;padding:16px;box-shadow:0 1px 4px #0001}
.days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:7px}
.day{border:1px solid #dce2e9;border-radius:9px;min-height:180px;padding:8px;overflow-wrap:anywhere}
.day,.month-day{box-shadow:0 2px 4px #22304714,0 1px 1px #2230470a}
.day-heading{display:block;width:100%;min-height:44px;margin-bottom:4px;border:0;border-radius:6px;background:transparent;color:inherit;font-weight:700;text-align:center}
.day-heading:hover,.day-heading:focus-visible{background:#eaf1fa}
#week-day-details{width:min(540px,calc(100% - 32px));max-height:calc(100dvh - 32px);overflow-y:auto;overscroll-behavior:contain}
.day-body{display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px;align-items:start}
.events{text-align:left}
.events .event{padding-inline:4px}
.day-body.events-only{grid-template-columns:minmax(0,1fr)}
.weather{display:grid;justify-items:center;gap:3px;font-size:.75rem;font-variant-numeric:tabular-nums}
.weather-button{border:0;background:transparent;padding:0;width:44px;height:44px;font-size:1.25rem}
.range{position:relative;width:5px;height:42px;border-radius:4px;background:linear-gradient(#fb9958,#79b7ee)}
.current{position:absolute;top:var(--position);left:50%;width:9px;height:9px;transform:translate(-50%,-50%);border:1px solid #304459;border-radius:50%;background:white}
.calendar-header,.month-top,.detail-header{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
.calendar-header h2,.month-top h3,.detail-header h3{margin:0}
.calendar-header{margin-bottom:12px}
.view-toggle [aria-pressed="true"],.month-day[aria-expanded="true"]{background:#dceafb}
.month-top{margin-bottom:10px}.month-navigation{display:flex;gap:6px}
.month-content{display:grid;gap:12px}
.month-content.has-details{grid-template-columns:minmax(0,1fr) minmax(220px,32%)}
.month-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}
.weekday{text-align:center;font-size:.75rem}
.month-day{display:grid;align-content:start;gap:3px;min-width:0;min-height:66px;text-align:left;border:1px solid #dce2e9;border-radius:7px;background:white;padding:5px;color:inherit}
.month-content:not(.has-details) .month-day{min-height:clamp(86px,11vh,125px)}
.day-details{display:flex;flex-direction:column;min-height:0;contain:size}
.day-details[hidden]{display:none}
#day-events{overflow-y:auto;overscroll-behavior:contain}
.day-event{margin:6px 0;padding:10px}
.day-event p{margin:4px 0;overflow-wrap:anywhere}
.event-meta{display:flex;align-items:baseline;gap:6px}
.event-icon{flex:0 0 1.2em;text-align:center}
.day-event details{margin-top:6px}
.day-event summary{cursor:pointer;min-height:32px}
.day-event summary .description-preview{margin-inline-start:1.2em;color:#4a596b}
.day-event .description-full{margin-inline-start:1.2em}
.description-preview{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.day-event details[open] .description-preview{display:none}
#quick-pin{min-width:88px;border:1px solid #cbd5e1;border-radius:8px;min-height:38px}
.settings-list{list-style:none;padding:0}
.settings-list li{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px}
.widget-grid.wide{grid-template-columns:minmax(0,1fr)}
.month-day .event{padding:3px;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:.72rem}
.month-day-top{display:flex;justify-content:space-between;gap:1px}
.day-details{border:1px solid #dce2e9;border-radius:9px;padding:10px;align-self:stretch}
.detail-header h3{font-size:1rem}
dialog{width:min(380px,calc(100% - 32px));border:1px solid #cbd5e1;border-radius:12px;padding:22px;color:inherit}
dialog::backdrop{background:#22304770}
@media(max-width:800px){
  .month-content.has-details{grid-template-columns:minmax(0,1fr)}
  .day-details{contain:none;max-height:360px}
  .month-content:not(.has-details) .month-day{min-height:76px}
  .month-day .event{font-size:0;min-height:4px;padding:0}
}
.event{display:block;background:#dceafb;border-radius:6px;padding:7px;margin:6px 0;font-size:.85rem}
.event.alt{background:#e8f4dc}.event.third{background:#fae8dd}
.side h3{margin-top:0}.device{padding:12px;border:1px solid #e2e6eb;border-radius:9px;margin:10px 0}
button{font:inherit;cursor:pointer}.device button{border:0;border-radius:8px;background:#e4ebf6;padding:8px 12px}
@media(max-width:1100px){.days{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media(max-width:850px){.days{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:440px){main{padding:10px}.calendar{padding:10px}.days{grid-template-columns:minmax(0,1fr)}.day{min-height:120px}}

#calendar-status:empty{display:none} button:disabled{cursor:default;opacity:.55}
</style><main><section class="quick-actions" aria-label="Quick Actions" id="quick-actions">
  <div class="quick-header">
    <button type="button" id="quick-toggle" aria-controls="quick-controls" aria-expanded="true">Quick Actions</button>
    <button type="button" id="quick-pin" aria-label="Pin Quick Actions" aria-pressed="false">Pin</button>
  </div>
  <div class="action-grid" id="quick-controls"></div></section>
<div class="layout" id="layout">
<section class="calendar" aria-label="Family calendar">
<div class="calendar-header">
  <h2>Family calendar</h2>
  <div class="view-toggle" role="group" aria-label="Calendar view">
    <button class="action-button" id="week-view" type="button" aria-pressed="true">Week</button>
    <button class="action-button" id="month-view" type="button" aria-pressed="false">Month</button>
  </div>
</div>
<p class="muted" id="calendar-status" role="status"></p><div id="week"><div class="days" id="week-days"></div></div>
<div id="month" hidden>
  <div class="month-top">
    <h3 id="month-title"></h3>
    <div class="month-navigation">
      <button class="action-button" id="previous-month" type="button" aria-label="Previous month">‹</button>
      <button class="action-button" id="next-month" type="button" aria-label="Next month">›</button>
    </div>
  </div>
  <div class="month-content" id="month-content">
    <div class="month-grid" id="month-grid" aria-labelledby="month-title"></div>
    <aside class="day-details" id="day-details" aria-labelledby="day-title" hidden>
      <div class="detail-header">
        <h3 id="day-title"></h3>
        <button class="action-button" type="button" id="close-day" aria-label="Close day details">×</button>
      </div>
      <div id="day-events" tabindex="0" role="region" aria-label="Events for selected day"></div>
    </aside>
  </div>
</div>
</section>
<section class="side" id="widget-panel" aria-labelledby="widgets-title">
<h3 id="widgets-title">Quick Widgets</h3>
<div class="widget-grid"></div></section>
</div><p class="muted" id="status" role="status" hidden></p>
<dialog id="week-day-details" aria-labelledby="week-day-title">
  <div class="detail-header">
    <h2 id="week-day-title"></h2>
    <form method="dialog"><button class="action-button" aria-label="Close day details">×</button></form>
  </div>
  <div id="week-day-events"></div>
</dialog>
</main>`;

function mount(root, host) {
  const document = {getElementById: id => root.getElementById(id)};
  const weekDays = document.getElementById('week-days');
  const monthGrid = document.getElementById('month-grid');
  const dayDetails = document.getElementById('day-details');
  const weekdays = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const today = new Date();
  const monday = addDays(today, -((today.getDay()+6)%7));
  const weekDates = weekdays.map((_, index) => addDays(monday, index));
  let monthView = host.config.default_view === 'month';
  let month = new Date(today.getFullYear(), today.getMonth(), 1);
  let selectedDay = null;
  let calendarEvents = [];
  let request = 0;
  let expanded = true;
  let pinned = false;
  const status = document.getElementById('status');
  const report = message => { status.textContent = message; status.hidden = !message; };
  const calendarStatus = document.getElementById('calendar-status');
  const quick = document.getElementById('quick-actions');
  const controls = document.getElementById('quick-controls');
  const pin = document.getElementById('quick-pin');
  const toggle = document.getElementById('quick-toggle');

  function updateRibbon() {
    controls.hidden = !expanded;
    quick.classList.toggle('pinned', pinned);
    pin.setAttribute('aria-pressed', String(pinned));
    pin.setAttribute('aria-label', pinned ? 'Unpin Quick Actions' : 'Pin Quick Actions');
    pin.textContent = pinned ? '✓ Pinned' : 'Pin';
    toggle.textContent = expanded ? '▾ Quick Actions' : '▸ Quick Actions';
    toggle.setAttribute('aria-expanded', String(expanded));
  }
  pin.onclick = () => { pinned = !pinned; if (pinned) expanded = true; updateRibbon(); };
  toggle.onclick = () => { expanded = !expanded; if (!expanded) pinned = false; updateRibbon(); };
  updateRibbon();

  function eventsOn(date) {
    const next = addDays(date, 1);
    return calendarEvents.filter(event => event.start < next && event.end > date)
      .map(event => [event.summary, '', {time:when(event.start, event.end, date, event.allDay),
        location:event.location, description:event.description}]);
  }

  async function loadCalendar() {
    const current = ++request;
    const {hass, config} = host;
    renderCalendar();
    if (!hass) return;
    if (!config.calendars.length) {
      calendarStatus.textContent = 'Choose calendars in the card editor.';
      return;
    }
    const weekEnd = addDays(monday, 7);
    const monthEnd = new Date(month.getFullYear(), month.getMonth()+1, 1);
    const start = new Date(Math.min(monday, month));
    const end = new Date(Math.max(weekEnd, monthEnd));
    // Fetch each visible range independently to avoid pulling events between distant months.
    const ranges = month < weekEnd && monthEnd > monday ? [[start,end]] : [[monday,weekEnd],[month,monthEnd]];
    calendarStatus.textContent = 'Loading events…';
    const results = await Promise.allSettled(config.calendars.flatMap(id => ranges.map(async ([from,to]) => {
      const query = new URLSearchParams({start:from.toISOString(), end:to.toISOString()});
      const events = await hass.callApi('GET', 'calendars/'+encodeURIComponent(id)+'?'+query);
      return events.filter(event => event.start && event.end).map(event => ({...event,
        start:endpoint(event.start), end:endpoint(event.end), allDay:Boolean(event.start.date)}));
    })));
    if (current !== request) return;
    calendarEvents = results.flatMap(result => result.status === 'fulfilled' ? result.value : [])
      .sort((a,b) => a.start-b.start);
    calendarStatus.textContent = results.some(result => result.status === 'rejected') ? 'Some calendars could not load.' : '';
    const focusedDay = root.activeElement?.dataset;
    renderCalendar();
    if (focusedDay?.day) monthGrid.querySelector('[data-day="'+focusedDay.day+'"]')?.focus();
    if (focusedDay?.weekDay) weekDays.querySelector('[data-week-day="'+focusedDay.weekDay+'"]')?.focus();
  }

  const actionButtons = host.config.actions.map(id => {
    const button = window.document.createElement('button');
    const label = window.document.createElement('span');
    const state = window.document.createElement('small');
    const domain = domainOf(id);
    button.type = 'button';
    button.className = 'quick-control';
    label.append(window.document.createTextNode(id), state);
    button.append(label);
    controls.append(button);
    let pending = false;
    button.onclick = async () => {
      if (pending || !host.hass?.states[id]) return;
      if (domain === 'cover' && !window.confirm('Open '+label.firstChild.textContent+'?')) return;
      pending = true;
      button.disabled = true;
      report('');
      try { await host.hass.callService(domain, ACTIONS[domain], {entity_id:id}); }
      catch { report('Could not run '+label.firstChild.textContent+'.'); }
      finally { pending = false; updateEntities(); }
    };
    return {id, button, label, state, busy:() => pending};
  });
  if (!actionButtons.length) controls.textContent = 'Add entities in the card editor.';
  const widgetPanel = document.getElementById('widget-panel');
  const widgetGrid = widgetPanel.querySelector('.widget-grid');
  widgetGrid.classList.toggle('wide', host.config.widget_layout === 'wide');
  const widgets = host.config.widgets.map(id => {
    const card = window.document.createElement('div');
    const value = window.document.createElement('strong');
    card.className = 'device';
    card.append(window.document.createTextNode(id), value);
    widgetGrid.append(card);
    return {id, card, value};
  });
  widgetPanel.hidden = !widgets.length;

  function updateEntities() {
    const hass = host.hass;
    if (!hass) return;
    for (const {id,button,label,state,busy} of actionButtons) {
      const entity = hass.states[id];
      label.firstChild.textContent = entity?.attributes.friendly_name || id;
      state.textContent = entity?.state ?? 'Unavailable';
      const domain = domainOf(id);
      button.disabled = busy() || !entity || ['unavailable','unknown'].includes(entity.state) ||
        (domain === 'cover' && entity.state !== 'closed');
      if (ACTIONS[domain] === 'toggle') button.setAttribute('aria-pressed', String(entity?.state === 'on'));
    }
    for (const {id,card,value} of widgets) {
      const entity = hass.states[id];
      card.firstChild.textContent = entity?.attributes.friendly_name || id;
      value.textContent = entity
        ? (hass.formatEntityState?.(entity) ?? [entity.state,entity.attributes.unit_of_measurement].filter(Boolean).join(' '))
        : 'Unavailable';
    }
  }
  function eventCards(events, tag = 'div') {
    return events.map(([title, color = '']) => `<${tag} class="event ${color}">${escapeText(title)}</${tag}>`).join('');
  }

  function dayEventCards(events) {
    return events.map(([title, color = '', details = {}]) => `<article class="event day-event ${color}">
      <strong>${escapeText(title)}</strong>
      ${details.time ? `<p class="event-meta"><span class="event-icon" role="img" aria-label="Time">🕒</span><span>${escapeText(details.time)}</span></p>` : ''}
      ${details.location ? `<p class="event-meta"><span class="event-icon" role="img" aria-label="Location">📍</span><span>${escapeText(details.location)}</span></p>` : ''}
      ${details.description ? `<details>
        <summary><span class="event-icon" aria-hidden="true">📝</span> Event notes
          <span class="description-preview">${escapeText(details.description)}</span>
        </summary>
        <p class="description-full">${escapeText(details.description)}</p>
      </details>` : ''}
    </article>`).join('');
  }


  function renderCalendar() {
    document.getElementById('week').hidden = monthView;
    document.getElementById('month').hidden = !monthView;
    document.getElementById('week-view').setAttribute('aria-pressed', String(!monthView));
    document.getElementById('month-view').setAttribute('aria-pressed', String(monthView));
    if (!monthView) {
      weekDays.innerHTML = weekDates.map((date, index) => `<article class="day">
        <button type="button" class="day-heading" data-week-day="${index}" aria-haspopup="dialog" aria-label="View events for ${weekdays[index]} ${date.getDate()}">${weekdays[index]} ${date.getDate()}</button>
        <div class="day-body events-only">
          <div class="events">${eventCards(eventsOn(date))}</div>
        </div>
      </article>`).join('');
      return;
    }

    const year = month.getFullYear();
    const monthNumber = month.getMonth();
    const offset = (month.getDay()+6)%7;
    const dayCount = new Date(year, monthNumber+1, 0).getDate();
    const getDayEvents = day => eventsOn(new Date(year, monthNumber, day));
    document.getElementById('month-title').textContent = month.toLocaleDateString('en-US', {month:'long', year:'numeric'});
    monthGrid.innerHTML = weekdays.map(day => `<div class="weekday">${day}</div>`).join('') +
      '<span aria-hidden="true"></span>'.repeat(offset) +
      Array.from({length:dayCount}, (_, index) => {
        const day = index+1;
        const events = getDayEvents(day);
        return `<button type="button" class="month-day" data-day="${day}" aria-controls="day-details"
          aria-expanded="${day === selectedDay}">
          <span class="month-day-top">${day}</span>
          ${eventCards(events.slice(0, 3), 'span')}
          ${events.length > 3 ? `<small>+${events.length - 3} more</small>` : ''}
        </button>`;
      }).join('');
    dayDetails.hidden = selectedDay === null;
    document.getElementById('month-content').classList.toggle('has-details', selectedDay !== null);
    if (selectedDay !== null) {
      document.getElementById('day-title').textContent = new Date(year, monthNumber, selectedDay)
        .toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric'});
      const events = getDayEvents(selectedDay);
      const eventList = document.getElementById('day-events');
      eventList.scrollTop = 0;
      eventList.innerHTML = dayEventCards(events) || '<p>No events</p>';
    }
  }


  weekDays.addEventListener('click', event => {
    const dayButton = event.target.closest('[data-week-day]');
    if (dayButton) {
      const index = Number(dayButton.dataset.weekDay);
      const dialog = document.getElementById('week-day-details');
      document.getElementById('week-day-title').textContent = weekDates[index]
        .toLocaleDateString('en-US', {weekday:'long', month:'short', day:'numeric'});
      document.getElementById('week-day-events').innerHTML = dayEventCards(eventsOn(weekDates[index])) || '<p>No events</p>';
      dialog.showModal();
      dialog.scrollTop = 0;
      return;
    }
  });
  document.getElementById('week-view').addEventListener('click', () => {
    monthView = false;
    renderCalendar();
  });
  document.getElementById('month-view').addEventListener('click', () => {
    monthView = true;
    renderCalendar();
  });
  monthGrid.addEventListener('click', event => {
    const button = event.target.closest('[data-day]');
    if (!button) return;
    const day = Number(button.dataset.day);
    selectedDay = selectedDay === day ? null : day;
    renderCalendar();
    monthGrid.querySelector(`[data-day="${day}"]`).focus();
  });
  document.getElementById('close-day').addEventListener('click', () => {
    const day = selectedDay;
    selectedDay = null;
    renderCalendar();
    monthGrid.querySelector(`[data-day="${day}"]`).focus();
  });
  for (const [id, direction] of [['previous-month', -1], ['next-month', 1]]) {
    document.getElementById(id).addEventListener('click', () => {
      month = new Date(month.getFullYear(), month.getMonth()+direction, 1);
      selectedDay = null;
      calendarEvents = [];
      loadCalendar();
    });
  }
  return {loadCalendar, updateEntities};
}

class FamilyHubLiveEditor extends HTMLElement {
  setConfig(config) {
    this.config = config;
    this.render();
  }

  set hass(hass) {
    const catalog = Object.keys(hass.states).join(',');
    this._hass = hass;
    if (catalog !== this.catalog) {
      this.catalog = catalog;
      this.render();
    }
  }

  render() {
    if (!this.config || !this._hass) return;
    this.replaceChildren();
    const save = (key, value) => this.dispatchEvent(new CustomEvent('config-changed', {
      detail:{config:{...this.config,[key]:value}}, bubbles:true, composed:true
    }));
    for (const [key, title, limit, allowed] of [
      ['calendars','Calendars',Infinity,id => domainOf(id) === 'calendar'],
      ['actions','Quick Actions',MAX_ITEMS,id => Object.hasOwn(ACTIONS, domainOf(id))],
      ['widgets','Quick Widgets',MAX_ITEMS,() => true]
    ]) {
      const selected = this.config[key] ?? [];
      const section = document.createElement('fieldset');
      const heading = document.createElement('legend');
      heading.textContent = title;
      section.append(heading);
      for (const id of selected) {
        const row = document.createElement('p');
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = 'Remove';
        remove.setAttribute('aria-label', 'Remove '+id);
        remove.onclick = () => save(key, selected.filter(item => item !== id));
        row.append(id+' ',remove);
        section.append(row);
      }
      const picker = document.createElement('select');
      picker.setAttribute('aria-label', 'Choose '+title.toLowerCase()+' entity');
      picker.add(new Option('Select an entity',''));
      for (const id of Object.keys(this._hass.states).filter(allowed).sort()) {
        if (!selected.includes(id)) {
          const name = this._hass.states[id].attributes.friendly_name;
          picker.add(new Option(name ? name+' ('+id+')' : id,id));
        }
      }
      const add = document.createElement('button');
      add.type = 'button';
      add.textContent = selected.length >= limit ? 'Limit reached' : '+ Add';
      add.disabled = true;
      picker.disabled = selected.length >= limit || picker.options.length === 1;
      picker.onchange = () => { add.disabled = !picker.value; };
      add.onclick = () => save(key, [...selected,picker.value]);
      section.append(picker,add);
      this.append(section);
    }
    for (const [key, title, options] of [
      ['default_view','Default calendar view',{week:'Week',month:'Month'}],
      ['widget_layout','Widget layout',{grid:'Side by side',wide:'Full-width stack'}]
    ]) {
      const row = document.createElement('p');
      const label = document.createElement('label');
      const picker = document.createElement('select');
      for (const [value,name] of Object.entries(options)) picker.add(new Option(name,value));
      picker.value = this.config[key] ?? Object.keys(options)[0];
      picker.onchange = () => save(key,picker.value);
      label.append(title+' ',picker);
      row.append(label);
      this.append(row);
    }
  }
}

class FamilyHubLive extends HTMLElement {
  static getConfigElement() { return document.createElement(CARD+'-editor'); }
  static getStubConfig() { return {type:'custom:'+CARD, calendars:[], actions:[], widgets:[]}; }

  setConfig(config) {
    const entities = (key, allowed, limit = Infinity) => {
      const list = config[key] ?? [];
      if (!Array.isArray(list) || list.length > limit ||
          list.some(id => typeof id !== 'string' || !/^[a-z0-9_]+\.[a-z0-9_]+$/.test(id) || !allowed(id))) {
        throw new Error('Invalid Family Hub '+key+' configuration');
      }
      return [...new Set(list)];
    };
    this.config = {
      ...config, calendars:entities('calendars',id => domainOf(id) === 'calendar'),
      actions:entities('actions',id => Object.hasOwn(ACTIONS,domainOf(id)),MAX_ITEMS),
      widgets:entities('widgets',() => true,MAX_ITEMS)
    };
    const root = this.shadowRoot ?? this.attachShadow({mode:'open'});
    root.innerHTML = markup;
    this.view = mount(root,this);
    this.view.updateEntities();
    this.view.loadCalendar();
  }

  get hass() { return this._hass; }
  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    this.view?.updateEntities();
    if (first) this.view?.loadCalendar();
  }

  connectedCallback() {
    this.refreshTimer = setInterval(() => this.view?.loadCalendar(), 5 * 60 * 1000);
  }
  disconnectedCallback() { clearInterval(this.refreshTimer); }
  getCardSize() { return 8; }
}

if (!customElements.get(CARD)) {
  customElements.define(CARD+'-editor',FamilyHubLiveEditor);
  customElements.define(CARD,FamilyHubLive);
  (window.customCards ??= []).push({type:CARD,name:'Family Hub Live',description:'Family calendar, quick actions and live widgets'});
}
