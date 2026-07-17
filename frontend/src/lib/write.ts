/**
 * Helper client-side gọi API streaming `/api/novels/[id]/write` + `/resume`.
 *
 * KHÔNG gọi LangGraph trực tiếp từ browser vì `LANGSMITH_API_KEY` là secret —
 * chỉ server-side route handler mới giữ key. Helper này POST tới route nội bộ,
 * route đó proxy sang agent + stream SSE về. Helper parse SSE (fetch +
 * ReadableStream — standard web API, KHÔNG reinvent library) và dispatch
 * events qua callbacks.
 */

/** Tin nhắn agent (đơn giản hóa từ LangChain message format cho FE render). */
export interface AgentMessage {
  /** Vai trò: 'human' (user) | 'ai' (agent) | 'tool' (kết quả tool). */
  role: "human" | "ai" | "tool";
  /** Nội dung text (đã trích từ content blocks nếu cần). */
  content: string;
  /** Tên tool (chỉ cho role='tool'). */
  toolName?: string;
}

/** HITL interrupt — agent đề xuất write_file, chờ user duyệt/từ chối. */
export interface HitlInterrupt {
  /** Thread ID (dùng cho resume). */
  threadId: string;
  /** Run ID (dùng cho cancel nếu cần). */
  runId: string;
  /** Tên tool bị interrupt (thường 'write_file'). */
  toolName: string;
  /** Đường dẫn file đề xuất ghi (vd '/manuscript/chapters/...'). */
  path: string;
  /** Nội dung prose đề xuất (hiển thị trong editor panel). */
  content: string;
  /** Mô tả tool call (từ HumanInTheLoopMiddleware). */
  description: string;
}

/** Kết quả khi agent hoàn thành (sau rubric evaluation + DB update). */
export interface WriteComplete {
  /** Trạng thái rubric: 'satisfied' | 'needs_revision' | ... | null. */
  rubricStatus: string | null;
  /** UUID chapter vừa tạo/cập nhật (null nếu agent không ghi chapter). */
  chapterId: string | null;
  /** Trạng thái chapter sau khi map rubric → chapter status. */
  chapterStatus: string | null;
  /** Số từ của chapter. */
  wordCount: number | null;
}

/** Callbacks cho stream write/resume — mỗi event kích hoạt callback tương ứng. */
export interface WriteStreamCallbacks {
  /** Khi nhận metadata (threadId + runId) — đầu stream. */
  onMetadata?: (meta: { threadId: string; runId: string }) => void;
  /** Khi nhận state snapshot (messages array) — mỗi bước agent. */
  onState?: (messages: AgentMessage[]) => void;
  /** Khi agent đề xuất write_file (HITL) — hiển thị prose + approve/reject. */
  onInterrupt?: (interrupt: HitlInterrupt) => void;
  /** Khi agent hoàn thành (sau rubric + DB update). */
  onComplete?: (result: WriteComplete) => void;
  /** Khi có lỗi. */
  onError?: (error: string) => void;
}

/**
 * Stream agent write — gửi message, nhận SSE stream từ route.
 *
 * POST `/api/novels/[novelId]/write` với body `{ message, userId }`. Route
 * server-side tạo thread + stream agent "novel-agent" qua LangGraph SDK.
 * Mỗi event SSE (metadata/state/interrupt/complete/error) dispatch callback.
 *
 * @param novelId - UUID novel.
 * @param message - Tin nhắn user (vd "viết chương 1 theo beat 8").
 * @param userId - user_id từ session (undefined → route dùng dev fallback).
 * @param callbacks - Các callback xử lý events.
 */
export async function streamWrite(
  novelId: string,
  message: string,
  userId: string | undefined,
  callbacks: WriteStreamCallbacks,
): Promise<void> {
  await consumeSSEStream(
    `/api/novels/${novelId}/write`,
    { message, userId },
    callbacks,
  );
}

/**
 * Resume agent — approve hoặc reject HITL interrupt.
 *
 * POST `/api/novels/[novelId]/write/resume` với body `{ threadId, decision, userId }`.
 * Route resume agent stream với `command.resume { decisions: [{ type: decision }] }`.
 *
 * @param novelId - UUID novel.
 * @param threadId - Thread ID từ interrupt event.
 * @param decision - 'approve' (ghi file + rubric eval) | 'reject' (agent nhận phản hồi).
 * @param userId - user_id từ session.
 * @param callbacks - Các callback xử lý events.
 */
export async function resumeWrite(
  novelId: string,
  threadId: string,
  decision: "approve" | "reject",
  userId: string | undefined,
  callbacks: WriteStreamCallbacks,
): Promise<void> {
  await consumeSSEStream(
    `/api/novels/${novelId}/write/resume`,
    { threadId, decision, userId },
    callbacks,
  );
}

/**
 * Consumes SSE stream từ POST endpoint, parse events, dispatch callbacks.
 *
 * Dùng fetch + ReadableStream reader (standard web API). Parse SSE format
 * (`event: <type>\ndata: <json>\n\n`) và dispatch theo event type.
 *
 * @param url - Endpoint URL (relative path).
 * @param body - JSON body cho POST.
 * @param callbacks - Callbacks xử lý events.
 */
async function consumeSSEStream(
  url: string,
  body: Record<string, unknown>,
  callbacks: WriteStreamCallbacks,
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    callbacks.onError?.(err.error ?? "Lỗi không xác định.");
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events phân tách bởi \n\n
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        const parsed = parseSSEEvent(part);
        if (parsed) dispatchSSEEvent(parsed.event, parsed.data, callbacks);
      }
    }
    // Flush buffer còn dư
    if (buffer.trim()) {
      const parsed = parseSSEEvent(buffer);
      if (parsed) dispatchSSEEvent(parsed.event, parsed.data, callbacks);
    }
  } catch (err) {
    callbacks.onError?.(
      err instanceof Error ? err.message : "Lỗi stream.",
    );
  }
}

/** Kết quả parse một SSE event. */
interface ParsedSSE {
  event: string;
  data: unknown;
}

/**
 * Parse một SSE event string thành `{ event, data }`.
 *
 * Format: `event: <type>\ndata: <json>` (có thể nhiều dòng data).
 *
 * @param raw - SSE event string (không chứa \n\n ở cuối).
 * @returns Parsed event hoặc null nếu không hợp lệ.
 */
function parseSSEEvent(raw: string): ParsedSSE | null {
  const lines = raw.split("\n");
  let event = "";
  let dataStr = "";
  for (const line of lines) {
    if (line.startsWith("event: ")) event = line.slice(7).trim();
    else if (line.startsWith("data: ")) dataStr += line.slice(6);
  }
  if (!event) return null;
  let data: unknown = null;
  try {
    data = JSON.parse(dataStr);
  } catch {
    data = dataStr;
  }
  return { event, data };
}

/**
 * Dispatch SSE event tới callback tương ứng.
 *
 * @param event - Event type (metadata/state/interrupt/complete/error).
 * @param data - Event data (đã parse JSON).
 * @param cb - Callbacks object.
 */
function dispatchSSEEvent(
  event: string,
  data: unknown,
  cb: WriteStreamCallbacks,
): void {
  switch (event) {
    case "metadata":
      cb.onMetadata?.(data as { threadId: string; runId: string });
      break;
    case "state":
      cb.onState?.((data as { messages: AgentMessage[] }).messages);
      break;
    case "interrupt":
      cb.onInterrupt?.(data as HitlInterrupt);
      break;
    case "complete":
      cb.onComplete?.(data as WriteComplete);
      break;
    case "error":
      cb.onError?.(
        (data as { message?: string }).message ?? "Lỗi agent.",
      );
      break;
  }
}
