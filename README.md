# 🫧 Washer Card

Eine Lovelace-Karte für Home Assistant im Glasmorphism-Stil für Waschmaschinen und Trockner. Das Icon dreht sich dynamisch, wenn das Gerät aktiv ist. Unterstützt Samsung SmartThings und andere Integrationen mit Programm-Status-Sensoren.

## ✨ Features

- **Drehende Animation** – das Drum-Icon rotiert, solange ein aktiver Waschgang läuft
- **Samsung-Zustände** – alle SmartThings-Programmzustände mit deutschen Bezeichnungen und Farbkodierung
- **Flexible Entitäten** – Haupt-Entität (An/Aus), optionaler Programm-Sensor und Leistungssensor
- **Waschmaschine oder Trockner** – wechselt das Icon je nach Gerätetyp
- **Tap-Aktion** – frei konfigurierbar (mehr Infos, toggle, navigation, service, URL)
- **Visueller Editor** – alles per Maske einstellbar, kein YAML nötig
- **Glasmorphism-Design** – passend zu den anderen Widgets

## 📦 Installation

### Über HACS (empfohlen)

1. HACS → Frontend → ⋮ → **Custom Repositories**
2. URL: `https://github.com/pquandel2-alt/pq_washer_card` → Typ: **Lovelace**
3. Installieren und Seite neu laden

### Manuell

1. `washer-card.js` nach `/config/www/` kopieren
2. In `configuration.yaml` unter `lovelace → resources` eintragen:
   ```yaml
   resources:
     - url: /local/washer-card.js
       type: module
   ```

## ⚙️ Konfiguration

### Über den visuellen Editor (empfohlen)

1. Karte hinzufügen → **Washer Card** auswählen
2. **Gerätetyp** wählen: Waschmaschine oder Trockner
3. **Haupt-Entität** eintragen (An/Aus – z. B. ein Switch oder Sensor)
4. Optional: **Programm-Sensor** für Statusanzeige und Drehanimation
5. Optional: **Leistungssensor** für Verbrauchsanzeige
6. **Aktive Zustände** anpassen – in diesen Zuständen dreht sich das Icon

### Per YAML

#### Minimal

```yaml
type: custom:washer-card
machine_type: washer
name: Waschmaschine
entity: switch.waschmaschine
```

#### Mit Samsung SmartThings

```yaml
type: custom:washer-card
machine_type: washer
name: Samsung Waschmaschine
entity: switch.samsung_washer_run_cycle
state_entity: sensor.samsung_washer_job_state
power_entity: sensor.samsung_washer_power
tap_action:
  action: more-info
```

#### Trockner

```yaml
type: custom:washer-card
machine_type: dryer
name: Trockner
state_entity: sensor.samsung_dryer_job_state
power_entity: sensor.samsung_dryer_power
tap_action:
  action: toggle
```

#### Vollständig

```yaml
type: custom:washer-card
machine_type: washer
name: Waschmaschine
entity: switch.waschmaschine
state_entity: sensor.waschmaschine_status
power_entity: sensor.waschmaschine_power
active_states: wash,pre_wash,ai_wash,rinse,ai_rinse,spin,ai_spin,air_wash,weight_sensing,drying,cooling,wrinkle_prevent
show_state: true
show_power: true
border_radius: 16
tap_action:
  action: more-info
```

## 🔧 Optionen

| Option | Typ | Standard | Beschreibung |
|---|---|---|---|
| `machine_type` | string | `washer` | Gerätetyp: `washer` oder `dryer` |
| `name` | string | Friendly Name | Anzeigename |
| `entity` | string | – | Haupt-Entität (An/Aus) |
| `state_entity` | string | – | Programm-Sensor (zeigt aktuellen Waschgang) |
| `power_entity` | string | – | Leistungssensor (W oder kW) |
| `active_states` | string | Samsung-Standard | Kommagetrennte Zustände, bei denen das Icon rotiert |
| `show_state` | boolean | `true` | Programmstatus anzeigen |
| `show_power` | boolean | `true` | Leistung anzeigen |
| `border_radius` | number | `16` | Eckenradius in px |
| `tap_action` | object | `more-info` | Aktion bei Tippen (siehe unten) |

## 👆 Tap-Aktionen

```yaml
tap_action:
  action: more-info          # Mehr-Infos-Dialog

tap_action:
  action: toggle             # An/Aus schalten (benötigt entity)

tap_action:
  action: navigate
  navigation_path: /lovelace/waschkeller

tap_action:
  action: call-service
  service: homeassistant.toggle
  service_data:
    entity_id: switch.waschmaschine

tap_action:
  action: url
  url_path: https://...

tap_action:
  action: none               # Keine Aktion
```

## 🔵 Programmzustände (Samsung SmartThings)

| Zustand | Deutsch | Farbe |
|---|---|---|
| `wash` / `ai_wash` / `pre_wash` | Waschen / KI-Waschen / Vorwäsche | 🔵 Blau |
| `rinse` / `ai_rinse` | Spülen / KI-Spülen | 🔵 Hellblau |
| `spin` / `ai_spin` | Schleudern / KI-Schleudern | 🟣 Lila |
| `air_wash` | Luftwäsche | 🩵 Cyan |
| `weight_sensing` | Gewichtsmessung | ⚫ Grau |
| `drying` | Trocknen | 🟠 Orange |
| `cooling` | Abkühlen | 🩵 Dunkelcyan |
| `wrinkle_prevent` | Knitterschutz | 🟣 Violett |
| `finish` | Fertig | 🟢 Grün |
| `delay_wash` | Zeitvorwahl | ⚫ Dunkelgrau |
| `freeze_protection` | Frostschutz | 🔵 Hellblau |
| `none` | Standby | – |

Eigene Zustände können über das Feld `active_states` ergänzt werden.

## 🔗 Verwandte Projekte

- [Energy Card](https://github.com/pquandel2-alt/pq_energy_card) – Stromverbrauch aller Geräte im gleichen Glasstil
- [Glass Button Card](https://github.com/pquandel2-alt/pq_glass-button-card) – Konfigurierbarer Button im gleichen Glasstil
- [Battery Card](https://github.com/pquandel2-alt/pq_battery_card) – Batteriestände im gleichen Glasstil
- [Trash Widget Card](https://github.com/pquandel2-alt/pq_trash_widget_card) – Müllabholtermin im gleichen Glasstil
- [Weather Widget Card](https://github.com/pquandel2-alt/pq_weather_widget_card) – Wetter im gleichen Glasstil
