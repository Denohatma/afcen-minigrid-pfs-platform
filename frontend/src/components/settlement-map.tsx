"use client";

import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import {
  DISCO_COLORS,
  DISCO_FILL,
  DISCO_CENTERS,
  DISCO_CONCESSIONS,
  TRANSMISSION_LINES,
} from "@/lib/nigeria-geo";

interface Settlement {
  rank: number;
  village: string;
  state: string;
  lga: string;
  disco: string;
  lat: number;
  lon: number;
  population: number;
  connections: number;
  demand_kwh: number;
  grid_dist_km: number;
  score: number;
  security_risk: string;
  recommended_mg_type: string;
  has_health: boolean;
  has_education: boolean;
}

interface SettlementMapProps {
  settlements: Settlement[];
  selectedRanks: Set<number>;
  onToggleSelect: (rank: number) => void;
  activeDisco: string;
}

export function SettlementMap({
  settlements,
  selectedRanks,
  onToggleSelect,
  activeDisco,
}: SettlementMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const onToggleRef = useRef(onToggleSelect);
  onToggleRef.current = onToggleSelect;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [9.5, 7.5],
      zoom: 6,
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      { maxZoom: 18 }
    ).addTo(map);

    L.control
      .attribution({ position: "bottomleft", prefix: false })
      .addTo(map);

    Object.entries(DISCO_CONCESSIONS).forEach(([disco, coords]) => {
      const color = DISCO_COLORS[disco] || "#666";
      const fill = DISCO_FILL[disco] || "rgba(0,0,0,0.05)";
      L.polygon(coords as L.LatLngExpression[], {
        color,
        weight: 2,
        dashArray: "8,4",
        fillColor: fill,
        fillOpacity: 1,
        opacity: 0.7,
      }).addTo(map);

      const center = DISCO_CENTERS[disco];
      if (center) {
        L.marker(center as L.LatLngExpression, {
          icon: L.divIcon({
            className: "disco-label",
            html: `<span style="
              background:${color};
              color:#fff;
              padding:2px 8px;
              border-radius:4px;
              font-size:11px;
              font-weight:600;
              font-family:Inter,system-ui,sans-serif;
              white-space:nowrap;
              box-shadow:0 1px 3px rgba(0,0,0,0.2);
            ">${disco}</span>`,
            iconSize: [60, 20],
            iconAnchor: [30, 10],
          }),
          interactive: false,
        }).addTo(map);
      }
    });

    TRANSMISSION_LINES.forEach((line) => {
      const is330 = line.voltage === "330kV";
      L.polyline(line.coords as L.LatLngExpression[], {
        color: is330 ? "#C62828" : "#F57C00",
        weight: is330 ? 2.5 : 1.5,
        opacity: 0.6,
        dashArray: is330 ? undefined : "6,4",
      })
        .bindTooltip(
          `<span style="font-size:11px"><strong>${line.voltage}</strong> ${line.name.replace(line.voltage + " ", "")}</span>`,
          { sticky: true }
        )
        .addTo(map);
    });

    mapRef.current = map;
    markersRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !markersRef.current) return;

    markersRef.current.clearLayers();

    const toShow = settlements.slice(0, 300);

    toShow.forEach((s) => {
      if (!s.lat || !s.lon) return;
      const isSelected = selectedRanks.has(s.rank);
      const color = DISCO_COLORS[s.disco] || "#666";
      const radius = isSelected ? 7 : Math.max(3, Math.min(6, s.score / 18));

      const marker = L.circleMarker([s.lat, s.lon], {
        radius,
        fillColor: isSelected ? "#2E7D32" : color,
        color: isSelected ? "#1B5E20" : color,
        weight: isSelected ? 2.5 : 1,
        opacity: isSelected ? 1 : 0.8,
        fillOpacity: isSelected ? 0.9 : 0.55,
      });

      marker.bindPopup(
        `<div style="font-family:Inter,system-ui,sans-serif;min-width:200px;color:#1a1a1a">
          <div style="font-weight:700;font-size:14px;margin-bottom:2px;color:#1B5E20">${s.village}</div>
          <div style="color:#666;font-size:12px;margin-bottom:8px">${s.state} &middot; ${s.lga}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:12px">
            <span style="color:#888">Rank</span><span style="font-weight:600">#${s.rank}</span>
            <span style="color:#888">Score</span><span style="font-weight:700;color:${s.score >= 70 ? "#2E7D32" : s.score >= 50 ? "#E65100" : "#C62828"}">${s.score.toFixed(1)}</span>
            <span style="color:#888">Population</span><span>${s.population.toLocaleString()}</span>
            <span style="color:#888">Connections</span><span>${s.connections.toLocaleString()}</span>
            <span style="color:#888">Grid dist</span><span>${s.grid_dist_km.toFixed(1)} km</span>
            <span style="color:#888">DisCo</span><span style="color:${color};font-weight:600">${s.disco}</span>
            <span style="color:#888">Type</span><span>${s.recommended_mg_type}</span>
            <span style="color:#888">Risk</span><span>${s.security_risk}</span>
          </div>
        </div>`,
        { className: "afcen-popup", maxWidth: 260 }
      );

      marker.on("click", () => {
        onToggleRef.current(s.rank);
      });

      markersRef.current!.addLayer(marker);
    });

    if (activeDisco && DISCO_CENTERS[activeDisco]) {
      mapRef.current.setView(
        DISCO_CENTERS[activeDisco] as L.LatLngExpression,
        activeDisco === "IE" ? 10 : 8,
        { animate: true }
      );
    }
  }, [settlements, selectedRanks, activeDisco]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-border">
      <div ref={containerRef} className="h-full w-full" />
      {/* Legend */}
      <div className="absolute bottom-3 right-3 z-[1000] rounded-lg border border-border bg-white/95 px-3 py-2 shadow-sm backdrop-blur-sm">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Legend
        </p>
        <div className="flex flex-col gap-1">
          {Object.entries(DISCO_COLORS).map(([name, color]) => (
            <div key={name} className="flex items-center gap-2 text-xs">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="text-foreground">{name}</span>
            </div>
          ))}
          <div className="my-0.5 border-t border-border" />
          <div className="flex items-center gap-2 text-xs">
            <span className="h-[2px] w-3 bg-[#C62828]" />
            <span className="text-muted-foreground">330kV</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span
              className="h-[2px] w-3"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(90deg,#F57C00 0,#F57C00 3px,transparent 3px,transparent 5px)",
              }}
            />
            <span className="text-muted-foreground">132kV</span>
          </div>
          <div className="my-0.5 border-t border-border" />
          <div className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 rounded-full bg-[#2E7D32]" />
            <span className="text-muted-foreground">Selected</span>
          </div>
        </div>
      </div>
      <style jsx global>{`
        .afcen-popup .leaflet-popup-content-wrapper {
          background: #fff;
          border: 1px solid #e0e0e0;
          border-radius: 10px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
        }
        .afcen-popup .leaflet-popup-tip {
          background: #fff;
          border: 1px solid #e0e0e0;
        }
        .disco-label {
          background: transparent !important;
          border: none !important;
        }
      `}</style>
    </div>
  );
}
