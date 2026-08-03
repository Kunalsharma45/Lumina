import {
  acknowledgeTicket,
  assignTicket,
  closeTicket,
  resolveTicket,
  verifyTicket,
} from "../api/apiClient";

const actionButtons = [
  {
    key: "acknowledge",
    label: "Acknowledge",
    tone: "bg-sky-500/15 text-sky-200 border-sky-400/20",
  },
  {
    key: "assign",
    label: "Assign Crew",
    tone: "bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-400/20",
  },
  {
    key: "resolve",
    label: "Mark Resolved",
    tone: "bg-amber-500/15 text-amber-200 border-amber-400/20",
  },
  {
    key: "verify",
    label: "Verify",
    tone: "bg-emerald-500/15 text-emerald-200 border-emerald-400/20",
  },
  {
    key: "close",
    label: "Close Ticket",
    tone: "bg-slate-500/15 text-slate-200 border-slate-400/20",
  },
];

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
      } else if (action === "close") {
        await closeTicket(ticket.id);
      }

      await onRefresh();
      onMessage("Action completed");
    } catch (error) {
      onMessage(error.message || "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col p-6">
      <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-slate-500">
              Selected Ticket
            </div>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              {ticket.ticket_number}
            </h3>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              {ticket.ai_summary ||
                ticket.confidence_reason ||
                "Awaiting AI dispatch summary."}
            </p>
          </div>
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-right">
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-200/70">
              Confidence
            </div>
            <div className="mt-1 text-2xl font-semibold text-cyan-100">
              {(Number(ticket.confidence || 0) * 100).toFixed(1)}%
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Status" value={ticket.status} />
          <Stat
            label="Boundary"
            value={`${ticket.last_live_pole_id ?? "—"} → ${ticket.first_dark_pole_id ?? "—"}`}
          />
          <Stat
            label="Downstream"
            value={`${ticket.downstream_pole_count} poles`}
          />
          <Stat label="PIN" value={ticket.pin_code || "Unknown"} />
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          {actionButtons.map((action) => (
            <button
              key={action.key}
              type="button"
              disabled={busy}
              onClick={() => runAction(action.key)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 ${action.tone}`}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
          <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
            Dispatch Notes
          </h4>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            <p>Last live pole: {ticket.last_live_pole_id ?? "Unknown"}</p>
            <p>First dark pole: {ticket.first_dark_pole_id ?? "Unknown"}</p>
            <p>Topology inferred: {ticket.topology_inferred ? "Yes" : "No"}</p>
            <p>
              Location: {Number(ticket.latitude).toFixed(6)},{" "}
              {Number(ticket.longitude).toFixed(6)}
            </p>
          </div>
        </div>

        <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
          <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
            Automated Rule
          </h4>
          <p className="mt-4 text-sm leading-6 text-slate-300">
            Resolution is rejected unless backend telemetry confirms the
            affected poles have returned to live state. Ticket closure is only
            allowed after verification succeeds.
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#08111f] px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}
