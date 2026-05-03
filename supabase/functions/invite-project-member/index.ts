import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type InvitePayload = {
  email?: string;
  projectId?: string;
  /** Alias for clients that send snake_case */
  project_id?: string;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

if (!supabaseUrl || !serviceRoleKey || !anonKey) {
  console.error("[invite-project-member] Missing required env vars.");
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const jwt = authHeader.slice("Bearer ".length);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    let raw: InvitePayload;
    try {
      raw = (await req.json()) as InvitePayload;
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const normalizedEmail = String(raw.email ?? "").trim().toLowerCase();
    const normalizedProjectId = String(
      raw.projectId ?? raw.project_id ?? "",
    ).trim();

    if (!normalizedEmail || !normalizedProjectId) {
      return jsonResponse({ error: "email and projectId are required" }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const redirectTo = Deno.env.get("INVITE_REDIRECT_URL") ?? undefined;

    const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      normalizedEmail,
      redirectTo ? { redirectTo } : undefined,
    );

    if (inviteError) {
      return jsonResponse({ error: inviteError.message }, 400);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});

