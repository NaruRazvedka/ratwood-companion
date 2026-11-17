# Ratwood Companion

Two browser tools for Ratwood: a Flavor Text Workshop and a searchable player's field guide. The websites use plain HTML, CSS and JavaScript. Reading and editing need no account, installation, backend or build step.

This is an independent player project, unaffiliated with the Ratwood maintainers. See [credits and sources](credits.html), [source notices](NOTICE.md), and the [guide instructions](guide/README.md).

## Open the websites

Public addresses after a successful GitHub Pages deployment:

- [Flavor Text Workshop](https://narurazvedka.github.io/ratwood-companion/)
- [Player's field guide](https://narurazvedka.github.io/ratwood-companion/guide/)

For offline use, extract the whole release archive and double-click `index.html` for the workshop or `guide/index.html` for the guide. Keep the accompanying scripts and asset folders together. External reference links require an internet connection; local reading and editing do not.

## Flavor Text Workshop

Choose SFW Appearance, NSFW Unclothed, SFW OOC Notes, or NSFW OOC Notes. Each field keeps its own draft, selection and undo history. Type the game's markup into the editor; the full preview updates immediately. The byte count is informational and does not truncate the text.

Select a passage and use a formatting button or Apply color. A color uses six hexadecimal digits, such as `D7A85D`. For a gradient, set the start and end colors, select text, and choose Apply gradient. Gradients preserve whitespace, Unicode graphemes and supported formatting. Select complete color/formatting spans when recoloring; partial existing wrappers can leave malformed markup.

Copy for game copies the active field's original markup. If clipboard access is unavailable, the workshop selects the source for Ctrl+C (⌘C on Mac). Use Ctrl+Z to undo, Ctrl+Shift+Z or Ctrl+Y to redo. Arrow keys, Home and End navigate the draft tabs. Undo history lasts for this page session.

### Back up, move and recover drafts

Open **Back up, import & recover drafts** below the editor.

1. Choose **Export all four drafts**. Check that the JSON file saved. If downloading fails, copy the backup JSON shown in the text box into a private file.
2. In the destination workshop, open the backup file or paste its JSON and choose **Preview backup**.
3. Check the individual fields you want to replace, review their incoming text, then choose **Replace selected drafts**. Previewing alone changes nothing.

Imports preserve unselected fields and retain a safety snapshot of the previous drafts. Each imported field can also be undone in its own tab. To recover earlier text, choose an entry under **Earlier snapshots**, preview it, and select only the fields to restore.

The workshop keeps up to ten persistent safety/session-start snapshots in this browser. If storage fails, editing and import remain available, with recovery held for the current page session only. Export before closing. Recovery cannot restore text lost before a snapshot existed.

Browser storage is separate for downloaded files, the public website, different browsers and private browsing. Moving online does not transfer existing drafts automatically. Export from the old workshop first. Clearing browser data can remove both drafts and snapshots. Two windows editing the same field use the last save; unrelated saved fields are preserved.

Backups can contain private character text. Drafts are never uploaded by the workshop, and backups should not be committed to the repository or shared unintentionally.

## Guide

The [guide instructions](guide/README.md) cover global search, catalogue filters, recipe branches, bookmarks, floating windows, source coverage and content maintenance. Both websites link to one another.

## Parser compatibility

The workshop parser adapts Ratwood 2.0's basic parser at revision `2d61e02c69520dacb0f4edc1d269395713cbeafb`. It preserves replacement order, escaping, numbered lists and incomplete/overlapping markup behavior. Color tokens follow the current upstream alphanumeric pattern and preserve case; the editing controls still require six valid hexadecimal digits. Raw HTML is escaped, and automatic hyperlink generation is disabled. The parser is not CommonMark.

The recorded fixture contains 354 outputs executed from the pinned current DM parser with BYOND 516.1688. These include color boundaries, multiline spans, ordered/unordered list transitions, Unicode, escapes and deterministic generated cases. `tests/upstream-fixtures.meta.json` records the source revision, hash and engine. Future parser changes must be compared against the upstream behavior before altering compatibility. The workshop imposes no source limit, following the reported server behavior; historical source caps are not applied.

The public build excludes Pterra because its separate redistribution rights are not established. Its game preview uses a system serif fallback; typography can differ from BYOND. The original personal working copy may retain the font and its embedded copyright notice. This tool does not access your game account or alter preferences automatically.

## Checks and development

With Node installed, run the public repository's checks from the project folder:

```sh
node --test tests/*.test.cjs guide/tests/public*.test.cjs guide/tests/recipe-revamp.test.cjs
```

With Python installed, check current-content extraction using `python -m unittest discover -s guide/tests -p 'test_current_content.py'`. The personal working tree also has historical guide/importer tests that require retained private workbook exports and earlier source snapshots; these are separate from public CI.

The workshop checks cover markup, gradients, Unicode, selection, undo, tab isolation, restart recovery, export/import, snapshots, storage failures and clipboard fallback. Controller tests use a simulated DOM; passing them does not verify an OS download dialog, real clipboard permission or live BYOND rendering.

For a local browser preview, run `python -m http.server 8765 --bind 127.0.0.1`, then open `http://127.0.0.1:8765/`. Stop it with Ctrl+C afterward. A server is optional for ordinary offline use.

## Publishing and updates

The public repository is [NaruRazvedka/ratwood-companion](https://github.com/NaruRazvedka/ratwood-companion), with the workshop at the Pages root and the guide under `/guide/`. Deployment stages an explicit distributable file set and passes the project checks first.

Never publish local drafts, chat backups, `.validation/`, cached client artwork, full game clones, private research exports or unlicensed workbook copies. Public output uses permitted repository artwork and independently written community-reference explanations. See [guide notices](guide/NOTICE.md).

Run `node tools/refresh-guide.cjs [revision]` to refresh the public content and affected-topic report. Omit the optional revision to check upstream main. The command needs Git, Node, Python and network access; it does not publish.

The daily/manual `source-update.yml` workflow prepares a reviewable update pull request rather than publishing balance updates automatically. `pages.yml` checks and packages accepted updates for GitHub Pages. Accepted content updates deploy from `main`; source revision, review date and [release notes](CHANGELOG.md) should change together. Maintenance commands and coverage reports are documented in the guide README.

## License

Application and adapted parser code use [AGPL-3.0-or-later](LICENSE). Upstream artwork keeps its original license and exceptions. Community authors retain their rights. See [credits](credits.html), [workshop notices](NOTICE.md) and [guide notices](guide/NOTICE.md).
