import { approveAllPending } from "../pipeline/scheduler";

export async function handleApproval(
  db: D1Database,
  action: string,
): Promise<{ ok: boolean; message: string }> {
  if (action === "approve_all") {
    const count = await approveAllPending(db);
    return { ok: true, message: `${count}件の投稿を承認しました` };
  }

  if (action.startsWith("approve_")) {
    const id = parseInt(action.replace("approve_", ""), 10);
    if (isNaN(id)) return { ok: false, message: "無効なID" };
    await db
      .prepare("UPDATE schedule_queue SET status = 'approved' WHERE id = ?")
      .bind(id)
      .run();
    return { ok: true, message: `投稿 #${id} を承認しました` };
  }

  if (action.startsWith("reject_")) {
    const id = parseInt(action.replace("reject_", ""), 10);
    if (isNaN(id)) return { ok: false, message: "無効なID" };
    await db
      .prepare("UPDATE schedule_queue SET status = 'rejected' WHERE id = ?")
      .bind(id)
      .run();
    return { ok: true, message: `投稿 #${id} を却下しました` };
  }

  return { ok: false, message: "不明なアクション" };
}
