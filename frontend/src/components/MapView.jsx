import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Popup, Polyline, TileLayer, useMap } from "react-leaflet";
import { getPoles } from "../api/apiClient";

// Fix Leaflet's default icon paths for Vite/Vercel production builds
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

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
  if (ticket.fault_type === 'FEEDER_FAULT') {
    return {
      color: isSelected ? '#FB923C' : '#F97316', // Bright Orange for 11 kV feeder failure
      weight: isSelected ? 12 : 8,
      dashArray: '18, 6',
      opacity: 1,
      label: '🔴 11 kV FEEDER FAULT — UPSTREAM HT FUSE',
      badgeClass: 'bg-orange-100 text-orange-900 border border-orange-300',
    };
  }

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

function getFaultIcon(ticket, isSelected) {
  let iconHtml = '';
  const ringClass = isSelected ? 'ring-4 ring-offset-2' : 'ring-2 ring-offset-1 hover:ring-4';

  if (ticket.fault_type === 'FEEDER_FAULT') {
    // Orange Substation / Lightning Bolt
    iconHtml = `
      <div class="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 border-2 border-orange-500 text-orange-600 shadow-lg ${isSelected ? 'ring-orange-400' : 'ring-orange-300'} ${ringClass} transition-all">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6">
          <path fill-rule="evenodd" d="M14.615 1.595a.75.75 0 01.359.852L12.982 9.75h7.268a.75.75 0 01.548 1.262l-10.5 11.25a.75.75 0 01-1.272-.71l1.992-7.302H3.75a.75.75 0 01-.548-1.262l10.5-11.25a.75.75 0 01.913-.143z" clip-rule="evenodd" />
        </svg>
      </div>
    `;
  } else if (ticket.fault_type === 'DT_FAULT') {
    // Purple Transformer Box / Industrial Icon
    iconHtml = `
      <div class="flex h-10 w-10 items-center justify-center rounded-md bg-purple-100 border-2 border-purple-500 text-purple-600 shadow-lg ${isSelected ? 'ring-purple-400' : 'ring-purple-300'} ${ringClass} transition-all">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6">
          <path d="M2 4.5A2.5 2.5 0 014.5 2h15A2.5 2.5 0 0122 4.5v15a2.5 2.5 0 01-2.5 2.5h-15A2.5 2.5 0 012 19.5v-15zM6 6v3h3V6H6zm6 0v3h3V6h-3zm6 0v3h3V6h-3zM6 15v3h12v-3H6z" />
        </svg>
      </div>
    `;
  } else if (ticket.fault_type === 'DEAD_SENSOR' || ticket.is_dead_sensor) {
    // Amber Wifi-Off / Warning / Wrench
    iconHtml = `
      <div class="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 border-2 border-amber-500 text-amber-600 shadow-lg ${isSelected ? 'ring-amber-400' : 'ring-amber-300'} ${ringClass} transition-all">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-5 h-5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 3l18 18M9.172 9.172a4 4 0 015.656 0M6.343 6.343a8 8 0 0111.314 0m-14.142 2.828a12 12 0 0116.97 0M12 12h.01" />
        </svg>
      </div>
    `;
  } else {
    // Red Span Break / Broken Line
    iconHtml = `
      <div class="flex h-9 w-9 items-center justify-center rounded-full bg-rose-100 border-2 border-rose-500 text-rose-600 shadow-lg ${isSelected ? 'ring-rose-400' : 'ring-rose-300'} ${ringClass} transition-all">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-5 h-5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
        </svg>
      </div>
    `;
  }

  return L.divIcon({
    html: iconHtml,
    className: 'bg-transparent border-none',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
  });
}

function getTransformerIcon() {
  const iconHtml = `
    <div class="flex h-1.5 w-1.5 items-center justify-center rounded-sm bg-blue-500 border border-blue-700 shadow-sm opacity-90"></div>
  `;
  return L.divIcon({
    html: iconHtml,
    className: 'bg-transparent border-none',
    iconSize: [6, 6],
    iconAnchor: [3, 3],
    popupAnchor: [0, -3],
  });
}

function getSubstationIcon() {
  const iconHtml = `
    <div class="flex h-5 w-5 items-center justify-center rounded-sm bg-orange-500 border border-orange-800 text-white shadow-md">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5">
        <path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z" />
        <path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.43z" />
      </svg>
    </div>
  `;
  return L.divIcon({
    html: iconHtml,
    className: 'bg-transparent border-none',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10],
  });
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
  const [transformers, setTransformers] = useState([]);
  const [substations, setSubstations] = useState([]);
  const [showGridPoles, setShowGridPoles] = useState(true);
  const [totalPolesCount, setTotalPolesCount] = useState(38400);

  useEffect(() => {
    getPoles(1000)
      .then((res) => {
        if (res && res.poles) {
          setGridPoles(res.poles);
        }
        if (res && res.transformers) {
          setTransformers(res.transformers);
        }
        if (res && res.substations) {
          setSubstations(res.substations);
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

        {/* Grid Poles Infrastructure Layer (Canvas Accelerated) */}
        {showGridPoles
          ? gridPoles.map((pole) => {
              const isWorking = pole.energized !== false;
              return (
                <CircleMarker
                  key={`grid-pole-${pole.id}`}
                  center={[Number(pole.latitude), Number(pole.longitude)]}
                  radius={isWorking ? 2 : 3.5} // Diameter of 4px-7px
                  pathOptions={{
                    color: isWorking ? "#047857" : "#dc2626", // Emerald 700
                    fillColor: isWorking ? "#10b981" : "#ef4444", // Emerald 500
                    fillOpacity: isWorking ? 0.6 : 1,
                    weight: isWorking ? 0.5 : 1.5,
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

        {/* Transformer Layer */}
        {showGridPoles && transformers.map((transformer) => (
          <Marker
            key={`transformer-${transformer.id}`}
            position={[Number(transformer.latitude), Number(transformer.longitude)]}
            icon={getTransformerIcon()}
          >
            <Popup autoPan={false}>
              <div className="p-1 text-xs font-sans text-slate-800">
                <div className="flex items-center justify-between gap-2 border-b pb-1">
                  <span className="font-bold text-slate-900">{transformer.code}</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                    TRANSFORMER (DT)
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">{transformer.name}</p>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Substation Layer */}
        {showGridPoles && substations.map((substation) => (
          <Marker
            key={`substation-${substation.id}`}
            position={[Number(substation.latitude), Number(substation.longitude)]}
            icon={getSubstationIcon()}
          >
            <Popup autoPan={false}>
              <div className="p-1 text-xs font-sans text-slate-800">
                <div className="flex items-center justify-between gap-2 border-b pb-1">
                  <span className="font-bold text-slate-900">{substation.code}</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-800">
                    SUBSTATION (11kV)
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">{substation.name}</p>
              </div>
            </Popup>
          </Marker>
        ))}

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
                  icon={getFaultIcon(ticket, isSelected)}
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
