// The thin progress bar under a running import, export, transfer, model
// download or batch translation: a rule-coloured track and an accent fill as
// wide as `percent`. Seven bars on six screens drew the same two elements by
// hand; restructure Phase 2 step 2h made them one piece. The import screen's
// taller bar and the batch translation bar kept their own markup until
// FOUND_ISSUES 9 put them on this too, so all nine look alike. `className`
// goes in front of the track's own classes (the catalog row and the batch bar
// add a top margin, the import screen a bottom one).

export function ProgressBar({ percent, className }: { percent: number; className?: string }) {
  return (
    <div className={`${className ? `${className} ` : ''}h-1.5 w-full overflow-hidden rounded-full bg-rule`}>
      <div className="h-full bg-accent transition-all" style={{ width: `${percent}%` }} />
    </div>
  );
}
