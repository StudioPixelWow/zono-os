/** Route-level loading state shown while the dashboard context is fetched. */
export default function DashboardLoading() {
  return (
    <div className="bg-surface flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="from-brand to-brand-light h-12 w-12 animate-pulse rounded-2xl bg-gradient-to-br" />
        <p className="text-muted text-sm font-semibold">טוען את הדאשבורד…</p>
      </div>
    </div>
  );
}
