-- =============================================================================
-- Migration 0001: Enable pgcrypto extension
-- =============================================================================

-- UP
create extension if not exists "pgcrypto";

-- DOWN
-- drop extension if exists "pgcrypto";
