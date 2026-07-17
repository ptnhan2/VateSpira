import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  CHAPTER_RUBRIC_STRING,
  createAgentStreamResponse,
  createLangGraphClient,
  resolveUserId,
} from "./shared";

/** Body nhận từ client (chat message + userId tùy chọn). */
interface WriteBody {
  message?: string;
  userId?: string;
}

/**
 * Route handler server-side — start agent write stream (SSE).
 *
 * FE (client component) POST message → route tạo thread + stream agent
 * "novel-agent" qua LangGraph SDK. Agent đọc context (beats, scenes, codex)
 * + đề xuất prose → HITL interrupt → FE approve/reject → resume route.
 *
 * Sau khi agent hoàn thành: route đọc `_rubric_status` → update chapters
 * status + insert rubric_evaluations (via Supabase service role).
 *
 * Response: SSE stream (event: metadata/state/interrupt/complete/error).
 *
 * @param req - NextRequest chứa JSON body `{ message, userId? }`.
 * @param params - Dynamic route params `{ id: string }` (novelId).
 * @returns SSE Response (streaming) hoặc JSON error (validation).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: novelId } = await params;

  let body: WriteBody;
  try {
    body = (await req.json()) as WriteBody;
  } catch {
    return NextResponse.json(
      { error: "Body không hợp lệ." },
      { status: 400 },
    );
  }

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json(
      { error: "Tin nhắn không được để trống." },
      { status: 400 },
    );
  }

  const client = createLangGraphClient();
  if (!client) {
    return NextResponse.json(
      { error: "Server chưa cấu hình LangGraph." },
      { status: 500 },
    );
  }

  // TODO(auth): verify JWT server-side thay vì tin body.userId (MVP chưa wire auth).
  const userId = resolveUserId(body.userId);
  if (!userId) {
    return NextResponse.json(
      { error: "Đăng nhập để viết chapter." },
      { status: 401 },
    );
  }

  const thread = await client.threads.create();
  const threadId = (thread as { thread_id: string }).thread_id;

  return createAgentStreamResponse(
    client,
    threadId,
    {
      input: {
        messages: [{ role: "user", content: message }],
        rubric: CHAPTER_RUBRIC_STRING,
      },
      context: { user_id: userId, novel_id: novelId },
      streamMode: "values" as const,
    },
    { novelId, userId },
  );
}
