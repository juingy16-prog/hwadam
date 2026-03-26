import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[HWADAM] .env 파일에 VITE_SUPABASE_URL과 VITE_SUPABASE_ANON_KEY를 설정해주세요.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,       // 세션 자동 유지 (localStorage)
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});

// ─── Auth Helpers ──────────────────────────────────────────────

/**
 * 닉네임 + 비밀번호로 회원가입
 * Supabase Auth는 이메일 기반이므로 nickname@hwadam-user.com 형태로 내부 처리
 */
export async function signUp(nickname, password) {
  const fakeEmail = `${nickname.toLowerCase()}@hwadam-user.com`;
  const { data, error } = await supabase.auth.signUp({
    email: fakeEmail,
    password,
    options: { data: { nickname } },
  });
  if (error) throw error;
  return data;
}

/**
 * 닉네임 + 비밀번호로 로그인
 */
export async function signIn(nickname, password) {
  const fakeEmail = `${nickname.toLowerCase()}@hwadam-user.com`;
  const { data, error } = await supabase.auth.signInWithPassword({
    email: fakeEmail,
    password,
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

// ─── Room Helpers ──────────────────────────────────────────────

/**
 * 비밀 코드로 방을 조회하거나 없으면 생성
 */
export async function getOrCreateRoom(code, userId) {
  // 조회
  const { data: existing, error: selectErr } = await supabase
    .from('rooms')
    .select('*')
    .eq('code', code)
    .single();

  if (selectErr && selectErr.code !== 'PGRST116') throw selectErr; // 404 제외 나머지 에러
  if (existing) return existing;

  // 프로필 존재 여부 확인 후 created_by 결정
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .single();

  const { data: created, error: insertErr } = await supabase
    .from('rooms')
    .insert({ code, created_by: profileRow ? userId : null })
    .select()
    .single();

  if (insertErr) throw insertErr;
  return created;
}

// ─── Message Helpers ───────────────────────────────────────────

/**
 * 특정 방의 최근 메시지 목록 조회 (최대 60개)
 */
export async function fetchMessages(roomId, limit = 60, before = null) {
  let query = supabase
    .from('messages')
    .select(`
      id, content, image_url, is_private, emoji_color, created_at,
      profiles:sender_id ( id, nickname, avatar_url )
    `)
    .eq('room_id', roomId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })  // 최신 우선
    .limit(limit);

  if (before) query = query.lt('created_at', before);  // 이전 메시지 페이지네이션

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).reverse();  // 화면엔 오래된 순서로 표시
}

/**
 * 메시지 전송
 */
export async function sendMessage({ roomId, senderId, content, imageUrl, isPrivate, emojiColor }) {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      room_id:    roomId,
      sender_id:  senderId,
      content:    content || null,
      image_url:  imageUrl || null,
      is_private: isPrivate ?? false,
      emoji_color: emojiColor || null,
    })
    .select(`
      id, content, image_url, is_private, emoji_color, created_at,
      profiles:sender_id ( id, nickname, avatar_url )
    `)
    .single();

  if (error) throw error;
  return data;
}

// ─── Storage Helpers ───────────────────────────────────────────

const BUCKET = 'chat-images';

/**
 * 이미지 파일을 chat-images 버킷에 업로드하고 공용 URL 반환
 * @param {File} file
 * @param {string} userId
 * @returns {Promise<string>} publicUrl
 */
export async function uploadChatImage(file, userId) {
  const ext = file.name.split('.').pop() || 'png';
  const path = `${userId}/${Date.now()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false });

  if (uploadErr) throw uploadErr;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ─── FCM Token Helpers ─────────────────────────────────────────

export async function upsertFcmToken(userId, token) {
  const { error } = await supabase
    .from('fcm_tokens')
    .upsert({ user_id: userId, token }, { onConflict: 'token' });
  if (error) throw error;
}

export async function deleteFcmToken(token) {
  const { error } = await supabase
    .from('fcm_tokens')
    .delete()
    .eq('token', token);
  if (error) throw error;
}
