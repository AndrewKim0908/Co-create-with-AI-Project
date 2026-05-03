import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type InvitePayload = {
  email?: string;
  projectId?: string;
  project_id?: string;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function isAlreadyRegisteredMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("already") ||
    m.includes("registered") ||
    m.includes("exists") ||
    m.includes("duplicate")
  );
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

    const {
      data: profileRows,
      error: profileLookupErr,
    } = await adminClient
      .from("profiles")
      .select("id, email")
      .eq("email", normalizedEmail)
      .limit(1);

    if (profileLookupErr) {
      console.warn(
        "[invite-project-member] profiles lookup:",
        profileLookupErr.message,
      );
    }

    let invitedUserId: string | null = null;
    let alreadyExistedInProfiles = false;

    if (profileRows && profileRows.length > 0) {
      invitedUserId = profileRows[0].id as string;
      alreadyExistedInProfiles = true;
      console.log(`[invite-project-member] Existing profile: ${normalizedEmail}`);
    } else {
      const redirectTo = Deno.env.get("INVITE_REDIRECT_URL") ?? undefined;
      const { data: inviteResult, error: inviteError } = await adminClient.auth.admin
        .inviteUserByEmail(
          normalizedEmail,
          redirectTo ? { redirectTo } : undefined,
        );

      if (inviteError) {
        if (!isAlreadyRegisteredMessage(inviteError.message ?? "")) {
          return jsonResponse({ error: inviteError.message }, 400);
        }
        const { data: again } = await adminClient
          .from("profiles")
          .select("id, email")
          .eq("email", normalizedEmail)
          .limit(1);
        if (again && again.length > 0) {
          invitedUserId = again[0].id as string;
        }
        console.log(
          `[invite-project-member] inviteUserByEmail skipped (registered): ${normalizedEmail}`,
        );
      } else {
        invitedUserId = inviteResult?.user?.id ?? null;
        console.log(`[invite-project-member] Invited: ${normalizedEmail}`);
      }
    }

    const { error: memberError } = await adminClient.from("project_members").upsert(
      {
        project_id: normalizedProjectId,
        invited_email: normalizedEmail,
        user_id: invitedUserId,
        invited_by: user.id,
        status: "pending",
      },
      { onConflict: "project_id,invited_email" },
    );

    if (memberError) {
      console.error("[invite-project-member] project_members upsert:", memberError);
      return jsonResponse({ error: memberError.message }, 400);
    }

    return jsonResponse({
      ok: true,
      alreadyRegistered: alreadyExistedInProfiles,
      linkedUserId: invitedUserId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[invite-project-member] Unexpected:", message);
    return jsonResponse({ error: message }, 500);
  }
});
