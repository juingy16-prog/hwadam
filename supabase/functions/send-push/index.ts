import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

async function getFirebaseAccessToken(): Promise<string> {
  const clientEmail  = Deno.env.get('FIREBASE_CLIENT_EMAIL')!;
  const privateKeyRaw = Deno.env.get('FIREBASE_PRIVATE_KEY')!.replace(/\\n/g, '\n');
  const projectId    = Deno.env.get('FIREBASE_PROJECT_ID')!;

  const now = Math.floor(Date.now() / 1000);
  const b64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const header  = b64url({ alg: 'RS256', typ: 'JWT' });
  const payload = b64url({
    iss: clientEmail,
    sub: clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: `https://oauth2.googleapis.com/token`,
    iat: now,
    exp: now + 3600,
  });

  const sigInput = `${header}.${payload}`;
  const keyData  = privateKeyRaw
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    Uint8Array.from(atob(keyData), c => c.charCodeAt(0)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(sigInput),
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const jwt = `${sigInput}.${sigB64}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const { access_token } = await res.json();
  return access_token;
}

Deno.serve(async (req) => {
  try {
    const { record } = await req.json();
    if (!record?.room_id || !record?.sender_id) return new Response('ok');

    // 발신자 프로필
    const { data: sender } = await supabase
      .from('profiles').select('nickname').eq('id', record.sender_id).single();

    // 해당 방의 다른 참여자 (최근 메시지 기준)
    const { data: msgs } = await supabase
      .from('messages')
      .select('sender_id')
      .eq('room_id', record.room_id)
      .neq('sender_id', record.sender_id)
      .order('created_at', { ascending: false })
      .limit(200);

    const userIds = [...new Set((msgs ?? []).map((m: { sender_id: string }) => m.sender_id))];
    if (!userIds.length) return new Response('ok');

    // FCM 토큰 조회
    const { data: tokenRows } = await supabase
      .from('fcm_tokens').select('token').in('user_id', userIds);
    if (!tokenRows?.length) return new Response('ok');

    // 알림 내용 — 스텔스는 내용 숨김
    const nickname = sender?.nickname ?? '누군가';
    const body = record.is_private ? '🔒 스텔스 메시지' : (record.content || '📷 이미지');

    const accessToken = await getFirebaseAccessToken();
    const projectId   = Deno.env.get('FIREBASE_PROJECT_ID')!;

    await Promise.allSettled(
      tokenRows.map(({ token }: { token: string }) =>
        fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: `HWADAM — ${nickname}`, body },
              webpush: {
                notification: { icon: '/icons/icon-192.png', badge: '/icons/icon-96.png' },
                fcm_options: { link: `/room/${record.room_id}` },
              },
              data: { roomId: record.room_id },
            },
          }),
        })
      )
    );

    return new Response('ok');
  } catch (err) {
    console.error('[send-push]', err);
    return new Response('error', { status: 500 });
  }
});
