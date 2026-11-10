import Link from "next/link";

/** Branded Hebrew 404 — replaces the default black English Next.js page. */
export default function NotFound() {
  return (
    <div dir="rtl" className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="zono-gradient grid h-16 w-16 place-items-center rounded-2xl text-2xl font-black text-white">Z</span>
      <h1 className="text-ink text-2xl font-black">העמוד לא נמצא</h1>
      <p className="text-muted max-w-md text-sm leading-relaxed">
        ייתכן שהקישור ישן או שהעמוד הועבר. אפשר לחזור למסך הבית ולהמשיך משם.
      </p>
      <Link href="/" className="bg-brand mt-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition hover:brightness-95">
        חזרה למסך הבית
      </Link>
    </div>
  );
}
