"""Export a pinned, read-only research snapshot without changing the game checkout."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import subprocess
import zipfile
from datetime import date

ROOT = Path(__file__).resolve().parents[1]
CHECKOUT = ROOT.parent / 'lab' / 'Ratwood-2.0'
PATHS = ['code/__HELPERS/text.dm', 'code/__HELPERS/sanitize.dm', 'code/__DEFINES', 'roguetown.dme', 'code/game/objects',
         'code/datums/armor.dm', 'code/datums/components/storage',
         'code/game/rotational_objects', 'code/game/turfs', 'code/modules/surgery/revive_chair.dm',
         'code/modules/mob/living/carbon/human/species_types/roguetown/construct',
         'code/datums/character_flaw', 'code/__DEFINES/charflaws.dm', 'code/datums/status_effects',
         'code/modules/projectiles', 'code/modules/clothing', 'code/modules/reagents',
         'code/modules/roguetown', 'code/modules/surgery/organs', 'code/modules/surgery/bodyparts',
         'code/__DEFINES/traits.dm', 'code/__DEFINES/skills.dm', 'code/datums/skills', 'code/datums/skill_holder.dm',
         'code/datums/special_traits', 'code/datums/brewing_recipes',
         'code/modules/jobs/job_types/roguetown', 'code/modules/spells',
         'code/modules/roguetown/roguecrafting', 'code/modules/mob/living/simple_animal/rogue',
         'code/modules/farming', 'code/game/objects/items/rogueitems/skillbooks.dm',
         'modular/Neu_Food/code', 'html/changelogs', 'LICENSE', 'README.md']


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--revision', required=True)
    parser.add_argument('--checkout', type=Path, default=CHECKOUT if CHECKOUT.exists() else ROOT.parent / '.cache/ratwood-source')
    parser.add_argument('--no-fetch', action='store_true', help='Use an already fetched local revision.')
    args = parser.parse_args()
    checkout = args.checkout.resolve()
    if not (checkout / '.git').exists():
        checkout.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(['git', 'clone', '--depth=1', '--filter=blob:none', '--no-checkout', 'https://github.com/Rotwood-Vale/Ratwood-2.0.git', str(checkout)], check=True)
    if not args.no_fetch:
        ref = args.revision.removeprefix('origin/')
        subprocess.run(['git', '-C', str(checkout), 'fetch', '--no-tags', 'origin', ref], check=True)
    revision = subprocess.check_output(['git', '-C', str(checkout), 'rev-parse', (args.revision if args.no_fetch else 'FETCH_HEAD') + '^{commit}'], text=True).strip()
    available = set(subprocess.check_output(['git', '-C', str(checkout), 'ls-tree', '-r', '--name-only', revision], text=True).splitlines())
    requested = set(PATHS)
    # Modular equipment definitions live beside artwork; export code subtrees only.
    for source in available:
        if source.startswith('modular') and source.endswith('.dm'):
            requested.add(source.split('/code/',1)[0]+'/code' if '/code/' in source else source)
    prior_manifest=ROOT/'sources/ratwood-current/manifest.json'
    if prior_manifest.exists():
        requested.update(f['path'] for f in json.loads(prior_manifest.read_text())['files'])
    for old_base in (ROOT / 'sources').glob('ratwood-2*'):
        if old_base.is_dir():
            requested.update(file.relative_to(old_base).as_posix() for file in old_base.rglob('*.dm'))
    paths = [p for p in requested if p in available or any(f.startswith(p + '/') for f in available)]
    paths = [p for p in paths if not any(p.startswith(parent + '/') for parent in paths if parent != p)]
    archive = subprocess.check_output(['git', '-C', str(checkout), 'archive', '--format=zip', revision, '--', *sorted(paths)])
    base = ROOT / 'sources' / 'ratwood-current'
    previous_path = base / 'manifest.json'
    previous = json.loads(previous_path.read_text()) if previous_path.exists() else {}
    files, excluded = [], []
    with zipfile.ZipFile(io.BytesIO(archive)) as source:
        for entry in source.infolist():
            path = Path(entry.filename)
            if entry.is_dir() or path.suffix not in ['.dm', '.dme', '.yml', '.yaml', '.md'] and entry.filename != 'LICENSE':
                continue
            if any(p in path.parts for p in ['lewd', 'sexcon']):
                excluded.append({'path':entry.filename,'reason':'Explicit adult interaction implementation excluded from this source snapshot.'})
                continue
            data = source.read(entry)
            target = base / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            files.append({'path': entry.filename, 'sha256': hashlib.sha256(data).hexdigest()})
    old = {f['path']: f['sha256'] for f in previous.get('files', [])}
    current = {f['path']: f['sha256'] for f in files}
    for retired in old.keys() - current.keys():
        target=(base/retired).resolve()
        if not target.is_relative_to(base.resolve()):
            raise ValueError('Snapshot path escapes its root: '+retired)
        if target.is_file():target.unlink()
    manifest = {'repository': 'Rotwood-Vale/Ratwood-2.0', 'revision': revision, 'reviewed': date.today().isoformat(), 'files': files, 'excluded':excluded,
                'changes': {'previousRevision': previous.get('revision'), 'added': sorted(current.keys() - old.keys()),
                            'removed': sorted(old.keys() - current.keys()), 'changed': sorted(p for p in current.keys() & old.keys() if current[p] != old[p])}}
    previous_path.write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({'revision': revision, 'files': len(files), 'changes': {k: len(v) if isinstance(v, list) else v for k, v in manifest['changes'].items()}}))


if __name__ == '__main__':
    main()
