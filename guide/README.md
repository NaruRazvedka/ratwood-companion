# Ratwood player's field guide

A compact reference for Ratwood's items, preparation routes and game systems. This is an independent player project. [Credits and sources](../credits.html) identify the community references and upstream licenses.

## Open and search

Open `guide/index.html` from the extracted release, or visit the hosted `/guide/` address. Keep `search.js`, `data.js`, `details/`, the application scripts, styles and assets with the page. Local reading works without a server or internet connection; external reference links need a connection.

Search covers the guide as a whole unless you select a section filter. Names, aliases, ingredients, descriptions and mechanics can find an entry. Ordinary questions such as "How do I get sinew?" also work. Press `/` to focus search. Items contains the sprite-and-name catalogue; Guides contains practical system explanations; Reference contains roles, skills, traits, abilities and other tables. Search results identify their entry type.

Use the available category, quality, preparation method, skill and evidence filters to narrow results. Recipe alternatives retain their own requirements. Browser Back and Forward follow your reading trail; returning to the catalogue restores its context. Existing topic links and merged-entry redirects remain supported.

## Read a recipe

An item description stays visible. Its preparation panel shows one route at a time, including quantities, equipment, skill, yield and ordered written steps. Select a different route only when you intend to follow that complete alternative.

The ingredient diagram starts with direct inputs. Expand an ingredient to see its own preparation and work back toward raw materials. Flour can lead back to milling grain; butterdough has separate flour/dough and butter branches. Alternatives marked “choose one” are not cumulative requirements. The diagram and written instructions follow the same selected route.

Amounts belong to the individual stages. Unknown yields, dynamic conditions and competing alternatives prevent reliable aggregate totals; the guide leaves these unknown instead of estimating. Tools are distinguished from consumed ingredients. Runtime interactions, skill checks and containers can matter even when the ingredients are correct.

Shelf life, quality, base value, storage and aging details stay available in expandable sections. A listed base value is not a guaranteed shop offer. Sprite tinting and inherited artwork can differ in-game. Category symbols identify liquids and unmatched artwork; these interface icons are not game sprites.

## Bookmarks and floating reference

Choose the star on an entry to bookmark it in this browser. Bookmarks remain usable during a storage failure for the current session, but may not survive closing the page. Downloaded files and the hosted website have separate storage. Clearing browser data, switching browsers or using private browsing can remove saved bookmarks. Use Export bookmarks in the sidebar before moving; Import bookmarks previews a merge and skips entries that no longer exist. Import does not erase your other bookmarks.

Open an entry and choose **Float this entry**, or use **Float guide** beside search. Supported browsers can open a Document Picture-in-Picture window; keep the original page open. The compact view keeps the same route and linked ingredient preparation. Reopening floating mode reuses its window.

If picture-in-picture is unavailable or rejected, the guide tries a compact popup. Ordinary popups need manual pinning through your window manager. If popups are blocked, compact mode stays inside the main page. **Return to full view** exits that fallback. Browser support, local-file restrictions and fullscreen game behavior can affect floating windows; pinning above BYOND requires a live check.

## Accuracy and coverage

The supplemental current-source snapshot is pinned to `2d61e02c69520dacb0f4edc1d269395713cbeafb`, reviewed 2026-11-17. Its manifest is `sources/ratwood-current/manifest.json`. It expands player-facing roles, skills, traits, abilities, cauldron recipes and animal butchery. Earlier food procedures and artwork retain their own recorded revisions; they are not relabeled as freshly tested evidence.

The guide distinguishes source-backed procedures, community references, historical material and unresolved gaps. A source match confirms a definition at its recorded revision, not the running server's version or every in-game condition. Some abilities, descriptions and values depend on state that static inspection cannot resolve.

Coverage records account for imported entries and supported source families. An exclusion, unsupported expression or unresolved acquisition route stays in the reports rather than becoming an invented recipe. A missing sprite alone does not prove that an item cannot be made.

The [RATWOOD KEEP - cookbook](https://docs.google.com/spreadsheets/d/1yOoJX5YUkUvg6TAqq3EVadf26AHdJYO8PbJ4sd-bJ84/edit) contributes 114 preparation candidates across four tabs. WIP instructions must be reconciled against source: incomplete methods and copied instructions do not overwrite confirmed recipes.

## Maintain the content

Run commands from the parent project directory. Node and Python are maintenance tools only; readers do not need them. Do not hand-edit generated `data.js`, `search.js` or `details/` bundles.

Refresh from the latest upstream main branch with one command:

```sh
node tools/refresh-guide.cjs
```

To inspect a specific commit or branch, pass it as the final argument: `node tools/refresh-guide.cjs <revision>`. The command requires Git, Node, Python and network access. It downloads or reuses an isolated source checkout, resolves a commit, exports supported source files, regenerates public content, and writes an affected-topic report. It does not publish the site. Review `sources/public-change-report.json` and the coverage changes before accepting the update.

To rebuild the public edition from the retained source records without fetching upstream:

```sh
node guide/tools/build-data.cjs --public
```

The public build uses the sanitized seed and excludes raw workbook rows, copied historical preparation prose and cached client artwork. The private working build `node guide/tools/build-data.cjs` additionally requires the original personal workbook imports and research files, which are intentionally absent from the public repository.

The daily `source-update.yml` workflow runs the refresh and prepares or updates a `codex/` pull request. It also supports manual dispatch. If GitHub blocks automatic pull-request creation, the tested branch remains available and the workflow summary provides a link to open its review manually. Repository review permissions are not expanded automatically. Review the additions, removals, recipe/value changes, unresolved cases and upstream changelog before merging. Changes to `main` run `pages.yml`, which checks and packages the static site before deploying Pages. A failed update is not a published release.

Older food preparation, descriptions, item properties and sprite importers remain separate supported tools under `guide/tools/`. Their source revisions must match their snapshots. Updating a manifest string alone does not refresh those files. Preserve authored explanations and stable IDs; add redirects for renamed or merged entries.

Relevant records include `sources/current-content.json`, `sources/coverage.json`, `sources/recipe-guidance-audit.json`, `sources/ratwood2-preparation-coverage.json`, and `sources/ratwood2-recipe-coverage.json`. Keep known gaps and revision-specific native fixture results in the review. Unsupported source changes require editorial work rather than automatic publication.

## Checks

The public repository's JavaScript checks are:

```sh
node --test tests/*.test.cjs guide/tests/public*.test.cjs guide/tests/recipe-revamp.test.cjs
```

Current-content extraction also has Python checks:

```sh
python -m unittest discover -s guide/tests -p 'test_current_content.py'
```

The original personal working tree has additional historical tests: `node --test guide/tests/*.test.cjs` and `python -m unittest discover -s guide/tests -p 'test_*.py'`. Several require private workbook exports or earlier snapshots, so they are not the public CI command.

Tests cover supported importers, link integrity, source coverage, recipe routes and branches, escaping, search, filters, storage behavior, and floating-window fallbacks. Browser layout, keyboard focus, zoom, local-file loading, and actual clipboard/download permissions need browser checks too. Narrow BYOND fixtures verify only their stated recipe behavior and source revision; they do not simulate a full live round.

For an optional loopback preview, run `python -m http.server 8765 --bind 127.0.0.1`, open `http://127.0.0.1:8765/guide/`, and stop it with Ctrl+C afterward.

## Public distribution

The public repository and Pages artifact must exclude personal drafts, `.validation/`, game clones, cached client resources, unlicensed font files, and raw community workbook exports. Public credits are centralized in [credits.html](../credits.html); source provenance stays in maintenance records without repeated blocks on each item.

Application code uses [AGPL-3.0-or-later](../LICENSE). Sprites retain their upstream terms, including applicable CC BY-SA 3.0 requirements and file-specific exceptions. The [guide notices](NOTICE.md) distinguish the public package from historical personal research assets.
