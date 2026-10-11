-- Starter schema only. Tenant-aware RLS policies are intentionally not included.
create extension if not exists pgcrypto;
do $$ begin create type public.app_role as enum ('super_admin','company_admin','hr','employee'); exception when duplicate_object then null; end $$;
create table if not exists public.organizations(id uuid primary key default gen_random_uuid(),name text not null,slug text not null unique,created_at timestamptz not null default now());
create table if not exists public.profiles(id uuid primary key references auth.users(id) on delete cascade,full_name text not null default '',email text,created_at timestamptz not null default now());
create table if not exists public.memberships(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,user_id uuid not null references public.profiles(id) on delete cascade,role public.app_role not null default 'employee',created_at timestamptz not null default now(),unique(organization_id,user_id));
create table if not exists public.clients(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,client_code text not null,client_name text not null,email text,is_active boolean not null default true,created_at timestamptz not null default now(),unique(organization_id,client_code));
create table if not exists public.projects(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,client_id uuid references public.clients(id) on delete set null,name text not null,created_at timestamptz not null default now());
create table if not exists public.timesheet_entries(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,user_id uuid not null references public.profiles(id) on delete cascade,project_id uuid references public.projects(id) on delete set null,work_date date not null,start_time time,end_time time,break_minutes integer not null default 0 check(break_minutes>=0),description text not null default '',status text not null default 'pending' check(status in ('pending','approved','rejected')),created_at timestamptz not null default now());
create table if not exists public.conveyance_claims(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,user_id uuid not null references public.profiles(id) on delete cascade,claim_date date not null,from_location text not null,to_location text not null,purpose text not null default '',amount numeric(12,2) not null check(amount>=0),status text not null default 'pending' check(status in ('pending','approved','rejected','paid')),created_at timestamptz not null default now());
create table if not exists public.audit_logs(id uuid primary key default gen_random_uuid(),organization_id uuid references public.organizations(id) on delete set null,actor_user_id uuid references public.profiles(id) on delete set null,action text not null,entity_type text not null,entity_id uuid,created_at timestamptz not null default now());
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.timesheet_entries enable row level security;
alter table public.conveyance_claims enable row level security;
alter table public.audit_logs enable row level security;
drop policy if exists profile_select_self on public.profiles;
create policy profile_select_self on public.profiles for select to authenticated using(id=(select auth.uid()));
drop policy if exists profile_update_self on public.profiles;
create policy profile_update_self on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
-- IMPORTANT: Add and test tenant-aware policies before using real data. Do not disable RLS.
