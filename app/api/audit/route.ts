import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, serverError, unauthorized } from "@/lib/http/error";

// AUDIT M12: cursor-based pagination so /audit can scale past the original limit(100).
// Cursor is the ISO timestamp of the last row's created_at (ordering is descending).
const querySchema = z.object({
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return unauthorized();
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return badRequest("Invalid query", { code: "invalid_query", details: parsed.error.flatten() });
  }
  const limit = parsed.data.limit ?? 50;

  let query = supabase
    .from("audit_events")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (parsed.data.cursor) {
    query = query.lt("created_at", parsed.data.cursor);
  }

  const { data, error } = await query;

  if (error) {
    return serverError(error.message, { code: "audit_query_failed" });
  }

  const events = data ?? [];
  const nextCursor = events.length === limit ? events[events.length - 1]!.created_at : null;

  return NextResponse.json({ events, nextCursor });
}
