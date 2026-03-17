import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import MapView, { Marker, type Region } from "react-native-maps";

import { getPointDisplayColor } from "@/src/lib/point-display";

import type { MapCanvasHandle, MapCanvasProps, MapRegion } from "./map-canvas.types";

function hasMeaningfulRegionChange(current: MapRegion | null, next: MapRegion) {
  if (!current) {
    return true;
  }

  return (
    Math.abs(current.latitude - next.latitude) > 0.0002 ||
    Math.abs(current.longitude - next.longitude) > 0.0002 ||
    Math.abs(current.latitudeDelta - next.latitudeDelta) > 0.0002 ||
    Math.abs(current.longitudeDelta - next.longitudeDelta) > 0.0002
  );
}

export const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(function MapCanvas(
  { points, region, selectedPointId, onLongPress, onRegionChangeComplete, onSelectPoint },
  ref,
) {
  const mapRef = useRef<MapView | null>(null);
  const lastAppliedRegionRef = useRef<MapRegion | null>(region);

  useImperativeHandle(ref, () => ({
    animateToRegion(nextRegion: MapRegion, duration = 450) {
      lastAppliedRegionRef.current = nextRegion;
      mapRef.current?.animateToRegion(nextRegion as Region, duration);
    },
  }));

  useEffect(() => {
    if (!hasMeaningfulRegionChange(lastAppliedRegionRef.current, region)) {
      return;
    }

    lastAppliedRegionRef.current = region;
    mapRef.current?.animateToRegion(region as Region, 250);
  }, [region]);

  return (
    <MapView
      initialRegion={region as Region}
      onLongPress={(event) => {
        onLongPress?.(event.nativeEvent.coordinate);
      }}
      onRegionChangeComplete={(nextRegion) => {
        const normalizedRegion = {
          latitude: nextRegion.latitude,
          longitude: nextRegion.longitude,
          latitudeDelta: nextRegion.latitudeDelta,
          longitudeDelta: nextRegion.longitudeDelta,
        };
        lastAppliedRegionRef.current = normalizedRegion;
        onRegionChangeComplete?.(normalizedRegion);
      }}
      ref={mapRef}
      style={{ flex: 1 }}
    >
      {points.map((point) => (
        <Marker
          coordinate={{ latitude: point.latitude, longitude: point.longitude }}
          key={point.id}
          onPress={() => onSelectPoint?.(point)}
          pinColor={getPointDisplayColor(point)}
          title={point.title}
          zIndex={selectedPointId === point.id ? 1000 : 1}
        />
      ))}
    </MapView>
  );
});
