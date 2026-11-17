# Source and asset notices

## Application and adapted parser

Ratwood Companion is an independent player project, unaffiliated with the Ratwood maintainers. Its application code is distributed under **AGPL-3.0-or-later**; the full license is in `LICENSE`. The public repository provides the application source, maintenance tools and applicable notices.

The markup parser in `parser.js` adapts `parsemarkdown_basic_step1`, `parsemarkdown_basic_step2`, and `parsemarkdown_basic` from [Ratwood 2.0](https://github.com/Rotwood-Vale/Ratwood-2.0), revision `2d61e02c69520dacb0f4edc1d269395713cbeafb`. The previous adaptation used Ratwood Keep revision `74f55d70294af6ac3650d7e2839ef70b3ce7db0d`; preview styles originated in that revision's `html/browser/common.css`. Copyright remains with the upstream contributors. This adaptation is AGPL-3.0-or-later under the upstream source terms.

`tests/upstream-fixtures.json` records 354 input/output pairs executed from those current DM functions with BYOND 516.1688. Its companion metadata records the source hash and revision. The fixtures check the adapted parser; they do not establish compatibility with every later server version.

Guide content, sprites and community references have separate attribution in `guide/NOTICE.md` and the public `credits.html` page. Do not infer an artwork license from the application's code license.

## Pterra font in the historical personal copy

The original personal working copy contains `assets/pterra.ttf`, copied unmodified from Ratwood Keep's `interface/fonts/pterra.ttf` at historical revision `74f55d70294af6ac3650d7e2839ef70b3ce7db0d`. Its embedded metadata states:

> ©1996 Gravy Fonts™ by Margo Chase Design. All rights reserved. Pterra Dactyl was designed by Margo Chase.

Family: Pterra. Style: Regular. Manufacturer: Gravy Fonts, Margo Chase Design.

No separate redistribution grant was established for this font. Public repository and release staging therefore exclude it and use a system serif fallback. The upstream repository's general license is not treated as a separate font license. If the personal file is retained locally, preserve its embedded metadata and this notice.

## Public package boundaries

The public package excludes personal drafts, chat backups, local browser/resource caches, full game clones, `.validation/`, raw community workbook exports and artwork with unestablished redistribution permission. The website does not upload workshop drafts or guide bookmarks. Exported draft JSON can contain private information and is user data, not an application asset.
