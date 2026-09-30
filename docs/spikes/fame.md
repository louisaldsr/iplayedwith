# Spike — player fame

*September 2026. Shipped: the metric is computed and stored. Nothing reads it yet — not the
random draw, not the points. That is deliberate, and it is the subject of this note.*

## What actually shipped — v1 (revision 1)

The research below explored a three-term formula stored in a generated column. What shipped is
a simpler first draft, meant to be iterated on:

```
score = round(100 × [ 0.55·s(caps, k_caps) + 0.45·s(games, k_games) ])
s(x, K) = min(1, √(x / K))
```

- **Two signals.** `caps` from `player_fame.details`, and `games` summed from `memberships.games`,
  so the total always covers the same clubs and seasons as the game graph. The weights are the
  spike's caps/games priors (0.45 / 0.35) rescaled to sum to 1.
- **No intensity term yet.** `games / seasons` is a real signal (see below), but it is left for
  a later revision. It is the obvious first thing to add back.
- **No generated column.** It cannot read `memberships`. `compute_fame_scores(sport)` rewrites
  the whole sport and stamps a `revision`. `fame:report` flags any row left on an older one.
- **K is data.** `fame_calibration` holds one row per sport (rugby 300 / 100, football 600 / 180,
  the ceilings below). The formula never branches on the sport.

See `supabase/migrations/012_fame_score.sql`. Sections below that mention `fame_details`, a
generated column or `DROP COLUMN fame` describe the earlier design and are superseded.

## The problem

`findRandom` drew uniformly across the whole table, so a game could pit two unknowns against
each other out of 7,823 rugby or 11,455 football players — unplayable, and with no recourse:
nothing in `players` could say that one player is better known than another.

Three upcoming uses depend on it: drawing from a fame **band**, building the **daily
challenge**, and **scoring points** (a less-known player is worth more).

## Why not "notoriety"

The first cut was called `notoriety`. In English that word is pejorative — you are *notorious*
for something bad — and it is a false friend of the neutral French *notoriété*. The right word
is **fame**. `reputation` would be a different axis (what people think of you, not whether they
have heard of you), and `renown` implies merit, which this metric does not measure.

## Absolute, not percentile

The first version ranked with `percent_rank()` — a percentile per sport. Two flaws:

1. **The score depended on the cohort, not the player.** Data is refreshed in bulk (once a
   year, or more often). Adding 500 young players moved everyone's score even though no career
   had changed: a daily challenge was no longer reproducible, and a player's point value
   drifted for reasons that had nothing to do with them.
2. **The percentile destroyed magnitude.** 68% of players have zero caps, so they all tied at
   percentile 0. Reweighting caps from 0.30 to 0.50 moved Antoine Dupont by 0.6 points — the
   ranking itself was destroying the signal.

The absolute score fixes both, and unlocks a simplification: it is computable row by row, so
`fame` is a **generated column**. Writing `fame_details` recalculates `fame` in the same
statement. No recompute step to forget, no ordering to respect. Correcting one player by hand
moves nobody else's score — verified in test.

## The formula

```
fame = round(100 × [ 0.35·s(gamesPlayed, Kg) + 0.45·s(caps, Kc) + 0.20·s(gamesPlayed/seasons, Ki) ])
s(x, K) = min(1, √(x / K))
```

`s` produces **diminishing returns**. With Kg = 300:

| games | 0 | 10 | 40 | 100 | 200 | 300 | 500 |
|---|---|---|---|---|---|---|---|
| √ | 0.00 | 0.18 | **0.37** | 0.58 | 0.82 | 1.00 | 1.00 |
| linear | 0.00 | 0.03 | 0.13 | 0.33 | 0.67 | 1.00 | 1.67 |

The first 40 games are worth as much as the next 160 — going from 0 to 40 flips a player from
unknown to "seen them play", while 250 to 290 changes nothing. A logarithm did the same thing
too strongly (0.65 for 40 games).

The constants are **per sport**, calibrated on observed ceilings — rugby counts a whole career,
football only the Big 5 since 2012:

| | rugby | football |
|---|---|---|
| `Kg` games | 300 (highest observed ~312) | 600 (p99=438, max=665 Lewandowski) |
| `Kc` caps | 100 (max 115 Ford) | 180 (p99=100, max=233 Ronaldo) |
| `Ki` games/season | 28 | 45 |

**The weights are priors, not a fit.** There is no ground truth "this player is 82% known"
anywhere in the data; fitting them would require labels. Caps dominate because they mark being
known **beyond your own club**; game volume follows but is not sufficient on its own (Dani
Parejo: 616 games, 4 caps, fame 61).

## Tested and rejected

### `seasons` as an additive term — **no**

`corr(gamesPlayed, seasons) = 0.933` across the 11,455 football players. Near-redundant: adding
it would be counting games twice. The justification written in v1 ("it covers for profiles with
no Matchs cell") was **wrong** — 14,727 of 14,727 rugby profiles carry a match count. That case
does not exist.

`seasons` earns its place as a **divisor**. `gamesPlayed / seasons` — starter or rotation
player — is a genuinely independent signal. At equal game counts:

```
                        games/season   mean caps
100-200 games  bottom 25%    18.6          9.1
               top 25%       33.9         16.5    x1.8
200-300 games  bottom 25%    23.1         16.5
               top 25%       36.1         28.8    x1.75
300-450 games  bottom 25%    27.1         21.9
               top 25%       39.1         54.2    x2.5
```

Monotonic across all three bands, and the gap widens.

### `clubs` — **no**

The hypothesis "moving around means known to several fanbases" against "moving around means
never settling". Measured at comparable volume, in mean caps:

```
               1 club  2 clubs  3 clubs  4 clubs  5+ clubs
100-200 games    12.0     13.4     12.1     11.9      7.7
200-300 games    19.4     19.2     21.6     19.0     19.0
300-450 games    31.3     37.4     37.9     35.5     27.5
```

Not monotonic: it rises to 2-3 clubs then falls off sharply at 5+. The two effects cancel. Raw
`caps ~ clubs` = 0.209, but `caps ~ games` = 0.455 and `games ~ clubs` = 0.585 — so 0.27 is
expected from volume alone. Once volume is controlled for, `clubs` contributes nothing. The
counter-examples (Totti, Dupont, Koke) had it right.

### Wikipedia pageviews — **no**

Rejected in favour of games played. Revisited later and rejected again on better grounds: it
means maintaining a per-player link to an external page, coverage is patchy exactly where it
would matter most, and a page can disappear.

## What it produces

Full rehearsal on real rugby data — 7,529 players, 44,072 memberships, scores produced by the
actual SQL functions:

```
TOP (extract)          games caps seas  fame     FOOTBALL          games caps seas  fame
Finn Russell             251   99   13    93     Modric              585  202   14    99
Gael Fickou              250   99   13    93     Lewandowski         665  167   14    98
George Ford              238  115   13    92     Messi               522  204   13    97
Owen Farrell             214  104   13    90     Ronaldo             482  233   13    95
Uini Atonio              286   68   13    89     Celso Borges        111  164    3    76
Ardie Savea              175  111   13    86     Dani Parejo         616    4   14    61
Antoine Dupont           211   64   12    81     p90 (213g, 8s)      213   28    8    54
Romain Ntamack           158   47    9    72     median (32g, 2s)     32    0    2    20
15 players with 1 game     1    0    1     6
```

Clearly better than the v1 percentile, whose top was occupied by very durable props (Atonio,
Slimani, Taofifenua, Tameifuna). The absolute score gives caps back the weight the percentile
rank was taking from them, and the top of the table is now genuine internationals.

Rugby distribution by decile: `503 / 1065 / 1662 / 1933 / 1198 / 599 / 336 / 158 / 69 / 6`. A
bell centred on 30-40 with a very thin top — only 6 players above 90, and 233 above 70 (3% of
the roster). Usable as a "well-known players" band, but narrow: if the top band lacks bodies,
lower `Kg`/`Kc` rather than touching the weights.

## The limit, to know before relying on it

Antoine Dupont comes out at 81, behind Uini Atonio at 89. This is **not** a flaw in the
formula: on the available signals Atonio genuinely is ahead (286 games to 211, 68 caps to 64).
No weighting of these three signals inverts it — verified, not assumed.

The deeper cause is structural: **all three signals are cumulative**, so fame tracks career
length and every young star is penalised for not having been around long enough. Measured on
football: Mbappe rank 61, Vinicius 225, Haaland 275, Bellingham 282, Lamine Yamal 793. No
reweighting fixes that; it is the wrong shape of input.

Two candidates would break the pattern, neither shipped:

- **`appearance`** — how often a player is actually searched for by users. A direct measure
  rather than a proxy, and the only thing that would finally supply labels to *fit* the weights
  instead of choosing them. Needs a live game producing data.
- **Club fame** — where you played rather than how long. Measured as genuinely independent
  (corr 0.235 with caps, 0.319 with games) and it separates exactly the players the formula
  gets wrong. Explored, then deliberately deferred to its own task.

Meanwhile the **bottom** of the ranking is sound — and that is the end the points system uses —
and a **high band** contains only recognisable players. It is the fine ordering at the top that
stays imprecise.

## Traps hit along the way

**`least(1, NULL)` is `1` in Postgres**, not `NULL`: `least`/`greatest` skip NULLs. An
uncalibrated sport therefore produced NULL constants, every term clamped to 1, and `fame` came
out at **100** instead of NULL. Fixed with an explicit `WHEN k.kg IS NULL THEN NULL` guard.

**`CREATE OR REPLACE` on a function backing a generated column is not refused.** Postgres
accepts it silently, does not recalculate stored values, but applies the new formula to any row
rewritten afterwards — so the table drifts into a **mixed state** with nothing to flag it
(measured: `fame` stored at 93 while the function returned 0). Changing the formula therefore
requires `DROP COLUMN fame` first. That is written at the bottom of `010_player_fame.sql`.

## What's left

1. Wire the floors up: draw by floor in `findRandom`, then the daily challenge, then points.
2. ~~Decide the fame floors~~ — done, see "Floors" below.
3. Club fame, as its own task.
4. The `appearance` signal, once the game produces games.
5. Players with no memberships (a real career, but club matching failed at import) are scored
   and will stay unreachable in a puzzle. Counted by `fame:report`.

## Floors

*Settled September 2026 — `src/domain/fameFloor.ts`.*

The game never shows or scores the raw number: nobody can tell a 47 from a 52, and the score
orders the top imprecisely anyway. It reads one of three floors:

| floor | key | label | score | rugby | football |
|---|---|---|---|---|---|
| 1 | `famous` | Famous / Célèbre | 70–100 | 186 (2.7%) | 173 (1.5%) |
| 2 | `known` | Known / Connu | 30–69 | 2,272 (33.1%) | 2,143 (18.7%) |
| 3 | `unsung` | Unsung / Méconnu | 0–29 | 4,397 (64.1%) | 9,139 (79.8%) |

**Absolute thresholds, not percentiles** — the reasons the score dropped percentiles apply again:
a player's floor, and so their point value, must not move because other players were imported,
and the top floor should be as small as stardom actually is.

**One set for every sport.** `fame_calibration` already normalises the sports onto one scale;
the floors do not branch on the sport.

**Derived, not stored.** A floor is read from `player_fame.score`, so changing a threshold needs
no migration and no recompute. `fame:report` prints the floor sizes and the named players either
side of each threshold — the check that matters, as with the top/bottom 30.

A NULL score has no floor: an unscored player is not an unknown one. "Unsung" is shown in public,
so the name has to stay kind to the players themselves.

Known edge at the top boundary: Dembélé and Havertz sit at 69, one point under `famous` — the
longevity bias of the score, not a threshold problem.

## Revision 2 — senior caps, and caps per season

*September 2026 — `supabase/migrations/014_fame_rate.sql`.*

Checked on the 2025-2026 Stade Toulousain squad. Two causes put known players in the wrong
floor.

**Youth caps counted as caps.** The allrugby career table lists every national side, and the
parser summed them all: U20 (5,619 "caps" across the roster), A (344), Barbarians (279), XV
(202), Māori All Blacks, France Développement — about 15% of every counted cap, landing on
youngsters (Rapetti 23 → 7 senior, Martin-Bonnard 11 → 0, Castro-Ferreira 16 → 0). Fixed in the
parser (`isSeniorNationalTeam`). The Lions stay: their Tests are caps. Football caps come from
Transfermarkt, which counts senior caps only.

**Only cumulative signals.** Revision 2 adds `rate = caps / greatest(seasons, 3)`, the
"intensity" term the first spike wanted, now in caps rather than games:

```
score = round(100 × [ 0.40·s(caps, k_caps) + 0.25·s(games, k_games) + 0.35·s(rate, k_rate) ])
```

Rate also answers the data window: caps and seasons both start in 2012-2013, so their ratio
survives the cut where totals do not. Dusautoir, whose career straddles it (18 caps over the 4
seasons we see), goes 47 → 60. Only importing older seasons fixes him fully.

Simulated on live data, then checked in a local Postgres against the SQL itself:

| | rev 1 | rev 2 |
|---|---|---|
| Romain Ntamack | 70 | 78 |
| Thibaud Flament | 64 | 74 |
| Dorian Aldegheri | 70 | 65 |
| Alexandre Roumat | 61 | 50 |
| Vinicius Junior | 63 | 75 |
| Jude Bellingham | 60 | 74 |
| Lamine Yamal | 45 | 64 |
| Dani Parejo | 53 | 38 |

### Measured and rejected

- **Share of the team's games** (games ÷ the most games anyone played in that club-season). It
  crowns regular club players — Neti 0.94, Graou 0.93 — and penalises internationals, who miss
  club games on Test duty (Dupont 0.77). It measures being dependable at a club, not being known.
- **Club prestige from the squad's caps.** Its top is Jaguares, Fijian Drua, Benetton, Zebre:
  national-team pools of smaller unions, not prestigious clubs. A prestige signal needs another
  source (results, titles).

### Still missing

Media and generation fame. Kinghorn stays ahead of Dupont on every signal we hold. Next step: a
Wikidata sitelinks spike (how many Wikipedia editions have an article on the player). It is
stable, unlike the pageviews rejected earlier, and football can match on the Transfermarkt ID.

## Revision 3 — season prestige, and the stage a player played on

*September 2026 — `supabase/migrations/023_season_prestige.sql`, `024_seed_rugby_titles.sql`,
`025_fame_stage.sql`.*

Revision 2 still reads a career and not where it was played. Revision 3 scores the stage: every
**club-season** gets a prestige score, and a player's `stage` is the games-weighted average of the
prestige of their memberships.

### Why club-seasons

People remember a season: its big European nights, its title, and the squad that played them. A
title stays attached to its own season. The squads before and after it do not get it, and an old
title needs no decay because it still belongs to the players who won it. The value is the same
for every player of a squad, so it lives on the club-season (`club_season_prestige`), not on
`memberships`.

### Signals measured

| Signal | Verdict |
|---|---|
| Continental games (UCL/EL, Champions/Challenge Cup) | Best source held, but see "games → wins" below. Summed 2012-2025: Real 170, Bayern 160, PSG 148 / Leinster 97, Toulouse 81, Munster 81 |
| Titles, from Wikidata (`P3450` season → `P1346` winner) | Covers the southern hemisphere, but **incomplete**: the Crusaders show 7 Super Rugby titles, not 11+. Titles are curated for rugby and derived from the results for football |
| Wikipedia editions per club | **Rejected**: flat in rugby (Toulouse = Leinster = Crusaders = 21, Zebre 15); inflated for English football (Luton 56) |
| Attendance, stadium size | **Rejected**: football only |
| Squad caps | Already rejected in revision 2 |

### Games → wins

The first version counted continental **games**, and on a local copy of both sports it rewarded
taking part. Zebre 2016-17 (6 Champions Cup games, 0 wins) scored 48, next to Munster. Every Super
Rugby franchise sat at 35-46 for playing its ~15 league games, so the Sunwolves ranked above Pau and
Bayonne. **Wins** tell these squads apart:

| | games | wins |
|---|---|---|
| Zebre 2016-17, Champions Cup | 6 | 0 |
| Toulouse 2023-24, Champions Cup | 8 | 8 |
| Sunwolves 2018, Super Rugby | 12 | 2 |
| Crusaders 2017, Super Rugby | 19 | 17 |

Average Super Rugby wins per season rank the franchises in their real order (Crusaders 12.1,
Hurricanes 10.8, Chiefs 10.3 … Waratahs 6.5), where games are flat at ~15. After the switch: Zebre
2016-17 scores 4, the Sunwolves 18, Moana Pasifika 22, Pau 25.

### Brand

A season alone is not enough. Man Utd 2014-15, Chelsea 2016-17 (league champions) and AC Milan
2014 to 2016 played no European game. So 30% of a club-season's prestige is the club's average over
the window, and Chelsea 2016-17 scores 29, not 0. This stays absolute: the average reads only the
club's own seasons.

### Stage, and its ceiling

`stage` is a career average, so it never reaches 1: Modrić, twelve seasons at Real, reads 0.71.
Read raw at a weight of 0.25, it topped out near 0.18 for the best-placed players, while taking
that weight from terms they had already saturated. The `famous` floor fell from 297 to 121
(rugby) and from 426 to 117 (football). So `stage` saturates at `k_stage`, the observed p99
(rugby 0.65, football 0.70).

The shape below the ceiling is **linear**. A √ lifted mid-table careers too far (Parejo 38 → 44,
rugby `known` 1,279 → 1,927): prestige already has its own diminishing returns.

### What it produces

Measured on a local Postgres loaded with both sports (rugby rebuilt from the profile cache,
football from the dataset), through the migrations themselves:

| | rev 2 | rev 3 |
|---|---|---|
| `famous` / `known` / `unsung`, rugby | 297 / 1,279 / 5,279 | 205 / 1,565 / 5,085 |
| `famous` / `known` / `unsung`, football | 426 / 2,507 / 8,522 | 189 / 2,358 / 8,908 |
| Antoine Dupont / Blair Kinghorn | 86 / 89 | 84 / 83 |
| Lamine Yamal | 64 | 71 |
| Vinícius Júnior | 75 | 81 |
| Antoine Griezmann | 95 | 87 |
| Gaël Fickou | 97 | 87 |
| Guillermo Ochoa | 85 | 63 |
| Celso Borges | 84 | 62 |

- The biggest falls are internationals from smaller football nations at modest clubs. Celso Borges
  was already flagged as an anomaly in revision 1. They land in `known`, not at the bottom: the
  term is added, not multiplied.
- The biggest rises are regulars of the great squads (Kroos, Marcelo, Saracens' Jackson Wray).
- The top-30 lists are household names only, in both sports.

### Still open

- The top of the rugby ranking now carries the role players of the dominant squads (Leinster:
  Toner 88, McGrath 85, ahead of Dupont 84). That is the intended effect of the stage. Media fame is
  still missing: see the Wikidata spike and the `appearance` signal.
- The 2025-26 titles are not in `024`, and the cached Transfermarkt download stops at the 2025-26
  European semi-finals. `prestige:report` lists every missing title by season.
- The 70 / 30 floor thresholds get their one review on the live data (CLAUDE.md, step 35).
