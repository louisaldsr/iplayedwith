-- Competition as an optional, per-membership fact — simplest place to hang it
-- until a richer (season-scoped, club-level) model is worth the complexity.
ALTER TABLE memberships ADD COLUMN competition TEXT;
