import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  createAgentStreamResponse,
  createLangGraphClient,
  resolveUserId,
} from "../shared";

/** Body nhận từ client (resume HITL interrupt). */
interface ResumeBody {
  threadId?: string;
  decision?: string;
  userId?: string;
}

/**
 * Route handler server-side — resume agent stream sau HITL (approve/reject).
 *
 * FE POST `{ threadId, decision, userId }` → route resume agent stream với
 * `command.resume { decisions: [{ type: decision }] }`. Agent tiếp tục:
 * - approve → write_file ghi prose → RubricMiddleware đánh giá → hoàn thành
 * - reject → agent nhận ToolMessage "rejected" → trả lời user → hoàn thành
 *
 * Sau khi agent hoàn thành: cùng DB update logic như write route (read
 * _rubric_status → update chapters + rubric_evaluations).
 *
 * @param req - NextRequest chứa JSON body `{ threadId, decision, userId? }`.
 * @param params - Dynamic route params `{ id: string }` (novelId).
 * @returns SSE Response (streaming) hoặc JSON error (validation).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: novelId } = await params;

  let body: ResumeBody;
  try {
    body = (await req.json()) as ResumeBody;
  } catch {
    return NextResponse.json(
      { error: "Body không hợp lệ." },
      { status: 400 },
    );
  }

  const threadId = body.threadId?.trim();
  if (!threadId) {
    return NextResponse.json(
      { error: "Thiếu threadId." },
      { status: 400 },
    );
  }

  const decision = body.decision?.trim();
  if (decision !== "approve" && decision !== "reject") {
    return NextResponse.json(
      { error: "Decision phải là 'approve' hoặc 'reject'." },
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

  const userId = resolveUserId(body.userId);
  if (!userId) {
    return NextResponse.json(
      { error: "Đăng nhập để tiếp tục." },
      { status: 401 },
    );
  }

  return createAgentStreamResponse(
    client,
    threadId,
    {
      command: {
        resume: { decisions: [{ type: decision }] },
      },
      input: null,
      context: { user_id: userId, novel_id: novelId },
      streamMode: "values" as const,
    },
    { novelId, userId },
  );
}
