/**
 * HWADAM 통합 테스트
 * 두 계정을 만들어 방 생성 → 메시지 송수신 전체 흐름을 검증합니다.
 * 실행: node test-chat.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// .env 파일에서 직접 읽기
const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => l.split('=').map(s => s.trim()))
);

const URL = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_ANON_KEY;

if (!URL || !KEY) { console.error('❌ .env 파일을 확인하세요'); process.exit(1); }

// 두 클라이언트 인스턴스 (각각 독립 세션)
const clientA = createClient(URL, KEY, { auth: { persistSession: false } });
const clientB = createClient(URL, KEY, { auth: { persistSession: false } });

const TEST_SUFFIX = Date.now(); // 테스트마다 유니크한 닉네임
const USER_A = { nick: `testerA_${TEST_SUFFIX}`, pw: 'test1234' };
const USER_B = { nick: `testerB_${TEST_SUFFIX}`, pw: 'test1234' };
const ROOM_CODE = `testroom_${TEST_SUFFIX}`;

let pass = 0, fail = 0;

function ok(label) { console.log(`  ✅ ${label}`); pass++; }
function ko(label, detail) { console.log(`  ❌ ${label}: ${detail}`); fail++; }

async function check(label, fn) {
  try { const r = await fn(); ok(label); return r; }
  catch (e) { ko(label, e.message ?? JSON.stringify(e)); return null; }
}

// ─── 1. 회원가입 ──────────────────────────────────────────────
console.log('\n[1] 회원가입');
const signUp = async (client, nick, pw) => {
  const { data, error } = await client.auth.signUp({
    email: `${nick}@hwadam-user.com`,
    password: pw,
    options: { data: { nickname: nick } },
  });
  if (error) throw error;
  return data.user;
};

const userA = await check(`A 가입 (${USER_A.nick})`, () => signUp(clientA, USER_A.nick, USER_A.pw));
const userB = await check(`B 가입 (${USER_B.nick})`, () => signUp(clientB, USER_B.nick, USER_B.pw));

// ─── 2. 로그인 ────────────────────────────────────────────────
console.log('\n[2] 로그인');
const signIn = async (client, nick, pw) => {
  const { data, error } = await client.auth.signInWithPassword({
    email: `${nick}@hwadam-user.com`,
    password: pw,
  });
  if (error) throw error;
  return data.user;
};

await check(`A 로그인`, () => signIn(clientA, USER_A.nick, USER_A.pw));
await check(`B 로그인`, () => signIn(clientB, USER_B.nick, USER_B.pw));

// ─── 3. 프로필 자동 생성 확인 ─────────────────────────────────
console.log('\n[3] 프로필');
const waitProfile = async (client, userId, retries = 5) => {
  for (let i = 0; i < retries; i++) {
    const { data } = await client.from('profiles').select('*').eq('id', userId).single();
    if (data) return data;
    await new Promise(r => setTimeout(r, 600));
  }
  throw new Error('프로필이 생성되지 않았습니다');
};

const profA = await check('A 프로필 확인', () => waitProfile(clientA, userA?.id));
const profB = await check('B 프로필 확인', () => waitProfile(clientB, userB?.id));

// ─── 4. 방 생성 ───────────────────────────────────────────────
console.log('\n[4] 채팅방');
const getOrCreate = async (client, code, userId) => {
  const { data: ex } = await client.from('rooms').select('*').eq('code', code).single();
  if (ex) return ex;
  const { data, error } = await client.from('rooms').insert({ code, created_by: userId }).select().single();
  if (error) throw error;
  return data;
};

const room = await check(`방 생성 (코드: ${ROOM_CODE})`, () =>
  getOrCreate(clientA, ROOM_CODE, profA?.id ?? userA?.id)
);

await check('B가 같은 방 입장', async () => {
  const { data, error } = await clientB.from('rooms').select('*').eq('code', ROOM_CODE).single();
  if (error) throw error;
  if (!data) throw new Error('방을 찾을 수 없음');
  return data;
});

// ─── 5. 메시지 전송 ───────────────────────────────────────────
console.log('\n[5] 메시지 전송');
const sendMsg = async (client, senderId, content, isPrivate = false) => {
  const { data, error } = await client
    .from('messages')
    .insert({
      room_id: room?.id,
      sender_id: senderId,
      content,
      is_private: isPrivate,
      emoji_color: '#1e3a5f',
    })
    .select(`id, content, is_private, profiles:sender_id(nickname)`)
    .single();
  if (error) throw error;
  return data;
};

const msgA1 = await check('A → "안녕하세요!"', () =>
  sendMsg(clientA, profA?.id ?? userA?.id, '안녕하세요!')
);
const msgB1 = await check('B → "반갑습니다!"', () =>
  sendMsg(clientB, profB?.id ?? userB?.id, '반갑습니다!')
);
const msgA2 = await check('A → 스텔스 메시지 (is_private=true)', () =>
  sendMsg(clientA, profA?.id ?? userA?.id, '이건 비밀 메시지', true)
);

// ─── 6. 메시지 조회 ───────────────────────────────────────────
console.log('\n[6] 메시지 조회');
await check('B가 방 메시지 전체 조회', async () => {
  const { data, error } = await clientB
    .from('messages')
    .select(`id, content, is_private, profiles:sender_id(nickname)`)
    .eq('room_id', room?.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (error) throw error;
  if (data.length < 3) throw new Error(`메시지 수 부족: ${data.length}개`);

  console.log('\n     📨 수신된 메시지 목록:');
  data.forEach(m => {
    const who = m.profiles?.nickname ?? '?';
    const content = m.is_private ? `[스텔스] ${m.content}` : m.content;
    console.log(`       [${who}] ${content}`);
  });
  return data;
});

// ─── 7. 정리 (테스트 데이터 삭제) ─────────────────────────────
console.log('\n[7] 정리');
if (room?.id) {
  await check('테스트 메시지 삭제', async () => {
    await clientA.from('messages').delete().eq('room_id', room.id);
  });
  await check('테스트 방 삭제', async () => {
    await clientA.from('rooms').delete().eq('id', room.id);
  });
}
if (userA?.id) await check('A 세션 종료', () => clientA.auth.signOut());
if (userB?.id) await check('B 세션 종료', () => clientB.auth.signOut());

// ─── 결과 ─────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(40)}`);
console.log(`결과: ✅ ${pass}개 통과 / ❌ ${fail}개 실패`);
if (fail === 0) {
  console.log('🎉 모든 테스트 통과! 채팅 기능이 정상 동작합니다.\n');
} else {
  console.log('⚠️  일부 테스트 실패. 위 내용을 확인하세요.\n');
  process.exit(1);
}
