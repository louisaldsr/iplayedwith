-- Removes the compatibility trigger from 006_sport_space.sql.
--
-- 006 could ship ahead of the application code because this trigger filled `sport` in
-- from the club whenever an insert omitted it. Once the repository writes `sport`
-- explicitly (membershipsRepository.upsertMany), the trigger is dead weight on every
-- write and hides a genuine bug if some path ever stops setting it.
--
-- Apply only after the new code is deployed and verified. To confirm nothing still
-- relies on it, this should return 0:
--   SELECT count(*) FROM memberships WHERE sport IS NULL;

BEGIN;

DROP TRIGGER IF EXISTS memberships_fill_sport_trg ON memberships;
DROP FUNCTION IF EXISTS memberships_fill_sport();

COMMIT;
