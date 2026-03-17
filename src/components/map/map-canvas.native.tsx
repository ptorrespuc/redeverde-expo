import { forwardRef, useImperativeHandle, useRef } from "react";
import MapView, { Marker, type Region } from "react-native-maps";

import { getPointDisplayColor } from "@/src/lib/point-display";

import type { MapCanvasHandle, MapCanvasProps, MapRegion } from "./map-canvas.types";

export const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(function MapCanvas(
  { points, region, selectedPointId, onLongPress, onRegionChangeComplete, onSelectPoint },
  ref,
) {
  const mapRef = useRef<MapView | null>(null);

  useImperativeHandle(ref, () => ({
    animateToRegion(nextRegion: MapRegion, duration = 450) {
      mapRef.current?.animateToRegion(nextRegion as Region, duration);
    },
  }));

  return (
    <MapView
      onLongPress={(event) => {
        onLongPress?.(event.nativeEvent.coordinate);
      }}
      onRegionChangeComplete={(nextRegion) => {
        onRegionChangeComplete?.({
          latitude: nextRegion.latitude,
          longitude: nextRegion.longitude,
          latitudeDelta: nextRegion.latitudeDelta,
          longitudeDelta: nextRegion.longitudeDelta,
        });
      }}
      ref={mapRef}
      region={region as Region}
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
