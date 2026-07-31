# La Passe / The Pass — le logo

Direction **B, « le bon de commande au rail »**, choisie le 2026-07-31.

Ces fichiers sont **générés**, jamais dessinés à la main :

```bash
node scripts/build-pass-logo.mjs
```

Le script lit `PASS_MARK_GEOMETRY` dans `src/pages/Pass/passUi.tsx` — la définition
qu'affiche l'application. Des fichiers recopiés à côté auraient divergé dès la première
retouche, et la divergence se serait vue dans les courriels avant de se voir dans le code.
Pour modifier le dessin : **toucher la géométrie, relancer le script.**

## Ce qu'il y a dans le dossier

| Fichier | Usage |
|---|---|
| `pass-mark-on-dark.svg` | symbole blanc, fonds sombres |
| `pass-mark-on-light.svg` | symbole encre `#141414`, fonds clairs |
| `pass-mark-compact-on-{dark,light}.svg` | version réduite, **sous 24 px** |
| `pass-mark-192.png` | courriels — fond opaque `#0f1722` |

Dans l'application, on n'utilise aucun de ces fichiers : le composant `PassMark` dessine
le symbole en `currentColor`, donc il prend la couleur du texte qui l'entoure et une seule
définition sert les deux surfaces. Ces exports servent au **transfert vers le designer**,
aux courriels et à tout ce qui vit hors de React.

## Les règles

**Deux dessins, un seuil.** Sous 24 px, le symbole perd ses deux lignes intérieures et
épaissit son contour. C'était la faiblesse connue de cette direction : quatre dents et deux
traits se referment en une tache. `PassMark` applique le seuil d'après la taille demandée —
ne pas le contourner en forçant le dessin détaillé en petit.

**Le nom n'est jamais un tracé.** « La Passe » et « The Pass » restent du **texte** composé
à côté du symbole, en Satoshi 700. C'est ce qui permet au même logo de servir dans les deux
langues sans version linguistique à maintenir. Ne jamais vectoriser le nom.

**Toujours endossé quand un marchand pourrait ignorer d'où ça vient.** Adhésion, courriels,
page publique : variante `endorsed` (symbole + nom + « par » + logo Cluster). À l'intérieur
du portail, où le contexte est établi, `horizontal` suffit.

**Dégagement.** Il est déjà **dans le fichier** : le billet occupe 34 × 40 dans une boîte de
64, soit ~15 % de marge sur chaque bord. Ne pas recadrer le `viewBox` pour « serrer » le
logo — il perdrait sa respiration et se collerait au texte voisin.

**Couleurs.** Accent `#F58345` (système de design du programme). L'encre est `currentColor`.
⚠️ L'orange du logo **Cluster** est `#FE6523`, volontairement différent : un logo ne se
reteinte pas pour s'accorder à une page. Les deux oranges coexistent, c'est normal.

**Ne pas :** recolorer l'accent · étirer le symbole hors de son rapport 1:1 · poser le
dessin détaillé sous 24 px · vectoriser le nom · utiliser le symbole seul là où l'origine
Cluster n'est pas déjà établie.

## Ce qui reste à faire

Le dessin est une **intention aboutie, pas une charte** : épaisseurs, rythme du bord déchiré
et corrections optiques méritent la main du designer du programme. Ce qui est ici est
cohérent et utilisable tel quel, et lui donne un point de départ précis plutôt qu'une
description.
