# Pinned native mechanics fixtures

`./run.ps1` prepares exact unmodified source blocks from `guide/sources/ratwood-current` revision `2d61e02c69520dacb0f4edc1d269395713cbeafb`, checks their snapshot hashes, compiles with installed BYOND and records 75 assertions. The successful recorded engine is 516.1688. This directory does not alter `lab/Ratwood-2.0` or the earlier recipe fixtures. Source and harness hashes, extraction line ranges and normalized block hashes are recorded in `manifest.json`; `results.json` records expected/actual values and binds the run to that manifest. No game binary belongs in the guide's public payload.

This is **native isolated handler evidence with scaffolding**, not a full-game test. The sparse clone lacks game art/audio/map assets and runtime dependencies. No full-game install/build was attempted. The wrapper types supply only state needed by these exact handlers; audio, XP, messages, logs, cooking-time updates and statistics are no-ops. Reagent storage is an invented dictionary, deletion is immediate, descending sorting is simplified and action completion/cancellation is a configured result. Native `prob(10)` affects only a discarded bubbling sound. There is no client, scheduler, player inventory, skill mind, species or trait simulation.

The assertions cover:

- Normal furnace `handle_smelting`: `smelt_bar_num` 1/4/10 each creates one result, carries supplied quality 6, deletes input and completes progress. Ore insertion, quality rolls, actual ingot behavior, great-furnace alloys, fuel and retrieval are outside this fixture.
- Actual cauldron `process`: unlit and 89-water states cannot progress; 90/180 water both yield the actual antidote recipe's fixed 100 units after 20 progress calls plus a completion call. Synthetic alchemy ingredients feed potency score 3+2 versus rejected 3+1; missing last user retains inputs and produces nothing; skill 1 fails to 90 yuck whereas skill 2 succeeds. Real ingredient definitions, inventory insertion, sorting ties, the real reagent subsystem and destroyed-user lifecycle are not validated.
- Actual armor datum channel arithmetic and `run_armor_check`: all eight datum channels; fixed tier-3 blocked-damage outputs for blunt/fire/acid/bullet/slash/stab/piercing, below/equal/above penetration and a chunked blade. `getarmor` returns a supplied tier, so coverage, equipment layers, integrity, bodyparts and final HP damage are not tested. Important observed source behavior: slash penetration 3 against tier 3 blocks about 30/100; piercing penetration 3 **and 4** against tier 3 blocks 80/100. The source comments alone would give a misleading result. Two fraction comparisons allow 0.0001 for native floating point.
- Actual dough and flatdough `attackby`: rolling without a table, cancelled rolling, successful rolling to one flatdough, cancelled scoring and successful sharp-tool scoring to two raw crackerdough. Inputs disappear on success; tools remain. `do_after` is a configured stub, so this proves branch effects, not real interruption timing. This does not exercise the shared snack slicing implementation or dough-to-two-doughslice interaction.

Each furnace/cauldron scenario creates fresh objects; dough uses one controlled floor and cleans it afterward. The complete suite runs in a fresh daemon process. The launcher bounds its own process to 30 seconds and stops it in `finally`, uses `-safe`, `-invisible`, `-ip 127.0.0.1`, restricts ports to 54397 and closes the world port at startup. No daemon remained after the recorded run.

Windows installation caveat: the installed daemon automatically authenticated its saved BYOND session even with `-invisible`, `world.visibility = 0`, no hub and immediate shutdown. Its log showed only loopback listener addresses, including reopening the same allowed local port. No DreamSeeker/client was launched, no live game was contacted, no account settings were changed, and raw logs containing the local account name are excluded from version control. This setup is not evidence of completely network-isolated execution. Use an isolated host/profile if account-independent execution is required.

The Python regression test validates these stored records and hashes without requiring BYOND:

```powershell
python -m unittest discover -s guide/tests -p test_current_native_mechanics.py
```

Refreshing a fixture requires rerunning the native launcher; editing expected JSON cannot substitute for engine execution. Upstream blocks retain their original license; this harness follows the parent project's AGPL-3.0-or-later license.
