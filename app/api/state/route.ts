import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";

const STATE_ID = "main";
const MAX_PAYLOAD_BYTES = 1_500_000;

export async function GET() {
  try {
    const db = env.DB;
    if (!db) throw new Error("DB binding unavailable");
    const row = await db.prepare(
      "SELECT payload, updated_at FROM app_state WHERE id = ?",
    )
      .bind(STATE_ID)
      .first<{ payload: string; updated_at: string }>();
    return NextResponse.json({
      state: row ? JSON.parse(row.payload) : null,
      updatedAt: row?.updated_at ?? null,
    });
  } catch (error) {
    console.error("Failed to load schedule state", error);
    return NextResponse.json({ error: "排班数据暂时无法读取，请稍后重试。" }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  try {
    const db = env.DB;
    if (!db) throw new Error("DB binding unavailable");
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_PAYLOAD_BYTES) {
      return NextResponse.json({ error: "保存内容过大。" }, { status: 413 });
    }
    const state = JSON.parse(raw) as unknown;
    if (!state || typeof state !== "object") {
      return NextResponse.json({ error: "数据格式不正确。" }, { status: 400 });
    }
    const payload = JSON.stringify(state);
    const updatedAt = new Date().toISOString();
    await db.prepare(
      `INSERT INTO app_state (id, payload, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
    ).bind(STATE_ID, payload, updatedAt).run();
    return NextResponse.json({ saved: true, updatedAt });
  } catch (error) {
    console.error("Failed to save schedule state", error);
    return NextResponse.json({ error: "保存失败，请保留当前页面后重试。" }, { status: 503 });
  }
}
