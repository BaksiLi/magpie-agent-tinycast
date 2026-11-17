# Release validation

Validated on 2026-11-18 with Magpie 0.1.4097 and Tinycast 0.12.15 on Apple silicon.

- All 12 automated tests pass, including model mapping, recovery, conflict protection, isolated native preferences, and the read-only status service.
- The macOS helper contains arm64 and x86_64 slices, targets macOS 13, and passes ad-hoc signature verification. Intel execution has not been tested.
- Tinycast's real AI Chat command sent `Reply exactly TINYCAST_MAGPIE_OK` using a model under the Magpie connection and displayed `TINYCAST_MAGPIE_OK`.
- Magpie recorded successful HTTP 200 requests attributed to the Tinycast agent at 05:00:18 UTC+08:00. Private usage exports are not included.
- Magpie's Agents panel displayed the connected state and a persistent yellow restart instruction during a temporary pending-model update. The original model order was restored after the test.
- No Magpie or Tinycast account password is required. The helper does not import Security or call Keychain APIs.

The persistent status panel appears below Magpie's Agents list. Its public plugin API does not provide the built-in GPT row's restart marker.
