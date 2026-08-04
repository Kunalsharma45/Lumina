import {
  acknowledgeTicket,
  assignTicket,
  closeTicket,
  repairFault,
  resolveTicket,
  verifyTicket,
} from "../api/apiClient";

export default function TicketDetail({
  ticket,
  onRefresh,
  onMessage,
  busy,
  setBusy,
}) {
  if (!ticket) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-slate-400">
        Select a ticket to see the live dispatch details.
      </div>
    );
  }

  const status = ticket.status || "DETECTED";

  async function runAction(action) {
    try {
      setBusy(true);
      onMessage("");

      if (action === "acknowledge") {
        await acknowledgeTicket(ticket.id);
      } else if (action === "assign") {
        await assignTicket(ticket.id);
      } else if (action === "resolve") {
        await resolveTicket(ticket.id);
      } else if (action === "verify") {
        await verifyTicket(ticket.id);
      } else if (action === "repair") {
        await repairFault(ticket.id);
      } else if (action === "close") {
        await closeTicket(ticket.id);
      }

      await onRefresh();
      onMessage(
        action === "repair"
          ? "⚡ Crew repair telemetry received: Power restored and ticket auto-verified!"
          : "Action completed successfully"
      );
    } catch (error) {
      onMessage(error.message || "Action failed");
    } finally {
      setBusy(false);
    }
  }

  const isClosed = status === "CLOSED";
  const isVerified = status === "VERIFIED" || isClosed;
  const isAssigned = status === "CREW_ASSIGNED" || isVerified;
  const isAcknowledged = status === "ACKNOWLEDGED" || isAssigned;

  const livePoleDisplay = ticket.last_live_pole_code || (ticket.last_live_pole_id ? `P-${ticket.last_live_pole_id}` : "—");
  const darkPoleDisplay = ticket.first_dark_pole_code || (ticket.first_dark_pole_id ? `P-${ticket.first_dark_pole_id}` : "—");

  return (
    <div className="flex h-full flex-col p-6 overflow-y-auto">
      <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-slate-400 font-semibold">
              Selected Fault Ticket
            </div>
            <h3 className="mt-2 text-2xl font-bold text-white">
              {ticket.ticket_number}
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
              {ticket.ai_summary ||
                ticket.confidence_reason ||
                "Awaiting AI dispatch summary."}
            </p>
          </div>
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-right">
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-200/80 font-semibold">
              Confidence
            </div>
            <div className="mt-1 text-2xl font-bold text-cyan-100">
              {(Number(ticket.confidence || 0) * 100).toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Responsive Grid for Stats preventing text cutoff */}
        <div className="mt-5 grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Stat label="Status" value={ticket.status} highlight={true} />
          <Stat
            label="Boundary"
            value={`${ticket.last_live_pole_id ?? "—"} → ${ticket.first_dark_pole_id ?? "—"}`}
          />
          <Stat
            label="Downstream"
            value={`${ticket.downstream_pole_count} poles`}
          />
          <Stat label="PIN Code" value={ticket.pin_code || "560001"} />
        </div>

        {/* Smart Lifecycle Action Buttons */}
        <div className="mt-5 flex flex-wrap gap-2.5">
          <button
            type="button"
            disabled={busy || isAcknowledged}
            onClick={() => runAction("acknowledge")}
            className={`rounded-full border px-4 py-2 text-xs sm:text-sm font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed ${
              status === "DETECTED"
                ? "bg-sky-500/25 text-sky-100 border-sky-400/40 shadow-[0_0_15px_rgba(56,189,248,0.25)] hover:bg-sky-500/35"
                : isAcknowledged
                ? "bg-slate-800/50 text-slate-400 border-slate-700"
                : "bg-sky-500/15 text-sky-200 border-sky-400/20"
            }`}
          >
            {isAcknowledged ? "✓ Acknowledged" : "Acknowledge"}
          </button>

          <button
            type="button"
            disabled={busy || isAssigned}
            onClick={() => runAction("assign")}
            className={`rounded-full border px-4 py-2 text-xs sm:text-sm font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed ${
              status === "ACKNOWLEDGED"
                ? "bg-fuchsia-500/25 text-fuchsia-100 border-fuchsia-400/40 shadow-[0_0_15px_rgba(232,121,249,0.25)] hover:bg-fuchsia-500/35"
                : isAssigned
                ? "bg-slate-800/50 text-slate-400 border-slate-700"
                : "bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-400/20"
            }`}
          >
            {isAssigned ? "✓ Crew Assigned" : "Assign Crew"}
          </button>

          <button
            type="button"
            disabled={busy || isVerified}
            onClick={() => runAction("repair")}
            className={`rounded-full border px-4 py-2 text-xs sm:text-sm font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed ${
              status === "CREW_ASSIGNED"
                ? "bg-emerald-500/30 text-emerald-100 border-emerald-400/50 shadow-[0_0_18px_rgba(52,211,153,0.3)] hover:bg-emerald-500/40"
                : isVerified
                ? "bg-slate-800/50 text-slate-400 border-slate-700"
                : "bg-emerald-500/15 text-emerald-200 border-emerald-400/20"
            }`}
          >
            {isVerified ? "✓ Telemetry Power Restored" : "⚡ Repair & Send Restored Telemetry"}
          </button>

          <button
            type="button"
            disabled={busy || isVerified}
            onClick={() => runAction("resolve")}
            className={`rounded-full border px-4 py-2 text-xs sm:text-sm font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed ${
              isVerified
                ? "bg-slate-800/50 text-slate-400 border-slate-700"
                : "bg-amber-500/15 text-amber-200 border-amber-400/20 hover:bg-amber-500/25"
            }`}
          >
            Mark Resolved
          </button>

          <button
            type="button"
            disabled={busy || isClosed || status !== "VERIFIED"}
            onClick={() => runAction("close")}
            className={`rounded-full border px-4 py-2 text-xs sm:text-sm font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed ${
              status === "VERIFIED"
                ? "bg-emerald-500/35 text-white border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.35)] hover:bg-emerald-500/45"
                : isClosed
                ? "bg-slate-800/50 text-slate-400 border-slate-700"
                : "bg-slate-500/15 text-slate-400 border-slate-700"
            }`}
          >
            {isClosed ? "✓ Closed" : "Close Ticket"}
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
          <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Dispatch & Location Notes
          </h4>
          <div className="mt-4 space-y-2.5 text-sm text-slate-300">
            <p className="flex justify-between border-b border-white/5 pb-1.5">
              <span className="text-slate-400">Last Live Pole:</span>
              <span className="font-semibold text-emerald-300">{livePoleDisplay}</span>
            </p>
            <p className="flex justify-between border-b border-white/5 pb-1.5">
              <span className="text-slate-400">First Dark Pole:</span>
              <span className="font-semibold text-rose-300">{darkPoleDisplay}</span>
            </p>
            <p className="flex justify-between border-b border-white/5 pb-1.5">
              <span className="text-slate-400">Topology Inferred:</span>
              <span className={`font-semibold ${ticket.topology_inferred ? "text-amber-300" : "text-slate-200"}`}>
                {ticket.topology_inferred ? "Yes (Geometric MST)" : "No (Surveyed Explicit)"}
              </span>
            </p>
            <p className="flex justify-between pt-1">
              <span className="text-slate-400">Coordinates:</span>
              <span className="font-mono text-xs text-cyan-200">
                {Number(ticket.latitude).toFixed(6)}, {Number(ticket.longitude).toFixed(6)}
              </span>
            </p>
          </div>
        </div>

        <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
          <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Automated Protection Rule
          </h4>
          <p className="mt-4 text-xs sm:text-sm leading-relaxed text-slate-300">
            Ticket resolution is strictly rejected unless backend telemetry confirms all affected downstream poles have returned to live state. Ticket closure is only permitted after automated telemetry verification succeeds.
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#08111f] px-3.5 py-3 overflow-hidden min-w-0">
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-semibold truncate">
        {label}
      </div>
      <div
        title={value}
        className={`mt-1.5 text-xs sm:text-sm font-bold truncate ${
          highlight ? "text-cyan-300" : "text-white"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
