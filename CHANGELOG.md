# Changes

## 2026-11-17 · Companion revamp

- Updated the workshop parser to the pinned current Ratwood color and numbered-list behavior; verified 354 outputs against the real DM parser with BYOND 516.1688.
- Added workshop JSON export and file/paste import, with previews and explicit selection of the fields to replace.
- Added earlier-snapshot recovery, safety snapshots before replacement, and per-field undo for imports.
- Kept imports usable when browser storage fails, with session recovery and an export-before-closing warning.
- Added navigation between the workshop and guide, local-file-to-hosted migration guidance, and larger workshop controls and labels.
- Added a shared credits page and public-distribution notices separating licensed source material from personal research assets.
- Expanded the public guide to 5,126 topics and 3,146 items, with current source recipes, acquisition routes, traits, roles, skills, conditions and heartbeast answer tables.
- Matched 2,725 catalogue items to exact current-revision sprites. Other items retain licensed historical artwork or clear category icons.
- Reconciled all 114 cookbook entries. Raelesini and unresolved source declarations retain explicit research gaps.
- Added route-specific ingredient diagrams, expandable prerequisites, written steps, and item totals where quantities and yields support them.
- Made search global, added ordinary-question handling and spelling suggestions, and preserved browser navigation, catalogue position and focus.
- Added bookmark export/import and compact-window synchronization; increased text and control sizes.
- Added a reproducible public build, daily source checks, change reports, and tested deployment packaging. Restricted GitHub policies fall back to a review branch/link without expanding review permissions.
- Update proposals flag previously managed references absent from a new import and retain reviewed artwork until replacement licenses are checked.

Source revision: `2d61e02c69520dacb0f4edc1d269395713cbeafb`. Source checks and parser fixtures do not establish the version deployed on the live server.
