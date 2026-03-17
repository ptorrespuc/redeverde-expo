import type { PointRecord } from "@/src/types/domain";

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface MapCanvasProps {
  points: PointRecord[];
  region: MapRegion;
  selectedPointId?: string | null;
  onSelectPoint?: (point: PointRecord) => void;
  onLongPress?: (coordinates: { latitude: number; longitude: number }) => void;
  onRegionChangeComplete?: (region: MapRegion) => void;
}

export interface MapCanvasHandle {
  animateToRegion: (region: MapRegion, duration?: number) => void;
}
