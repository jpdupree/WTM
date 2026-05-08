export default function StatTile({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        "rounded-lg border border-mud-600 bg-mud-800 px-4 py-3 " +
        (accent ? "border-mud-accent/40" : "")
      }
    >
      <div className="text-xs uppercase tracking-wide text-mud-400">{label}</div>
      <div className="font-mono text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-mud-400">{sub}</div>}
    </div>
  );
}
