"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { SettlementData } from "@/lib/types";

const DISCO_CENTERS: Record<string, { lat: number; lon: number; zoom: number }> = {
  AEDC: { lat: 8.5, lon: 7.0, zoom: 7 },
  KEDCO: { lat: 11.5, lon: 8.5, zoom: 7 },
  IE: { lat: 6.55, lon: 3.4, zoom: 10 },
};

const SCORE_COLORS: [number, string][] = [
  [70, "#22c55e"],
  [50, "#eab308"],
  [30, "#f97316"],
  [0, "#ef4444"],
];

function getColor(score: number): string {
  for (const [threshold, color] of SCORE_COLORS) {
    if (score >= threshold) return color;
  }
  return "#ef4444";
}

function getRadius(pop: number): number {
  if (pop > 10000) return 8;
  if (pop > 5000) return 6;
  if (pop > 2000) return 5;
  return 4;
}

interface SettlementMapProps {
  disco: string;
  settlements: SettlementData[];
  selectedRanks: Set<number>;
  onToggleSelect: (rank: number) => void;
}

export function SettlementMap({ disco, settlements, selectedRanks, onToggleSelect }: SettlementMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);
  const [loaded, setLoaded] = useState(false);
  const LRef = useRef<typeof import("leaflet") | null>(null);

  useEffect(() => {
    if (!mapRef.current || loaded) return;

    import("leaflet").then((L) => {
      LRef.current = L;

      const center = DISCO_CENTERS[disco] || { lat: 9.07, lon: 7.4, zoom: 6 };
      const map = L.map(mapRef.current!, {
        center: [center.lat, center.lon],
        zoom: center.zoom,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);

      mapInstanceRef.current = map;
      setLoaded(true);

      import("leaflet/dist/leaflet.css");
    });

    return () => {
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
    };
  }, [disco]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const L = LRef.current;
    if (!map || !L || !loaded) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    for (const s of settlements) {
      const isSelected = selectedRanks.has(s.rank);
      const marker = L.circleMarker([s.lat, s.lon], {
        radius: getRadius(s.population),
        fillColor: isSelected ? "#2563eb" : getColor(s.score),
        color: isSelected ? "#1d4ed8" : "#333",
        weight: isSelected ? 2 : 1,
        fillOpacity: isSelected ? 0.9 : 0.7,
      }).addTo(map);

      marker.bindPopup(`
        <div style="min-width:200px">
          <strong>${s.village}</strong><br/>
          ${s.lga} LGA, ${s.state} State<br/>
          <hr style="margin:4px 0"/>
          <b>Population:</b> ${s.population.toLocaleString()}<br/>
          <b>Buildings:</b> ${s.buildings.toLocaleString()}<br/>
          <b>Grid distance:</b> ${s.grid_dist_km} km<br/>
          <b>PV irradiance:</b> ${s.pv_kwh_m2_yr} kWh/m²/yr<br/>
          <b>Security:</b> ${s.security_risk}<br/>
          <b>Type:</b> ${s.recommended_mg_type}<br/>
          <b>Score:</b> ${s.score}<br/>
          <hr style="margin:4px 0"/>
          <b>Rank:</b> #${s.rank}
        </div>
      `);

      marker.on("click", () => {
        onToggleSelect(s.rank);
      });

      markersRef.current.push(marker);
    }

    if (settlements.length > 0) {
      const bounds = L.latLngBounds(settlements.map((s) => [s.lat, s.lon] as [number, number]));
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  }, [settlements, selectedRanks, loaded, onToggleSelect]);

  const mvLayerRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const L = LRef.current;
    if (!map || !L || !disco) return;

    const center = DISCO_CENTERS[disco];
    if (center) {
      map.setView([center.lat, center.lon], center.zoom);
    }

    if (mvLayerRef.current) {
      mvLayerRef.current.remove();
      mvLayerRef.current = null;
    }

    fetch(`/api/proxy/mv-lines/${disco}`)
      .then((r) => r.json())
      .then((geojson) => {
        if (!geojson.features || geojson.features.length === 0) return;
        const layer = L.geoJSON(geojson, {
          style: {
            color: "#e67e22",
            weight: 1.5,
            opacity: 0.6,
          },
        }).addTo(map);
        mvLayerRef.current = layer;
      })
      .catch(() => {});
  }, [disco, loaded]);

  return (
    <div className="relative">
      <div ref={mapRef} className="h-[400px] w-full rounded-lg border" />
      <div className="absolute bottom-3 left-3 z-[1000] rounded bg-white/90 px-2 py-1 text-xs shadow">
        <span className="inline-block h-2 w-2 rounded-full bg-green-500" /> High score
        <span className="ml-2 inline-block h-2 w-2 rounded-full bg-yellow-500" /> Medium
        <span className="ml-2 inline-block h-2 w-2 rounded-full bg-red-500" /> Low
        <span className="ml-2 inline-block h-2 w-2 rounded-full bg-blue-600" /> Selected
        <span className="ml-2 inline-block h-3 w-3 border-t-2 border-orange-500" /> MV Lines
      </div>
    </div>
  );
}
