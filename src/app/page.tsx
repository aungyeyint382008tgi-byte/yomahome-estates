'use client';

import { useEffect, useState, useCallback, FormEvent } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import type { Property } from '@/components/YomaMap';
import PropertyModal from '@/components/PropertyModal';
import PostBoostModal from '@/components/PostBoostModal';

const YomaMap = dynamic(() => import('@/components/YomaMap'), { ssr: false });

interface AiFilters {
  township: string;
  property_type: string;
  max_price_lakhs: number;
  min_price_lakhs: number;
  min_beds: number;
  flood_free: boolean;
  summary: string;
}

export default function HomePage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<'all' | 'rent' | 'buy'>('all');
  const [onlyGenerator, setOnlyGenerator] = useState(false);
  const [onlyOwner, setOnlyOwner] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [activeZone, setActiveZone] = useState(false);
  const [selected, setSelected] = useState<Property | null>(null);
  const [detailProp, setDetailProp] = useState<Property | null>(null);
  const [showPostModal, setShowPostModal] = useState(false);

  // Search & Gemini AI State
  const [searchText, setSearchText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiFilters, setAiFilters] = useState<AiFilters | null>(null);

  const loadAllProperties = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    setDrawMode(false);
    setActiveZone(false);
    const { data, error } = await supabase.rpc('get_properties');
    if (error) {
      setErrorMsg(error.message);
    } else if (data) {
      setProperties(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAllProperties();
  }, [loadAllProperties]);

  const handleZoneDrawn = useCallback(
    async (lat: number, lng: number, radiusMeters: number) => {
      setLoading(true);
      setErrorMsg(null);
      setDrawMode(false);
      setActiveZone(true);
      const { data, error } = await supabase.rpc('properties_in_zone', {
        center_lat: lat,
        center_lng: lng,
        radius_meters: radiusMeters,
      });
      if (error) {
        setErrorMsg(error.message);
      } else if (data) {
        setProperties(data);
      }
      setLoading(false);
    },
    []
  );

  const runAiSearch = async (e?: FormEvent) => {
    e?.preventDefault();
    const q = searchText.trim();
    if (!q) {
      clearAiSearch();
      return;
    }

    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiError(data.error || 'AI search failed');
        setAiLoading(false);
        return;
      }

      setMode(data.mode || 'all');
      setOnlyGenerator(Boolean(data.only_generator));
      setOnlyOwner(Boolean(data.only_owner));
      setAiFilters({
        township: data.township || '',
        property_type: data.property_type || '',
        max_price_lakhs: Number(data.max_price_lakhs) || 0,
        min_price_lakhs: Number(data.min_price_lakhs) || 0,
        min_beds: Number(data.min_beds) || 0,
        flood_free: Boolean(data.flood_free),
        summary: data.summary || q,
      });
    } catch {
      setAiError('Could not reach AI search API.');
    } finally {
      setAiLoading(false);
    }
  };

  const clearAiSearch = () => {
    setAiFilters(null);
    setAiError(null);
    setSearchText('');
    setMode('all');
    setOnlyGenerator(false);
    setOnlyOwner(false);
  };

  const filtered = properties.filter((p) => {
    if (mode !== 'all' && p.mode !== mode) return false;
    if (onlyGenerator && !p.backup_power) return false;
    if (onlyOwner && !p.owner_direct) return false;

    if (aiFilters) {
      if (
        aiFilters.township &&
        !p.township.toLowerCase().includes(aiFilters.township.toLowerCase())
      ) {
        return false;
      }
      if (
        aiFilters.property_type &&
        !p.property_type
          .toLowerCase()
          .includes(aiFilters.property_type.toLowerCase())
      ) {
        return false;
      }
      if (
        aiFilters.max_price_lakhs > 0 &&
        Number(p.price_lakhs) > aiFilters.max_price_lakhs
      ) {
        return false;
      }
      if (
        aiFilters.min_price_lakhs > 0 &&
        Number(p.price_lakhs) < aiFilters.min_price_lakhs
      ) {
        return false;
      }
      if (aiFilters.min_beds > 0 && p.beds < aiFilters.min_beds) {
        return false;
      }
      if (aiFilters.flood_free && !p.flood_free) {
        return false;
      }
    } else if (searchText.trim()) {
      const q = searchText.toLowerCase();
      const match =
        p.title.toLowerCase().includes(q) ||
        p.township.toLowerCase().includes(q) ||
        p.property_type.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  return (
    <main className="min-h-screen bg-[#0A0B0E] text-slate-100">
      <header className="sticky top-0 z-[1000] bg-[#0A0B0E]/95 backdrop-blur-md border-b border-amber-500/20 px-4 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-300 via-amber-500 to-yellow-700 flex items-center justify-center text-[#0A0B0E] font-black text-lg shadow-lg">
              Y
            </div>
            <div>
              <h1 className="text-base font-bold tracking-wide text-amber-200">
                YOMAHOME <span className="text-amber-400 font-light">ESTATES</span>
              </h1>
              <p className="text-[11px] text-slate-400">Yangon Curated Real Estate</p>
            </div>
          </div>

          {/* Gemini AI Natural-Language Search Bar */}
          <form
            onSubmit={runAiSearch}
            className="flex-1 max-w-lg min-w-[230px] flex items-center gap-1.5 bg-[#131720] border border-slate-700/80 focus-within:border-amber-400 rounded-xl p-1 pl-3"
          >
            <input
              type="text"
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                if (aiFilters) setAiFilters(null);
              }}
              placeholder='Try: "3 bed Bahan condo under 40L with generator"'
              className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 outline-none min-w-0"
            />
            <button
              type="submit"
              disabled={aiLoading}
              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-300 to-amber-500 hover:from-amber-200 hover:to-amber-400 text-[#0A0B0E] text-xs font-extrabold whitespace-nowrap transition disabled:opacity-60"
            >
              {aiLoading ? 'Thinking...' : '✨ AI Search'}
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {(['all', 'rent', 'buy'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded-lg font-semibold uppercase tracking-wider transition ${
                  mode === m
                    ? 'bg-amber-400 text-[#0A0B0E]'
                    : 'bg-[#131720] text-slate-300 border border-slate-800'
                }`}
              >
                {m}
              </button>
            ))}

            <button
              type="button"
              onClick={() => setOnlyGenerator(!onlyGenerator)}
              className={`px-3 py-1.5 rounded-lg font-medium border transition ${
                onlyGenerator
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                  : 'bg-[#131720] border-slate-800 text-slate-300'
              }`}
            >
              ⚡ 24/7 Power
            </button>

            <button
              type="button"
              onClick={() => setOnlyOwner(!onlyOwner)}
              className={`px-3 py-1.5 rounded-lg font-medium border transition ${
                onlyOwner
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                  : 'bg-[#131720] border-slate-800 text-slate-300'
              }`}
            >
              Owner Direct
            </button>

            <button
              type="button"
              onClick={() => setDrawMode((prev) => !prev)}
              className={`px-3 py-1.5 rounded-lg font-semibold border transition ${
                drawMode
                  ? 'bg-amber-400 text-[#0A0B0E] border-amber-300'
                  : 'bg-[#131720] border-amber-500/40 text-amber-300'
              }`}
            >
              {drawMode ? '✕ Cancel Zone' : '◎ Draw Zone'}
            </button>

            <button type="button" onClick={() => setShowPostModal(true)} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-300 to-amber-500 text-[#0A0B0E] font-extrabold transition">+ Post / Boost</button>
            {activeZone && (
              <button
                type="button"
                onClick={loadAllProperties}
                className="px-3 py-1.5 rounded-lg bg-rose-500/20 border border-rose-400/50 text-rose-200 font-medium"
              >
                Reset Map
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7">
          <YomaMap
            properties={filtered}
            selectedId={selected?.id ?? null}
            drawMode={drawMode}
            activeZone={activeZone}
            onSelectProperty={(p) => setSelected(p)}
            onZoneDrawn={handleZoneDrawn}
            onCancelDraw={() => setDrawMode(false)}
            onClearZone={loadAllProperties}
          />
        </div>

        <div className="lg:col-span-5 space-y-4 max-h-[640px] overflow-y-auto pr-1">
          {/* Active Gemini AI Filter Banner */}
          {aiFilters && (
            <div className="flex items-center justify-between gap-2 rounded-xl bg-amber-500/10 border border-amber-400/40 px-3.5 py-2.5 text-xs">
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-amber-300">
                  ✨ Gemini AI Filter Active
                </p>
                <p className="text-slate-200 mt-0.5">{aiFilters.summary}</p>
              </div>
              <button
                type="button"
                onClick={clearAiSearch}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-300 font-semibold whitespace-nowrap"
              >
                ✕ Clear
              </button>
            </div>
          )}

          {aiError && (
            <div className="rounded-xl border border-rose-500/50 bg-rose-950/40 p-3 text-xs text-rose-200">
              AI Search error: {aiError}
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-widest text-amber-400/90 font-semibold">
              {loading
                ? 'Loading Yangon Portfolio...'
                : `${filtered.length} Verified Properties`}
            </span>
            {activeZone && (
              <span className="text-xs text-emerald-400">Filtered by 1.5km Map Zone</span>
            )}
          </div>

          {errorMsg && (
            <div className="rounded-xl border border-rose-500/50 bg-rose-950/40 p-3 text-xs text-rose-200">
              Database error: {errorMsg}
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="rounded-2xl border border-slate-800 bg-[#11151E] p-6 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-200">
                No matching properties found
              </p>
              <p className="text-xs text-slate-400">
                Try broadening your budget or clearing active filters.
              </p>
              <button
                type="button"
                onClick={clearAiSearch}
                className="mt-2 px-4 py-1.5 rounded-lg bg-amber-400 text-[#0A0B0E] text-xs font-bold"
              >
                Reset All Filters
              </button>
            </div>
          )}

          {filtered.map((p) => (
            <div
              key={p.id}
              onClick={() => setSelected(p)}
              className={`cursor-pointer rounded-2xl overflow-hidden border transition bg-[#11151E] ${
                selected?.id === p.id
                  ? 'border-emerald-400 shadow-lg'
                  : p.is_sponsored
                  ? 'border-amber-400/60 shadow-lg'
                  : 'border-slate-800'
              }`}
            >
              <div className="relative h-44 w-full bg-slate-900">
                {p.image_url && (
                  <img
                    src={p.image_url}
                    alt={p.title}
                    className="h-full w-full object-cover"
                  />
                )}
                <div className="absolute top-3 left-3 flex gap-2">
                  {p.is_sponsored && (
                    <span className="bg-gradient-to-r from-amber-300 to-amber-500 text-[#0A0B0E] text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full shadow">
                      ★ Premier Featured
                    </span>
                  )}
                  <span className="bg-[#0A0B0E]/85 text-slate-200 text-[11px] font-semibold uppercase px-2.5 py-1 rounded-full border border-slate-700">
                    For {p.mode}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDetailProp(p);
                  }}
                  className="absolute top-3 right-3 bg-[#0A0B0E]/85 hover:bg-amber-400 hover:text-[#0A0B0E] text-amber-200 text-[11px] font-bold px-2.5 py-1 rounded-full border border-amber-400/50 transition"
                >
                  🌐 360° Tour
                </button>
                <div className="absolute bottom-3 left-3 bg-[#0A0B0E]/90 backdrop-blur px-3 py-1 rounded-xl border border-amber-400/40">
                  <span className="text-amber-300 font-bold text-base">
                    {Number(p.price_lakhs).toLocaleString()} Lakhs
                  </span>
                  <span className="text-slate-400 text-xs ml-1">
                    {p.mode === 'rent' ? '/ mo' : 'MMK'}
                  </span>
                </div>
              </div>

              <div className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold text-slate-100 text-base leading-snug">
                      {p.title}
                    </h2>
                    <p className="text-xs text-slate-400">
                      {p.township} Township • {p.property_type}
                      {p.floor_level ? ` • ${p.floor_level}` : ''}
                    </p>
                  </div>
                  {p.owner_direct && (
                    <span className="text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-md whitespace-nowrap">
                      Owner Direct
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-300 pt-1 border-t border-slate-800/80">
                  <span>{p.beds} Beds</span>
                  <span>•</span>
                  <span>{p.baths} Baths</span>
                  <span>•</span>
                  <span>{Number(p.sqft).toLocaleString()} sqft</span>
                  {p.backup_power && (
                    <>
                      <span>•</span>
                      <span className="text-amber-300">⚡ Generator</span>
                    </>
                  )}
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailProp(p);
                    }}
                    className="flex-1 text-center py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#0A0B0E] font-bold text-xs transition"
                  >
                    Details & Calculator
                  </button>
                  <a
                    href={`tel:${p.contact_phone}`}
                    onClick={(e) => e.stopPropagation()}
                    className="px-3.5 py-2 rounded-xl bg-[#1A202C] hover:bg-slate-800 text-amber-200 border border-amber-500/30 font-semibold text-xs transition"
                  >
                    Call
                  </a>
                  <a
                    href={`https://t.me/+${p.contact_phone.replace(/\+/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="px-3.5 py-2 rounded-xl bg-[#1A202C] hover:bg-slate-800 text-slate-200 border border-slate-700 font-semibold text-xs transition"
                  >
                    Telegram
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {detailProp && (
        <PropertyModal
          property={detailProp}
          onClose={() => setDetailProp(null)}
        />
      )}
      {showPostModal && (
        <PostBoostModal
          properties={properties}
          onClose={() => setShowPostModal(false)}
          onSuccess={loadAllProperties}
        />
      )}
    </main>
  );
}
