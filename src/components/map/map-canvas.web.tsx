import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import { loadGoogleMapsLibraries } from "@/src/lib/google-maps";
import { getPointDisplayColor } from "@/src/lib/point-display";
import type { PointRecord } from "@/src/types/domain";

import { buildDisplayPointMarkers } from "./marker-layout";
import type { MapCanvasHandle, MapCanvasProps, MapRegion } from "./map-canvas.types";

function deltaToZoom(latitudeDelta: number) {
  return Math.max(3, Math.min(20, Math.round(Math.log2(360 / latitudeDelta))));
}

function zoomToLatitudeDelta(zoom: number) {
  return 360 / Math.pow(2, zoom);
}

function buildMarkerIcon(point: PointRecord, isSelected: boolean): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: getPointDisplayColor(point),
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeOpacity: 1,
    strokeWeight: isSelected ? 2.5 : 2,
    scale: isSelected ? 8 : 6,
  };
}

export const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(function MapCanvas(
  { points, region, selectedPointId, onLongPress, onRegionChangeComplete, onSelectPoint },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<{ pointId: string; marker: google.maps.Marker }[]>([]);
  const lastRegionRef = useRef<MapRegion | null>(null);
  const initialRegionRef = useRef(region);
  const onLongPressRef = useRef(onLongPress);
  const onRegionChangeCompleteRef = useRef(onRegionChangeComplete);
  const [mapError, setMapError] = useState<string | null>(null);
  const displayMarkers = useMemo(() => buildDisplayPointMarkers(points), [points]);

  useEffect(() => {
    onLongPressRef.current = onLongPress;
    onRegionChangeCompleteRef.current = onRegionChangeComplete;
  }, [onLongPress, onRegionChangeComplete]);

  useImperativeHandle(ref, () => ({
    animateToRegion(nextRegion: MapRegion) {
      const map = mapRef.current;

      if (!map) {
        return;
      }

      map.panTo({ lat: nextRegion.latitude, lng: nextRegion.longitude });
      map.setZoom(deltaToZoom(nextRegion.latitudeDelta));
    },
  }));

  useEffect(() => {
    let disposed = false;

    async function initialize() {
      try {
        const { Map } = await loadGoogleMapsLibraries();
        const initialRegion = initialRegionRef.current;

        if (disposed || !containerRef.current || mapRef.current) {
          return;
        }

        setMapError(null);
        lastRegionRef.current = initialRegion;
        mapRef.current = new Map(containerRef.current, {
          center: { lat: initialRegion.latitude, lng: initialRegion.longitude },
          zoom: deltaToZoom(initialRegion.latitudeDelta),
          clickableIcons: false,
          fullscreenControl: true,
          mapTypeControl: false,
          streetViewControl: false,
        });

        mapRef.current.addListener("idle", () => {
          const map = mapRef.current;

          if (!map) {
            return;
          }

          const center = map.getCenter();
          const zoom = map.getZoom() ?? deltaToZoom(initialRegion.latitudeDelta);

          if (!center) {
            return;
          }

          const nextRegion = {
            latitude: Number(center.lat().toFixed(6)),
            longitude: Number(center.lng().toFixed(6)),
            latitudeDelta: zoomToLatitudeDelta(zoom),
            longitudeDelta: zoomToLatitudeDelta(zoom),
          };

          lastRegionRef.current = nextRegion;
          onRegionChangeCompleteRef.current?.(nextRegion);
        });

        mapRef.current.addListener("rightclick", (event: google.maps.MapMouseEvent) => {
          if (!event.latLng) {
            return;
          }

          onLongPressRef.current?.({
            latitude: Number(event.latLng.lat().toFixed(6)),
            longitude: Number(event.latLng.lng().toFixed(6)),
          });
        });
      } catch (error) {
        if (!disposed) {
          setMapError(
            error instanceof Error ? error.message : "Nao foi possivel carregar o mapa.",
          );
        }
      }
    }

    void initialize();

    return () => {
      disposed = true;
      markersRef.current.forEach(({ marker }) => marker.setMap(null));
      markersRef.current = [];
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    const previousRegion = lastRegionRef.current;
    const hasMeaningfulChange =
      !previousRegion ||
      Math.abs(previousRegion.latitude - region.latitude) > 0.0002 ||
      Math.abs(previousRegion.longitude - region.longitude) > 0.0002 ||
      Math.abs(previousRegion.latitudeDelta - region.latitudeDelta) > 0.0002;

    if (!hasMeaningfulChange) {
      return;
    }

    map.panTo({ lat: region.latitude, lng: region.longitude });
    map.setZoom(deltaToZoom(region.latitudeDelta));
    lastRegionRef.current = region;
  }, [region]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    markersRef.current.forEach(({ marker }) => marker.setMap(null));
    markersRef.current = [];

    displayMarkers.forEach(({ point, latitude, longitude }) => {
      const marker = new google.maps.Marker({
        map,
        position: { lat: latitude, lng: longitude },
        title: point.title,
        icon: buildMarkerIcon(point, selectedPointId === point.id),
        zIndex: selectedPointId === point.id ? 1000 : 10,
      });

      marker.addListener("click", () => {
        onSelectPoint?.(point);
      });

      markersRef.current.push({ pointId: point.id, marker });
    });
  }, [displayMarkers, onSelectPoint, selectedPointId]);

  return (
    <>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          minHeight: 360,
          borderRadius: 16,
          overflow: "hidden",
          display: mapError ? "none" : "block",
        }}
      />
      {mapError ? (
        <div
          style={{
            alignItems: "center",
            backgroundColor: "#f7f8f4",
            border: "1px solid rgba(21,34,27,0.1)",
            borderRadius: 16,
            color: "#5c6b61",
            display: "flex",
            fontSize: 14,
            justifyContent: "center",
            lineHeight: "20px",
            minHeight: 360,
            padding: 24,
            textAlign: "center",
          }}
        >
          {mapError}
        </div>
      ) : null}
    </>
  );
});
