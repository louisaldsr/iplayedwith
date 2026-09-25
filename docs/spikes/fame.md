# Spike — player fame

*September 2026. Shipped: the metric is computed and stored. Nothing reads it yet — not the
random draw, not the points. That is deliberate, and it is the subject of this note.*

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

1. Wire fame up: band the random draw in `findRandom`, then the daily challenge, then points.
2. Decide the fame floors (3, 4 or 5 tiers) — the score supports coarse grouping better than
   fine ordering, so the floors are what the game should actually read.
3. Club fame, as its own task.
4. The `appearance` signal, once the game produces games.
5. Players with no memberships (a real career, but club matching failed at import) are scored
   and will stay unreachable in a puzzle. Counted by `fame:report`.
