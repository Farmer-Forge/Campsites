import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return new Response("Missing required environment variables", { status: 500, headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await callerClient.auth.getUser();
  if (authError || !user) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const { data: isAdmin, error: adminCheckError } = await callerClient.rpc("is_admin", { uid: user.id });
  if (adminCheckError || !isAdmin) {
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  const { target_user_id, new_email } = await req.json();
  if (!target_user_id || typeof target_user_id !== "string") {
    return new Response("target_user_id is required", { status: 400, headers: corsHeaders });
  }
  if (!new_email || typeof new_email !== "string") {
    return new Response("new_email is required", { status: 400, headers: corsHeaders });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  // email_confirm: true applies the change immediately as an admin override,
  // rather than Supabase's normal double-opt-in flow that emails both the
  // old and new address for confirmation before it takes effect.
  const { error } = await adminClient.auth.admin.updateUserById(target_user_id, {
    email: new_email,
    email_confirm: true,
  });
  if (error) {
    console.error("admin-update-user-email failed:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }

  return new Response(null, { status: 204, headers: corsHeaders });
});
