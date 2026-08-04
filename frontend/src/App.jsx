import { useMemo, useState } from "react";

import "leaflet/dist/leaflet.css";

import { getTickets } from "./api/apiClient";
import Layout from "./components/Layout";
import MapView from "./components/MapView";
import SimulatorPanel from "./components/SimulatorPanel";
import TicketDetail from "./components/TicketDetail";
import TicketList from "./components/TicketList";
import { useTickets } from "./hooks/useTickets";

function App() {
  const { tickets, loading, error, refresh } = useTickets();
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSelectTicket = (target) => {
    const targetId = target && typeof target === "object" ? target.id : target;
    setSelectedTicketId(targetId);
  };

  const selectedTicket = useMemo(
    () =>
      tickets.find(
        (ticket) =>
          String(ticket.id) === String(selectedTicketId?.id || selectedTicketId),
      ) ||
      tickets[0] ||
      null,
    [selectedTicketId, tickets],
  );

  return (
    <Layout
      topbar={
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.34em] text-amber-200/80">
              Lumina Control Room
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-white md:text-3xl">
              Lumina Fault Localization Command Console
            </h1>
          </div>
          <div className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-200 font-medium">
            ⚡ 5,048 Monitored Grid Poles | OpenStreetMap Operations
          </div>
        </div>
      }
      sidebar={
        <>
          <TicketList
            tickets={tickets}
            selectedTicketId={selectedTicket?.id}
            onSelectTicket={handleSelectTicket}
          />
          <SimulatorPanel
            onMessage={setMessage}
            onRefresh={refresh}
          />
        </>
      }
    >
      <div className="grid h-full grid-rows-[1fr_auto]">
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="min-h-160 p-4">
            <MapView
              tickets={tickets}
              selectedTicket={selectedTicket}
              onSelectTicket={handleSelectTicket}
            />
          </div>
          <div className="border-l border-white/10">
            <TicketDetail
              ticket={selectedTicket}
              onRefresh={refresh}
              onMessage={setMessage}
              busy={busy}
              setBusy={setBusy}
            />
          </div>
        </div>

        <div className="border-t border-white/10 px-5 py-4 text-sm text-slate-300">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {loading ? "Refreshing tickets..." : "Telemetry synchronized"}
            </span>
            <span className={error ? "text-rose-300" : "text-emerald-300"}>
              {error || message || "Ready"}
            </span>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default App;
