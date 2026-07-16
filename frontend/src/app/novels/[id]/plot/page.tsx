"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ACT_LABELS,
  STC_BEATS,
  createBeat,
  deriveStatus,
  listBeats,
  updateBeat,
  type Beat,
} from "@/lib/beats";

/**
 * Beat đã merge cấu trúc StC (act + hint) với DB row (id + content).
 * `id` null khi DB chưa có row (init_beats chưa chạy).
 */
interface MergedBeat extends Beat {
  act: 1 | 2 | 3;
  hint: string;
}

/**
 * Gộp 15 beat StC (cấu trúc cố định) với DB rows theo `beat_number`.
 * DB row cung cấp id + content; beat thiếu → id null, content null.
 * @param dbBeats - Mảng beat từ Supabase.
 * @param novelId - UUID novel (dự phòng khi DB row thiếu novel_id).
 * @returns 15 MergedBeat theo thứ tự narrative.
 */
function mergeBeats(dbBeats: Beat[], novelId: string): MergedBeat[] {
  return STC_BEATS.map((stc) => {
    const db = dbBeats.find((b) => b.beat_number === stc.beat_number);
    return {
      id: db?.id ?? null,
      novel_id: db?.novel_id ?? novelId,
      beat_number: stc.beat_number,
      beat_name: db?.beat_name ?? stc.beat_name,
      content: db?.content ?? null,
      status: db?.status ?? null,
      created_at: db?.created_at ?? null,
      updated_at: db?.updated_at ?? null,
      act: stc.act,
      hint: stc.hint,
    };
  });
}

/**
 * Trang Plot view — beat sheet 15 nhịp Save the Cat.
 *
 * Fetch beats qua Supabase browser client, merge với cấu trúc StC cố định,
 * render 15 slot nhóm theo 3 hồi. Mỗi slot editable, auto-save on blur
 * (slot có id → update, slot thiếu id → create).
 */
export default function PlotPage() {
  const params = useParams<{ id: string }>();
  const novelId = params.id;

  const [beats, setBeats] = useState<MergedBeat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!novelId) return;
    let cancelled = false;
    listBeats(novelId)
      .then((data) => {
        if (!cancelled) setBeats(mergeBeats(data, novelId));
      })
      .catch((e) => {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Không thể tải beat sheet.",
          );
          // Vẫn render 15 slot rỗng để user có thể điền (resilient).
          setBeats(mergeBeats([], novelId));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [novelId]);

  /**
   * Callback khi một beat lưu xong — cập nhật id/content vào state.
   * @param beatNumber - Số thứ tự beat.
   * @param saved - Beat trả về từ Supabase (kèm id mới nếu vừa create).
   */
  function handleSaved(beatNumber: number, saved: Beat) {
    setBeats((prev) =>
      prev.map((b) =>
        b.beat_number === beatNumber
          ? {
              ...b,
              id: saved.id,
              content: saved.content,
              status: saved.status,
              updated_at: saved.updated_at,
            }
          : b,
      ),
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link
        href="/"
        className="text-sm text-muted transition-colors hover:text-ink"
      >
        ← Quay lại
      </Link>

      <header className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-vermilion dark:text-terracotta">
          Cốt truyện
        </p>
        <h1 className="mt-1 font-serif text-3xl font-semibold text-ink">
          Beat Sheet
        </h1>
        <p className="mt-1 text-sm text-muted">Save the Cat · 15 nhịp</p>
      </header>

      {loading && (
        <p className="mt-8 text-sm text-muted">Đang tải beat sheet…</p>
      )}

      {!loading && error && (
        <div className="mt-6 rounded-lg border border-vermilion/20 bg-vermilion-soft p-4 text-sm text-vermilion dark:text-terracotta">
          {error}
        </div>
      )}

      {!loading &&
        ([1, 2, 3] as const).map((act) => (
          <section key={act} className="mt-8 first:mt-8">
            <div className="flex items-baseline justify-between border-b border-line pb-2">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted">
                {ACT_LABELS[act].name}
              </h2>
              <span className="font-mono text-[11px] text-muted">
                {ACT_LABELS[act].range}
              </span>
            </div>
            {beats
              .filter((b) => b.act === act)
              .map((beat) => (
                <BeatSlot
                  key={beat.beat_number}
                  novelId={novelId}
                  beat={beat}
                  onSaved={handleSaved}
                />
              ))}
          </section>
        ))}
    </div>
  );
}

/**
 * Một slot beat — số + chấm trạng thái + tên + textarea editable.
 * Component riêng để UF-3 có thể extend (nest scenes) mà không redesign.
 */
function BeatSlot({
  novelId,
  beat,
  onSaved,
}: {
  novelId: string;
  beat: MergedBeat;
  onSaved: (beatNumber: number, saved: Beat) => void;
}) {
  const [content, setContent] = useState(beat.content ?? "");
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /**
   * Lưu beat on blur: có id → update, thiếu id → create (resilient).
   */
  async function handleBlur() {
    if (!isDirty) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const saved = beat.id
        ? await updateBeat(beat.id, content)
        : await createBeat(novelId, beat.beat_number, beat.beat_name, content);
      setIsDirty(false);
      onSaved(beat.beat_number, saved);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Không thể lưu beat.");
    } finally {
      setIsSaving(false);
    }
  }

  const status = deriveStatus(content, isDirty);
  const dotClass =
    status === "filled"
      ? "bg-sage"
      : status === "draft"
        ? "bg-vermilion"
        : "border border-muted";

  return (
    <div
      data-testid={`beat-${beat.beat_number}`}
      className="flex gap-4 border-b border-line py-4"
    >
      <div className="flex w-9 flex-none flex-col items-center gap-2 pt-1">
        <span className="font-mono text-sm text-vermilion dark:text-terracotta">
          {String(beat.beat_number).padStart(2, "0")}
        </span>
        <span
          data-status={status}
          className={`h-2 w-2 rounded-full ${dotClass}`}
          aria-label={`trạng thái: ${status}`}
        />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="font-serif text-lg font-semibold text-ink">
          {beat.beat_name}
        </h3>
        <p className="mt-0.5 text-xs text-muted">{beat.hint}</p>
        <textarea
          aria-label={`Nội dung ${beat.beat_name}`}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            setIsDirty(true);
          }}
          onBlur={handleBlur}
          placeholder="Viết nội dung beat này…"
          className="mt-2 w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 font-serif text-[15px] leading-relaxed text-ink outline-none transition-colors focus:border-vermilion dark:focus:border-terracotta"
        />
        {isSaving && <p className="mt-1 text-xs text-muted">đang lưu…</p>}
        {saveError && (
          <p className="mt-1 text-xs text-vermilion dark:text-terracotta">
            {saveError}
          </p>
        )}
      </div>
    </div>
  );
}
