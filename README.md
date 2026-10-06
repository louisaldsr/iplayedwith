<p align="center">
  <img src="brand/logo.svg" alt="I Played With" width="96" />
</p>

<h1 align="center">I Played With</h1>

<p align="center">
  <strong>Six degrees of separation, for sport.</strong><br />
  Link two players through the teammates they shared — club by club, season by season.
</p>

<p align="center">
  <a href="https://iplayedwith.com"><strong>▶ Play at iplayedwith.com</strong></a>
</p>

---

## What is it?

Every day, two players are drawn — say, two rugby internationals who never wore the same shirt.
Your job: connect them through **players who were teammates** — in the same club, in the same
season.

> **Messi** played with **Neymar** at FC Barcelona (2013-2014), who played with **Cavani** at PSG
> (2017-2018), who played with **Ronaldo** at Manchester United (2021-2022).
> Messi → Ronaldo in 3 links.

Two sports for now: **🏉 rugby** and **⚽ football**.

## How to play

1. **Two players are drawn**: A and B. The same pair for everyone, every day.
2. **Name a player** who shared a club and a season with someone already on the board. They join
   the board, linked to their teammates.
3. **Build your chain** until A and B are connected. The chain is complete — you win.

### The rules of the daily challenge

- **❤️ 3 lives.** A player who shared no club and season with anyone on the board costs a life.
  Lose all three and the day is over.
- **🎯 Your score: extra players.** The game knows the shortest possible chain. Find it and you score
  **Perfect!** — every player added beyond it counts **+1**, dead ends included. No limit: only lives
  can end the day.
- **🏆 A daily ranking is coming**: best score first, then fastest.
- **🔍 Stuck?** Tap any player card to see their career, club by club.
- **✨ Fame.** Players are tagged *Famous*, *Known* or *Unsung*: the less known the player, the rarer
  the find.
- **💡 Proposed solution.** Once the day is over — won or lost — switch on *Proposed Solution* to see
  one of the shortest chains laid over your own board.
- **🆕 A new pair every day** at midnight (Paris time).

### Free play

Pick any two players yourself, no lives, as many games as you like. In **Hard** mode you also name
the club and the season of every link.

### Your stats

Games played, win rate and how your scores spread from *Perfect* to *+5+* — per sport, kept from one
day to the next. No account needed: you get a generated name (*Hasty Prop 042*), and you can rename
yourself from the menu.

## Where does the data come from?

| Sport | Source |
| --- | --- |
| 🏉 Rugby | [allrugby.com](https://www.allrugby.com) and [all.rugby](https://all.rugby) |
| ⚽ Football | [Transfermarkt](https://www.transfermarkt.com), via [`dcaribou/transfermarkt-datasets`](https://github.com/dcaribou/transfermarkt-datasets) (CC0) — seasons from 2012-2013 |

An independent fan project: records may be incomplete or wrong. If a teammate is missing, see
[How to help](#how-to-help).

## How it works

- **Stack**: [Next.js](https://nextjs.org) (TypeScript, React) and PostgreSQL on
  [Supabase](https://supabase.com).
- **The rules live on the server.** The browser never downloads the dataset: it sends each move with
  its current board, and the server checks every link against the database before accepting it — a
  forged board is rejected. No game session is stored.
- **The daily pair** is drawn by the database, among players of the right fame, at least two links
  apart. The shortest chain is computed once and kept on the server: it is never sent to the browser
  before your day is over.
- **Your results** are recorded by the server — moves, lives, time — never reported by the browser.
- **Search** forgives accents, punctuation and spacing (`gael fickou` finds *Gaël Fickou*), and knows
  club nicknames (*UBB*, *La Rochelle*).

## Run it locally

You need **Node.js 18.18 or later** and a **Supabase** project (PostgreSQL with the `pg_trgm`, `unaccent`,
`btree_gin` and `pg_cron` extensions).

```bash
git clone https://github.com/louisaldsr/iplayedwith.git
cd iplayedwith
npm install
cp .env.example .env.local   # then fill in your Supabase URL and keys
```

Apply the SQL files in [`supabase/migrations`](supabase/migrations) in numeric order (skip the
`*_rollback.sql` ones), import the data with the `seed:*` scripts in [`package.json`](package.json),
then:

```bash
npm run dev          # http://localhost:3000
npm test             # unit and integration tests
npm run test:e2e     # end-to-end tests (Playwright) — every API call mocked, no database needed
npm run type-check
npm run format:check
```

## How to help

The most useful help is about the game and its data:

- 🐛 **Report a bug** — what you did, what you expected, what happened (a screenshot helps).
- 🧩 **Report a data error** — a missing teammate, a wrong season, a player in the wrong club.
- 🏷️ **Suggest a club nickname** the search should know (*UBB* → Union Bordeaux-Bègles).
- 💡 **Share an idea** — a new sport, a new mode, anything that would make you play again tomorrow.

All of it goes in [GitHub issues](https://github.com/louisaldsr/iplayedwith/issues).

**Code contributions**: please open an issue first to talk it through — pull requests are welcome
once we agree on the change.

## Contact

- [GitHub issues](https://github.com/louisaldsr/iplayedwith/issues) for anything about the game.
- ✉️ [contact@iplayedwith.com](mailto:contact@iplayedwith.com) for the rest.

Made by [**louisaldsr**](https://github.com/louisaldsr).
