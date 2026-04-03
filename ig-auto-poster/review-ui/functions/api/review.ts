type Env = { DB: D1Database };

const ALLOWED = new Set(["approved", "rejected", "rejected_human"]);

type Body = {
  id?: unknown;
  status?: unknown;
};

export async function onRequestPost({
  request,
  env,
}: {
  request: Request;
  env: Env;
}): Promise<Response> {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const id = typeof body.id === "number" ? body.id : Number(body.id);
  const status = typeof body.status === "string" ? body.status : "";

  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }
  if (!ALLOWED.has(status)) {
    return Response.json(
      { ok: false, error: "invalid_status", allowed: [...ALLOWED] },
      { status: 400 },
    );
  }

  const updated = await env.DB.prepare(
    `UPDATE generated_content
     SET status = ?, reviewed_at = datetime('now')
     WHERE id = ? AND status IN ('pending_review', 'approved_auto')`,
  )
    .bind(status, id)
    .run();

  if (!updated.success || (updated.meta?.changes ?? 0) === 0) {
    return Response.json({ ok: false, error: "not_found_or_not_reviewable" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
