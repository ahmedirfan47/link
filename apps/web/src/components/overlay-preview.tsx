/** A static rendering of the desktop overlay, used on public pages to show what Link looks like on a call. */
export function OverlayPreview() {
  return (
    <div className="w-full max-w-[420px] space-y-3">
      <div className="flex items-center gap-2 px-1 text-xs text-[#8a8a85]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#5bbf7a]" />
        Seed round, Northgate Capital
        <span className="ml-auto font-mono">18:42</span>
      </div>
      <article className="rounded-lg border border-[#2e2e2c] bg-[#121211] p-5 text-[#ededea]">
        <div className="mb-3 flex items-center justify-between text-xs text-[#8a8a85]">
          <span>Answer</span>
          <span className="font-mono">94% match</span>
        </div>
        <p className="mb-3 text-sm text-[#a9a9a4]">What does it cost you to acquire a customer right now?</p>
        <ul className="space-y-2 text-[22px] leading-[1.25] font-semibold">
          <li>
            <span className="text-[#ffe14d]">$38</span> blended, down from $61 in March
          </li>
          <li>Paid is 30% of new users</li>
          <li>Pays back in under 5 months</li>
        </ul>
      </article>
      <div className="rounded-lg border border-[#2e2e2c] bg-[#121211]/70 px-5 py-3 text-sm text-[#8a8a85]">
        How big is the team today?
      </div>
    </div>
  );
}