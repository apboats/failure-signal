-- 00003: signal_category values that exist on the live project but were never migrated.
-- Must be its own migration: a transaction that ADDs an enum value cannot also USE it (00004 does).
-- No-op on production (ADD VALUE IF NOT EXISTS); 00001 now lists the same values for fresh databases.
alter type signal_category add value if not exists 'insider_selling';
alter type signal_category add value if not exists 'peer_contagion';
alter type signal_category add value if not exists 'social_panic';
alter type signal_category add value if not exists 'lawmaker_selling';
