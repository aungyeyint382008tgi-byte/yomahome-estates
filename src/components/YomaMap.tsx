'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export interface Property {
  id: string;
  title: string;
  mode: 'rent' | 'buy';
  property_type: string;
  township: string;
  price_lakhs: number;
  beds: number;
  baths: number;
  sqft: number;
  floor_level?: string;
  backup_power: boolean;
  has_elevator: boolean;
  owner_direct: boolean;
  flood_free: boolean;
  ownership_doc?: string;
  contact_phone: string;
  image_url?: string;
  is_sponsored: boolean;
  lat: number;
  lng: number;
}

const YANGON_ORIGINS = [
  { label: 'Myanmar Plaza', lat: 16.8286, lng: 96.1554 },
  { label: 'Shwedagon', lat: 16.7983, lng: 96.1496 },
  { label: 'Sule', lat: 16.7745, lng: 96.1588 },
  { label: 'Airport', lat: 16.9073, lng: 96.1332 },
];

const EMPTY_FC = {
  type: 'FeatureCollection' as const,
  features: [],
};

function createCircleGeoJSON(lng: number, lat: number, radiusMeters: number) {
  const points = 64;
  const coords: [number, number][] = [];
  const distanceX = radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180));
  const distanceY = radiusMeters / 110540;

  for (let i = 0; i <= points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    coords.push([
      lng + distanceX * Math.cos(theta),
      lat + distanceY * Math.sin(theta),
    ]);
  }

  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'Polygon' as const,
          coordinates: [coords],
        },
      },
    ],
  };
}

interface SavedLabelStyle {
  id: string;
  textColor: unknown;
  haloColor: unknown;
  haloWidth: unknown;
}

export default function YomaMap({
  properties,
  selectedId,
  drawMode,
  activeZone,
  onSelectProperty,
  onZoneDrawn,
  onCancelDraw,
  onClearZone,
  hideOverlayControls,
}: {
  properties: Property[];
  selectedId: string | null;
  drawMode: boolean;
  activeZone: boolean;
  onSelectProperty: (prop: Property) => void;
  onZoneDrawn: (lat: number, lng: number, radiusMeters: number) => void;
  onCancelDraw: () => void;
  onClearZone: () => void;
  hideOverlayControls?: boolean;
}) {
  const [mapStyle, setMapStyle] = useState<'street' | 'satellite'>('street');
  const [mapLoaded, setMapLoaded] = useState(false);
  const [modalBlocked, setModalBlocked] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeInfo, setRouteInfo] = useState<{
    from: string;
    km: string;
    mins: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const baseNonSymbolIdsRef = useRef<string[]>([]);
  const textLabelStylesRef = useRef<SavedLabelStyle[]>([]);
  const drawModeRef = useRef(drawMode);
  const onZoneDrawnRef = useRef(onZoneDrawn);
  const onClearZoneRef = useRef(onClearZone);
  const activeZoneCenterRef = useRef<[number, number] | null>(null);
  const activeZoneRadiusRef = useRef<number>(1500);
  const lastZoneTapRef = useRef<number>(0);

  drawModeRef.current = drawMode;
  onZoneDrawnRef.current = onZoneDrawn;
  onClearZoneRef.current = onClearZone;

  const selectedProp = properties.find((p) => p.id === selectedId) ?? null;

  const clearRoute = useCallback(() => {
    const map = mapRef.current;
    if (map && map.isStyleLoaded()) {
      const routeSrc = map.getSource('route-source') as
        | maplibregl.GeoJSONSource
        | undefined;
      const originSrc = map.getSource('route-origin-source') as
        | maplibregl.GeoJSONSource
        | undefined;
      routeSrc?.setData(EMPTY_FC);
      originSrc?.setData(EMPTY_FC);
    }
    setRouteInfo(null);
    setRouteError(null);
  }, []);

  // Initialize MapLibre GL vector map + clean Google-style Satellite Hybrid
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/bright',
      center: [96.15, 16.822],
      zoom: 12.5,
      maxZoom: 19,
      attributionControl: false,
    });

    map.on('load', () => {
      const baseLayers = map.getStyle().layers || [];
      const firstSymbolLayer = baseLayers.find((l) => l.type === 'symbol');

      const nonSymbolIds: string[] = [];
      const labelStyles: SavedLabelStyle[] = [];

      baseLayers.forEach((l) => {
        if (l.type !== 'symbol') {
          // Track every painted road, building, land, and water layer so Satellite mode hides them cleanly
          nonSymbolIds.push(l.id);
        } else if (l.layout && 'text-field' in l.layout) {
          const tf = JSON.stringify(l.layout['text-field']);
          if (tf.includes('name')) {
            map.setLayoutProperty(l.id, 'text-field', [
              'coalesce',
              ['get', 'name:en'],
              ['get', 'name:latin'],
              ['get', 'name'],
            ]);
          }
          labelStyles.push({
            id: l.id,
            textColor: map.getPaintProperty(l.id, 'text-color'),
            haloColor: map.getPaintProperty(l.id, 'text-halo-color'),
            haloWidth: map.getPaintProperty(l.id, 'text-halo-width'),
          });
        }
      });

      baseNonSymbolIdsRef.current = nonSymbolIds;
      textLabelStylesRef.current = labelStyles;

      // Real satellite imagery placed right underneath street/place labels (no painted white roads)
      map.addSource('esri-satellite', {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        maxzoom: 19,
      });

      map.addLayer(
        {
          id: 'satellite-layer',
          type: 'raster',
          source: 'esri-satellite',
          layout: { visibility: 'none' },
        },
        firstSymbolLayer?.id
      );

      // Draw Zone 1.5 km circle layers
      map.addSource('zone-source', {
        type: 'geojson',
        data: EMPTY_FC,
      });
      map.addLayer({
        id: 'zone-fill',
        type: 'fill',
        source: 'zone-source',
        paint: {
          'fill-color': '#1A73E8',
          'fill-opacity': 0.16,
        },
      });
      map.addLayer({
        id: 'zone-outline',
        type: 'line',
        source: 'zone-source',
        paint: {
          'line-color': '#1A73E8',
          'line-width': 2.5,
        },
      });

      // Google-blue driving route layers (always visible on top in both Map & Satellite)
      map.addSource('route-source', {
        type: 'geojson',
        data: EMPTY_FC,
      });
      map.addLayer({
        id: 'route-casing',
        type: 'line',
        source: 'route-source',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#1967D2',
          'line-width': 9,
          'line-opacity': 0.95,
        },
      });
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route-source',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#4285F4',
          'line-width': 5,
        },
      });

      // Green origin dot for road route start point
      map.addSource('route-origin-source', {
        type: 'geojson',
        data: EMPTY_FC,
      });
      map.addLayer({
        id: 'route-origin',
        type: 'circle',
        source: 'route-origin-source',
        paint: {
          'circle-radius': 7,
          'circle-color': '#188038',
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': 3,
        },
      });

      setMapLoaded(true);
    });

    // Tap map to draw 1.5 km search zone
    map.on('click', (e) => {
      if (!drawModeRef.current) return;
      const radius = 1500;
      const zoneSrc = map.getSource('zone-source') as
        | maplibregl.GeoJSONSource
        | undefined;
      activeZoneCenterRef.current = [e.lngLat.lng, e.lngLat.lat];
        activeZoneRadiusRef.current = radius;
        zoneSrc?.setData(createCircleGeoJSON(e.lngLat.lng, e.lngLat.lat, radius));
      onZoneDrawnRef.current(e.lngLat.lat, e.lngLat.lng, radius);
    });

    const syncModalState = () => {
        const isOpen = Boolean((window as unknown as { __yomaModalOpen?: boolean }).__yomaModalOpen);
        setModalBlocked(isOpen);
      };
      syncModalState();
      window.addEventListener('yoma-post-modal-toggle', syncModalState);
      mapRef.current = map;

    window.removeEventListener('yoma-post-modal-toggle', syncModalState);
    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, []);

  // Switch between Street Map and natural Google-style Satellite Hybrid
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const isSat = mapStyle === 'satellite';

    if (map.getLayer('satellite-layer')) {
      map.setLayoutProperty(
        'satellite-layer',
        'visibility',
        isSat ? 'visible' : 'none'
      );
    }

    // Hide ALL painted white/yellow roads & buildings in Satellite mode so real aerial roads show naturally
    baseNonSymbolIdsRef.current.forEach((id) => {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', isSat ? 'none' : 'visible');
      }
    });

    // Style street & place names crisp white with dark halo over Satellite, restore original over Map
    textLabelStylesRef.current.forEach((item) => {
      if (!map.getLayer(item.id)) return;
      if (isSat) {
        map.setPaintProperty(item.id, 'text-color', '#FFFFFF');
        map.setPaintProperty(item.id, 'text-halo-color', 'rgba(0, 0, 0, 0.88)');
        map.setPaintProperty(item.id, 'text-halo-width', 1.6);
      } else {
        map.setPaintProperty(item.id, 'text-color', item.textColor ?? '#2B2B2B');
        map.setPaintProperty(
          item.id,
          'text-halo-color',
          item.haloColor ?? 'rgba(255, 255, 255, 0.9)'
        );
        map.setPaintProperty(item.id, 'text-halo-width', item.haloWidth ?? 1);
      }
    });
  }, [mapStyle, mapLoaded]);

  // Clear drawn zone circle when reset
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || activeZone) return;
    const zoneSrc = map.getSource('zone-source') as
      | maplibregl.GeoJSONSource
      | undefined;
    activeZoneCenterRef.current = null;
      zoneSrc?.setData(EMPTY_FC);
  }, [activeZone, mapLoaded]);

  // Smoothly zoom to street level when a property is tapped
  useEffect(() => {
    clearRoute();
    const map = mapRef.current;
    if (!map || !mapLoaded || !selectedProp?.lat || !selectedProp?.lng) return;
    map.flyTo({
      center: [selectedProp.lng, selectedProp.lat],
      zoom: Math.max(map.getZoom(), 16),
      duration: 650,
    });
  }, [selectedProp?.id, selectedProp?.lat, selectedProp?.lng, mapLoaded, clearRoute]);

  // Fetch & draw real Google-blue driving route along Yangon roads via OSRM
  const fetchRoadRoute = useCallback(
    async (startLat: number, startLng: number, fromLabel: string) => {
      const map = mapRef.current;
      if (!map || !mapLoaded || !selectedProp) return;

      setRouteLoading(true);
      setRouteError(null);

      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${selectedProp.lng},${selectedProp.lat}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        const data = await res.json();

        if (!data.routes?.length) {
          setRouteError('No road route found between these points.');
          setRouteLoading(false);
          return;
        }

        const route = data.routes[0];
        const coords: [number, number][] = route.geometry.coordinates;

        const routeSrc = map.getSource('route-source') as
          | maplibregl.GeoJSONSource
          | undefined;
        routeSrc?.setData({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: route.geometry,
            },
          ],
        });

        const originSrc = map.getSource('route-origin-source') as
          | maplibregl.GeoJSONSource
          | undefined;
        originSrc?.setData({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'Point',
                coordinates: [startLng, startLat],
              },
            },
          ],
        });

        const bounds = new maplibregl.LngLatBounds();
        coords.forEach((c) => bounds.extend(c));
        map.fitBounds(bounds, { padding: 80, duration: 700 });

        setRouteInfo({
          from: fromLabel,
          km: (route.distance / 1000).toFixed(1),
          mins: Math.max(1, Math.round(route.duration / 60)),
        });
      } catch {
        setRouteError('Could not load route right now. Try again.');
      } finally {
        setRouteLoading(false);
      }
    },
    [selectedProp, mapLoaded]
  );

  const handleRouteFromGPS = () => {
    if (!navigator.geolocation) {
      setRouteError('GPS is not supported in this browser.');
      return;
    }
    setRouteLoading(true);
    setRouteError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        fetchRoadRoute(pos.coords.latitude, pos.coords.longitude, 'My Location');
      },
      () => {
        setRouteLoading(false);
        setRouteError('Location access denied — pick a Yangon landmark instead.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Render Google-style pointer price pins
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    properties.forEach((p) => {
      if (!p.lat || !p.lng) return;
      const isSelected = p.id === selectedId;
      const bg = isSelected
        ? '#D4AF37'
        : p.is_sponsored
        ? '#1C170C'
        : '#11131A';
      const text = isSelected
        ? '#0B0C10'
        : p.is_sponsored
        ? '#F3D58D'
        : '#F5F2EB';
      const border = isSelected
        ? '#FAF0CE'
        : p.is_sponsored
        ? '#D4AF37'
        : 'rgba(212,175,55,0.65)';

      const el = document.createElement('div');
      el.style.cursor = 'pointer';
      el.style.zIndex = isSelected ? '30' : p.is_sponsored ? '20' : '10';
      el.innerHTML = `<div style="display:inline-flex;flex-direction:column;align-items:center;transform:${isSelected ? 'scale(1.12)' : 'scale(1)'};transition:transform 0.15s ease;">
        <div style="width:max-content;background:${bg};color:${text};border:1.5px solid ${border};padding:5px 10px;border-radius:999px;font-weight:700;font-size:12px;line-height:1.1;white-space:nowrap;box-shadow:0 3px 10px rgba(0,0,0,0.4);">
          ${p.is_sponsored ? '★ ' : ''}${Number(p.price_lakhs).toLocaleString()}L
        </div>
        <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid ${bg};margin-top:-1px;filter:drop-shadow(0 2px 2px rgba(0,0,0,0.25));"></div>
      </div>`;

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelectProperty(p);
      });

      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([p.lng, p.lat])
        .addTo(map);

      markersRef.current.push(marker);
    });
  }, [properties, selectedId, onSelectProperty]);

  return (
    <div className="relative isolate z-0 h-[440px] lg:h-[640px] w-full rounded-2xl overflow-hidden border border-slate-700/60 shadow-2xl bg-[#E5E3DF]">
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Google-style Road Route & Directions Card */}
      {!drawMode && selectedProp && (
        <div className="absolute top-3 left-3 right-3 z-50 max-w-md bg-white/95 backdrop-blur border border-slate-200 rounded-2xl p-3 shadow-xl text-slate-800 space-y-2" style={{ display: (hideOverlayControls || modalBlocked) ? 'none' : undefined }}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-slate-900 leading-tight">
                {selectedProp.title}
              </p>
              <p className="text-[11px] text-slate-500">
                {selectedProp.township} • Road Route & Directions
              </p>
            </div>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${selectedProp.lat},${selectedProp.lng}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="px-2.5 py-1 rounded-lg bg-[#1A73E8] text-white text-[11px] font-bold whitespace-nowrap shadow-sm"
            >
              Google Maps ↗
            </a>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleRouteFromGPS();
              }}
              className="px-2.5 py-1 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-semibold"
            >
              📍 From GPS
            </button>
            {YANGON_ORIGINS.map((o) => (
              <button
                key={o.label}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fetchRoadRoute(o.lat, o.lng, o.label);
                }}
                className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium"
              >
                {o.label}
              </button>
            ))}
          </div>

          {routeLoading && (
            <p className="text-[11px] text-blue-600 font-medium">
              Calculating road route...
            </p>
          )}
          {routeError && (
            <p className="text-[11px] text-rose-600 font-medium">{routeError}</p>
          )}
          {routeInfo && (
            <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-3 py-1.5 text-xs">
              <span className="font-bold text-blue-800">
                🚗 {routeInfo.mins} min ({routeInfo.km} km){' '}
                <span className="font-normal text-blue-600">
                  from {routeInfo.from}
                </span>
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  clearRoute();
                }}
                className="text-rose-600 font-bold ml-2"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}

      {/* Bottom-Left Map / Satellite Hybrid Toggle */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setMapStyle((prev) => (prev === 'street' ? 'satellite' : 'street'));
        }}
        className="absolute bottom-4 left-4 z-50 flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold shadow-lg transition"
      >
        <span
          className={`h-3.5 w-3.5 rounded-sm border border-slate-400 ${
            mapStyle === 'street' ? 'bg-emerald-700' : 'bg-sky-200'
          }`}
        />
        {mapStyle === 'street' ? 'Satellite' : 'Map'}
      </button>

      {/* Bottom-Right Zoom & Re-center Controls */}
      <div className="absolute bottom-4 right-4 z-50 flex flex-col gap-2">
        <button
          type="button"
          title="Re-center Yangon"
          onClick={(e) => {
            e.stopPropagation();
            mapRef.current?.flyTo({
              center: [96.15, 16.822],
              zoom: 12.5,
              duration: 600,
            });
          }}
          className="h-9 w-9 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg shadow-md flex items-center justify-center text-base font-bold"
        >
          ⌖
        </button>
        <div className="flex flex-col bg-white border border-slate-300 rounded-lg shadow-md overflow-hidden divide-y divide-slate-200">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              mapRef.current?.zoomIn();
            }}
            className="h-9 w-9 hover:bg-slate-50 text-slate-700 text-lg font-bold flex items-center justify-center"
          >
            +
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              mapRef.current?.zoomOut();
            }}
            className="h-9 w-9 hover:bg-slate-50 text-slate-700 text-lg font-bold flex items-center justify-center"
          >
            −
          </button>
        </div>
      </div>
    </div>
  );
}
