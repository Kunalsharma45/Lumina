import { useEffect, useRef, useState } from "react";
import { CircleMarker, MapContainer, Marker, Popup, Polyline, TileLayer, useMap } from "react-leaflet";
import { getPoles } from "../api/apiClient";

const defaultCenter = [12.9716, 77.5946];

function MapController({ center, selectedTicketId, ticketsCount }) {
  const map = useMap();
  const prevTicketIdRef = useRef(null);

  useEffect(() => {
    const handleResize = () => {
      map.invalidateSize();
    };

    // Immediate & dual-delayed invalidateSize to fix flexbox bounds & canvas sizing
    handleResize();
    const timer1 = setTimeout(handleResize, 100);
    const timer2 = setTimeout(handleResize, 350);

    window.addEventListener("resize", handleResize);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      window.removeEventListener("resize", handleResize);
    };
  }, [map, ticketsCount]);

  useEffect(() => {
    if (selectedTicketId && selectedTicketId !== prevTicketIdRef.current) {
      prevTicketIdRef.current = selectedTicketId;
      if (center && Array.isArray(center) && center.length === 2 && Number.isFinite(center[0]) && Number.isFinite(center[1])) {
        map.panTo(center, {
          animate: true,
          duration: 0.8,
        });
      }
    }
  }, [center, selectedTicketId, map]);

  return null;
}

function getFaultStyle(ticket, isSelected) {
  if (ticket.fault_type === 'DT_FAULT') {
    return {
      color: isSelected ? '#A855F7' : '#8B5CF6', // Deep Purple / Violet for Transformer Fuse Blow
      weight: isSelected ? 10 : 6,
      dashArray: '12, 6',
      opacity: 0.95,
      label: '⚡ DT FUSE BLOWN / SHORT CIRCUIT',
      badgeClass: 'bg-purple-100 text-purple-900 border border-purple-300',
    };
  }

  if (ticket.fault_type === 'DEAD_SENSOR' || ticket.is_dead_sensor) {
    return {
      color: isSelected ? '#FBBF24' : '#F59E0B', // Amber / Yellow Warning for Hardware Sensor Glitch
      weight: isSelected ? 8 : 5,
      dashArray: '4, 4',
      opacity: 0.9,
      label: '⚠️ SENSOR / HARDWARE GLITCH',
      badgeClass: 'bg-amber-100 text-amber-900 border border-amber-300',
    };
  }

  // Standard Wire Break (SPAN_BREAK): Dashed Red (#EF4444)
  return {
    color: isSelected ? '#F87171' : '#EF4444',
    weight: isSelected ? 9 : 5,
    dashArray: '5, 10', // Dashed line style at boundary break
    opacity: 0.95,
    label: '💥 WIRE BREAK / SPAN SNAP',
    badgeClass: 'bg-rose-100 text-rose-900 border border-rose-300',
  };
}

function MarkerContent({ ticket }) {
  const isInferred = Boolean(ticket.topology_inferred);
  const confidencePct = (Number(ticket.confidence || 0) * 100).toFixed(1);
  const faultStyle = getFaultStyle(ticket, false);

  return (
    <Popup autoPan={false} className="lumina-map-popup">
      <div className="space-y-2 p-1 text-slate-900 min-w-64 max-w-72 font-sans">
        <div className="flex items-center justify-between border-b pb-2">
          <span className="font-bold text-base text-slate-900">{ticket.ticket_number}</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${faultStyle.badgeClass}`}>
            {ticket.status}
          </span>
        </div>

        <div className="space-y-1.5 text-xs text-slate-700">
          <div className="flex justify-between">
            <span className="font-semibold text-slate-500 uppercase tracking-wider">Fault Diagnosis:</span>
            <span className="font-bold text-slate-900">{faultStyle.label}</span>
          </div>

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
    getPoles(800)
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

  const isValidCoord = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;

  return (
    <div className="h-full w-full min-h-[550px] relative">
      <MapContainer
        center={center}
        zoom={13}
        preferCanvas={true}
        style={{ height: "100%", width: "100%", minHeight: "550px" }}
        className="h-full w-full min-h-[550px] overflow-hidden rounded-[28px]"
      >
        <MapController center={center} selectedTicketId={selectedTicket?.id} ticketsCount={tickets.length} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={19}
        />

        {/* Grid Poles Infrastructure Layer (Canvas Accelerated: Green = Working, Red = Fault/Dark) */}
        {showGridPoles
          ? gridPoles.slice(0, 800).map((pole) => {
              const isWorking = pole.energized !== false;
              return (
                <CircleMarker
                  key={`grid-pole-${pole.id}`}
                  center={[Number(pole.latitude), Number(pole.longitude)]}
                  radius={isWorking ? 3.5 : 5}
                  pathOptions={{
                    color: isWorking ? "#059669" : "#dc2626",
                    fillColor: isWorking ? "#10b981" : "#ef4444",
                    fillOpacity: isWorking ? 0.85 : 1,
                    weight: isWorking ? 1 : 2,
                  }}
                >
                  <Popup autoPan={false}>
                    <div className="p-1 text-xs font-sans text-slate-800">
                      <div className="flex items-center justify-between gap-2 border-b pb-1">
                        <span className="font-bold text-slate-900">{pole.pole_code}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          isWorking ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {isWorking ? '✓ WORKING (ENERGIZED)' : '⚠️ DARK (FAULT)'}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">Transformer ID: {pole.transformer_id}</p>
                      <p className="text-[11px] text-slate-500">Sequence: #{pole.seq_on_line || "MST Inferred"}</p>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })
          : null}

        {processedMapTickets.map((ticket) => {
          const isSelected = selectedTicket?.id === ticket.id;
          const style = getFaultStyle(ticket, isSelected);

          const liveLat = Number(ticket.last_live_lat || ticket.latitude || ticket.displayLat);
          const liveLng = Number(ticket.last_live_lng || ticket.longitude || ticket.displayLng);
          const darkLat = Number(ticket.first_dark_lat || liveLat + 0.0001);
          const darkLng = Number(ticket.first_dark_lng || liveLng + 0.0001);

          const markerLat = Number(ticket.first_dark_lat || ticket.latitude || ticket.displayLat);
          const markerLng = Number(ticket.first_dark_lng || ticket.longitude || ticket.displayLng);

          const liveValid = isValidCoord(liveLat, liveLng);
          const darkValid = isValidCoord(darkLat, darkLng);
          const markerValid = isValidCoord(markerLat, markerLng);

          const polylinePositions = liveValid && darkValid
            ? [
                [liveLat, liveLng],
                [darkLat, darkLng],
              ]
            : null;

          return (
            <div key={`ticket-group-${ticket.id}`}>
              {/* Span Polyline connecting Live and Dark Pole */}
              {polylinePositions ? (
                <Polyline
                  positions={polylinePositions}
                  eventHandlers={{
                    click: () => onSelectTicket(ticket),
                  }}
                  pathOptions={{
                    color: style.color,
                    weight: style.weight,
                    dashArray: style.dashArray,
                    opacity: style.opacity,
                  }}
                >
                  <MarkerContent ticket={ticket} />
                </Polyline>
              ) : null}

              {/* Glowing casing line for selected ticket */}
              {isSelected && polylinePositions ? (
                <Polyline
                  positions={polylinePositions}
                  pathOptions={{
                    color: "#38bdf8",
                    weight: 14,
                    opacity: 0.3,
                  }}
                />
              ) : null}

              {/* Boundary Position Marker strictly placed on exact Dark Pole GPS */}
              {markerValid ? (
                <Marker
                  position={[markerLat, markerLng]}
                  eventHandlers={{
                    click: () => onSelectTicket(ticket),
                  }}
                >
                  <MarkerContent ticket={ticket} />
                </Marker>
              ) : null}
            </div>
          );
        })}
      </MapContainer>
    </div>
  );
}
