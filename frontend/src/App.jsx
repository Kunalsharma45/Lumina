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

  const selectedTicket = useMemo(
    () =>
      tickets.find((ticket) => ticket.id === selectedTicketId) ||
      tickets[0] ||
      null,
    [selectedTicketId, tickets],
  );

  async function refreshTickets() {
    const response = await getTickets();
    return response;
  }

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
          <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300">
            OpenStreetMap-powered live operations
          </div>
        </div>
      }
      sidebar={
        <>
          <TicketList
            tickets={tickets}
            selectedTicketId={selectedTicket?.id}
            onSelectTicket={setSelectedTicketId}
          />
          <SimulatorPanel
            onMessage={setMessage}
            onRefresh={async () => {
              await refreshTickets();
            }}
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
              onSelectTicket={setSelectedTicketId}
            />
          </div>
          <div className="border-l border-white/10">
            <TicketDetail
              ticket={selectedTicket}
              onRefresh={async () => {
                await refreshTickets();
              }}
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
