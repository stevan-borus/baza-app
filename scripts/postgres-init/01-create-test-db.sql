-- Runs once, only when the Postgres data volume is being initialized.
-- For existing volumes, run `pnpm --filter mobile test:db:bootstrap` instead.
CREATE DATABASE baza_app_test;
