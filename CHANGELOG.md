# Changelog

## 0.3.0

- Register Tinycast solely as a Magpie agent. Remove the separate page, panel, and status server.
- Show Magpie’s built-in yellow agent notice after a configuration change.
- Apply the requested connection with a one-shot sync command while Tinycast is closed. Preserve existing connections and recovery records when upgrading.

## 0.2.0

- Add Tinycast to Magpie’s Agents page and synchronize models through its local gateway.
- Use Magpie’s keyless `/agent/tinycast/v1` endpoint with Tinycast usage attribution.
- Keep pending restart guidance visible in a yellow Agents panel.
- Preserve other Tinycast providers and default-model choices, with recovery after interrupted updates.
- Include Tinycast’s lightning icon, source attribution, setup guidance, and a universal macOS settings helper.

This is the first public release. The unpublished 0.1.0 prototype has been replaced; it is not distributed.
