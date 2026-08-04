import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";

const defaultCenter = [12.9716, 77.5946];

function MapController({ center }) {
  const map = useMap();

  useEffect(() => {
    if (center && Array.isArray(center) && center.length === 2) {
      map.flyTo(center, 14, {
        duration: 1.5,
        easeLinearity: 0.25,
      });
    }
  }, [center, map]);

  return null;
}

function MarkerContent({ ticket }) {
  return (
    <Popup>
      <div className="space-y-1 text-sm text-slate-900">
        <div className="font-semibold">{ticket.ticket_number}</div>
        <div>Status: {ticket.status}</div>
        <div>
          Confidence: {(Number(ticket.confidence || 0) * 100).toFixed(1)}%
        </div>
        <div>Downstream poles: {ticket.downstream_pole_count}</div>
      </div>
    </Popup>
  );
}

export default function MapView({ tickets, selectedTicket, onSelectTicket }) {
  const mapTickets = tickets.filter(
    (ticket) =>
      Number.isFinite(Number(ticket.latitude)) &&
      Number.isFinite(Number(ticket.longitude)),
  );
  const center =
    selectedTicket && Number.isFinite(Number(selectedTicket.latitude))
      ? [Number(selectedTicket.latitude), Number(selectedTicket.longitude)]
      : mapTickets[0]
        ? [Number(mapTickets[0].latitude), Number(mapTickets[0].longitude)]
        : defaultCenter;

  return (
    <div className="h-full min-h-160">
      <MapContainer
        center={center}
        zoom={13}
        className="h-full min-h-160 w-full overflow-hidden rounded-[28px]"
      >
        <MapController center={center} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {mapTickets.map((ticket) => (
          <Marker
            key={ticket.id}
            position={[Number(ticket.latitude), Number(ticket.longitude)]}
            eventHandlers={{
              click: () => onSelectTicket(ticket),
            }}
          >
            <MarkerContent ticket={ticket} />
          </Marker>
        ))}
        {selectedTicket && Number.isFinite(Number(selectedTicket.latitude)) ? (
          <Marker
            position={[
              Number(selectedTicket.latitude),
              Number(selectedTicket.longitude),
            ]}
          >
            <MarkerContent ticket={selectedTicket} />
          </Marker>
        ) : null}
      </MapContainer>
    </div>
  );
}
