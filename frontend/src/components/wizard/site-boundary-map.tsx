"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";

interface SiteBoundaryMapProps {
  center: [number, number];
  onBoundaryChange?: (boundary: [number, number][], structureCount: number) => void;
  initialBoundary?: [number, number][];
}

export function SiteBoundaryMap({
  center,
  onBoundaryChange,
  initialBoundary,
}: SiteBoundaryMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const polygonRef = useRef<L.Polygon | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const [points, setPoints] = useState<[number, number][]>(initialBoundary ?? []);
  const [drawing, setDrawing] = useState(false);
  const [structureCount, setStructureCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const LRef = useRef<typeof import("leaflet") | null>(null);

  const estimateStructures = useCallback(
    (boundary: [number, number][]) => {
      if (boundary.length < 3) return 0;
      const L = LRef.current;
      if (!L) return 0;
      const latlngs = boundary.map(([lat, lng]) => L.latLng(lat, lng));
      const poly = L.polygon(latlngs);
      const bounds = poly.getBounds();
      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();
      const widthM =
        ne.distanceTo(L.latLng(ne.lat, sw.lng));
      const heightM =
        ne.distanceTo(L.latLng(sw.lat, ne.lng));
      const areaM2 = widthM * heightM * 0.7;
      const structuresPerHectare = 15;
      const hectares = areaM2 / 10000;
      return Math.round(hectares * structuresPerHectare);
    },
    []
  );

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    import("leaflet").then((L) => {
      LRef.current = L;

      const map = L.map(mapRef.current!, {
        center: center[0] !== 0 || center[1] !== 0 ? center : [-15.5, 35.5],
        zoom: center[0] !== 0 || center[1] !== 0 ? 15 : 6,
        zoomControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);

      const satellite = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { attribution: "&copy; Esri", maxZoom: 19 }
      );

      L.control
        .layers(
          { Street: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"), Satellite: satellite },
          {},
          { position: "topright" }
        )
        .addTo(map);

      if (initialBoundary && initialBoundary.length >= 3) {
        const polygon = L.polygon(initialBoundary, {
          color: "#228B22",
          fillColor: "#228B22",
          fillOpacity: 0.15,
          weight: 2,
        }).addTo(map);
        polygonRef.current = polygon;
        map.fitBounds(polygon.getBounds(), { padding: [30, 30] });
        setStructureCount(estimateStructures(initialBoundary));
      }

      mapInstanceRef.current = map;
      setLoaded(true);
    });

    return () => {
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
    };
  }, [center, initialBoundary, estimateStructures]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const L = LRef.current;
    if (!map || !L || !drawing) return;

    const handleClick = (e: L.LeafletMouseEvent) => {
      const newPoint: [number, number] = [e.latlng.lat, e.latlng.lng];
      setPoints((prev) => {
        const updated = [...prev, newPoint];

        markersRef.current.forEach((m) => m.remove());
        markersRef.current = [];

        updated.forEach((p, i) => {
          const marker = L.circleMarker(p, {
            radius: 6,
            color: "#228B22",
            fillColor: "#63b32e",
            fillOpacity: 0.8,
            weight: 2,
          }).addTo(map);
          marker.bindTooltip(`Point ${i + 1}`, { permanent: false });
          markersRef.current.push(marker as unknown as L.Marker);
        });

        if (polygonRef.current) {
          polygonRef.current.remove();
        }
        if (updated.length >= 3) {
          polygonRef.current = L.polygon(updated, {
            color: "#228B22",
            fillColor: "#228B22",
            fillOpacity: 0.15,
            weight: 2,
          }).addTo(map);
          const count = estimateStructures(updated);
          setStructureCount(count);
          onBoundaryChange?.(updated, count);
        }

        return updated;
      });
    };

    map.on("click", handleClick);
    map.getContainer().style.cursor = "crosshair";

    return () => {
      map.off("click", handleClick);
      map.getContainer().style.cursor = "";
    };
  }, [drawing, estimateStructures, onBoundaryChange]);

  const clearBoundary = () => {
    markersRef.current.forEach((m) =>
      (m as unknown as L.CircleMarker).remove()
    );
    markersRef.current = [];
    polygonRef.current?.remove();
    polygonRef.current = null;
    setPoints([]);
    setStructureCount(0);
    onBoundaryChange?.([], 0);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={drawing ? "default" : "outline"}
            size="sm"
            onClick={() => setDrawing(!drawing)}
          >
            {drawing ? "Stop Drawing" : "Draw Boundary"}
          </Button>
          {points.length > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={clearBoundary}>
              Clear
            </Button>
          )}
        </div>
        {structureCount > 0 && (
          <span className="text-sm font-medium text-primary">
            ~{structureCount} structures estimated
          </span>
        )}
      </div>
      <div
        ref={mapRef}
        className="h-[350px] w-full rounded-lg border border-border overflow-hidden"
        style={{ zIndex: 0 }}
      />
      {!loaded && (
        <div className="flex items-center justify-center h-[350px] rounded-lg border bg-muted">
          <p className="text-sm text-muted-foreground">Loading map...</p>
        </div>
      )}
      {drawing && (
        <p className="text-xs text-muted-foreground">
          Click on the map to draw the site boundary polygon. At least 3 points needed.
        </p>
      )}
    </div>
  );
}
