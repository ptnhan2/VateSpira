import { Client } from "@langchain/langgraph-sdk";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import type { ScaffoldFile } from "@/lib/agent";

/** Body nhận từ client (form fields + userId tùy chọn). */
interface CreateNovelBody {
  title?: string;
  genre?: string;
  language?: string;
  pov?: string;
  tense?: string;
  technique?: string;
  userId?: string;
}

/** Kết quả trích xuất novel từ state agent (từ tool message create_novel). */
interface ExtractedNovel {
  novelId: string;
  scaffold: ScaffoldFile[];
}

/**
 * Route handler server-side — proxy tạo novel qua LangGraph agent.
 *
 * FE (client component) KHÔNG gọi LangGraph trực tiếp vì `LANGSMITH_API_KEY`
 * là secret. Route này đọc `LANGSMITH_API_URL` + `LANGSMITH_API_KEY` từ env
 * (root `.env` qua `next.config.ts` dotenv), dùng `@langchain/langgraph-sdk`
 * gọi agent "novel-agent". Agent nhận message → gọi @tool create_novel →
 * insert DB + scaffold `/manuscript/outline.md` + `/memories/novel-bible.md`.
 *
 * user_id: lấy từ `body.userId` (session browser) hoặc fallback
 * `VATESPIRA_DEV_USER_ID` (dev mode, auth chưa wired). Khi production wire
 * auth, thay bằng verify JWT server-side (TODO).
 *
 * @param req - NextRequest chứa JSON body (form fields + userId tùy chọn).
 * @returns JSON `{ success, novelId?, scaffold?, error? }`.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: CreateNovelBody;
  try {
    body = (await req.json()) as CreateNovelBody;
  } catch {
    return NextResponse.json(
      { error: "Body không hợp lệ." },
      { status: 400 },
    );
  }

  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json(
      { error: "Tiêu đề không được để trống." },
      { status: 400 },
    );
  }

  const apiUrl = process.env.LANGSMITH_API_URL;
  const apiKey = process.env.LANGSMITH_API_KEY;
  if (!apiUrl || !apiKey) {
    return NextResponse.json(
      { error: "Server chưa cấu hình LangGraph." },
      { status: 500 },
    );
  }

  // TODO(auth): verify JWT server-side thay vì tin body.userId (MVP chưa wire auth).
  const userId = body.userId?.trim() || process.env.VATESPIRA_DEV_USER_ID;
  if (!userId) {
    return NextResponse.json(
      { error: "Đăng nhập để tạo tiểu thuyết." },
      { status: 401 },
    );
  }

  const message =
    `Tạo novel mới. Hãy gọi tool create_novel với các tham số: ` +
    `title="${title}", genre="${body.genre ?? ""}", ` +
    `language="${body.language ?? "vi"}", pov="${body.pov ?? ""}", ` +
    `tense="${body.tense ?? ""}", technique="${body.technique ?? "save-the-cat"}".`;

  try {
    const client = new Client({ apiUrl, apiKey });
    const thread = await client.threads.create();
    const threadId = (thread as { thread_id: string }).thread_id;

    const stream = client.runs.stream(threadId, "novel-agent", {
      input: { messages: [{ role: "user", content: message }] },
      context: { user_id: userId },
      streamMode: "values" as const,
    });

    let finalState: Record<string, unknown> | null = null;
    for await (const chunk of stream) {
      if (chunk.event === "error") {
        const errData = chunk.data as { message?: string; error?: string };
        return NextResponse.json(
          {
            error: `Agent lỗi: ${
              errData.message ?? errData.error ?? "không xác định"
            }`,
          },
          { status: 502 },
        );
      }
      if (chunk.event === "values") {
        finalState = chunk.data as Record<string, unknown>;
      }
    }

    const extracted = extractNovelFromState(finalState);
    if (!extracted) {
      return NextResponse.json(
        { error: "Agent không tạo được tiểu thuyết. Vui lòng thử lại." },
        { status: 502 },
      );
    }
    return NextResponse.json({
      success: true,
      novelId: extracted.novelId,
      scaffold: extracted.scaffold,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lỗi không xác định.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

/**
 * Trích xuất novelId + scaffold từ state agent (lấy từ tool message create_novel).
 *
 * Tìm message cuối cùng có type/role "tool" mà content parse thành JSON chứa
 * `id` (UUID) + `scaffold` array — đó là kết quả create_novel tool trả về.
 *
 * @param state - State values cuối cùng từ stream (chứa `messages`).
 * @returns `{ novelId, scaffold }` nếu tìm thấy, ngược lại null.
 */
function extractNovelFromState(
  state: Record<string, unknown> | null,
): ExtractedNovel | null {
  if (!state) return null;
  const maybeMessages =
    (state.messages as unknown[]) ??
    (state as { values?: { messages?: unknown[] } }).values?.messages;
  if (!Array.isArray(maybeMessages)) return null;

  for (let i = maybeMessages.length - 1; i >= 0; i--) {
    const msg = maybeMessages[i] as Record<string, unknown>;
    const type = msg.type ?? msg.role;
    if (type !== "tool") continue;

    const rawContent = msg.content;
    const text =
      typeof rawContent === "string"
        ? rawContent
        : Array.isArray(rawContent)
          ? (rawContent.find((b) => typeof b === "string") as
              | string
              | undefined) ?? ""
          : "";

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      continue;
    }

    if (typeof parsed.id === "string" && Array.isArray(parsed.scaffold)) {
      return {
        novelId: parsed.id,
        scaffold: parsed.scaffold as ScaffoldFile[],
      };
    }
  }
  return null;
}
