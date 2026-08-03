#!/bin/bash
# Reproducible clean-replay harness for ZONO migrations.
export PGPORT=55432
REPO=/home/claude/zono-os
DB=${1:-zono_replay}
psql -h localhost -p $PGPORT -U postgres -q -c "drop database if exists $DB;" -c "create database $DB;" >/dev/null 2>&1
# Supabase-style bootstrap (roles are cluster-wide, created once)
psql -h localhost -p $PGPORT -U postgres -d $DB -q >/dev/null 2>&1 <<SQL
alter database $DB set search_path = "\$user", public, extensions;
create schema if not exists auth; create schema if not exists storage; create schema if not exists extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists btree_gin with schema extensions;
create extension if not exists btree_gist with schema extensions;
create or replace function auth.uid() returns uuid language sql stable as \$\$ select nullif(current_setting('request.jwt.claims',true)::json->>'sub','')::uuid \$\$;
create or replace function auth.role() returns text language sql stable as \$\$ select current_setting('request.jwt.claims',true)::json->>'role' \$\$;
create or replace function auth.jwt() returns jsonb language sql stable as \$\$ select coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb \$\$;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text, phone text, raw_user_meta_data jsonb);
create table if not exists storage.buckets (id text primary key, name text, public boolean default false, created_at timestamptz default now());
create table if not exists storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text references storage.buckets(id), name text, owner uuid, created_at timestamptz default now(), updated_at timestamptz default now(), metadata jsonb);
create or replace function storage.foldername(name text) returns text[] language sql immutable as \$\$ select string_to_array(name,'/') \$\$;
SQL
COUNT=0; PASS=0
for f in $(ls $REPO/supabase/migrations/*.sql | sort); do
  COUNT=$((COUNT+1)); base=$(basename "$f")
  psql -h localhost -p $PGPORT -U postgres -d $DB -v ON_ERROR_STOP=1 -q -f "$f" >/tmp/mig.out 2>/tmp/mig.err
  if [ $? -ne 0 ]; then
    echo "FAIL @ #$COUNT $base"
    grep -iE "ERROR:|FATAL:" /tmp/mig.err | head -3
    exit 1
  fi
  PASS=$((PASS+1))
done
echo "ALL $PASS/$COUNT MIGRATIONS PASSED"
