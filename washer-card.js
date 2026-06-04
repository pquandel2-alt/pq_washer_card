// =====================================================================
//  Washer Card v1.0.0
// =====================================================================

const _WC_LABELS = {
  air_wash:         'Luftwäsche',
  ai_rinse:         'KI-Spülen',
  ai_spin:          'KI-Schleudern',
  ai_wash:          'KI-Waschen',
  cooling:          'Abkühlen',
  delay_wash:       'Zeitvorwahl',
  drying:           'Trocknen',
  finish:           'Fertig',
  none:             'Standby',
  pre_wash:         'Vorwäsche',
  rinse:            'Spülen',
  spin:             'Schleudern',
  wash:             'Waschen',
  weight_sensing:   'Gewichtsmessung',
  wrinkle_prevent:  'Knitterschutz',
  freeze_protection:'Frostschutz',
  on:               'An',
  off:              'Aus',
  unavailable:      'Nicht verfügbar',
  unknown:          'Unbekannt',
};

const _WC_COLORS = {
  wash:             '#2196F3',
  pre_wash:         '#2196F3',
  ai_wash:          '#2196F3',
  rinse:            '#42A5F5',
  ai_rinse:         '#42A5F5',
  spin:             '#7E57C2',
  ai_spin:          '#7E57C2',
  air_wash:         '#26C6DA',
  weight_sensing:   '#78909C',
  drying:           '#FF9800',
  cooling:          '#00BCD4',
  wrinkle_prevent:  '#AB47BC',
  finish:           '#4CAF50',
  delay_wash:       '#607D8B',
  freeze_protection:'#90CAF9',
  on:               '#4CAF50',
};

const _WC_DEFAULT_ACTIVE = 'wash,pre_wash,ai_wash,rinse,ai_rinse,spin,ai_spin,air_wash,weight_sensing,drying,cooling,wrinkle_prevent';

function _wcLabel(s) { return _WC_LABELS[s] || s || '–'; }
function _wcColor(s, on) { return on ? (_WC_COLORS[s] || '#4CAF50') : 'rgba(255,255,255,0.25)'; }
function _wcWatts(st) {
  if (!st) return null;
  const v = parseFloat(st.state);
  if (isNaN(v)) return null;
  const u = (st.attributes?.unit_of_measurement || '').toLowerCase().trim();
  return u === 'kw' ? v * 1000 : v;
}
function _wcFmtPower(w) {
  if (w === null || isNaN(w)) return '–';
  return Math.abs(w) >= 1000 ? `${(w / 1000).toFixed(2)} kW` : `${Math.round(w)} W`;
}

// =====================================================================
//  Haupt-Card
// =====================================================================
class WasherCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._lastKey = null;
  }

  setConfig(config) {
    if (!config) throw new Error('Keine Konfiguration');
    this._config = {
      machine_type: 'washer',
      name: '',
      show_power: true,
      show_state: true,
      active_states: _WC_DEFAULT_ACTIVE,
      tap_action: { action: 'more-info' },
      border_radius: 16,
      ...config,
    };
    delete this._lastKey;
  }

  set hass(hass) { this._hass = hass; this._render(); }
  getCardSize() { return 2; }
  static getConfigElement() { return document.createElement('washer-card-editor'); }
  static getStubConfig() {
    return { machine_type: 'washer', name: 'Waschmaschine', tap_action: { action: 'more-info' } };
  }

  _activeSet() {
    return new Set(
      (this._config.active_states || _WC_DEFAULT_ACTIVE)
        .split(',').map(s => s.trim()).filter(Boolean)
    );
  }

  _handleTap() {
    const action = this._config.tap_action || { action: 'more-info' };
    const eid = this._config.entity;
    switch (action.action) {
      case 'toggle':
        if (eid) this._hass.callService('homeassistant', 'toggle', { entity_id: eid });
        break;
      case 'more-info':
        if (eid) this.dispatchEvent(new CustomEvent('hass-more-info',
          { detail: { entityId: eid }, bubbles: true, composed: true }));
        break;
      case 'navigate':
        if (action.navigation_path) {
          history.pushState(null, '', action.navigation_path);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }
        break;
      case 'call-service': {
        const [dom, svc] = (action.service || '').split('.');
        if (dom && svc) this._hass.callService(dom, svc, action.service_data || {});
        break;
      }
      case 'url':
        if (action.url_path) window.open(action.url_path, action.url_target || '_blank');
        break;
    }
  }

  _render() {
    if (!this._hass) return;
    const cfg = this._config;

    const mainSt  = cfg.entity       ? this._hass.states[cfg.entity]       : null;
    const stateSt = cfg.state_entity ? this._hass.states[cfg.state_entity] : null;
    const powerSt = cfg.power_entity ? this._hass.states[cfg.power_entity] : null;

    const rawState = stateSt?.state ?? mainSt?.state ?? null;

    // isOn: von Haupt-Entität ableiten, sonst aus State-Entität
    let isOn;
    if (mainSt) {
      isOn = !['off', 'unavailable', 'unknown'].includes(mainSt.state);
    } else if (stateSt) {
      isOn = !['none', 'off', 'unavailable', 'unknown'].includes(stateSt.state);
    } else {
      isOn = false;
    }

    const isRunning  = isOn && (stateSt ? this._activeSet().has(rawState) : isOn);
    const isFinished = rawState === 'finish';
    const stateColor = _wcColor(rawState, isOn);
    const stateLabel = _wcLabel(rawState);
    const powerWatts = _wcWatts(powerSt);
    const name       = cfg.name
      || mainSt?.attributes?.friendly_name
      || stateSt?.attributes?.friendly_name
      || (cfg.machine_type === 'dryer' ? 'Trockner' : 'Waschmaschine');
    const icon       = cfg.machine_type === 'dryer' ? 'mdi:tumble-dryer' : 'mdi:washing-machine';
    const br         = cfg.border_radius ?? 16;
    const clickable  = (cfg.tap_action?.action ?? 'more-info') !== 'none';

    const key = [rawState, isOn, isRunning, powerWatts, JSON.stringify(cfg)].join('|');
    if (key === this._lastKey) return;
    this._lastKey = key;

    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; box-sizing:border-box; }
        .card {
          background:rgba(255,255,255,0.06);
          border:1px solid ${isOn && !isFinished ? stateColor + '44' : isFinished ? '#4CAF5066' : 'rgba(255,255,255,0.12)'};
          border-radius:${br}px;
          padding:16px;
          box-sizing:border-box;
          cursor:${clickable ? 'pointer' : 'default'};
          transition:background 0.2s, border-color 0.3s, box-shadow 0.3s;
          user-select:none;
          -webkit-tap-highlight-color:transparent;
          box-shadow:${isOn && !isFinished ? `0 0 14px 0 ${stateColor}1a` : isFinished ? '0 0 18px 0 #4CAF5025' : 'none'};
        }
        .card:active { background:rgba(255,255,255,0.1); }
        .main { display:flex; align-items:center; gap:16px; }
        .icon-wrap {
          flex-shrink:0;
          width:62px; height:62px;
          border-radius:50%;
          display:flex; align-items:center; justify-content:center;
          background:rgba(255,255,255,0.04);
          border:2px solid ${isOn ? stateColor + '55' : 'rgba(255,255,255,0.1)'};
          box-shadow:${isOn ? `0 0 12px 0 ${stateColor}2a` : 'none'};
          transition:border-color 0.3s, box-shadow 0.3s;
          overflow:hidden;
        }
        ha-icon {
          --mdc-icon-size:34px;
          color:${isOn ? stateColor : 'rgba(255,255,255,0.3)'};
          display:block;
          transform-origin:center center;
          transition:color 0.3s;
          ${isRunning   ? 'animation:drum 3s linear infinite;' : ''}
          ${isFinished && !isRunning ? 'animation:finish-pop 0.5s ease-out 2 forwards;' : ''}
        }
        @keyframes drum {
          from { transform:rotate(0deg); }
          to   { transform:rotate(360deg); }
        }
        @keyframes finish-pop {
          0%,100% { transform:scale(1); }
          50%     { transform:scale(1.18); }
        }
        .details { flex:1; min-width:0; display:flex; flex-direction:column; gap:6px; }
        .name {
          font-size:14px; font-weight:600; color:rgba(255,255,255,0.9);
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        }
        .state-row { display:flex; align-items:center; gap:7px; }
        .dot {
          width:7px; height:7px; border-radius:50%; flex-shrink:0;
          background:${isOn ? stateColor : 'rgba(255,255,255,0.18)'};
          ${isRunning ? `animation:blink 1.8s ease-in-out infinite;box-shadow:0 0 5px 0 ${stateColor};` : ''}
        }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .state-label { font-size:12px; font-weight:500; color:${isOn ? stateColor : 'rgba(255,255,255,0.35)'}; }
        .bottom-row { display:flex; align-items:center; justify-content:space-between; }
        .on-badge {
          font-size:10px; padding:2px 8px; border-radius:8px; font-weight:600;
          background:${isOn ? stateColor + '1f' : 'rgba(255,255,255,0.05)'};
          color:${isOn ? stateColor : 'rgba(255,255,255,0.3)'};
          border:1px solid ${isOn ? stateColor + '44' : 'rgba(255,255,255,0.08)'};
        }
        .power {
          font-size:12px; font-weight:700; font-variant-numeric:tabular-nums;
          color:${powerWatts !== null && powerWatts > 5 ? stateColor : 'rgba(255,255,255,0.3)'};
        }
      </style>
      <div class="card">
        <div class="main">
          <div class="icon-wrap">
            <ha-icon icon="${icon}"></ha-icon>
          </div>
          <div class="details">
            <div class="name">${name}</div>
            ${cfg.show_state !== false ? `
              <div class="state-row">
                <div class="dot"></div>
                <span class="state-label">${stateLabel}</span>
              </div>` : ''}
            <div class="bottom-row">
              <span class="on-badge">${isOn ? 'An' : 'Aus'}</span>
              ${cfg.show_power !== false && powerWatts !== null
                ? `<span class="power">${_wcFmtPower(powerWatts)}</span>` : ''}
            </div>
          </div>
        </div>
      </div>
    `;

    if (clickable) {
      this.shadowRoot.querySelector('.card').addEventListener('click', () => this._handleTap());
    }
  }
}

customElements.define('washer-card', WasherCard);

// =====================================================================
//  Visueller Editor
// =====================================================================
class WasherCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config  = {};
    this._hass    = null;
    this._rendered = false;
  }

  setConfig(config) {
    this._config = { ...config };
    if (this._rendered) {
      this._syncFields();
    } else {
      this._render();
    }
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._rendered) {
      this._render();
    } else {
      const root   = this.shadowRoot;
      const active = root.activeElement;
      const fields = root.getElementById('entityFields');
      if (!active || !fields || !fields.contains(active)) {
        this._rebuildEntityFields();
      }
    }
  }

  _emit() {
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: { ...this._config } },
      bubbles: true, composed: true,
    }));
  }

  _syncFields() {
    const root   = this.shadowRoot;
    const c      = this._config;
    const active = root.activeElement;

    [['field_entity','entity'],['field_state_entity','state_entity'],['field_power_entity','power_entity']]
      .forEach(([fid, key]) => {
        const el  = root.getElementById(fid)?.querySelector('input[type=text]');
        const btn = root.getElementById(fid)?.querySelector('button');
        if (el && active !== el) {
          el.value = c[key] || '';
          if (btn) btn.style.display = c[key] ? 'block' : 'none';
        }
      });

    const nameEl = root.getElementById('name');
    if (nameEl && active !== nameEl) nameEl.value = c.name || '';

    const asEl = root.getElementById('active_states');
    if (asEl && active !== asEl) asEl.value = c.active_states || _WC_DEFAULT_ACTIVE;

    this._updateActionFields();
  }

  // Autocomplete-Feld für eine einzelne Entität
  _buildEntityField(fieldId, label, configKey) {
    const root      = this.shadowRoot;
    const container = root.getElementById(fieldId);
    if (!container) return;
    container.innerHTML = '';

    const lbl = document.createElement('label');
    lbl.textContent = label;
    lbl.style.cssText = 'font-size:13px;font-weight:500;color:var(--primary-text-color,#212121);display:block;margin-bottom:5px;';
    container.appendChild(lbl);

    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;';

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;border:1px solid var(--divider-color,#e0e0e0);border-radius:8px;background:var(--card-background-color,#fff);overflow:hidden;';

    const input = document.createElement('input');
    input.type  = 'text';
    input.value = this._config[configKey] || '';
    input.placeholder = 'entity_id…';
    input.style.cssText = 'flex:1;padding:9px 11px;border:none;outline:none;background:transparent;color:var(--primary-text-color,#212121);font-size:13px;';

    const clrBtn = document.createElement('button');
    clrBtn.textContent = '×';
    clrBtn.style.cssText = 'background:none;border:none;cursor:pointer;color:var(--secondary-text-color,#aaa);font-size:18px;padding:0 10px;line-height:1;display:' + (this._config[configKey] ? 'block' : 'none') + ';';
    clrBtn.addEventListener('click', () => {
      input.value = '';
      clrBtn.style.display = 'none';
      const cfg = { ...this._config };
      delete cfg[configKey];
      this._config = cfg;
      this._emit();
    });

    row.appendChild(input);
    row.appendChild(clrBtn);

    const dropdown = document.createElement('div');
    dropdown.style.cssText = 'position:absolute;top:100%;left:0;right:0;max-height:200px;overflow-y:auto;background:var(--card-background-color,#fff);border:1px solid var(--divider-color,#e0e0e0);border-radius:8px;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.15);display:none;margin-top:2px;';

    const show = (filter) => {
      dropdown.innerHTML = '';
      if (!this._hass || !filter.trim()) { dropdown.style.display = 'none'; return; }
      const lower = filter.toLowerCase();
      const matches = Object.keys(this._hass.states)
        .filter(id => {
          const fn = (this._hass.states[id]?.attributes?.friendly_name || '').toLowerCase();
          return id.toLowerCase().includes(lower) || fn.includes(lower);
        }).slice(0, 8);
      if (!matches.length) { dropdown.style.display = 'none'; return; }
      matches.forEach(id => {
        const fn   = this._hass.states[id]?.attributes?.friendly_name || id;
        const item = document.createElement('div');
        item.style.cssText = 'padding:7px 11px;cursor:pointer;border-bottom:1px solid var(--divider-color,#f0f0f0);';
        item.innerHTML = `<div style="font-size:12px;font-weight:500;">${fn}</div><div style="font-size:10px;color:var(--secondary-text-color,#727272);">${id}</div>`;
        item.addEventListener('mouseover', () => { item.style.background = 'var(--secondary-background-color,#f5f5f5)'; });
        item.addEventListener('mouseout',  () => { item.style.background = ''; });
        item.addEventListener('mousedown', ev => {
          ev.preventDefault();
          input.value = id;
          clrBtn.style.display = 'block';
          dropdown.style.display = 'none';
          this._config = { ...this._config, [configKey]: id };
          this._emit();
        });
        dropdown.appendChild(item);
      });
      dropdown.style.display = 'block';
    };

    input.addEventListener('input',  () => show(input.value));
    input.addEventListener('focus',  () => show(input.value));
    input.addEventListener('blur',   () => setTimeout(() => { dropdown.style.display = 'none'; }, 150));
    input.addEventListener('change', () => {
      const v = input.value.trim();
      this._config = { ...this._config, [configKey]: v || undefined };
      clrBtn.style.display = v ? 'block' : 'none';
      this._emit();
    });

    wrap.appendChild(row);
    wrap.appendChild(dropdown);
    container.appendChild(wrap);
  }

  _rebuildEntityFields() {
    this._buildEntityField('field_entity',       'Haupt-Entität (An / Aus)',    'entity');
    this._buildEntityField('field_state_entity', 'Programm-Sensor (optional)',  'state_entity');
    this._buildEntityField('field_power_entity', 'Leistungssensor (optional)',  'power_entity');
  }

  _updateActionFields() {
    const root   = this.shadowRoot;
    const action = this._config.tap_action?.action || 'more-info';
    const navF = root.getElementById('nav_field');
    const svcF = root.getElementById('svc_field');
    const urlF = root.getElementById('url_field');
    if (navF) navF.style.display = action === 'navigate'     ? '' : 'none';
    if (svcF) svcF.style.display = action === 'call-service' ? '' : 'none';
    if (urlF) urlF.style.display = action === 'url'          ? '' : 'none';
  }

  _render() {
    this._rendered = true;
    const c  = this._config;
    const ta = c.tap_action || { action: 'more-info' };
    const root = this.shadowRoot;

    root.innerHTML = `
      <style>
        .editor { display:flex; flex-direction:column; gap:14px; padding:8px 0; }
        .section {
          font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.6px;
          color:var(--secondary-text-color,#727272); margin-top:6px;
          border-bottom:1px solid var(--divider-color,#e0e0e0); padding-bottom:4px;
        }
        .field { display:flex; flex-direction:column; gap:5px; }
        label { font-size:13px; font-weight:500; color:var(--primary-text-color,#212121); }
        .hint { font-size:11px; color:var(--secondary-text-color,#727272); line-height:1.5; }
        input[type=text], input[type=number], select, textarea {
          padding:9px 11px; border-radius:8px; border:1px solid var(--divider-color,#e0e0e0);
          background:var(--card-background-color,#fff); color:var(--primary-text-color,#212121);
          font-size:13px; outline:none; box-sizing:border-box; width:100%; font-family:inherit; }
        input:focus, select:focus, textarea:focus { border-color:var(--primary-color,#03a9f4); }
        .toggle-row { display:flex; align-items:center; justify-content:space-between; padding:4px 0; }
        .toggle-row label { flex:1; }
        .type-buttons { display:flex; gap:10px; }
        .type-btn {
          flex:1; padding:12px 8px; border-radius:10px;
          border:1px solid var(--divider-color,#e0e0e0);
          background:var(--card-background-color,#fff);
          cursor:pointer; text-align:center; font-size:13px; font-weight:500;
          color:var(--primary-text-color,#212121);
          display:flex; flex-direction:column; align-items:center; gap:6px;
          transition:all 0.15s;
        }
        .type-btn ha-icon { --mdc-icon-size:30px; }
        .type-btn.selected {
          background:var(--primary-color,#03a9f4);
          color:#fff; border-color:var(--primary-color,#03a9f4);
        }
        #entityFields { display:flex; flex-direction:column; gap:14px; }
        textarea { resize:vertical; min-height:56px; }
      </style>
      <div class="editor">

        <div class="section">Gerätetyp</div>
        <div class="type-buttons" id="typeBtns">
          <button class="type-btn ${(c.machine_type||'washer')==='washer'?'selected':''}" data-type="washer">
            <ha-icon icon="mdi:washing-machine"></ha-icon>
            Waschmaschine
          </button>
          <button class="type-btn ${c.machine_type==='dryer'?'selected':''}" data-type="dryer">
            <ha-icon icon="mdi:tumble-dryer"></ha-icon>
            Trockner
          </button>
        </div>

        <div class="section">Gerät</div>
        <div class="field">
          <label>Name</label>
          <input type="text" id="name" value="${c.name || ''}" placeholder="${c.machine_type === 'dryer' ? 'Trockner' : 'Waschmaschine'}" />
        </div>
        <div id="entityFields">
          <div class="field" id="field_entity"></div>
          <div class="field" id="field_state_entity"></div>
          <div class="field" id="field_power_entity"></div>
        </div>
        <div class="hint">
          Die Haupt-Entität bestimmt An/Aus. Der Programm-Sensor zeigt den aktuellen Waschgang und steuert die Drehaniation.
          Ist nur der Programm-Sensor gesetzt, wird An/Aus automatisch daraus abgeleitet.
        </div>

        <div class="section">Zustände</div>
        <div class="field">
          <label>Aktive Zustände (Icon dreht sich)</label>
          <textarea id="active_states" rows="3">${c.active_states || _WC_DEFAULT_ACTIVE}</textarea>
          <span class="hint">Kommagetrennte Zustandsnamen – in diesen Zuständen dreht sich das Icon.<br>
          Samsung-Beispiele: wash, pre_wash, rinse, spin, drying, ai_wash, ai_rinse, ai_spin, air_wash, weight_sensing, cooling, wrinkle_prevent</span>
        </div>

        <div class="section">Aktion bei Tippen</div>
        <div class="field">
          <select id="tap_action_type">
            <option value="more-info"    ${ta.action==='more-info'    ?'selected':''}>Mehr Infos anzeigen</option>
            <option value="toggle"       ${ta.action==='toggle'       ?'selected':''}>Umschalten (toggle)</option>
            <option value="navigate"     ${ta.action==='navigate'     ?'selected':''}>Navigation</option>
            <option value="call-service" ${ta.action==='call-service' ?'selected':''}>Service aufrufen</option>
            <option value="url"          ${ta.action==='url'          ?'selected':''}>URL öffnen</option>
            <option value="none"         ${ta.action==='none'         ?'selected':''}>Keine Aktion</option>
          </select>
        </div>
        <div class="field" id="nav_field" style="${ta.action==='navigate'?'':'display:none'}">
          <label>Navigationspfad</label>
          <input type="text" id="nav_path" value="${ta.navigation_path||''}" placeholder="/lovelace/0" />
        </div>
        <div class="field" id="svc_field" style="${ta.action==='call-service'?'':'display:none'}">
          <label>Service (domain.service)</label>
          <input type="text" id="svc_name" value="${ta.service||''}" placeholder="homeassistant.toggle" />
        </div>
        <div class="field" id="url_field" style="${ta.action==='url'?'':'display:none'}">
          <label>URL</label>
          <input type="text" id="url_path" value="${ta.url_path||''}" placeholder="https://..." />
        </div>

        <div class="section">Darstellung</div>
        <div class="toggle-row">
          <label>Zustand anzeigen</label>
          <input type="checkbox" id="show_state" ${c.show_state!==false?'checked':''} />
        </div>
        <div class="toggle-row">
          <label>Leistung anzeigen</label>
          <input type="checkbox" id="show_power" ${c.show_power!==false?'checked':''} />
        </div>
        <div class="field">
          <label>Eckenradius (px)</label>
          <input type="number" id="border_radius" value="${c.border_radius??16}" min="0" max="40" />
        </div>

      </div>
    `;

    // Entity-Felder aufbauen
    this._rebuildEntityFields();

    // Gerätetyp-Buttons
    root.getElementById('typeBtns').addEventListener('click', e => {
      const btn = e.target.closest('[data-type]');
      if (!btn) return;
      const type = btn.dataset.type;
      root.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('selected', b.dataset.type === type));
      this._config = { ...this._config, machine_type: type };
      this._emit();
    });

    root.getElementById('name').addEventListener('change', e => {
      this._config = { ...this._config, name: e.target.value }; this._emit();
    });
    root.getElementById('active_states').addEventListener('change', e => {
      this._config = { ...this._config, active_states: e.target.value }; this._emit();
    });

    // Tap-Action
    root.getElementById('tap_action_type').addEventListener('change', e => {
      this._config = { ...this._config, tap_action: { ...this._config.tap_action, action: e.target.value } };
      this._emit();
      this._updateActionFields();
    });
    root.getElementById('nav_path').addEventListener('change', e => {
      this._config = { ...this._config, tap_action: { ...this._config.tap_action, navigation_path: e.target.value } }; this._emit();
    });
    root.getElementById('svc_name').addEventListener('change', e => {
      this._config = { ...this._config, tap_action: { ...this._config.tap_action, service: e.target.value } }; this._emit();
    });
    root.getElementById('url_path').addEventListener('change', e => {
      this._config = { ...this._config, tap_action: { ...this._config.tap_action, url_path: e.target.value } }; this._emit();
    });

    // Darstellung
    root.getElementById('show_state').addEventListener('change', e => {
      this._config = { ...this._config, show_state: e.target.checked }; this._emit();
    });
    root.getElementById('show_power').addEventListener('change', e => {
      this._config = { ...this._config, show_power: e.target.checked }; this._emit();
    });
    root.getElementById('border_radius').addEventListener('change', e => {
      this._config = { ...this._config, border_radius: parseInt(e.target.value) }; this._emit();
    });
  }
}

customElements.define('washer-card-editor', WasherCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'washer-card',
  name: 'Washer Card',
  description: 'Waschmaschinen- & Trockner-Widget mit dynamischer Drehanimation, Statusanzeige und Leistungsanzeige',
  preview: true,
});
