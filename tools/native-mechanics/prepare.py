"""Extract exact source blocks from the guide's pinned snapshot; never edit the clone."""
import hashlib
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parents[1] / 'guide/sources/ratwood-current'
REVISION = '2d61e02c69520dacb0f4edc1d269395713cbeafb'
SPECS = [
    ('code/modules/roguetown/roguejobs/blacksmith/smelter.dm', '/obj/machinery/light/rogue/smelter/proc/handle_smelting()', '/obj/machinery/light/rogue/smelter/burn_out()'),
    ('code/modules/roguetown/roguecrafting/alchemy/cauldron.dm', '/obj/machinery/light/rogue/cauldron/process()', '/obj/machinery/light/rogue/cauldron/attackby('),
    ('code/datums/armor.dm', '#define ARMORID', '/datum/armor/vv_edit_var('),
    ('code/__DEFINES/roguetown/armor_defines.dm', '#define PEN_NONE', '// Chest / Armor Pieces'),
    ('code/__DEFINES/combat.dm', '#define SHARPNESS_TIER2_THRESHOLD', '#define UNARMED_DAMAGE_DEFAULT'),
    ('code/modules/mob/living/living_defense.dm', '/mob/living/proc/run_armor_check(', '/proc/get_pen_info('),
    ('modular/Neu_Food/code/raw/raw_dough.dm', '/obj/item/reagent_containers/food/snacks/rogue/dough/attackby(', '/*\t.................   Flatdough'),
    ('modular/Neu_Food/code/raw/raw_dough.dm', '/obj/item/reagent_containers/food/snacks/rogue/flatdough/attackby(', '/*\t.................   Tomatoplate'),
    ('code/modules/roguetown/roguecrafting/alchemy/alch_cauldron_recipe_base.dm', '/datum/alch_cauldron_recipe\n', '/datum/alch_cauldron_recipe/proc/'),
    ('code/modules/roguetown/roguecrafting/alchemy/alch_cauldron_recipes.dm', '/datum/alch_cauldron_recipe/antidote\n', '/datum/alch_cauldron_recipe/strong_antidote'),
]


def extract():
    manifest = json.loads((SOURCE / 'manifest.json').read_text())
    assert manifest['revision'] == REVISION
    hashes = {row['path']: row['sha256'] for row in manifest['files']}
    blocks, records = [], []
    for path, start, end in SPECS:
        raw = (SOURCE / path).read_bytes()
        assert hashlib.sha256(raw).hexdigest() == hashes[path], path
        text = raw.decode('utf-8-sig').replace('\r\n', '\n')
        begin = text.index(start)
        finish = text.index(end, begin + len(start))
        block = text[begin:finish]
        blocks.append(block)
        records.append({'path': path, 'sourceSha256': hashes[path],
                        'firstLine': text[:begin].count('\n') + 1,
                        'lastLine': text[:finish].count('\n'),
                        'normalizedBlockSha256': hashlib.sha256(block.encode()).hexdigest()})
    return blocks, records


def main():
    blocks, records = extract()
    generated = HERE / 'generated'
    generated.mkdir(exist_ok=True)
    combined = '\n'.join(blocks)
    (generated / 'upstream.dm').write_text(combined, encoding='utf-8')
    # Stand-in resources satisfy the compiler; playsound is a no-op in this world.
    for resource in re.findall(r"'([^']+\.(?:ogg|dmi))'", combined):
        file = generated / resource
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(b'')
    types = sorted(path for path in set(re.findall(r'/(?:obj|datum/reagent|datum/skill)(?:/\w+)*', combined))
                   if '/proc/' not in path and not path.endswith(('/attackby', '/process')))
    (generated / 'types.dm').write_text('\n'.join(types) + '\n', encoding='utf-8')
    provenance = {'revision': REVISION, 'evidenceKind': 'native-isolated-handler',
                  'sourceBlocks': records, 'target': 'mechanics.dme',
                  'defines': ['TRUE=1', 'FALSE=0', 'DF_USE_TAG=0', 'SKILL_LEVEL_APPRENTICE=2'],
                  'scope': 'Unmodified selected handler bodies and armor datum; explicit scaffolding, not full-game tests.',
                  'scaffolding': ['minimal types and state', 'fixed getarmor tier (no coverage/layer/integrity calculation)', 'dictionary reagent storage', 'immediate deletion',
                                  'descending associative sort (ties not tested)', 'configured do_after result',
                                  'cooktime update and XP no-ops', 'audio/messages/logging/statistics no-ops',
                                  'empty resource placeholders', 'no subsystem scheduler'],
                  'fullGameBlocker': 'Sparse lab clone omits assets/maps and full-game runtime dependencies. No installation or full-game compile attempted.'}
    provenance['harnessFiles'] = [{'path': name, 'sha256': hashlib.sha256((HERE/name).read_bytes()).hexdigest()}
                                  for name in ['prepare.py', 'scaffold.dm', 'checks.dm', 'mechanics.dme', 'run.ps1']]
    provenance['runtime'] = {'bind': '127.0.0.1', 'allowedPorts': [54397], 'safeMode': True,
                             'visibility': 0, 'deadlineSeconds': 30,
                             'rng': 'Native prob(10) only controls a no-op bubble sound; scenarios have deterministic state assertions.',
                             'accountNote': 'Installed Windows daemon automatically authenticates its saved BYOND session even with invisible/visibility=0. No game client is launched and no account settings are changed.'}
    (HERE / 'manifest.json').write_text(json.dumps(provenance, indent=2) + '\n')


if __name__ == '__main__':
    main()
