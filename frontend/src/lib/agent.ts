/**
 * Helper client-side gọi API nội bộ `/api/novels/create` để tạo novel qua
 * backend agent (LangGraph stream).
 *
 * KHÔNG gọi LangGraph trực tiếp từ browser vì `LANGSMITH_API_KEY` là secret —
 * chỉ server-side route handler (`app/api/novels/create/route.ts`) mới giữ key.
 * Helper này chỉ POST form data tới route nội bộ, route đó proxy sang agent.
 */

/** Dữ liệu form tạo novel + user_id tùy chọn (từ supabase.auth.getUser). */
export interface CreateNovelInput {
  /** Tiêu đề novel (bắt buộc). */
  title: string;
  /** Thể loại, vd 'fantasy', 'sci-fi'. */
  genre: string;
  /** Mã ngôn ngữ, vd 'vi', 'en'. */
  language: string;
  /** Điểm nhìn, vd '1st', '3rd'. */
  pov: string;
  /** Thì kể, vd 'past', 'present'. */
  tense: string;
  /** Kỹ thuật cấu trúc, vd 'save-the-cat'. */
  technique: string;
  /** user_id từ session browser; server dùng dev fallback env nếu thiếu (MVP). */
  userId?: string;
}

/** Trạng thái scaffold một file (trả về bởi create_novel tool). */
export interface ScaffoldFile {
  /** Đường dẫn file trong StoreBackend, vd '/manuscript/outline.md'. */
  path: string;
  /** True nếu scaffold thành công. */
  ok: boolean;
}

/** Kết quả tạo novel qua agent. */
export interface CreateNovelResult {
  /** True nếu agent tạo novel thành công. */
  success: boolean;
  /** UUID novel vừa tạo (có khi success). */
  novelId?: string;
  /** Danh sách file đã scaffold (có khi success). */
  scaffold?: ScaffoldFile[];
  /** Thông báo lỗi (có khi !success). */
  error?: string;
}

/**
 * Gọi API nội bộ tạo novel qua backend agent.
 *
 * POST `/api/novels/create` với body là form fields + userId tùy chọn.
 * Route handler server-side proxy sang LangGraph agent "novel-agent", agent
 * gọi @tool create_novel (insert DB + scaffold manuscript/memory files).
 *
 * @param input - Dữ liệu form + user_id tùy chọn.
 * @returns Kết quả `{ success, novelId?, scaffold?, error? }`.
 */
export async function createNovelViaAgent(
  input: CreateNovelInput,
): Promise<CreateNovelResult> {
  const res = await fetch("/api/novels/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    novelId?: string;
    scaffold?: ScaffoldFile[];
    error?: string;
  };
  if (!res.ok || !data.success) {
    return {
      success: false,
      error:
        data.error ?? "Không thể tạo tiểu thuyết. Vui lòng thử lại.",
    };
  }
  return {
    success: true,
    novelId: data.novelId,
    scaffold: data.scaffold,
  };
}
