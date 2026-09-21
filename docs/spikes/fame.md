# Spike — la fame d'un joueur

*Septembre 2026. Livrée : la métrique est calculée et stockée. Rien ne la lit encore — ni le
tirage aléatoire, ni le comptage des points. C'est délibéré, et c'est l'objet de cette note.*

## Le problème

`findRandom` tirait uniformément sur toute la table. Une partie pouvait donc opposer deux
inconnus parmi 7 823 joueurs de rugby ou 11 455 de football — injouable, et sans recours : rien
dans `players` ne permettait de dire qu'un joueur est plus connu qu'un autre.

Trois usages à venir en dépendent : tirer dans une **bande** de fame, construire le **daily
challenge**, et **compter les points** (un joueur peu connu vaut plus).

## Pourquoi pas « notoriety »

Le premier jet s'appelait `notoriety`. En anglais, *notoriety* est péjoratif : on est
« notorious » pour une mauvaise raison. Le français *notoriété* est neutre — faux ami. Le mot
juste est **fame**. `reputation` aurait été un autre axe (ce qu'on pense de vous, pas si on vous
connaît) et `renown` implique le mérite, que cette métrique ne mesure pas.

## Absolu, pas centile

La première version classait par `percent_rank()` — un centile par sport. Deux défauts :

1. **Le score dépendait de la cohorte, pas du joueur.** Les données sont rafraîchies en bloc
   (une fois par an, ou plus souvent). Ajouter 500 jeunes joueurs déplaçait le score de tout le
   monde alors qu'aucune carrière n'avait changé : un daily challenge n'était plus
   reproductible, et la valeur en points d'un joueur bougeait sans raison le concernant.
2. **Le centile écrasait la magnitude.** 68 % des joueurs sont à 0 sélection, donc tous à
   égalité au centile 0. Repondérer les sélections de 0.30 à 0.50 ne déplaçait Antoine Dupont
   que de 0,6 point — le signal était détruit par le classement lui-même.

Le score absolu règle les deux, et ouvre une simplification : il est calculable ligne à ligne,
donc `fame` est une **colonne générée**. Écrire `fame_details` recalcule `fame` dans la même
instruction. Plus d'étape de recalcul à oublier, plus d'ordre à respecter. Corriger un joueur à
la main ne déplace le score de personne d'autre — vérifié en test.

## La formule

```
fame = round(100 × [ 0.35·s(gamesPlayed, Kg) + 0.45·s(caps, Kc) + 0.20·s(gamesPlayed/seasons, Ki) ])
s(x, K) = min(1, √(x / K))
```

`s` donne des **rendements décroissants**. Avec Kg = 300 :

| matchs | 0 | 10 | 40 | 100 | 200 | 300 | 500 |
|---|---|---|---|---|---|---|---|
| √ | 0.00 | 0.18 | **0.37** | 0.58 | 0.82 | 1.00 | 1.00 |
| linéaire | 0.00 | 0.03 | 0.13 | 0.33 | 0.67 | 1.00 | 1.67 |

Les 40 premiers matchs rapportent autant que les 160 suivants — passer de 0 à 40 fait basculer
d'inconnu à « déjà vu jouer », passer de 250 à 290 ne change rien. Le logarithme faisait la même
chose trop fort (0.65 pour 40 matchs).

Les constantes sont **par sport**, calibrées sur les plafonds observés — le rugby compte la
carrière entière, le football seulement le Big-5 depuis 2012 :

| | rugby | football |
|---|---|---|
| `Kg` matchs | 300 | 600 (p99=438, max=665 Lewandowski) |
| `Kc` sélections | 100 (max 115 Ford) | 180 (p99=100, max=233 Ronaldo) |
| `Ki` matchs/saison | 28 | 45 |

**Les poids sont des a priori, pas un ajustement.** Il n'existe aucune vérité terrain « ce
joueur est connu à 82 % » dans les données : les fitter demanderait des étiquettes. Les
sélections dominent parce qu'elles marquent le fait d'être connu **hors de son club** ; le
volume de matchs suit mais ne suffit pas (Dani Parejo : 616 matchs, 4 sélections, fame 61).

## Ce qui a été testé et écarté

### `seasons` comme terme additif — **non**

`corr(gamesPlayed, seasons) = 0.933` sur les 11 455 joueurs de football. Quasi-redondant :
l'ajouter reviendrait à compter les matchs deux fois. La justification écrite dans la v1
(« ça rattrape les profils sans cellule Matchs ») était **fausse** — 14 727 profils rugby sur
14 727 ont un compte de matchs. Ce cas n'existe pas.

`seasons` gagne sa place comme **diviseur**. `gamesPlayed / seasons` — titulaire ou rotation —
est un vrai signal indépendant. À nombre de matchs égal :

```
                       matchs/saison   sélections moyennes
100-200 matchs  bas 25%     18.6              9.1
                haut 25%    33.9             16.5    ×1.8
200-300 matchs  bas 25%     23.1             16.5
                haut 25%    36.1             28.8    ×1.75
300-450 matchs  bas 25%     27.1             21.9
                haut 25%    39.1             54.2    ×2.5
```

Monotone sur les trois bandes, et l'écart grandit.

### `clubs` — **non**

L'hypothèse « bouger de club = connu de plusieurs publics » contre « bouger = ne pas s'imposer ».
Mesuré à volume comparable, en sélections moyennes :

```
                1 club  2 clubs  3 clubs  4 clubs  5+ clubs
100-200 matchs    12.0     13.4     12.1     11.9      7.7
200-300 matchs    19.4     19.2     21.6     19.0     19.0
300-450 matchs    31.3     37.4     37.9     35.5     27.5
```

Non monotone : ça monte jusqu'à 2–3 clubs puis redescend franchement à 5+. Les deux effets se
neutralisent. En corrélation brute `caps ~ clubs` = 0.209, mais `caps ~ games` = 0.455 et
`games ~ clubs` = 0.585 — soit 0.27 attendu par le seul volume. Une fois le volume retiré,
`clubs` n'apporte rien. Les contre-exemples (Totti, Dupont, Koke) avaient raison.

### Wikipédia — **non**

Écarté au profit des matchs joués : ≈ 40 000 requêtes, résolution de titre ambiguë, et un
arbitrage fr/en qui décide à la place du joueur.

## Ce que ça donne

Répétition complète sur les données rugby réelles — 7 529 joueurs, 44 072 memberships, scores
produits par les vraies fonctions SQL :

```
TOP (extrait)          games caps seas  fame     FOOTBALL          games caps seas  fame
Finn Russell             251   99   13    93     Modrić              585  202   14    99
Gaël Fickou              250   99   13    93     Lewandowski         665  167   14    98
George Ford              238  115   13    92     Messi               522  204   13    97
Owen Farrell             214  104   13    90     Ronaldo             482  233   13    95
Uini Atonio              286   68   13    89     Celso Borges        111  164    3    76
Ardie Savea              175  111   13    86     Dani Parejo         616    4   14    61
Antoine Dupont           211   64   12    81     p90 (213g, 8s)      213   28    8    54
Romain Ntamack           158   47    9    72     médiane (32g, 2s)    32    0    2    20
15 joueurs à 1 match       1    0    1     6
```

C'est très nettement mieux que la v1 au centile, dont le sommet était occupé par des piliers
très durables (Atonio, Slimani, Taofifenua, Tameifuna). Le score absolu rend aux sélections le
poids que le rang centile leur retirait, et le haut du classement est maintenant peuplé de
vrais internationaux.

Distribution rugby, par décile : `503 / 1065 / 1662 / 1933 / 1198 / 599 / 336 / 158 / 69 / 6`.
Une cloche centrée sur 30-40, avec un sommet très fin — seulement 6 joueurs au-dessus de 90, et
233 au-dessus de 70 (3 % du roster). C'est exploitable pour une bande « joueurs connus », mais
étroit : si la bande haute manque de monde, c'est `Kg`/`Kc` qu'il faudra baisser, pas les poids.

## La limite, à connaître avant de s'y fier

Antoine Dupont sort à 81, derrière Uini Atonio à 89. Ce n'est **pas** un défaut de la formule :
sur les signaux disponibles, Atonio est réellement devant (286 matchs contre 211, 68 sélections
contre 64). Aucune pondération de ces trois signaux ne l'inverse — vérifié, pas supposé.

La célébrité de Dupont n'est dans aucun de ces chiffres. Seul **`appearance`** la capterait :
combien de fois un joueur est effectivement cherché par les utilisateurs — une mesure directe
plutôt qu'un proxy, et la seule qui fournira enfin des étiquettes pour *ajuster* les poids au
lieu de les choisir. Elle entre dans le sac jsonb sans migration ; seule la fonction bouge (et
les poids se renormalisent).

En attendant : le **bas** du classement est juste — c'est lui qui sert au comptage des points —
et une **bande haute** ne contient que des joueurs reconnaissables. C'est le tri fin du sommet
qui reste imprécis.

## Pièges rencontrés

**`least(1, NULL)` vaut `1` en Postgres**, pas `NULL` : `least`/`greatest` ignorent les NULL. Un
sport non calibré donnait donc des K nuls, les trois termes plafonnaient à 1, et `fame` sortait
à **100** au lieu de NULL. Corrigé par un test explicite `WHEN k.kg IS NULL THEN NULL`.

**`CREATE OR REPLACE` sur une fonction dont dépend une colonne générée n'est pas refusé.**
Postgres l'accepte sans un mot, ne recalcule pas les valeurs déjà stockées, mais applique la
nouvelle formule à toute ligne réécrite ensuite — la table part en **état mixte**, sans rien qui
le signale (mesuré : `fame` stocké à 93 pendant que la fonction renvoie 0). Changer la formule
impose donc `DROP COLUMN fame` d'abord. C'est écrit en bas de `010_player_fame.sql`.

## Ce qui reste

1. Brancher la fame : bande de tirage sur `findRandom`, daily challenge, points.
2. Le signal `appearance`, quand le jeu produira des parties.
3. Remonter `source` / `sourceUrl` dans `Player` — retirés du sac de fame, ils ont leur place au
   niveau du joueur, et permettraient d'envoyer l'utilisateur vers la fiche d'origine.
4. Les joueurs sans membership (carrière réelle, appariement de club raté à l'import) sont notés
   et resteront injoignables dans une énigme. Comptés par `fame:report`.
