// @ts-check
// =====================================================================
//  Washer Card v1.0.6
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

function _wcFmtTime(st) {
  if (!st) return null;
  const unit = (st.attributes?.unit_of_measurement || '').toLowerCase().trim();
  // HA timer-Entität: remaining-Attribut "H:MM:SS"
  if (st.attributes?.remaining) {
    const parts = st.attributes.remaining.split(':').map(Number);
    if (parts.length === 3) {
      const [h, m, s] = parts;
      if (h > 0) return `${h}:${String(m).padStart(2,'0')}`;
      if (m > 0) return `${m}:${String(s).padStart(2,'0')}`;
      return s > 0 ? `${s} s` : null;
    }
    return st.attributes.remaining;
  }
  const val = parseFloat(st.state);
  if (isNaN(val) || val <= 0) return null;
  if (unit === 'min' || unit === 'minutes' || unit === 'minute') {
    const h = Math.floor(val / 60);
    const m = Math.round(val % 60);
    return h > 0 ? `${h}:${String(m).padStart(2,'0')}` : `${Math.round(val)} min`;
  }
  if (['s','sec','seconds','second'].includes(unit)) {
    const m = Math.floor(val / 60);
    const s = Math.round(val % 60);
    return m > 0 ? `${m}:${String(s).padStart(2,'0')}` : `${Math.round(val)} s`;
  }
  if (/^\d+:\d{2}(:\d{2})?$/.test(st.state)) return st.state;
  return st.state + (unit ? ' ' + unit : '');
}

// =====================================================================
//  Haupt-Card
// =====================================================================
class WasherCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config     = {};
    this._lastKey    = null;
    this._popupOpen  = false;
    this._popupEl    = null;
  }

  /** @param {LovelaceCardConfig} config */
  setConfig(config) {
    if (!config) throw new Error('Keine Konfiguration');
    this._config = {
      machine_type:   'washer',
      name:           '',
      show_power:     true,
      show_state:     true,
      active_states:  _WC_DEFAULT_ACTIVE,
      tap_action:     { action: 'more-info' },
      border_radius:  16,
      popup_controls: [],
      timer_entity:   '',
      ...config,
    };
    if (!Array.isArray(this._config.popup_controls)) this._config.popup_controls = [];
    delete this._lastKey;
  }

  /** @param {HomeAssistant} hass */
  set hass(hass) {
    this._hass = hass;
    // Wenn Popup offen: nur Controls aktualisieren, nicht ganzen render
    if (this._popupOpen) {
      this._refreshPopupControls();
    } else {
      this._render();
    }
  }

  getCardSize() { return 2; }
  static getConfigElement() { return document.createElement('washer-card-editor'); }
  static getStubConfig() {
    return { machine_type: 'washer', name: 'Waschmaschine', tap_action: { action: 'more-info' }, popup_controls: [] };
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

  // ---- Popup öffnen / schließen ----

  _openPopup() {
    this._popupOpen = true;
    if (!this._popupEl) {
      this._popupEl = document.createElement('div');
      this.shadowRoot.appendChild(this._popupEl);
    }
    this._popupEl.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:flex-end;justify-content:center;';
    this._buildPopupContent();
  }

  _closePopup() {
    this._popupOpen = false;
    if (this._popupEl) this._popupEl.style.display = 'none';
    this._lastKey = null; // Card-Re-render beim nächsten hass-Update erzwingen
  }

  // Popup-Element nach shadowRoot.innerHTML-Reset wiederherstellen
  _ensurePopup() {
    if (!this._config.popup_controls?.length) return;
    if (!this._popupEl) {
      this._popupEl = document.createElement('div');
    }
    this.shadowRoot.appendChild(this._popupEl);
    this._popupEl.style.cssText = `position:fixed;inset:0;z-index:9999;align-items:flex-end;justify-content:center;display:${this._popupOpen ? 'flex' : 'none'};`;
    if (this._popupOpen) this._buildPopupContent();
  }

  // Nur Steuerelement-Zustände aktualisieren (ohne Popup neu zu bauen)
  _refreshPopupControls() {
    if (!this._popupEl || !this._hass) return;
    (this._config.popup_controls || []).forEach((ctrl, i) => {
      const st = this._hass.states[ctrl.entity];
      if (!st) return;
      if (ctrl.type === 'switch') {
        const isOn = st.state === 'on';
        const sw = /** @type {HTMLElement|null} */ (this._popupEl.querySelector(`.wcsw[data-idx="${i}"]`));
        if (sw) {
          sw.style.background = isOn ? '#4CAF50' : 'rgba(255,255,255,0.15)';
          const kn = /** @type {HTMLElement|null} */ (sw.querySelector('.wckn'));
          if (kn) kn.style.left = isOn ? '23px' : '3px';
        }
      } else if (ctrl.type === 'number') {
        const sld = /** @type {HTMLInputElement & HTMLElement|null} */ (this._popupEl.querySelector(`.wcsld[data-idx="${i}"]`));
        const nv  = /** @type {HTMLElement|null} */ (this._popupEl.querySelector(`.wcnv[data-idx="${i}"]`));
        if (sld && this._popupEl.ownerDocument.activeElement !== sld) {
          const val = parseFloat(st.state);
          const min = parseFloat(sld.min);
          const max = parseFloat(sld.max);
          sld.value = String(isNaN(val) ? min : val);
          const pct = ((val - min) / (max - min) * 100).toFixed(1);
          sld.style.background = `linear-gradient(to right,#42A5F5 ${pct}%,rgba(255,255,255,0.18) ${pct}%)`;
          if (nv) {
            const dec  = parseInt(sld.dataset.dec || '0');
            const unit = sld.dataset.unit || '';
            nv.textContent = (isNaN(val) ? '–' : val.toFixed(dec)) + (unit ? ' ' + unit : '');
          }
        }
      } else if (ctrl.type === 'select') {
        const sel = /** @type {HTMLInputElement|null} */ (this._popupEl.querySelector(`.wcslt[data-idx="${i}"]`));
        if (sel && this._popupEl.ownerDocument.activeElement !== sel) sel.value = st.state;
      }
    });
  }

  // Popup-Inhalt vollständig neu aufbauen
  _buildPopupContent() {
    if (!this._popupEl || !this._hass) return;
    const cfg = this._config;
    const controls = cfg.popup_controls || [];
    const name = cfg.name
      || this._hass.states[cfg.entity]?.attributes?.friendly_name
      || this._hass.states[cfg.state_entity]?.attributes?.friendly_name
      || (cfg.machine_type === 'dryer' ? 'Trockner' : 'Waschmaschine');

    this._popupEl.innerHTML = `
      <div id="wcBD" style="position:absolute;inset:0;background:rgba(0,0,0,0.55);cursor:pointer;"></div>
      <div style="position:relative;width:100%;max-width:480px;background:rgba(18,18,28,0.97);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,0.12);border-radius:20px 20px 0 0;z-index:1;">
        <!-- Handle -->
        <div style="display:flex;justify-content:center;padding:12px 0 0;">
          <div style="width:36px;height:4px;border-radius:2px;background:rgba(255,255,255,0.2);"></div>
        </div>
        <!-- Header -->
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 18px 12px;">
          <span style="font-size:16px;font-weight:700;color:rgba(255,255,255,0.92);">${name}</span>
          <button id="wcCL" style="background:rgba(255,255,255,0.1);border:none;border-radius:50%;width:30px;height:30px;cursor:pointer;color:rgba(255,255,255,0.7);font-size:15px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">✕</button>
        </div>
        <!-- Controls -->
        <div style="padding:0 18px 28px;display:flex;flex-direction:column;">
          ${controls.length
            ? controls.map((ctrl, i) => this._renderControl(ctrl, i)).join('')
            : '<div style="color:rgba(255,255,255,0.35);font-size:13px;text-align:center;padding:20px 0;">Keine Steuerelemente konfiguriert</div>'
          }
        </div>
      </div>
    `;

    this._popupEl.querySelector('#wcBD')?.addEventListener('click', () => this._closePopup());
    this._popupEl.querySelector('#wcCL')?.addEventListener('click', () => this._closePopup());

    // Switch-Toggles
    (/** @type {NodeListOf<HTMLElement>} */ (this._popupEl.querySelectorAll('.wcsw'))).forEach(el => {
      el.addEventListener('click', () => {
        this._hass.callService('homeassistant', 'toggle', { entity_id: el.dataset.entity });
      });
    });

    // Number-Slider
    (/** @type {NodeListOf<HTMLInputElement & HTMLElement>} */ (this._popupEl.querySelectorAll('.wcsld'))).forEach(el => {
      const updateSlider = () => {
        const min  = parseFloat(el.min);
        const max  = parseFloat(el.max);
        const val  = parseFloat(el.value);
        const pct  = ((val - min) / (max - min) * 100).toFixed(1);
        el.style.background = `linear-gradient(to right,#42A5F5 ${pct}%,rgba(255,255,255,0.18) ${pct}%)`;
        const dec  = parseInt(el.dataset.dec || '0');
        const unit = el.dataset.unit || '';
        const nv   = this._popupEl.querySelector(`.wcnv[data-idx="${el.dataset.idx}"]`);
        if (nv) nv.textContent = val.toFixed(dec) + (unit ? ' ' + unit : '');
      };
      el.addEventListener('input', updateSlider);
      el.addEventListener('change', () => {
        const [domain] = el.dataset.entity.split('.');
        const svcDomain = domain === 'input_number' ? 'input_number' : 'number';
        this._hass.callService(svcDomain, 'set_value', { entity_id: el.dataset.entity, value: parseFloat(el.value) });
      });
    });

    // Select-Dropdowns
    (/** @type {NodeListOf<HTMLInputElement & HTMLElement>} */ (this._popupEl.querySelectorAll('.wcslt'))).forEach(el => {
      el.addEventListener('change', () => {
        const [domain] = el.dataset.entity.split('.');
        const svcDomain = domain === 'input_select' ? 'input_select' : 'select';
        this._hass.callService(svcDomain, 'select_option', { entity_id: el.dataset.entity, option: el.value });
      });
    });
  }

  _renderControl(ctrl, i) {
    const st    = this._hass?.states[ctrl.entity];
    const label = ctrl.label || st?.attributes?.friendly_name || ctrl.entity || '–';
    const icon  = st?.attributes?.icon || (ctrl.type === 'switch' ? 'mdi:toggle-switch' : 'mdi:format-list-bulleted');
    const sep   = 'border-bottom:1px solid rgba(255,255,255,0.07);';

    if (ctrl.type === 'switch') {
      const isOn  = st?.state === 'on';
      const color = isOn ? '#4CAF50' : 'rgba(255,255,255,0.35)';
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:15px 0;${sep}">
          <div style="display:flex;align-items:center;gap:13px;">
            <ha-icon icon="${icon}" style="--mdc-icon-size:22px;color:${color};flex-shrink:0;"></ha-icon>
            <span style="font-size:14px;font-weight:500;color:rgba(255,255,255,0.88);">${label}</span>
          </div>
          <div class="wcsw" data-entity="${ctrl.entity}" data-idx="${i}"
               style="width:48px;height:27px;border-radius:14px;background:${isOn ? '#4CAF50' : 'rgba(255,255,255,0.15)'};position:relative;cursor:pointer;flex-shrink:0;transition:background 0.2s;">
            <div class="wckn" style="position:absolute;top:3px;left:${isOn ? '23px' : '3px'};width:21px;height:21px;border-radius:50%;background:#fff;transition:left 0.2s;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>
          </div>
        </div>`;
    }

    if (ctrl.type === 'number') {
      const min   = parseFloat(st?.attributes?.min  ?? 0);
      const max   = parseFloat(st?.attributes?.max  ?? 100);
      const step  = parseFloat(st?.attributes?.step ?? 1);
      const unit  = st?.attributes?.unit_of_measurement || '';
      const cur   = parseFloat(String(st?.state ?? min));
      const pct   = isNaN(cur) ? 0 : ((cur - min) / (max - min) * 100).toFixed(1);
      const dec   = step < 1 ? (String(step).split('.')[1]?.length || 1) : 0;
      const disp  = isNaN(cur) ? '–' : cur.toFixed(dec) + (unit ? ' ' + unit : '');
      return `
        <div style="padding:15px 0;${sep}">
          <div style="display:flex;align-items:center;gap:13px;margin-bottom:14px;">
            <ha-icon icon="${icon}" style="--mdc-icon-size:22px;color:rgba(255,255,255,0.6);flex-shrink:0;"></ha-icon>
            <span style="font-size:14px;font-weight:500;color:rgba(255,255,255,0.88);">${label}</span>
            <span class="wcnv" data-idx="${i}" style="margin-left:auto;font-size:14px;font-weight:700;color:#42A5F5;white-space:nowrap;flex-shrink:0;">${disp}</span>
          </div>
          <input type="range" class="wcsld" data-entity="${ctrl.entity}" data-idx="${i}"
                 data-unit="${unit}" data-dec="${dec}"
                 min="${min}" max="${max}" step="${step}" value="${isNaN(cur) ? min : cur}"
                 style="width:100%;height:5px;-webkit-appearance:none;appearance:none;border-radius:3px;outline:none;cursor:pointer;accent-color:#42A5F5;background:linear-gradient(to right,#42A5F5 ${pct}%,rgba(255,255,255,0.18) ${pct}%);">
        </div>`;
    }

    if (ctrl.type === 'select') {
      const options = st?.attributes?.options || [];
      const current = st?.state || '';
      return `
        <div style="padding:15px 0;${sep}">
          <div style="display:flex;align-items:center;gap:13px;margin-bottom:10px;">
            <ha-icon icon="${icon}" style="--mdc-icon-size:22px;color:rgba(255,255,255,0.6);flex-shrink:0;"></ha-icon>
            <span style="font-size:14px;font-weight:500;color:rgba(255,255,255,0.88);">${label}</span>
          </div>
          <select class="wcslt" data-entity="${ctrl.entity}" data-idx="${i}"
                  style="width:100%;padding:10px 36px 10px 12px;border-radius:10px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#fff;font-size:13px;outline:none;cursor:pointer;-webkit-appearance:none;appearance:none;background-image:url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22><path fill=%22rgba(255,255,255,0.5)%22 d=%22M7 10l5 5 5-5z%22/></svg>');background-repeat:no-repeat;background-position:right 8px center;background-size:22px;box-sizing:border-box;">
            ${options.map(o => `<option value="${o}" style="background:#1a1a2e;color:#fff;" ${o === current ? 'selected' : ''}>${o}</option>`).join('')}
          </select>
        </div>`;
    }

    return '';
  }

  _render() {
    if (!this._hass) return;
    const cfg = this._config;

    const mainSt  = cfg.entity       ? this._hass.states[cfg.entity]       : null;
    const stateSt = cfg.state_entity ? this._hass.states[cfg.state_entity] : null;
    const powerSt = cfg.power_entity ? this._hass.states[cfg.power_entity] : null;

    const rawState = stateSt?.state ?? mainSt?.state ?? null;

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
    const timerSt    = cfg.timer_entity ? this._hass.states[cfg.timer_entity] : null;
    const timerDisp  = isOn ? _wcFmtTime(timerSt) : null;
    const name       = cfg.name
      || mainSt?.attributes?.friendly_name
      || stateSt?.attributes?.friendly_name
      || (cfg.machine_type === 'dryer' ? 'Trockner' : 'Waschmaschine');
    const br         = cfg.border_radius ?? 16;
    const hasPopup   = cfg.popup_controls?.length > 0;
    const clickable  = hasPopup || (cfg.tap_action?.action ?? 'more-info') !== 'none';

    const popupStates = (cfg.popup_controls || [])
      .map(c => `${c.entity}:${this._hass.states[c.entity]?.state}`).join(',');

    const key = [rawState, isOn, isRunning, powerWatts, timerDisp, popupStates, JSON.stringify(cfg)].join('|');
    if (key === this._lastKey) return;
    this._lastKey = key;

    const iconColor = isOn ? stateColor : 'rgba(255,255,255,0.3)';
    const drumStyle = `transform-box:fill-box;transform-origin:center;${isRunning ? 'animation:drum-spin 3s linear infinite;' : ''}`;

    const washerSVG = `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
           style="width:52px;height:52px;color:${iconColor};">
        <rect x="1" y="1" width="22" height="22" rx="2.5" stroke="currentColor" stroke-width="1.5"/>
        <line x1="1" y1="6.5" x2="23" y2="6.5" stroke="currentColor" stroke-width="1"/>
        <circle cx="4"   cy="3.8" r="1.2" fill="currentColor"/>
        <circle cx="7.5" cy="3.8" r="1.2" fill="currentColor"/>
        <circle cx="20"  cy="3.8" r="1.8" stroke="currentColor" stroke-width="1"/>
        <circle cx="12" cy="14" r="6.5" stroke="currentColor" stroke-width="1.2"/>
        <g style="${drumStyle}">
          <circle cx="12" cy="14" r="4" stroke="currentColor" stroke-width="1"/>
          <circle cx="12"   cy="11.2" r="0.9" fill="currentColor"/>
          <circle cx="14.4" cy="15.4" r="0.9" fill="currentColor"/>
          <circle cx="9.6"  cy="15.4" r="0.9" fill="currentColor"/>
        </g>
      </svg>`;

    const dryerSVG = `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
           style="width:52px;height:52px;color:${iconColor};">
        <rect x="1" y="1" width="22" height="22" rx="2.5" stroke="currentColor" stroke-width="1.5"/>
        <line x1="1" y1="6.5" x2="23" y2="6.5" stroke="currentColor" stroke-width="1"/>
        <circle cx="4.5" cy="3.8" r="1.2" fill="currentColor"/>
        <circle cx="19"  cy="3.8" r="2"   stroke="currentColor" stroke-width="1"/>
        <line x1="19" y1="3.8" x2="19" y2="1.9" stroke="currentColor" stroke-width="0.9" stroke-linecap="round"/>
        <circle cx="12" cy="14" r="6.5" stroke="currentColor" stroke-width="1.2"/>
        <line x1="8"  y1="21.5" x2="10" y2="21.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
        <line x1="11" y1="21.5" x2="13" y2="21.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
        <line x1="14" y1="21.5" x2="16" y2="21.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
        <g style="${drumStyle}">
          <circle cx="12" cy="14" r="4" stroke="currentColor" stroke-width="1"/>
          <line x1="12"    y1="12"    x2="12"    y2="10.5"  stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="13.73" y1="15"    x2="15.03" y2="15.75" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="10.27" y1="15"    x2="8.97"  y2="15.75" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </g>
      </svg>`;

    const machineIcon = cfg.machine_type === 'dryer' ? dryerSVG : washerSVG;

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
          flex-shrink:0; width:72px; height:72px; border-radius:14px;
          display:flex; align-items:center; justify-content:center;
          background:rgba(255,255,255,0.04);
          border:2px solid ${isOn ? stateColor + '55' : 'rgba(255,255,255,0.1)'};
          box-shadow:${isOn ? `0 0 12px 0 ${stateColor}2a` : 'none'};
          transition:border-color 0.3s, box-shadow 0.3s;
          ${isFinished && !isRunning ? 'animation:finish-pop 0.5s ease-out 2 forwards;' : ''}
        }
        @keyframes drum-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes finish-pop { 0%,100%{transform:scale(1)} 50%{transform:scale(1.1)} }
        .details { flex:1; min-width:0; display:flex; flex-direction:column; gap:6px; }
        .name-row { display:flex; align-items:center; justify-content:space-between; gap:8px; }
        .name { font-size:14px; font-weight:600; color:rgba(255,255,255,0.9); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; min-width:0; }
        .timer-badge {
          display:flex; align-items:center; gap:4px; flex-shrink:0;
          font-size:11px; font-weight:700; font-variant-numeric:tabular-nums;
          color:${stateColor};
          background:${stateColor}18;
          border:1px solid ${stateColor}33;
          border-radius:6px; padding:2px 7px;
          white-space:nowrap;
        }
        .timer-badge ha-icon { --mdc-icon-size:13px; }
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
        .power { font-size:12px; font-weight:700; font-variant-numeric:tabular-nums; color:${powerWatts !== null && powerWatts > 5 ? stateColor : 'rgba(255,255,255,0.3)'}; }
        ${hasPopup ? `.popup-hint { font-size:10px; color:rgba(255,255,255,0.25); margin-top:2px; }` : ''}
      </style>
      <div class="card">
        <div class="main">
          <div class="icon-wrap">${machineIcon}</div>
          <div class="details">
            <div class="name">${name}</div>
            ${cfg.show_state !== false ? `
              <div class="state-row">
                <div class="dot"></div>
                <span class="state-label">${stateLabel}</span>
              </div>` : ''}
            <div class="bottom-row">
              <span class="on-badge">${isOn ? 'An' : 'Aus'}</span>
              <div style="display:flex;align-items:center;gap:8px;">
                ${cfg.show_power !== false && powerWatts !== null
                  ? `<span class="power">${_wcFmtPower(powerWatts)}</span>` : ''}
                ${timerDisp ? `
                  <div class="timer-badge">
                    <ha-icon icon="mdi:timer-outline"></ha-icon>
                    ${timerDisp}
                  </div>` : ''}
              </div>
            </div>
            ${hasPopup ? `<span class="popup-hint">Tippen für Steuerung</span>` : ''}
          </div>
        </div>
      </div>
    `;

    if (hasPopup) {
      this.shadowRoot.querySelector('.card').addEventListener('click', () => this._openPopup());
    } else if (clickable) {
      this.shadowRoot.querySelector('.card').addEventListener('click', () => this._handleTap());
    }

    // Popup-Element nach innerHTML-Reset wiederherstellen
    this._ensurePopup();
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
    this._config   = {};
    this._hass     = null;
    this._rendered = false;
  }

  /** @param {LovelaceCardConfig} config */
  setConfig(config) {
    this._config = { ...config };
    if (!Array.isArray(this._config.popup_controls)) this._config.popup_controls = [];
    if (this._rendered) {
      this._syncFields();
    } else {
      this._render();
    }
  }

  /** @param {HomeAssistant} hass */
  set hass(hass) {
    this._hass = hass;
    if (!this._rendered) {
      this._render();
    } else {
      const root   = this.shadowRoot;
      const active = root.activeElement;
      const ef     = root.getElementById('entityFields');
      const pc     = root.getElementById('popupControlsList');
      if (!active || !ef || !ef.contains(active)) this._rebuildEntityFields();
      if (!active || !pc || !pc.contains(active)) this._updatePopupControls();
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

    [['field_entity','entity'],['field_state_entity','state_entity'],
     ['field_power_entity','power_entity'],['field_timer_entity','timer_entity']]
      .forEach(([fid, key]) => {
        const el  = /** @type {HTMLInputElement|null} */ (root.getElementById(fid)?.querySelector('input[type=text]'));
        const btn = root.getElementById(fid)?.querySelector('button');
        if (el && active !== el) {
          el.value = c[key] || '';
          if (btn) btn.style.display = c[key] ? 'block' : 'none';
        }
      });

    const nameEl = /** @type {HTMLInputElement|null} */ (root.getElementById('name'));
    if (nameEl && active !== nameEl) nameEl.value = c.name || '';
    const asEl = /** @type {HTMLInputElement|null} */ (root.getElementById('active_states'));
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
    row.appendChild(input); row.appendChild(clrBtn);

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

    wrap.appendChild(row); wrap.appendChild(dropdown);
    container.appendChild(wrap);
  }

  _rebuildEntityFields() {
    this._buildEntityField('field_entity',       'Haupt-Entität (An / Aus)',       'entity');
    this._buildEntityField('field_state_entity', 'Programm-Sensor (optional)',     'state_entity');
    this._buildEntityField('field_power_entity', 'Leistungssensor (optional)',     'power_entity');
    this._buildEntityField('field_timer_entity', 'Restzeit-Sensor (optional)',     'timer_entity');
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

  // ---- Popup-Controls Liste ----
  _updatePopupControls() {
    const container = this.shadowRoot.getElementById('popupControlsList');
    if (!container) return;
    const active = this.shadowRoot.activeElement;
    if (active && container.contains(active)) return; // Fokus-Schutz

    container.innerHTML = '';
    const controls = this._config.popup_controls || [];

    if (controls.length === 0) {
      const msg = document.createElement('div');
      msg.style.cssText = 'font-size:12px;color:var(--secondary-text-color,#888);padding:4px 0;';
      msg.textContent = 'Noch keine Steuerelemente hinzugefügt.';
      container.appendChild(msg);
      return;
    }

    controls.forEach((ctrl, i) => {
      const st = this._hass?.states[ctrl.entity];
      const fn = st?.attributes?.friendly_name || ctrl.entity || '';

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:8px;border-radius:8px;background:var(--secondary-background-color,#f5f5f5);margin-bottom:6px;flex-wrap:wrap;';

      // Typ-Auswahl
      const typeSel = document.createElement('select');
      typeSel.style.cssText = 'padding:7px 8px;border-radius:6px;border:1px solid var(--divider-color,#e0e0e0);background:var(--card-background-color,#fff);font-size:12px;color:var(--primary-text-color,#212121);flex-shrink:0;cursor:pointer;';
      typeSel.innerHTML = `<option value="switch" ${ctrl.type==='switch'?'selected':''}>Switch</option><option value="select" ${ctrl.type==='select'?'selected':''}>Select</option><option value="number" ${ctrl.type==='number'?'selected':''}>Number</option>`;
      typeSel.addEventListener('change', () => {
        const ctrls = [...(this._config.popup_controls || [])];
        ctrls[i] = { ...ctrls[i], type: typeSel.value };
        this._config = { ...this._config, popup_controls: ctrls };
        this._emit();
        this._updatePopupControls();
      });

      // Entity-Input mit Autocomplete
      const eWrap = document.createElement('div');
      eWrap.style.cssText = 'position:relative;flex:1;min-width:120px;';

      const eInput = document.createElement('input');
      eInput.type = 'text';
      eInput.value = ctrl.entity || '';
      eInput.placeholder = 'entity_id…';
      eInput.style.cssText = 'width:100%;padding:7px 8px;border-radius:6px;border:1px solid var(--divider-color,#e0e0e0);background:var(--card-background-color,#fff);font-size:12px;color:var(--primary-text-color,#212121);box-sizing:border-box;outline:none;';

      const eDrop = document.createElement('div');
      eDrop.style.cssText = 'position:absolute;top:100%;left:0;right:0;max-height:160px;overflow-y:auto;background:var(--card-background-color,#fff);border:1px solid var(--divider-color,#e0e0e0);border-radius:6px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.15);display:none;margin-top:2px;';

      const showEDrop = (filter) => {
        eDrop.innerHTML = '';
        if (!this._hass || !filter.trim()) { eDrop.style.display = 'none'; return; }
        const lower = filter.toLowerCase();
        const matches = Object.keys(this._hass.states)
          .filter(id => {
            const f = (this._hass.states[id]?.attributes?.friendly_name || '').toLowerCase();
            return id.toLowerCase().includes(lower) || f.includes(lower);
          }).slice(0, 6);
        if (!matches.length) { eDrop.style.display = 'none'; return; }
        matches.forEach(id => {
          const f    = this._hass.states[id]?.attributes?.friendly_name || id;
          const item = document.createElement('div');
          item.style.cssText = 'padding:6px 9px;cursor:pointer;border-bottom:1px solid var(--divider-color,#f0f0f0);';
          item.innerHTML = `<div style="font-size:11px;font-weight:500;">${f}</div><div style="font-size:10px;color:var(--secondary-text-color,#727272);">${id}</div>`;
          item.addEventListener('mouseover', () => { item.style.background = 'var(--secondary-background-color,#f5f5f5)'; });
          item.addEventListener('mouseout',  () => { item.style.background = ''; });
          item.addEventListener('mousedown', ev => {
            ev.preventDefault();
            eInput.value = id;
            eDrop.style.display = 'none';
            const ctrls = [...(this._config.popup_controls || [])];
            ctrls[i] = { ...ctrls[i], entity: id };
            this._config = { ...this._config, popup_controls: ctrls };
            this._emit();
          });
          eDrop.appendChild(item);
        });
        eDrop.style.display = 'block';
      };

      eInput.addEventListener('input',  () => showEDrop(eInput.value));
      eInput.addEventListener('focus',  () => showEDrop(eInput.value));
      eInput.addEventListener('blur',   () => setTimeout(() => { eDrop.style.display = 'none'; }, 150));
      eInput.addEventListener('change', () => {
        const ctrls = [...(this._config.popup_controls || [])];
        ctrls[i] = { ...ctrls[i], entity: eInput.value.trim() };
        this._config = { ...this._config, popup_controls: ctrls };
        this._emit();
      });

      eWrap.appendChild(eInput); eWrap.appendChild(eDrop);

      // Bezeichnung-Input
      const lInput = document.createElement('input');
      lInput.type = 'text';
      lInput.value = ctrl.label || '';
      lInput.placeholder = fn || 'Bezeichnung…';
      lInput.style.cssText = 'flex:1;min-width:80px;padding:7px 8px;border-radius:6px;border:1px solid var(--divider-color,#e0e0e0);background:var(--card-background-color,#fff);font-size:12px;color:var(--primary-text-color,#212121);box-sizing:border-box;outline:none;';
      lInput.addEventListener('change', () => {
        const ctrls = [...(this._config.popup_controls || [])];
        ctrls[i] = { ...ctrls[i], label: lInput.value.trim() || undefined };
        this._config = { ...this._config, popup_controls: ctrls };
        this._emit();
      });

      // Entfernen-Button
      const rmBtn = document.createElement('button');
      rmBtn.textContent = '×';
      rmBtn.title = 'Entfernen';
      rmBtn.style.cssText = 'background:none;border:none;cursor:pointer;color:var(--error-color,#f44336);font-size:18px;padding:0 2px;line-height:1;flex-shrink:0;align-self:center;';
      rmBtn.addEventListener('click', () => {
        const ctrls = [...(this._config.popup_controls || [])];
        ctrls.splice(i, 1);
        this._config = { ...this._config, popup_controls: ctrls };
        this._emit();
        this._updatePopupControls();
      });

      row.appendChild(typeSel); row.appendChild(eWrap); row.appendChild(lInput); row.appendChild(rmBtn);
      container.appendChild(row);
    });
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
        .type-btn.selected { background:var(--primary-color,#03a9f4); color:#fff; border-color:var(--primary-color,#03a9f4); }
        #entityFields { display:flex; flex-direction:column; gap:14px; }
        textarea { resize:vertical; min-height:56px; }
        .add-btn {
          width:100%; padding:9px 14px; border-radius:8px; border:1px dashed var(--divider-color,#ccc);
          background:transparent; cursor:pointer; color:var(--primary-color,#03a9f4);
          font-size:13px; font-weight:500; display:flex; align-items:center; justify-content:center; gap:6px;
        }
        .add-btn:hover { background:var(--secondary-background-color,#f5f5f5); }
        #popupControlsList { display:flex; flex-direction:column; }
      </style>
      <div class="editor">

        <div class="section">Gerätetyp</div>
        <div class="type-buttons" id="typeBtns">
          <button class="type-btn ${(c.machine_type||'washer')==='washer'?'selected':''}" data-type="washer">
            <ha-icon icon="mdi:washing-machine"></ha-icon>Waschmaschine
          </button>
          <button class="type-btn ${c.machine_type==='dryer'?'selected':''}" data-type="dryer">
            <ha-icon icon="mdi:tumble-dryer"></ha-icon>Trockner
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
          <div class="field" id="field_timer_entity"></div>
        </div>
        <div class="hint">Restzeit-Sensor: wird nur angezeigt wenn das Gerät an ist. Unterstützt Sensoren in Minuten, Sekunden und HA-Timer-Entitäten.</div>

        <div class="section">Popup-Steuerung</div>
        <div class="hint">Beim Antippen der Karte erscheint ein Popup mit diesen Bedienelementen. Switch = An/Aus-Schalter, Select = Auswahlliste (z.&nbsp;B. Schleudergang).</div>
        <div id="popupControlsList"></div>
        <button class="add-btn" id="addPopupCtrl">
          <ha-icon icon="mdi:plus" style="--mdc-icon-size:18px;"></ha-icon>
          Steuerung hinzufügen
        </button>

        <div class="section">Zustände</div>
        <div class="field">
          <label>Aktive Zustände (Icon dreht sich)</label>
          <textarea id="active_states" rows="3">${c.active_states || _WC_DEFAULT_ACTIVE}</textarea>
          <span class="hint">Kommagetrennte Zustandsnamen – in diesen Zuständen dreht sich das Icon.</span>
        </div>

        <div class="section">Aktion bei Tippen (ohne Popup)</div>
        <div class="hint">Wird verwendet wenn kein Popup konfiguriert ist.</div>
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

    this._rebuildEntityFields();
    this._updatePopupControls();

    root.getElementById('typeBtns').addEventListener('click', e => {
      const btn = /** @type {HTMLElement|null} */ ((/** @type {HTMLElement} */ (e.target)).closest('[data-type]'));
      if (!btn) return;
      const type = btn.dataset.type;
      (/** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll('.type-btn'))).forEach(b => b.classList.toggle('selected', b.dataset.type === type));
      this._config = { ...this._config, machine_type: type };
      this._emit();
    });
    root.getElementById('name').addEventListener('change', e => {
      this._config = { ...this._config, name: (/** @type {HTMLInputElement} */ (e.target)).value }; this._emit();
    });
    root.getElementById('active_states').addEventListener('change', e => {
      this._config = { ...this._config, active_states: (/** @type {HTMLInputElement} */ (e.target)).value }; this._emit();
    });
    root.getElementById('addPopupCtrl').addEventListener('click', () => {
      const ctrls = [...(this._config.popup_controls || [])];
      ctrls.push({ type: 'switch', entity: '' });
      this._config = { ...this._config, popup_controls: ctrls };
      this._emit();
      this._updatePopupControls();
    });
    root.getElementById('tap_action_type').addEventListener('change', e => {
      this._config = { ...this._config, tap_action: { ...this._config.tap_action, action: (/** @type {HTMLInputElement} */ (e.target)).value } };
      this._emit(); this._updateActionFields();
    });
    root.getElementById('nav_path').addEventListener('change', e => {
      this._config = { ...this._config, tap_action: { ...this._config.tap_action, navigation_path: (/** @type {HTMLInputElement} */ (e.target)).value } }; this._emit();
    });
    root.getElementById('svc_name').addEventListener('change', e => {
      this._config = { ...this._config, tap_action: { ...this._config.tap_action, service: (/** @type {HTMLInputElement} */ (e.target)).value } }; this._emit();
    });
    root.getElementById('url_path').addEventListener('change', e => {
      this._config = { ...this._config, tap_action: { ...this._config.tap_action, url_path: (/** @type {HTMLInputElement} */ (e.target)).value } }; this._emit();
    });
    root.getElementById('show_state').addEventListener('change', e => {
      this._config = { ...this._config, show_state: (/** @type {HTMLInputElement} */ (e.target)).checked }; this._emit();
    });
    root.getElementById('show_power').addEventListener('change', e => {
      this._config = { ...this._config, show_power: (/** @type {HTMLInputElement} */ (e.target)).checked }; this._emit();
    });
    root.getElementById('border_radius').addEventListener('change', e => {
      this._config = { ...this._config, border_radius: parseInt((/** @type {HTMLInputElement} */ (e.target)).value) }; this._emit();
    });
  }
}

customElements.define('washer-card-editor', WasherCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'washer-card',
  name: 'Washer Card',
  description: 'Waschmaschinen- & Trockner-Widget mit Drehanimation, Statusanzeige, Popup-Steuerung (Switch/Select)',
  preview: true,
});
