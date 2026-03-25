-- ================================================================
-- HWADAM (화담) — Supabase Database Schema
-- Supabase SQL Editor에서 순서대로 실행하세요.
-- ================================================================

-- ─── Extensions ───────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── profiles ─────────────────────────────────────────────────
-- auth.users와 1:1 연결되는 공개 프로필 테이블
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nickname    text not null unique,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- nickname 검색 인덱스
create index if not exists profiles_nickname_idx on public.profiles(nickname);

-- updated_at 자동 갱신 함수
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- 신규 유저 가입 시 profiles 자동 생성
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, nickname, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nickname', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── rooms ────────────────────────────────────────────────────
-- 비밀 코드를 식별자로 하는 채팅방
create table if not exists public.rooms (
  id          uuid primary key default uuid_generate_v4(),
  code        text not null unique,          -- 사용자 입력 비밀 코드 (영문/한글/숫자)
  name        text,                          -- 선택적 방 이름
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  last_message_at timestamptz default now()
);

create index if not exists rooms_code_idx on public.rooms(code);
create index if not exists rooms_last_message_idx on public.rooms(last_message_at desc);

-- ─── messages ─────────────────────────────────────────────────
create table if not exists public.messages (
  id            uuid primary key default uuid_generate_v4(),
  room_id       uuid not null references public.rooms(id) on delete cascade,
  sender_id     uuid not null references public.profiles(id) on delete cascade,
  content       text,                        -- 텍스트 내용 (null 허용 — 이미지 전용 메시지)
  image_url     text,                        -- Supabase Storage 공용 URL
  is_private    boolean not null default false,  -- 프라이버시 모드 (스텔스 메시지)
  emoji_color   text,                        -- 이모티콘 기반 말풍선 배경색 (hex)
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz                  -- soft delete
);

-- 방별 시간순 조회 인덱스
create index if not exists messages_room_created_idx on public.messages(room_id, created_at asc);

-- 메시지 저장 시 rooms.last_message_at 자동 갱신
create or replace function public.update_room_last_message()
returns trigger language plpgsql as $$
begin
  update public.rooms
  set last_message_at = new.created_at
  where id = new.room_id;
  return new;
end;
$$;

create trigger messages_update_room
  after insert on public.messages
  for each row execute function public.update_room_last_message();

-- ─── fcm_tokens ───────────────────────────────────────────────
-- FCM 푸시 토큰 관리
create table if not exists public.fcm_tokens (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  token       text not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists fcm_tokens_user_idx on public.fcm_tokens(user_id);

create trigger fcm_tokens_updated_at
  before update on public.fcm_tokens
  for each row execute function public.handle_updated_at();

-- ─── Row Level Security (RLS) ─────────────────────────────────
alter table public.profiles  enable row level security;
alter table public.rooms     enable row level security;
alter table public.messages  enable row level security;
alter table public.fcm_tokens enable row level security;

-- profiles: 본인 프로필 읽기/수정, 전체 닉네임 조회
create policy "profiles_select_all"  on public.profiles for select using (true);
create policy "profiles_update_own"  on public.profiles for update using (auth.uid() = id);

-- rooms: 누구나 코드로 입장/생성 가능 (공개 채팅방 모델)
create policy "rooms_select_all"     on public.rooms for select using (true);
create policy "rooms_insert_auth"    on public.rooms for insert with check (auth.uid() is not null);

-- messages: 방 참여자 누구나 읽기/쓰기 (삭제는 본인만)
create policy "messages_select_all"  on public.messages for select using (deleted_at is null);
create policy "messages_insert_auth" on public.messages for insert with check (auth.uid() = sender_id);
create policy "messages_delete_own"  on public.messages for delete using (auth.uid() = sender_id);

-- fcm_tokens: 본인 토큰만 관리
create policy "fcm_own_select" on public.fcm_tokens for select using (auth.uid() = user_id);
create policy "fcm_own_insert" on public.fcm_tokens for insert with check (auth.uid() = user_id);
create policy "fcm_own_update" on public.fcm_tokens for update using (auth.uid() = user_id);
create policy "fcm_own_delete" on public.fcm_tokens for delete using (auth.uid() = user_id);

-- ─── Storage: chat-images 버킷 ────────────────────────────────
-- Supabase Dashboard > Storage에서 버킷 생성 후 아래 policy 적용
-- insert into storage.buckets (id, name, public) values ('chat-images', 'chat-images', true);

create policy "chat_images_select" on storage.objects for select
  using (bucket_id = 'chat-images');

create policy "chat_images_insert" on storage.objects for insert
  with check (bucket_id = 'chat-images' and auth.uid() is not null);

create policy "chat_images_delete" on storage.objects for delete
  using (bucket_id = 'chat-images' and auth.uid()::text = (storage.foldername(name))[1]);
