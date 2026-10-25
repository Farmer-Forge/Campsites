// Only callers holding the service role key may run the sync functions
// (Shawn, 2026-10-24). Supabase's own JWT check lets any valid JWT through,
// including the public anon key, so the sync functions check this as well.
export function isServiceRoleRequest(req: Request, serviceRoleKey: string | undefined): boolean {
  if (!serviceRoleKey) return false;
  return req.headers.get("Authorization") === `Bearer ${serviceRoleKey}`;
}
