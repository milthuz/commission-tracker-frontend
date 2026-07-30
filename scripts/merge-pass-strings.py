#!/usr/bin/env python3
"""Recable le deck de copie de La Passe (SH-22) dans l'i18n de l'application.

Le designer livre `strings.en.json` / `strings.fr.json` : deux fichiers a cles
appariees, copie complete et definitive. Le brief interdit de paraphraser ou de
re-traduire — on les cable TELS QUELS, sous la cle `pass`. Ce script existe pour que
la prochaine livraison du designer soit un re-run, pas une reprise a la main.

    python scripts/merge-pass-strings.py <dossier_du_bundle>

Deux transformations, et deux seulement :

1. `provinces` — les deux decks trient les 13 provinces alphabetiquement DANS LEUR
   PROPRE LANGUE, donc dans des ordres DIFFERENTS. Apparier les deux listes par
   position intervertirait la Nouvelle-Ecosse et les Territoires du Nord-Ouest (et
   decalerait tout le reste). On les reindexe par code des l'import : c'est le seul
   endroit ou l'ordre du deck compte encore.

2. `tierSets` — le deck embarque trois jeux de noms de paliers pour la revue de
   design. Un seul est retenu ("Commis / Sous / Chef", mots francais donc identiques
   dans les deux langues). Le selecteur ne doit pas etre livre (brief, regle 7).

Le script verifie que EN et FR restent apparies apres transformation et que le
contenu preexistant des fichiers i18n est intact.
"""
import collections
import io
import json
import os
import sys

I18N = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'i18n')

# L'ordre est celui du deck, dans chaque langue. Si le designer reordonne ses listes,
# c'est ICI qu'il faut suivre — nulle part ailleurs.
PROVINCE_ORDER = {
    'en': ['AB', 'BC', 'MB', 'NB', 'NL', 'NT', 'NS', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'],
    'fr': ['AB', 'BC', 'PE', 'MB', 'NB', 'NS', 'NU', 'ON', 'QC', 'SK', 'NL', 'NT', 'YT'],
}
TIER_KEYS = ['commis', 'sous', 'chef']


def leaf_paths(node, prefix=''):
    """Chaque chaine finale, par son chemin — pour comparer EN et FR cle a cle."""
    if isinstance(node, dict):
        for key, value in node.items():
            yield from leaf_paths(value, '%s.%s' % (prefix, key))
    elif isinstance(node, list):
        for index, value in enumerate(node):
            yield from leaf_paths(value, '%s[%d]' % (prefix, index))
    else:
        yield prefix


def merge(bundle_dir):
    merged = {}
    for lang in ('en', 'fr'):
        deck = json.load(io.open(os.path.join(bundle_dir, 'strings.%s.json' % lang), encoding='utf-8'))

        provinces = deck.pop('provinces')
        if len(provinces) != len(PROVINCE_ORDER[lang]):
            raise SystemExit('%s : %d provinces dans le deck, %d codes attendus — '
                             'le deck a change, verifier PROVINCE_ORDER.'
                             % (lang, len(provinces), len(PROVINCE_ORDER[lang])))
        deck['provinceNames'] = dict(zip(PROVINCE_ORDER[lang], provinces))

        tiers = deck.pop('tierSets')['recommended']
        deck['tiers'] = dict(zip(TIER_KEYS, tiers))
        deck.pop('_meta', None)
        merged[lang] = deck

    en_paths, fr_paths = set(leaf_paths(merged['en'])), set(leaf_paths(merged['fr']))
    if en_paths != fr_paths:
        raise SystemExit('EN et FR ne sont plus apparies : %s' % sorted(en_paths ^ fr_paths)[:10])

    for lang in ('en', 'fr'):
        path = os.path.join(I18N, '%s.json' % lang)
        base = json.load(io.open(path, encoding='utf-8'), object_pairs_hook=collections.OrderedDict)
        before = {k: v for k, v in base.items() if k != 'pass'}

        # Tout ce qui vit sous `pass` sans venir du deck est CONSERVE : le design laisse des
        # trous reconnus (l'adhesion n'est pas dessinee, `pass.join` est de nous), et une
        # affectation seche les effacerait a la prochaine livraison du designer — en
        # silence, puisque i18next affiche simplement la cle brute a la place.
        kept = {k: v for k, v in (base.get('pass') or {}).items() if k not in merged[lang]}
        if kept:
            print('conservees hors deck : %s' % ', '.join(sorted(kept)))
        base['pass'] = collections.OrderedDict(list(merged[lang].items()) + list(kept.items()))
        after = {k: v for k, v in base.items() if k != 'pass'}
        if before != after:
            raise SystemExit('%s : le contenu preexistant aurait ete modifie — abandon.' % path)
        io.open(path, 'w', encoding='utf-8').write(json.dumps(base, ensure_ascii=False, indent=2) + '\n')

    print('OK — %d chaines cablees sous `pass`, EN et FR apparies.' % len(en_paths))


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    merge(sys.argv[1])
