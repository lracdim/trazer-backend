/**
 * Point-in-Polygon geo-fence engine.
 * Checks if a GPS coordinate falls inside a GeoJSON polygon using ray-casting algorithm.
 * No PostGIS needed — pure Node.js.
 */

interface Point {
    lat: number;
    lng: number;
}

interface GeoJSONPolygon {
    type: "Polygon";
    coordinates: number[][][]; // [ring][point][lng, lat]
}

/**
 * Ray-casting algorithm for point-in-polygon.
 * Returns true if point is inside the polygon.
 */
export function isPointInPolygon(point: Point, polygon: GeoJSONPolygon): boolean {
    const ring = polygon.coordinates[0]; // outer ring
    if (!ring || ring.length < 3) return false;

    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][1]; // lat
        const yi = ring[i][0]; // lng
        const xj = ring[j][1];
        const yj = ring[j][0];

        const intersect =
            yi > point.lng !== yj > point.lng &&
            point.lat < ((xj - xi) * (point.lng - yi)) / (yj - yi) + xi;

        if (intersect) inside = !inside;
    }

    return inside;
}

/**
 * Calculate distance between two GPS points in meters (Haversine formula).
 */
export function haversineDistance(a: Point, b: Point): number {
    const R = 6371e3; // Earth radius in meters
    const toRad = (deg: number) => (deg * Math.PI) / 180;

    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);

    const sinLat = Math.sin(dLat / 2);
    const sinLng = Math.sin(dLng / 2);

    const h =
        sinLat * sinLat +
        Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;

    return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Parse boundary GeoJSON string from DB into typed polygon.
 */
export function parseBoundary(geojsonStr: string | null): GeoJSONPolygon | null {
    if (!geojsonStr) return null;
    try {
        const parsed = JSON.parse(geojsonStr);
        if (parsed.type === "Polygon" && Array.isArray(parsed.coordinates)) {
            return parsed as GeoJSONPolygon;
        }
        return null;
    } catch {
        return null;
    }
}
