-- Keep every table in the DR publication readable by the bounded logical
-- replication role. The guards keep local/dev databases without the Oracle
-- DR role or publication unaffected.
DO $migration$
DECLARE
  item record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aura_board_dr_replication')
     AND EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'aura_board_dr_pub') THEN
    FOR item IN
      SELECT schemaname, tablename
      FROM pg_publication_tables
      WHERE pubname = 'aura_board_dr_pub'
    LOOP
      EXECUTE format(
        'GRANT SELECT ON TABLE %I.%I TO aura_board_dr_replication',
        item.schemaname,
        item.tablename
      );
    END LOOP;
  END IF;
END
$migration$;
