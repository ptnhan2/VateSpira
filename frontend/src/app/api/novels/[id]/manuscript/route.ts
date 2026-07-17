import { Client } from "@langchain/langgraph-sdk";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Manuscript file từ StoreBackend (path + prose content). */
export interface ManuscriptFile {
  /** Đường dẫn file (vd '/manuscript/chapters/chapter_1.md'). */
  path: string;
  /** Nội dung prose (text). */
  content: string;
}

/**
 * Route handler server-side — đọc manuscript prose từ LangGraph StoreBackend.
 *
 * FE không thể đọc StoreBackend trực tiếp (server-side, cần API key). Route
 * này dùng `client.store.searchItems()` để list tất cả files trong namespace
 * `(userId, 'novels', novelId)`, filter chỉ lấy `/manuscript/` files.
 *
 * FE dùng route này cho chapter reader — khi user click chapter, tìm file
 * prose matching để hiển thị.
 *
 * @param req - NextRequest (query: `?userId=...`).
 * @param params - Dynamic route params `{ id: string }` (novelId).
 * @returns JSON `{ files: ManuscriptFile[] }`.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: novelId } = await params;

  const userId =
    req.nextUrl.searchParams.get("userId") ||
    process.env.VATESPIRA_DEV_USER_ID;
  if (!userId) {
    return NextResponse.json(
      { error: "Đăng nhập để xem manuscript." },
      { status: 401 },
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

  try {
    const client = new Client({ apiUrl, apiKey });
    // Namespace = (user_id, 'novels', novel_id) — match _manuscript_namespace
    const namespace = [userId, "novels", novelId];
    const response = await client.store.searchItems(namespace);
    const items = (response as { items?: Array<{ key: string; value: Record<string, unknown> }> }).items ?? [];

    const files: ManuscriptFile[] = items
      .filter((item) => item.key.startsWith("/manuscript/"))
      .map((item) => ({
        path: item.key,
        content: extractStoreContent(item.value),
      }));

    return NextResponse.json({ files });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lỗi không xác định.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

/**
 * Trích text content từ store item value.
 *
 * StoreBackend lưu file content dưới `value.content` (string hoặc legacy
 * list[str]). Hỗ trợ cả 2 format.
 *
 * @param value - Store item value dict.
 * @returns Text content.
 */
function extractStoreContent(value: Record<string, unknown>): string {
  const raw = value.content;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw.join("\n");
  return "";
}
