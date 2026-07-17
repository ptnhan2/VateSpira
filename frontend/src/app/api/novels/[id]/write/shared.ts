/**
 * Shared server-side logic cho write + resume routes.
 *
 * Cả 2 route (write/route.ts + write/resume/route.ts) đều cần:
 * 1. Stream agent qua LangGraph SDK → emit SSE events
 * 2. Sau khi stream kết thúc: detect interrupt (HITL) hoặc completion
 * 3. Nếu completion: read _rubric_status → update chapters + rubric_evaluations
 *
 * File này export `createAgentStreamResponse` — tạo SSE Response wrapping
 * toàn bộ flow. Route chỉ cần tạo thread + gọi function này.
 */

import { Client } from "@langchain/langgraph-sdk";
import { createClient } from "@supabase/supabase-js";

/** Mapping rubric result → chapter status (giống codex_service.py). */
const RUBRIC_STATUS_TO_CHAPTER_STATUS: Record<string, string> = {
  satisfied: "final",
  needs_revision: "revised",
  max_iterations_reached: "revised",
  failed: "draft",
  grader_error: "draft",
};

/**
 * Rubric string truyền trong invocation state (KHÁC CHAPTER_RUBRIC_PROMPT).
 *
 * CHAPTER_RUBRIC_PROMPT (agent.py) = grader system prompt (hướng dẫn grader
 * sub-agent cách chấm). Rubric string (state) = nội dung cần đánh giá (5 tiêu
 * chí). RubricMiddleware đọc `rubric` từ state, dùng CHAPTER_RUBRIC_PROMPT làm
 * system prompt cho grader, chấm prose transcript against rubric string.
 */
export const CHAPTER_RUBRIC_STRING = `Evaluate the chapter prose quality against 5 criteria:
1. Beat alignment — Does the chapter advance the assigned story beats from the beat sheet?
2. Voice/POV/tense consistency — Is the narrative voice, point of view, and tense consistent throughout?
3. Show-don't-tell — Does the prose dramatize scenes through action and sensory detail rather than summarizing?
4. Character consistency — Do characters behave and speak according to their established profiles?
5. Pacing — Does the chapter maintain appropriate rhythm, tension, and emotional beats?`;

/** Hàm gửi SSE event — enqueue text vào ReadableStream controller. */
type SSESender = (event: string, data: unknown) => void;

/** Options cho agent stream — context cho DB update. */
export interface StreamOptions {
  /** UUID novel. */
  novelId: string;
  /** UUID user (enforce ownership khi update DB). */
  userId: string;
}

/**
 * Tạo LangGraph client từ env vars.
 *
 * @returns Client nếu LANGSMITH_API_URL + LANGSMITH_API_KEY đã set, null nếu thiếu.
 */
export function createLangGraphClient(): Client | null {
  const apiUrl = process.env.LANGSMITH_API_URL;
  const apiKey = process.env.LANGSMITH_API_KEY;
  if (!apiUrl || !apiKey) return null;
  return new Client({ apiUrl, apiKey });
}

/**
 * Resolve user_id từ body hoặc dev fallback env.
 *
 * @param bodyUserId - user_id từ request body (session browser).
 * @returns user_id string, hoặc null nếu thiếu cả body + env.
 */
export function resolveUserId(bodyUserId?: string): string | null {
  return bodyUserId?.trim() || process.env.VATESPIRA_DEV_USER_ID || null;
}

/**
 * Tạo SSE Response wrapping agent stream + post-completion DB update.
 *
 * Route tạo thread, rồi gọi function này với payload (input cho write,
 * command.resume cho resume). Function:
 * 1. Tạo ReadableStream + SSE sender
 * 2. Stream agent qua `client.runs.stream()` — emit state/metadata events
 * 3. Sau khi stream kết thúc: check `client.threads.getState()`
 *    - Interrupted → emit interrupt event (HITL — proposed prose)
 *    - Completed → read _rubric_status → update DB → emit complete event
 *
 * @param client - LangGraph client.
 * @param threadId - Thread ID (mới cho write, có sẵn cho resume).
 * @param payload - RunsStreamPayload (input/context/streamMode hoặc command.resume).
 * @param opts - novelId + userId cho DB update.
 * @returns Response với content-type text/event-stream.
 */
export function createAgentStreamResponse(
  client: Client,
  threadId: string,
  payload: Record<string, unknown>,
  opts: StreamOptions,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send: SSESender = (event, data) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };
      try {
        await runAgentStream(client, threadId, payload, opts, send);
      } catch (err) {
        send("error", {
          message: err instanceof Error ? err.message : "Lỗi không xác định.",
        });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/**
 * Core streaming logic — iterate agent stream, emit events, detect interrupt/complete.
 *
 * @param client - LangGraph client.
 * @param threadId - Thread ID.
 * @param payload - Stream payload.
 * @param opts - novelId + userId.
 * @param send - SSE sender function.
 */
async function runAgentStream(
  client: Client,
  threadId: string,
  payload: Record<string, unknown>,
  opts: StreamOptions,
  send: SSESender,
): Promise<void> {
  let finalState: Record<string, unknown> | null = null;
  let runId = "";

  const stream = client.runs.stream(threadId, "novel-agent", payload);
  for await (const chunk of stream) {
    const ev = chunk.event;
    if (ev === "error") {
      const errData = chunk.data as { message?: string; error?: string };
      send("error", {
        message: errData.message ?? errData.error ?? "Agent lỗi.",
      });
      return;
    }
    if (ev === "metadata") {
      const meta = chunk.data as { run_id?: string; thread_id?: string };
      runId = meta.run_id ?? "";
      send("metadata", { threadId, runId });
    }
    if (ev === "values") {
      finalState = chunk.data as Record<string, unknown>;
      const messages = extractMessages(finalState);
      if (messages.length > 0) send("state", { messages });
    }
  }

  // Stream kết thúc. Kiểm tra: interrupt hay completion?
  // Delay nhỏ để đảm bảo interrupt đã được register trong thread state (race condition fix).
  await new Promise((resolve) => setTimeout(resolve, 500));
  const state = await client.threads.getState(threadId);
  const nextNodes = (state as { next?: string[] }).next ?? [];

  if (nextNodes.length > 0) {
    // Interrupted (HITL) — đọc interrupt value từ tasks
    const interrupt = extractInterruptFromState(state, threadId, runId);
    if (interrupt) {
      send("interrupt", interrupt);
    } else {
      send("error", {
        message:
          "Agent tạm dừng nhưng không đọc được nội dung đề xuất.",
      });
    }
  } else if (finalState) {
    // Completed — read _rubric_status → update DB
    const result = await updateChapterAfterCompletion(
      finalState,
      opts,
      threadId,
    );
    send("complete", result);
  } else {
    send("error", { message: "Agent kết thúc mà không trả về kết quả." });
  }
}

/** Message trong LangGraph state (đơn giản hóa cho extract). */
interface RawMessage {
  type?: string;
  role?: string;
  content?: unknown;
  name?: string;
}

/**
 * Trích xuất messages từ state, convert sang AgentMessage format cho FE.
 *
 * LangGraph state `messages` chứa LangChain message objects. Content có thể
 * là string (text) hoặc array of content blocks (multimodal). Trích text-only.
 *
 * @param state - State values từ stream chunk.
 * @returns Mảng AgentMessage (human/ai/tool) với text content.
 */
function extractMessages(
  state: Record<string, unknown>,
): Array<{ role: "human" | "ai" | "tool"; content: string; toolName?: string }> {
  const msgs = state.messages as unknown[] | undefined;
  if (!Array.isArray(msgs)) return [];
  return msgs
    .map((m) => {
      const msg = m as RawMessage;
      const type = msg.type ?? msg.role ?? "";
      const content = extractTextContent(msg.content);
      const role: "human" | "ai" | "tool" =
        type === "human"
          ? "human"
          : type === "ai"
            ? "ai"
            : "tool";
      return { role, content, toolName: type === "tool" ? msg.name : undefined };
    })
    .filter((m) => m.content || m.role === "tool");
}

/**
 * Trích text từ message content (string hoặc array of blocks).
 *
 * @param content - LangChain message content (string | content block[]).
 * @returns Text content đã join.
 */
function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) =>
        typeof b === "string"
          ? b
          : typeof b === "object" && b && "text" in b
            ? String((b as { text: unknown }).text)
            : "",
      )
      .join("");
  }
  return "";
}

/** HITLRequest structure từ HumanInTheLoopMiddleware interrupt. */
interface HitlRequest {
  action_requests?: Array<{
    name?: string;
    args?: Record<string, unknown>;
    description?: string;
  }>;
}

/**
 * Trích HITL interrupt info từ thread state (sau khi stream kết thúc).
 *
 * Thread state `tasks[].interrupts[].value` chứa HITLRequest. Parse
 * `action_requests[0].args` để lấy file_path + content (proposed prose).
 *
 * @param state - Thread state từ `client.threads.getState()`.
 * @param threadId - Thread ID.
 * @param runId - Run ID (từ metadata event).
 * @returns HitlInterrupt info hoặc null nếu không parse được.
 */
function extractInterruptFromState(
  state: unknown,
  threadId: string,
  runId: string,
): {
  threadId: string;
  runId: string;
  toolName: string;
  path: string;
  content: string;
  description: string;
} | null {
  const s = state as {
    tasks?: Array<{ interrupts?: Array<{ value?: unknown }> }>;
  };
  if (!s.tasks) return null;
  for (const task of s.tasks) {
    for (const interrupt of task.interrupts ?? []) {
      const hitl = interrupt.value as HitlRequest | undefined;
      const action = hitl?.action_requests?.[0];
      if (action) {
        return {
          threadId,
          runId,
          toolName: action.name ?? "unknown",
          path: String(action.args?.file_path ?? ""),
          content: String(action.args?.content ?? ""),
          description: action.description ?? "",
        };
      }
    }
  }
  return null;
}

/**
 * Sau khi agent hoàn thành: read _rubric_status → update chapters + rubric_evaluations.
 *
 * Đọc `_rubric_status` + `_rubric_evaluations` từ final state (PrivateStateAttr
 * — có trong state values nhưng LLM không thấy). Tìm chapter_id từ
 * save_chapter_metadata tool message. Map rubric status → chapter status.
 * Update DB qua Supabase service role (bypass RLS, manual ownership check).
 *
 * @param state - Final state values từ stream.
 * @param opts - novelId + userId.
 * @param threadId - Thread ID (lưu vào rubric_evaluations.thread_id).
 * @returns WriteComplete result cho FE.
 */
async function updateChapterAfterCompletion(
  state: Record<string, unknown>,
  opts: StreamOptions,
  threadId: string,
): Promise<{
  rubricStatus: string | null;
  chapterId: string | null;
  chapterStatus: string | null;
  wordCount: number | null;
}> {
  const rubricStatus = (state._rubric_status as string | undefined) ?? null;
  const evaluations = state._rubric_evaluations as
    | Array<Record<string, unknown>>
    | undefined;
  const chapterId = extractChapterId(state);

  if (!rubricStatus || !chapterId) {
    return { rubricStatus, chapterId, chapterStatus: null, wordCount: null };
  }

  const chapterStatus = RUBRIC_STATUS_TO_CHAPTER_STATUS[rubricStatus] ?? "draft";
  const lastEval = evaluations?.[evaluations.length - 1];

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return { rubricStatus, chapterId, chapterStatus: null, wordCount: null };
  }

  const sb = createClient(supabaseUrl, serviceKey);

  // Verify ownership: chapter.novel.user_id === userId
  const { data: chapter } = await sb
    .from("chapters")
    .select("*, novels!inner(user_id)")
    .eq("id", chapterId)
    .eq("novels.user_id", opts.userId)
    .single();

  if (!chapter) {
    return { rubricStatus, chapterId, chapterStatus: null, wordCount: null };
  }

  // Update chapter status
  await sb
    .from("chapters")
    .update({
      status: chapterStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", chapterId);

  // Insert rubric evaluation
  await sb.from("rubric_evaluations").insert({
    novel_id: opts.novelId,
    thread_id: threadId,
    rubric_id: chapterId,
    result: rubricStatus,
    criteria: lastEval?.criteria ?? [],
    explanation: lastEval?.explanation ?? null,
  });

  return {
    rubricStatus,
    chapterId,
    chapterStatus,
    wordCount: (chapter as { word_count?: number }).word_count ?? null,
  };
}

/**
 * Tìm chapter_id từ save_chapter_metadata tool message trong state.
 *
 * Tìm message cuối cùng có type='tool' mà content parse thành JSON chứa
 * `id` (UUID) + `number` (int) — đó là kết quả save_chapter_metadata.
 *
 * @param state - Final state values.
 * @returns chapter_id UUID hoặc null.
 */
function extractChapterId(state: Record<string, unknown>): string | null {
  const msgs = state.messages as unknown[] | undefined;
  if (!Array.isArray(msgs)) return null;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const msg = msgs[i] as RawMessage;
    const type = msg.type ?? msg.role;
    if (type !== "tool") continue;
    const text = extractTextContent(msg.content);
    try {
      const parsed = JSON.parse(text) as { id?: unknown; number?: unknown };
      if (typeof parsed.id === "string" && typeof parsed.number === "number") {
        return parsed.id;
      }
    } catch {
      continue;
    }
  }
  return null;
}
