import { useState } from "react";

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
  const [showSuppressed, setShowSuppressed] = useState(false);

  // Filter tickets: separate actual outages from suppressed hardware glitches
  const liveTickets = tickets.filter(t => t.fault_type !== 'DEAD_SENSOR' && t.status !== 'CLOSED');
  const suppressedTickets = tickets.filter(t => t.fault_type === 'DEAD_SENSOR' || t.status === 'CLOSED');

  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
      {/* ── LIVE OUTAGE TICKETS ── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Live Tickets</h2>
            <p className="text-sm text-slate-400">
              Telemetry-driven fault localization
            </p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-300">
            {liveTickets.length} open
          </span>
        </div>

        <div className="space-y-3">
          {liveTickets.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-sm text-slate-400">
              No live power outages. Grid is operating normally.
            </div>
          ) : null}

          {liveTickets.map((ticket) => (
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

      {/* ── SUPPRESSED HARDWARE GLITCHES ── */}
      {suppressedTickets.length > 0 && (
        <div className="border-t border-white/10 pt-4">
          <button
            onClick={() => setShowSuppressed(!showSuppressed)}
            className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left transition hover:bg-white/5"
          >
            <div>
              <h2 className="text-sm font-semibold text-amber-500/90 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Suppressed Sensor Glitches
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">Auto-filtered by backend topology logic</p>
            </div>
            <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-200">
              {suppressedTickets.length}
            </span>
          </button>

          {showSuppressed && (
            <div className="mt-3 space-y-2 pl-2 border-l-2 border-amber-500/20">
              {suppressedTickets.map((ticket) => (
                <div key={ticket.id} className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                  <div className="flex items-start justify-between">
                    <div className="text-xs font-semibold text-amber-200">Pole #{ticket.first_dark_pole_id} — DEAD_SENSOR</div>
                    <span className="text-[9px] uppercase tracking-wider text-amber-500/70 border border-amber-500/20 rounded px-1.5 py-0.5">
                      Auto-Suppressed
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] text-amber-100/60 leading-relaxed">
                    {ticket.confidence_reason || "Hardware glitch / Dead Modem detected. Suppressed from crew dispatch because parent/children poles are energized."}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
