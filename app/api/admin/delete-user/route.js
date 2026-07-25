import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function getCaller(token) {
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: profile } = await client
    .from('profiles')
    .select('is_admin')
    .eq('id', data.user.id)
    .single();
  return { user: data.user, isAdmin: !!profile?.is_admin };
}

export async function POST(request) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const caller = await getCaller(token);
    if (!caller || !caller.isAdmin) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { userId } = await request.json();
    if (!userId) {
      return Response.json({ error: 'Missing userId' }, { status: 400 });
    }
    if (userId === caller.user.id) {
      return Response.json({ error: 'You cannot delete your own account' }, { status: 400 });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: e.message || 'Unexpected error' }, { status: 500 });
  }
}
