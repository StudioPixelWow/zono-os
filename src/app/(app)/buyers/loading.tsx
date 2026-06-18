export default function BuyersLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-card border-line h-36 animate-pulse rounded-[22px] border"
          />
        ))}
      </div>
      <div className="bg-card border-line h-20 animate-pulse rounded-[20px] border" />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-card border-line h-44 animate-pulse rounded-[22px] border"
          />
        ))}
      </div>
    </div>
  );
}
