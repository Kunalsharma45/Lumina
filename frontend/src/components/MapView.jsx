import { useEffect, useRef, useState } from "react";
import { CircleMarker, MapContainer, Marker, Popup, Polyline, TileLayer, useMap } from "react-leaflet";
import { getPoles } from "../api/apiClient";

const defaultCenter = [12.9716, 77.5946];

function MapController({ center, selectedTicketId }) {
  const map = useMap();
  const prevTicketIdRef = useRef(null);

  useEffect(() => {
    const handleResize = () => {
      map.invalidateSize();
    };
    const timer = setTimeout(handleResize, 150);
    window.addEventListener("resize", handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", handleResize);
    };
  }, [map]);

  useEffect(() => {
    if (selectedTicketId && selectedTicketId !== prevTicketIdRef.current) {
      prevTicketIdRef.current = selectedTicketId;
      if (center && Array.isArray(center) && center.length === 2) {
        map.panTo(center, {
          animate: true,
          duration: 0.8,
        });
      }
    }
  }, [center, selectedTicketId, map]);

  return null;
}

function MarkerContent({ ticket }) {
  const isInferred = Boolean(ticket.topology_inferred);
  const confidencePct = (Number(ticket.confidence || 0) * 100).toFixed(1);

  return (
    <Popup autoPan={false} className="lumina-map-popup">
      <div className="space-y-2 p-1 text-slate-900 min-w-64 max-w-72 font-sans">
        <div className="flex items-center justify-between border-b pb-2">
          <span className="font-bold text-base text-slate-900">{ticket.ticket_number}</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
            ticket.status === 'VERIFIED' || ticket.status === 'CLOSED'
              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
              : 'bg-amber-100 text-amber-800 border border-amber-300'
          }`}>
            {ticket.status}
          </span>
        </div>

        <div className="space-y-1.5 text-xs text-slate-700">
          <div className="flex justify-between">
            <span className="font-semibold text-slate-500 uppercase tracking-wider">Confidence:</span>
            <span className="font-bold text-cyan-800">{confidencePct}%</span>
          </div>

          <div className="flex justify-between">
            <span className="font-semibold text-slate-500 uppercase tracking-wider">Fault Boundary:</span>
            <span className="font-medium text-slate-900">
              Pole {ticket.last_live_pole_id ?? '—'} &rarr; Pole {ticket.first_dark_pole_id ?? '—'}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="font-semibold text-slate-500 uppercase tracking-wider">Downstream Impact:</span>
            <span className="font-bold text-rose-700">{ticket.downstream_pole_count} poles dark</span>
          </div>

          <div className="flex justify-between">
            <span className="font-semibold text-slate-500 uppercase tracking-wider">PIN Code:</span>
            <span className="font-medium text-slate-900">{ticket.pin_code || '560001'}</span>
          </div>

          <div className="pt-1 border-t">
            <span className={`inline-block px-2 py-1 rounded text-[11px] font-medium w-full text-center ${
              isInferred
                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            }`}>
              {isInferred ? '⚠️ 60% Case: Geometric MST Inferred' : '✓ 40% Case: Explicit Surveyed Topology'}
            </span>
          </div>

          {ticket.ai_summary ? (
            <div className="pt-2 text-[11px] text-slate-600 italic bg-slate-50 p-2 rounded border border-slate-200 leading-snug">
              &ldquo;{ticket.ai_summary}&rdquo;
            </div>
          ) : null}
        </div>
      </div>
    </Popup>
  );
}

export default function MapView({ tickets, selectedTicket, onSelectTicket, refreshKey }) {
  const [gridPoles, setGridPoles] = useState([]);
  const [showGridPoles, setShowGridPoles] = useState(true);
  const [totalPolesCount, setTotalPolesCount] = useState(5048);

  useEffect(() => {
    getPoles(10000)
      .then((res) => {
        if (res && res.poles) {
          setGridPoles(res.poles);
        }
        if (res && res.total) {
          setTotalPolesCount(res.total);
        }
      })
      .catch(() => {});
  }, [tickets, refreshKey]);

  const mapTickets = tickets.filter(
    (ticket) =>
      Number.isFinite(Number(ticket.latitude)) &&
      Number.isFinite(Number(ticket.longitude)),
  );

  const posCountMap = new Map();
  const processedMapTickets = mapTickets.map((ticket) => {
    const baseLat = Number(ticket.latitude);
    const baseLng = Number(ticket.longitude);
    const posKey = `${baseLat.toFixed(5)},${baseLng.toFixed(5)}`;

    const count = posCountMap.get(posKey) || 0;
    posCountMap.set(posKey, count + 1);

    // Apply a micro-offset if identical coordinates exist so overlapping ticket markers are individually visible
    const offsetLat = count > 0 ? baseLat + (count % 2 === 1 ? 0.0003 : -0.0003) * Math.ceil(count / 2) : baseLat;
    const offsetLng = count > 0 ? baseLng + (count % 2 === 1 ? -0.0003 : 0.0003) * Math.ceil(count / 2) : baseLng;

    return {
      ...ticket,
      displayLat: offsetLat,
      displayLng: offsetLng,
    };
  });

  const center =
    selectedTicket && Number.isFinite(Number(selectedTicket.latitude))
      ? [Number(selectedTicket.latitude), Number(selectedTicket.longitude)]
      : processedMapTickets[0]
        ? [processedMapTickets[0].displayLat, processedMapTickets[0].displayLng]
        : defaultCenter;

  return (
    <div className="h-full min-h-160">
      <MapContainer
        center={center}
        zoom={13}
        className="h-full min-h-160 w-full overflow-hidden rounded-[28px]"
      >
        <MapController center={center} selectedTicketId={selectedTicket?.id} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* 5,000 Grid Poles Infrastructure Layer */}
        {showGridPoles
          ? gridPoles.slice(0, 250).map((pole) => (
              <CircleMarker
                key={`grid-pole-${pole.id}`}
                center={[Number(pole.latitude), Number(pole.longitude)]}
                radius={3}
                pathOptions={{
                  color: "#0284c7",
                  fillColor: "#38bdf8",
                  fillOpacity: 0.8,
                  weight: 1,
                }}
              >
                <Popup autoPan={false}>
                  <div className="p-1 text-xs font-sans text-slate-800">
                    <p className="font-bold text-slate-900">{pole.pole_code}</p>
                    <p className="text-[11px] text-slate-500">Transformer ID: {pole.transformer_id}</p>
                    <p className="text-[11px] text-slate-500">Sequence: #{pole.seq_on_line || "MST Inferred"}</p>
                  </div>
                </Popup>
              </CircleMarker>
            ))
          : null}

        {processedMapTickets.map((ticket) => {
          const isSelected = selectedTicket?.id === ticket.id;
          const isInferred = Boolean(ticket.topology_inferred);

          const liveLat = Number(ticket.last_live_lat || ticket.displayLat);
          const liveLng = Number(ticket.last_live_lng || ticket.displayLng);
          const darkLat = Number(ticket.first_dark_lat || Number(ticket.displayLat) + 0.0003);
          const darkLng = Number(ticket.first_dark_lng || Number(ticket.displayLng) + 0.0003);

          const polylinePositions = [
            [liveLat, liveLng],
            [darkLat, darkLng],
          ];

          return (
            <div key={`ticket-group-${ticket.id}`}>
              {/* Span Polyline connecting Live and Dark Pole */}
              <Polyline
                positions={polylinePositions}
                eventHandlers={{
                  click: () => onSelectTicket(ticket),
                }}
                pathOptions={{
                  color: isSelected ? "#38bdf8" : isInferred ? "#f59e0b" : "#ef4444",
                  weight: isSelected ? 8 : 5,
                  dashArray: isInferred ? "8, 8" : null,
                  opacity: isSelected ? 1 : 0.85,
                }}
              >
                <MarkerContent ticket={ticket} />
              </Polyline>

              {/* Glowing casing line for selected ticket */}
              {isSelected ? (
                <Polyline
                  positions={polylinePositions}
                  pathOptions={{
                    color: "#38bdf8",
                    weight: 14,
                    opacity: 0.3,
                  }}
                />
              ) : null}

              {/* Boundary Position Marker */}
              <Marker
                position={[ticket.displayLat, ticket.displayLng]}
                eventHandlers={{
                  click: () => onSelectTicket(ticket),
                }}
              >
                <MarkerContent ticket={ticket} />
              </Marker>
            </div>
          );
        })}
      </MapContainer>
    </div>
  );
}
