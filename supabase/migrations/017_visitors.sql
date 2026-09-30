-- Visitors and their generated names.
--
-- A visitor is the anonymous id a browser mints on its first visit (`ipw.playerId`,
-- src/lib/visitor.ts) — the one daily_results are already kept under. This gives it a row of its
-- own, and a name to show in the rankings instead of a UUID.
--
--   name_adjective, name_noun — KEYS into curated lists (src/domain/visitorName.ts), drawn once by
--                               the server and never changed. The text is the viewer's language:
--                               "Hasty Prop" in English, "Pilier Pressé" in French. The lists
--                               only ever grow, so a stored key always has a label.
--
-- Generated, not chosen: curated lists need no moderation. A username of one's own comes with
-- accounts, and so does the filtering it needs (format, blocklist, reserved names, reporting).
--
-- The row is where an account will attach later: signing up claims the visitor — and with it the
-- results already played — rather than starting over.
--
-- No foreign key from daily_results: a move can be recorded before Start (when Start never
-- reached the server), and the name is created at Start. A result without a visitor row simply has
-- no name yet.
--
-- Depends on 016_daily_hints.sql. Apply as ONE transaction in the Supabase SQL editor.
-- Rollback: 017_visitors_rollback.sql.

BEGIN;

CREATE TABLE visitors (
  id              uuid        PRIMARY KEY,
  name_adjective  text        NOT NULL,
  name_noun       text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Same as the other game tables: only the server (service_role) reads and writes.
ALTER TABLE visitors ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON visitors FROM anon, authenticated;
GRANT SELECT, INSERT ON visitors TO service_role;

-- ─── First sight of a visitor ─────────────────────────────────────────────────
--
-- Creates the visitor with the name drawn by the server. Idempotent: an existing visitor keeps
-- the name it already has — a name never changes.
CREATE OR REPLACE FUNCTION public.ensure_visitor(p_id uuid, p_name_adjective text, p_name_noun text)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO visitors (id, name_adjective, name_noun)
  VALUES (p_id, p_name_adjective, p_name_noun)
  ON CONFLICT (id) DO NOTHING;
$$;

-- ─── The ranking, now with names ──────────────────────────────────────────────
--
-- Same order as 015 and 016. The return type changes, hence DROP + CREATE.
DROP FUNCTION public.daily_ranking(text, date);

CREATE FUNCTION public.daily_ranking(p_sport text, p_day date)
RETURNS TABLE (
  rank            bigint,
  visitor_id      uuid,
  name_adjective  text,
  name_noun       text,
  attempts        integer,
  duration_ms     bigint,
  lives_lost      integer,
  links           integer,
  hints           integer,
  finished_at     timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT rank() OVER (ORDER BY r.attempts, r.finished_at - r.started_at),
         r.visitor_id,
         v.name_adjective,
         v.name_noun,
         r.attempts,
         (extract(epoch FROM r.finished_at - r.started_at) * 1000)::bigint,
         r.lives_lost,
         r.links,
         cardinality(r.hint_player_ids),
         r.finished_at
    FROM daily_results r
    LEFT JOIN visitors v ON v.id = r.visitor_id
   WHERE r.sport = p_sport AND r.day = p_day AND r.outcome = 'won'
   ORDER BY 1, r.finished_at;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_visitor(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.daily_ranking(text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_visitor(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.daily_ranking(text, date) TO service_role;

COMMIT;

-- ─── Post-apply checks ────────────────────────────────────────────────────────
--
-- A name is kept once drawn — rolled back, nothing stays:
--   BEGIN;
--   SELECT ensure_visitor('00000000-0000-4000-8000-000000000001', 'hasty', 'prop');
--   SELECT ensure_visitor('00000000-0000-4000-8000-000000000001', 'shy', 'winger');
--   SELECT name_adjective, name_noun FROM visitors;       -- hasty | prop
--   ROLLBACK;
--
-- After a day of play, every ranked result has a name (Start creates it) — expect 0:
--   SELECT count(*) FROM daily_results r LEFT JOIN visitors v ON v.id = r.visitor_id
--    WHERE r.outcome = 'won' AND v.id IS NULL;
--
-- Closed to the public key — as anon, must fail with "permission denied":
--   SET ROLE anon; SELECT * FROM visitors; RESET ROLE;
