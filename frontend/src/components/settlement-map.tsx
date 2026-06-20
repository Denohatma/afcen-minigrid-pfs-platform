"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";

const DISCO_COLORS: Record<string, string> = {
  AEDC: "#22d3ee",
  KEDCO: "#a78bfa",
  IE: "#fb923c",
};

const DISCO_CENTERS: Record<string, [number, number]> = {
  AEDC: [9.06, 7.49],
  KEDCO: [11.5, 8.5],
  IE: [6.45, 3.4],
};

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

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const center: [number, number] = activeDisco
      ? DISCO_CENTERS[activeDisco] || [9.5, 8.0]
      : [9.5, 8.0];

    const map = L.map(containerRef.current, {
      center,
      zoom: activeDisco ? 8 : 6,
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      { maxZoom: 18 }
    ).addTo(map);

    L.control.attribution({ position: "bottomleft", prefix: false }).addTo(map);

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

    const toShow = settlements.slice(0, 200);

    toShow.forEach((s) => {
      if (!s.lat || !s.lon) return;
      const isSelected = selectedRanks.has(s.rank);
      const color = DISCO_COLORS[s.disco] || "#94a3b8";
      const radius = isSelected ? 8 : Math.max(4, Math.min(7, s.score / 15));

      const marker = L.circleMarker([s.lat, s.lon], {
        radius,
        fillColor: isSelected ? "#22c55e" : color,
        color: isSelected ? "#16a34a" : color,
        weight: isSelected ? 3 : 1,
        opacity: isSelected ? 1 : 0.8,
        fillOpacity: isSelected ? 0.9 : 0.5,
      });

      marker.bindPopup(
        `<div style="font-family:Inter,system-ui,sans-serif;min-width:180px;color:#e2e8f0">
          <div style="font-weight:600;font-size:14px;margin-bottom:4px">${s.village}</div>
          <div style="color:#94a3b8;font-size:12px;margin-bottom:8px">${s.state} / ${s.lga}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:12px">
            <span style="color:#94a3b8">Rank</span><span style="font-weight:600">#${s.rank}</span>
            <span style="color:#94a3b8">Score</span><span style="font-weight:600;color:${s.score >= 70 ? '#34d399' : s.score >= 50 ? '#fbbf24' : '#f87171'}">${s.score.toFixed(1)}</span>
            <span style="color:#94a3b8">Pop</span><span>${s.population.toLocaleString()}</span>
            <span style="color:#94a3b8">Conn</span><span>${s.connections.toLocaleString()}</span>
            <span style="color:#94a3b8">Grid</span><span>${s.grid_dist_km.toFixed(1)} km</span>
            <span style="color:#94a3b8">DisCo</span><span style="color:${color}">${s.disco}</span>
          </div>
          <div style="margin-top:8px;text-align:center">
            <span style="color:#22c55e;font-size:11px;cursor:pointer" id="select-${s.rank}">
              ${isSelected ? "[ Selected ]" : "[ Click to select ]"}
            </span>
          </div>
        </div>`,
        {
          className: "dark-popup",
        }
      );

      marker.on("click", () => {
        onToggleSelect(s.rank);
      });

      markersRef.current!.addLayer(marker);
    });

    if (activeDisco && DISCO_CENTERS[activeDisco]) {
      mapRef.current.setView(DISCO_CENTERS[activeDisco], 8, { animate: true });
    }
  }, [settlements, selectedRanks, activeDisco, onToggleSelect]);

  return (
    <div className="relative h-full w-full rounded-lg overflow-hidden border border-border">
      <div ref={containerRef} className="h-full w-full" />
      <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-1.5">
        {Object.entries(DISCO_COLORS).map(([name, color]) => (
          <div
            key={name}
            className={`flex items-center gap-2 rounded-md px-2.5 py-1 text-xs font-medium backdrop-blur-sm ${
              !activeDisco || activeDisco === name
                ? "bg-card/90 text-foreground"
                : "bg-card/50 text-muted-foreground"
            }`}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            {name}
          </div>
        ))}
      </div>
      <style jsx global>{`
        .dark-popup .leaflet-popup-content-wrapper {
          background: #1e293b;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          box-shadow: 0 10px 25px rgba(0,0,0,0.5);
        }
        .dark-popup .leaflet-popup-tip {
          background: #1e293b;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .leaflet-control-zoom a {
          background: #1e293b !important;
          color: #e2e8f0 !important;
          border-color: rgba(255,255,255,0.1) !important;
        }
        .leaflet-control-zoom a:hover {
          background: #334155 !important;
        }
      `}</style>
    </div>
  );
}
