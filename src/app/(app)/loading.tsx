/**
 * Route-level loading state. Launch polish: a content-shaped skeleton (header,
 * KPI row, cards) instead of a centered spinner with "טוען את הדאשבורד" — the
 * page feels instant and the layout doesn't jump when data arrives.
 */
export default function DashboardLoading() {
  const bar = "zono-skel rounded-xl";
  return (
    <div dir="rtl" className="flex flex-col gap-5" aria-busy="true" aria-label="טוען">
      <div className="flex flex-col gap-2">
        <div className={`${bar} h-7 w-56`} />
        <div className={`${bar} h-4 w-36`} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className={`${bar} h-20`} />)}
      </div>
      <div className={`${bar} h-44`} />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className={`${bar} h-56`} />)}
      </div>
    </div>
  );
}
