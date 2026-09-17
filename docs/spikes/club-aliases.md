# Spike — les clubs cherchés par le nom qu'on leur donne

*Septembre 2026. Livré et branché sur la recherche réelle, mais la question du sourcing à
l'échelle reste ouverte — c'est l'objet de cette note.*

## Le problème

Personne ne dit « Stade Rochelais ». On dit « La Rochelle ». Un joueur qui tape `LA R…`
ne voyait apparaître aucun club, parce que la recherche comparait la saisie au nom
officiel et à rien d'autre. Même chose pour `UBB`, `MHR`, `RCT`, `ASM` — les formes qui
sont, en pratique, les seules employées.

C'est une classe de problème différente des accents et de la ponctuation (réglés dans la
même livraison par `search_normalize`, cf. `008_search_normalization.sql`) : là il s'agit
d'écrire correctement le même nom, ici il s'agit d'un **autre nom**. Aucune normalisation
ne fait le pont entre « Stade Rochelais » et « La Rochelle ». Il faut de la donnée.

## Ce qui a été construit

Une table `club_aliases` (008) : `(club_id, sport, alias, search_alias, source)`, FK
composite sur `clubs (id, sport)` pour hériter de l'invariant d'espace `sport` posé par
006, index GIN trigramme sur `search_alias`.

La fonction `search_clubs()` fait l'`UNION ALL` des correspondances sur le nom officiel et
sur les alias, puis un `DISTINCT ON (club_id)` qui conserve la meilleure. Elle renvoie
`matched_alias` : `NULL` si c'est le nom officiel qui a matché, sinon l'alias. L'UI s'en
sert pour afficher **« Stade Rochelais · La Rochelle »**, ce qui répond à la question
qu'un joueur se pose en voyant la ligne : *pourquoi ce club apparaît-il ?*

Seed (009) : 48 alias rugby. Une bonne moitié n'est pas une découverte — elle dormait dans
`scripts/rugby/lib/clubsIndex.ts`, où la même connaissance servait déjà à réconcilier les
noms courts d'allrugby.com avec `clubs.csv` au moment de l'import. Le spike l'a surtout
remontée des scripts vers la base, là où le joueur en profite.

**Coût** : une table, un index, une fonction SQL. La recherche club passe d'un `.ilike()`
à un `.rpc()`. Aucun surcoût perceptible : le `DISTINCT ON` porte sur ≤ 40 lignes.

## La question ouverte : d'où viennent les alias à l'échelle ?

Le seed couvre le rugby français, soit **48 alias sur 82 clubs rugby** et **0 sur les 176
clubs football**. Les chiffres à jour se relisent avec la requête 4 en bas de 009. Trois
pistes, par ordre de ce que je recommande :

### 1. Dérivation par règles, à mesurer avant de l'écrire

Une grande partie des alias français est mécanique : retirer le préfixe ou le suffixe de
forme juridique/sportive (`FC`, `RC`, `AS`, `US`, `SU`, `CA`, `Stade`, `Union`, `Olympique`,
`Sporting`) laisse la ville — `RC Toulon` → `Toulon`, `CA Brive` → `Brive`,
`US Carcassonne` → `Carcassonne`. Et l'initialisme se dérive des majuscules
(`Union Bordeaux Bègles` → `UBB`).

Mais la règle casse exactement là où le besoin est le plus fort : `Stade Rochelais` ne
donne pas « La Rochelle » (adjectif, pas toponyme), et c'est vrai de tous les gentilés —
Toulousain, Paloise, Montois, Aurillacois, Bayonnais. Or ce sont les clubs les plus joués.

**À faire avant d'implémenter** : appliquer la règle à froid sur les 82 clubs rugby, la
confronter aux 48 alias curés, et mesurer le taux de recouvrement. Si la règle retrouve
moins de ~60 % du seed manuel, elle ne porte pas le football toute seule. Les lignes
générées iraient dans la table avec `source = 'rule:v1'`, donc rejouables et effaçables
sans toucher au curé.

### 2. Import externe

Wikidata expose des `altLabel` par club et par langue — c'est la source la plus propre pour
les gentilés et les exonymes (« Trévise », « Édimbourg »), précisément ce que la règle rate.
Le dataset Transfermarkt déjà utilisé pour le football (cf. la note *Football data source*)
porte aussi des noms courts exploitables. Coût : un script d'import et une passe de revue,
comme pour les imports existants. C'est la seule piste qui monte à 176 clubs football sans
curation manuelle.

### 3. Curation à la demande

Ne rien pré-remplir de plus et ajouter les alias au fil des manques constatés. Viable
seulement si l'on sait ce que les gens tapent sans résultat — donc suppose de logguer les
recherches à zéro résultat, ce qui n'existe pas aujourd'hui. À garder comme complément des
deux autres, pas comme stratégie principale.

## Recommandation

Mesurer (1) d'abord, parce que c'est une demi-journée et que le résultat détermine s'il
faut (2). Quoi qu'il arrive, le football n'aura pas d'alias sans (2) : personne ne va curer
176 clubs à la main.

## Pièges rencontrés, à ne pas réapprendre

- **L'ambiguïté d'alias est le vrai risque.** Deux clubs d'un même sport derrière un seul
  alias normalisé rendent la liste trompeuse. La contrainte `PRIMARY KEY (club_id, alias)`
  ne l'empêche pas — elle empêche le doublon, pas la collision. La requête de contrôle 2
  en bas de 009 la détecte ; elle devra tourner après tout import automatique.
- **Un alias court pollue le classement.** `BO` ou `CO` matchent en sous-chaîne un grand
  nombre de noms. Le tri exact → préfixe → `similarity()` les remonte correctement, mais
  c'est la raison pour laquelle le classement n'est pas resté alphabétique.
- **Résoudre les clubs par nom, pas par id, dans un seed.** Les ids sont des UUID générés à
  l'import et diffèrent d'un environnement à l'autre. 009 joint sur `search_name`, et
  signale les paires non résolues au lieu de les perdre en silence.
- **Une curation manuelle existait déjà**, cachée dans les scripts d'import. Avant d'en
  écrire une nouvelle, chercher ce que les imports ont dû résoudre : ils rencontrent les
  mêmes écarts de nommage, plus tôt.
