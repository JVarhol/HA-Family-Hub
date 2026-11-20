# Family Hub Live test card

Install this as a custom Home Assistant dashboard resource. The card reads selected calendars and entity states and runs selected actions through the active Home Assistant session.

## Install on MasonPi

From Mac Terminal, use the SSH address you normally use for the Pi. This example assumes the Home Assistant container's config directory is `/home/pi/homeassistant/config`.

```sh
ssh pi@MasonPi.local 'mkdir -p /home/pi/homeassistant/config/www/family-hub-live'
curl -fLSs -o /tmp/family-hub-live.js https://raw.githubusercontent.com/rmasonIV/HA-Family-Hub/a98cee0ce414463613ed95b315f9fb704ae1d9e3/live/family-hub-live.js &&
  scp /tmp/family-hub-live.js pi@MasonPi.local:/home/pi/homeassistant/config/www/family-hub-live/
```

Enable **Advanced Mode** in your Home Assistant profile if Resources is hidden. In **Settings → Dashboards → ⋮ → Resources**, add `/local/family-hub-live/family-hub-live.js?v=1` as a **JavaScript Module**. If this is your first time creating the `www` directory, restart Home Assistant to enable the `/local/` route.

Create a separate dashboard named **Family Hub Test**. Use a Panel view for a full-width calendar, then add **Family Hub Live** from the card picker. If needed, add a Manual card:

```yaml
type: custom:family-hub-live
calendars: []
actions: []
widgets: []
```

## Configure

Edit the card to select calendars and set the default view. Add up to four Quick Actions and four Quick Widgets. Start with one `light.*` entity and one `sensor.*` entity, then save and try them on the test dashboard.

- Quick Actions support lights, switches and input booleans for toggling, scripts for running, buttons and input buttons for pressing, and closed covers for opening after confirmation.
- Quick Widgets show the name and state of a selected entity. A pollen or temperature sensor makes a good first test. Select a side-by-side or full-width stacked layout.
- Week and Month use live calendar events. Inline forecast icons and richer widget card types are future work.

Save edits in Home Assistant so the configuration is shared with your touchscreen. For a later build, replace the JavaScript file and bump the resource query parameter to reload it.
