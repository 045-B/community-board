-- Supabase Dashboard > SQL Editor에서 이 파일 전체를 한 번 실행하세요.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '회원',
  role text not null default 'member' check (role in ('member', 'editor', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  category text not null default '자유게시판',
  title text not null check (char_length(title) between 1 and 100),
  content text not null check (char_length(content) between 1 and 10000),
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 20),
  is_notice boolean not null default false,
  view_count integer not null default 0 check (view_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists posts_created_at_idx on public.posts(created_at desc);
create index if not exists posts_category_idx on public.posts(category);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), '회원'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.has_board_role(allowed_roles text[])
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = any(allowed_roles)
  );
$$;

create or replace function public.increment_post_views(post_id_value uuid)
returns void
language sql
security definer set search_path = public
as $$
  update public.posts
  set view_count = view_count + 1
  where id = post_id_value;
$$;

alter table public.profiles enable row level security;
alter table public.posts enable row level security;

drop policy if exists "profiles public read" on public.profiles;
create policy "profiles public read" on public.profiles
  for select using (true);

drop policy if exists "profile owner update" on public.profiles;
-- 프로필 역할은 SQL Editor에서 관리자만 변경합니다.
-- 브라우저 사용자의 역할 변경을 허용하지 않아 권한 상승을 막습니다.

drop policy if exists "posts public read" on public.posts;
create policy "posts public read" on public.posts
  for select using (true);

drop policy if exists "signed members create posts" on public.posts;
create policy "signed members create posts" on public.posts
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and (is_notice = false or public.has_board_role(array['editor', 'admin']))
  );

drop policy if exists "authors and editors update posts" on public.posts;
create policy "authors and editors update posts" on public.posts
  for update to authenticated
  using (author_id = auth.uid() or public.has_board_role(array['editor', 'admin']))
  with check (
    (author_id = auth.uid() or public.has_board_role(array['editor', 'admin']))
    and (is_notice = false or public.has_board_role(array['editor', 'admin']))
  );

drop policy if exists "authors and admins delete posts" on public.posts;
create policy "authors and admins delete posts" on public.posts
  for delete to authenticated
  using (author_id = auth.uid() or public.has_board_role(array['admin']));

grant execute on function public.increment_post_views(uuid) to anon, authenticated;
grant execute on function public.has_board_role(text[]) to authenticated;

-- 편집자로 지정할 때 아래 이메일만 바꾸어 한 번 실행하세요.
-- update public.profiles
-- set role = 'editor'
-- where id = (select id from auth.users where email = 'editor@example.com');

-- 관리자로 지정할 때 아래 이메일만 바꾸어 한 번 실행하세요.
-- update public.profiles
-- set role = 'admin'
-- where id = (select id from auth.users where email = 'owner@example.com');
