import type { PointRecord } from "@/src/types/domain";

const MARKER_SPREAD_RADIUS = 0.00004;

export interface DisplayPointMarker {
  point: PointRecord;
  latitude: number;
  longitude: number;
}

function buildCoordinateKey(point: PointRecord) {
  return `${point.latitude.toFixed(6)}:${point.longitude.toFixed(6)}`;
}

export function buildDisplayPointMarkers(points: PointRecord[]) {
  const grouped = new Map<string, PointRecord[]>();

  for (const point of points) {
    const key = buildCoordinateKey(point);
    const current = grouped.get(key) ?? [];
    current.push(point);
    grouped.set(key, current);
  }

  const displayMarkers = new Map<string, DisplayPointMarker>();

  for (const group of grouped.values()) {
    if (group.length === 1) {
      const [point] = group;
      displayMarkers.set(point.id, {
        point,
        latitude: point.latitude,
        longitude: point.longitude,
      });
      continue;
    }

    group.forEach((point, index) => {
      const angle = (2 * Math.PI * index) / group.length;
      const latitudeOffset = Math.sin(angle) * MARKER_SPREAD_RADIUS;
      const longitudeOffset =
        (Math.cos(angle) * MARKER_SPREAD_RADIUS) /
        Math.max(Math.cos((point.latitude * Math.PI) / 180), 0.35);

      displayMarkers.set(point.id, {
        point,
        latitude: point.latitude + latitudeOffset,
        longitude: point.longitude + longitudeOffset,
      });
    });
  }

  return points.map((point) => displayMarkers.get(point.id)!);
}
