const statusTone = {
  DETECTED: "bg-amber-500/15 text-amber-200 border-amber-400/20",
  ACKNOWLEDGED: "bg-sky-500/15 text-sky-200 border-sky-400/20",
  CREW_ASSIGNED: "bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-400/20",
  RESOLVED: "bg-lime-500/15 text-lime-200 border-lime-400/20",
  VERIFIED: "bg-emerald-500/15 text-emerald-200 border-emerald-400/20",
  CLOSED: "bg-slate-500/15 text-slate-200 border-slate-400/20",
};

export default function TicketList({
  tickets,
  selectedTicketId,
  onSelectTicket,
}) {
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Live Tickets</h2>
          <p className="text-sm text-slate-400">
            Telemetry-driven fault localization
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-300">
          {tickets.length} open
        </span>
      </div>

      <div className="space-y-3">
        {tickets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-sm text-slate-400">
            No tickets yet. Ingest telemetry or inject a simulator fault to
            populate the board.
          </div>
        ) : null}

        {tickets.map((ticket) => (
          <button
            key={ticket.id}
            type="button"
            onClick={() => onSelectTicket(ticket)}
            className={`w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/7 ${String(selectedTicketId) === String(ticket.id) ? "border-cyan-300/40 bg-cyan-500/10 shadow-[0_10px_40px_rgba(34,211,238,0.15)]" : "border-white/10 bg-white/5"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">
                  {ticket.ticket_number}
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  {ticket.confidence_reason || "Awaiting localization details"}
                </div>
              </div>
              <span
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${statusTone[ticket.status] || statusTone.DETECTED}`}
              >
                {ticket.status}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-300">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  Boundary
                </div>
                <div className="mt-1">
                  {ticket.last_live_pole_id ?? "—"} →{" "}
                  {ticket.first_dark_pole_id ?? "—"}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  Downstream
                </div>
                <div className="mt-1">{ticket.downstream_pole_count} poles</div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
