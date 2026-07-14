"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

/** Tùy chọn thể loại tiểu thuyết. */
const GENRE_OPTIONS = [
  { value: "fantasy", label: "Fantasy" },
  { value: "sci-fi", label: "Sci-Fi" },
  { value: "romance", label: "Romance" },
  { value: "thriller", label: "Thriller" },
  { value: "literary", label: "Literary" },
  { value: "other", label: "Khác" },
] as const;

/** Tùy chọn ngôn ngữ — mặc định Tiếng Việt. */
const LANGUAGE_OPTIONS = [
  { value: "vi", label: "Tiếng Việt" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
  { value: "other", label: "Khác" },
] as const;

/** Tùy chọn điểm nhìn (point of view). */
const POV_OPTIONS = [
  { value: "1st", label: "Ngôi thứ nhất" },
  { value: "3rd", label: "Ngôi thứ ba" },
] as const;

/** Tùy chọn thì (tense). */
const TENSE_OPTIONS = [
  { value: "past", label: "Quá khứ" },
  { value: "present", label: "Hiện tại" },
] as const;

/**
 * Tùy chọn kỹ thuật cấu trúc — MVP chỉ có Save the Cat.
 * P2 sẽ thêm Snowflake, 12 Acts, 7-Point, Hero's Journey.
 */
const TECHNIQUE_OPTIONS = [
  { value: "save-the-cat", label: "Save the Cat" },
] as const;

/**
 * Trang tạo tiểu thuyết mới — form nhập title, genre, language, POV, tense
 * và chọn kỹ thuật cấu trúc (mặc định Save the Cat).
 *
 * Flow: nhập form → submit → insert vào Supabase novels table → redirect Dashboard.
 * Khi Supabase chưa cấu hình hoặc chưa có auth, hiển thị lỗi tương ứng.
 */
export default function NewNovelPage() {
  const router = useRouter();
  const configured = isSupabaseConfigured;

  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState<string>(GENRE_OPTIONS[0].value);
  const [language, setLanguage] = useState<string>(LANGUAGE_OPTIONS[0].value);
  const [pov, setPov] = useState<string>(POV_OPTIONS[0].value);
  const [tense, setTense] = useState<string>(TENSE_OPTIONS[0].value);
  const [technique, setTechnique] = useState<string>(
    TECHNIQUE_OPTIONS[0].value,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Xử lý submit form — insert novel vào Supabase rồi redirect về Dashboard.
   * @param e - Submit event.
   */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;

    setSubmitting(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error: insertError } = await supabase.from("novels").insert({
        title: trimmed,
        genre,
        language,
        pov,
        tense,
        technique,
        ...(user ? { user_id: user.id } : {}),
      });
      if (insertError) throw insertError;
      router.push("/");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể tạo tiểu thuyết. Kiểm tra cấu hình Supabase.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-10">
      <Link
        href="/"
        className="text-sm text-muted transition-colors hover:text-ink"
      >
        ← Quay lại
      </Link>

      <header className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-vermilion dark:text-terracotta">
          Tạo mới
        </p>
        <h1 className="mt-1 font-serif text-3xl font-semibold text-ink">
          Tạo tiểu thuyết mới
        </h1>
      </header>

      {!configured && (
        <div className="mt-6 rounded-lg border border-vermilion/20 bg-vermilion-soft p-4 text-sm text-ink-2">
          <p className="font-medium text-vermilion dark:text-terracotta">Cần cấu hình Supabase</p>
          <p className="mt-1">
            Đặt env vars trong{" "}
            <code className="font-mono text-xs">frontend/.env.local</code> trước
            khi tạo tiểu thuyết.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
        {/* Title */}
        <div>
          <label
            htmlFor="title"
            className="font-serif text-sm font-medium text-ink-2"
          >
            Tiêu đề
          </label>
          <input
            id="title"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Tên tiểu thuyết của bạn"
            className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-ink outline-none transition-colors focus:border-vermilion dark:focus:border-terracotta"
          />
        </div>

        {/* Genre + Language */}
        <div className="grid grid-cols-2 gap-4">
          <SelectField
            id="genre"
            label="Thể loại"
            value={genre}
            onChange={setGenre}
            options={GENRE_OPTIONS}
          />
          <SelectField
            id="language"
            label="Ngôn ngữ"
            value={language}
            onChange={setLanguage}
            options={LANGUAGE_OPTIONS}
          />
        </div>

        {/* POV + Tense */}
        <div className="grid grid-cols-2 gap-4">
          <SelectField
            id="pov"
            label="Điểm nhìn"
            value={pov}
            onChange={setPov}
            options={POV_OPTIONS}
          />
          <SelectField
            id="tense"
            label="Thì"
            value={tense}
            onChange={setTense}
            options={TENSE_OPTIONS}
          />
        </div>

        {/* Technique selector */}
        <div>
          <label
            htmlFor="technique"
            className="font-serif text-sm font-medium text-ink-2"
          >
            Kỹ thuật cấu trúc
          </label>
          <select
            id="technique"
            value={technique}
            onChange={(e) => setTechnique(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-ink outline-none transition-colors focus:border-vermilion dark:focus:border-terracotta"
          >
            {TECHNIQUE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-muted">
            Thêm kỹ thuật (Snowflake, 12 Acts) trong bản sau.
          </p>
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-vermilion dark:text-terracotta">{error}</p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting || !title.trim()}
          className="mt-2 self-start rounded-full bg-vermilion px-6 py-2.5 font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Đang tạo..." : "Tạo tiểu thuyết"}
        </button>
      </form>
    </div>
  );
}

interface Option {
  value: string;
  label: string;
}

/**
 * Trường select tái sử dụng — label font-serif + select styled Direction A.
 * @param id - HTML id cho label association.
 * @param label - Nhãn hiển thị.
 * @param value - Giá trị hiện tại.
 * @param onChange - Callback khi giá trị đổi.
 * @param options - Danh sách tùy chọn.
 */
function SelectField({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly Option[];
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="font-serif text-sm font-medium text-ink-2"
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-ink outline-none transition-colors focus:border-vermilion dark:focus:border-terracotta"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
