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

type CategoryKey = 'all' | 'villa' | 'penthouse' | 'condo' | 'house';
type MobileTab = 'home' | 'map' | 'saved';

const CATEGORIES: { key: CategoryKey; label: string }[] = [
  { key: 'all', label: 'All Estates' },
  { key: 'villa', label: 'Villas' },
  { key: 'penthouse', label: 'Penthouses' },
  { key: 'condo', label: 'Condos' },
  { key: 'house', label: 'Residences' },
];

export default function HomePage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Core filters
  const [mode, setMode] = useState<'all' | 'rent' | 'buy'>('all');
  const [category, setCategory] = useState<CategoryKey>('all');
  const [onlyGenerator, setOnlyGenerator] = useState(false);
  const [onlyOwner, setOnlyOwner] = useState(false);
  const [onlyElevator, setOnlyElevator] = useState(false);
  const [onlyFloodFree, setOnlyFloodFree] = useState(false);
  const [minBeds, setMinBeds] = useState(0);
  const [maxPriceLakhs, setMaxPriceLakhs] = useState(0);

  // Map & Modals
  const [drawMode, setDrawMode] = useState(false);
  const [activeZone, setActiveZone] = useState(false);
  const [selected, setSelected] = useState<Property | null>(null);
  const [detailProp, setDetailProp] = useState<Property | null>(null);
  const [showPostModal, setShowPostModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // AI Search
  const [searchText, setSearchText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiFilters, setAiFilters] = useState<AiFilters | null>(null);

  // Navigation & Saved Favorites
  const [mobileTab, setMobileTab] = useState<MobileTab>('home');
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [savedIds, setSavedIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('yomahome_saved_ids');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setSavedIds(parsed);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const toggleSave = (id: string) => {
    setSavedIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((item) => item !== id)
        : [...prev, id];
      try {
        localStorage.setItem('yomahome_saved_ids', JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const loadAllProperties = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    setActiveZone(false);
    setDrawMode(false);
    const { data, error } = await supabase.rpc('get_properties');
    if (error) {
      setErrorMsg(error.message);
    } else if (data) {
      setProperties(data as Property[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAllProperties();
  }, [loadAllProperties]);

  // Force map resize when switching to Map tab on mobile
  useEffect(() => {
    if (mobileTab === 'map') {
      const timer = setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [mobileTab]);

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
        setProperties(data as Property[]);
      }
      setLoading(false);
    },
    []
  );

  const handleAiSearch = async (e: FormEvent) => {
    e.preventDefault();
    const q = searchText.trim();
    if (!q) {
      setAiFilters(null);
      setAiError(null);
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
        max_price_lakhs: Number(data.max_price_lakhs || 0),
        min_price_lakhs: Number(data.min_price_lakhs || 0),
        min_beds: Number(data.min_beds || 0),
        flood_free: Boolean(data.flood_free),
        summary: data.summary || q,
      });
    } catch {
      setAiError('Unable to reach AI Search. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  const resetAllFilters = () => {
    setAiFilters(null);
    setAiError(null);
    setSearchText('');
    setMode('all');
    setCategory('all');
    setOnlyGenerator(false);
    setOnlyOwner(false);
    setOnlyElevator(false);
    setOnlyFloodFree(false);
    setMinBeds(0);
    setMaxPriceLakhs(0);
    setShowSavedOnly(false);
    if (activeZone) {
      loadAllProperties();
    }
  };

  const activeFilterCount =
    (mode !== 'all' ? 1 : 0) +
    (category !== 'all' ? 1 : 0) +
    (onlyGenerator ? 1 : 0) +
    (onlyOwner ? 1 : 0) +
    (onlyElevator ? 1 : 0) +
    (onlyFloodFree ? 1 : 0) +
    (minBeds > 0 ? 1 : 0) +
    (maxPriceLakhs > 0 ? 1 : 0);

  const filtered = properties.filter((p) => {
    if (mode !== 'all' && p.mode !== mode) return false;
    if (onlyGenerator && !p.backup_power) return false;
    if (onlyOwner && !p.owner_direct) return false;
    if (onlyElevator && !p.has_elevator) return false;
    if (onlyFloodFree && !p.flood_free) return false;
    if (minBeds > 0 && Number(p.beds) < minBeds) return false;
    if (maxPriceLakhs > 0 && Number(p.price_lakhs) > maxPriceLakhs) return false;

    if (category !== 'all') {
      const pType = (p.property_type || '').toLowerCase();
      if (!pType.includes(category)) return false;
    }

    if (aiFilters) {
      if (
        aiFilters.township &&
        !(p.township || '')
          .toLowerCase()
          .includes(aiFilters.township.toLowerCase())
      ) {
        return false;
      }
      if (
        aiFilters.property_type &&
        !(p.property_type || '')
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
      if (aiFilters.min_beds > 0 && Number(p.beds) < aiFilters.min_beds) {
        return false;
      }
      if (aiFilters.flood_free && !p.flood_free) {
        return false;
      }
    }

    return true;
  });

  const savedProperties = properties.filter((p) => savedIds.includes(p.id));
  const displayedListings =
    mobileTab === 'saved'
      ? savedProperties
      : showSavedOnly
      ? filtered.filter((p) => savedIds.includes(p.id))
      : filtered;

  const formatPrice = (p: Property) => {
    const num = Number(p.price_lakhs || 0).toLocaleString();
    return p.mode === 'rent' ? `${num} Lakhs / mo` : `${num} Lakhs MMK`;
  };

  return (
    <main className="min-h-dvh lg:h-dvh flex flex-col bg-[#0B0C10] text-[#F5F2EB] lg:overflow-hidden">
      {/* Top Luxury Brand Bar */}
      <header className="sticky top-0 z-30 luxury-glass border-x-0 border-t-0 px-4 lg:px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl border border-[#D4AF37]/55 bg-gradient-to-br from-[#1F1B12] via-[#111319] to-[#090A0E] flex items-center justify-center shadow-[0_0_24px_rgba(212,175,55,0.22)] shrink-0 relative overflow-hidden">
            <svg className="w-8 h-8" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="yomaDiamondGold" x1="6" y1="4" x2="34" y2="36" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#F8E3B0" />
                  <stop offset="55%" stopColor="#D4AF37" />
                  <stop offset="100%" stopColor="#9A7222" />
                </linearGradient>
              </defs>
              <path d="M20 4L21.5 9.5H23.5V12H16.5V9.5H18.5L20 4Z" fill="url(#yomaDiamondGold)" />
              <path d="M16.5 10.5L6.5 20.5L20 34L33.5 20.5L23.5 10.5" stroke="url(#yomaDiamondGold)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M14.5 14.5L9.5 20.5L20 31L30.5 20.5L25.5 14.5" stroke="url(#yomaDiamondGold)" strokeWidth="1" strokeOpacity="0.65" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M14.5 16L20 22.5L25.5 16M20 22.5V28.5M17 28.5H23" stroke="url(#yomaDiamondGold)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="min-w-0">
            <h1 className="font-luxury text-sm sm:text-base tracking-[0.14em] uppercase text-[#F5E6B3] truncate">
              YomaHome Estates
            </h1>
            <p className="text-[11px] text-[#9A9589] tracking-wide truncate">
              Yangon Curated Real Estate
            </p>
          </div>
        </div>

        {/* Desktop Quick Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSavedOnly((prev) => !prev)}
            className={`hidden lg:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium border transition ${
              showSavedOnly
                ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-[#F5E6B3]'
                : 'border-white/10 bg-[#141720] text-[#C9C3B4] hover:border-[#D4AF37]/40'
            }`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={showSavedOnly ? '#D4AF37' : 'none'} stroke="currentColor" strokeWidth="1.8">
              <path d="M12 21s-7-4.5-9.2-8.4C1.1 9.5 2.7 5.5 6.5 5.1c2.1-.2 4 1 5.5 2.7 1.5-1.7 3.4-2.9 5.5-2.7 3.8.4 5.4 4.4 3.7 7.5C19 16.5 12 21 12 21z" />
            </svg>
            Saved ({savedIds.length})
          </button>

          <button
            type="button"
            onClick={() => setShowFilters(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium border border-[#D4AF37]/35 bg-[#151821] text-[#F3D58D] hover:border-[#D4AF37] transition"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" />
            </svg>
            <span className="hidden sm:inline">Filters</span>
            {activeFilterCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold gold-gradient">
                {activeFilterCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowPostModal(true)}
            className="gold-gradient px-3.5 sm:px-4 py-2 rounded-full text-xs font-semibold tracking-wide shadow-[0_6px_18px_rgba(212,175,55,0.28)] hover:brightness-105 transition"
          >
            + Post / Boost
          </button>
        </div>
      </header>

      {/* Main Responsive Workspace */}
      <div className="flex-1 flex flex-col lg:flex-row lg:overflow-hidden relative">
        {/* LEFT PANE (Desktop) / MAP TAB (Mobile) */}
        <section
          className={`${
            mobileTab === 'map'
              ? 'block h-[calc(100dvh-134px)]'
              : 'hidden'
          } lg:block lg:h-full lg:w-[52%] xl:w-[56%] relative border-b lg:border-b-0 lg:border-r border-[#D4AF37]/15 bg-[#0F1117]`}
        >
          {/* Floating Top Map Pills */}
          <div className="absolute top-3 left-3 right-3 z-[400] flex items-center justify-between gap-2 pointer-events-none">
            {!showPostModal && (
  <div className="flex items-center gap-2 pointer-events-auto">
              {!showPostModal && (<button
                type="button"
                onClick={() => {
                  if (activeZone) {
                    loadAllProperties();
                  } else {
                    setDrawMode((d) => !d);
                  }
                }}
                className={`luxury-glass px-3.5 py-2 rounded-full text-xs font-medium flex items-center gap-1.5 transition shadow-lg ${
                  drawMode || activeZone
                    ? 'border-[#D4AF37] text-[#F5E6B3] bg-[#241E12]/90'
                    : 'text-[#E7E2D6] hover:border-[#D4AF37]/60'
                }`}
              >
                <svg className="w-3.5 h-3.5 text-[#D4AF37]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="12" cy="12" r="8" strokeDasharray="3 3" />
                  <circle cx="12" cy="12" r="2.5" />
                </svg>
                {activeZone ? 'Clear Zone' : drawMode ? 'Drawing Zone...' : 'Draw Zone'}
              </button>)}

              {!showPostModal && (<button
                type="button"
                onClick={() => setShowFilters(true)}
                className="luxury-glass px-3 py-2 rounded-full text-xs font-medium text-[#E7E2D6] hover:border-[#D4AF37]/60 transition shadow-lg"
              >
                {mode === 'all' ? 'All Modes' : mode === 'rent' ? 'For Rent' : 'For Buy'}
              </button>)}
            </div>
)}

            {!showPostModal && (<button
              type="button"
              onClick={() => {
                setMobileTab('home');
                const input = document.getElementById('yoma-ai-input');
                input?.focus();
              }}
              className="lg:hidden pointer-events-auto gold-gradient px-3.5 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 shadow-[0_6px_20px_rgba(212,175,55,0.32)]"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
              </svg>
              AI Search
            </button>)}
          </div>

                <YomaMap
                  properties={filtered}
                  selectedId={selected?.id ?? null}
                  drawMode={drawMode}
                  activeZone={activeZone}
                  onSelectProperty={(p) => setSelected(p)}
                  onZoneDrawn={handleZoneDrawn}
                  onCancelDraw={() => setDrawMode(false)}
                  onClearZone={loadAllProperties}
                  hideOverlayControls={showPostModal}
                />

          {/* Floating Bottom Preview Card When a Pin is Selected */}
          {selected && (
            <div className="absolute bottom-4 left-3 right-3 sm:left-4 sm:right-4 z-[400] max-w-md mx-auto">
              <div
                onClick={() => setDetailProp(selected)}
                className="luxury-glass rounded-2xl p-3 flex items-center gap-3 cursor-pointer hover:border-[#D4AF37]/60 transition shadow-[0_14px_34px_rgba(0,0,0,0.6)]"
              >
                <img
                  src={
                    selected.image_url ||
                    'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=400&q=80'
                  }
                  alt={selected.title}
                  className="w-16 h-16 rounded-xl object-cover border border-[#D4AF37]/30 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-luxury text-sm font-semibold text-[#F8F3E6] truncate">
                      {selected.title}
                    </h3>
                    {!showPostModal && (<button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(null);
                      }}
                      className="text-[#9A9589] hover:text-white text-xs px-1"
                      aria-label="Close preview"
                    >
                      ✕
                    </button>)}
                  </div>
                  <p className="text-xs font-semibold text-[#F3D58D] mt-0.5">
                    {formatPrice(selected)} • {selected.sqft.toLocaleString()} sqft
                  </p>
                  <p className="text-[11px] text-[#ABA599] truncate mt-0.5">
                    {selected.township} Township • {selected.beds} Beds • {selected.baths} Baths
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* RIGHT PANE (Desktop) / HOME & SAVED TABS (Mobile) */}
        <section
          className={`${
            mobileTab === 'map' ? 'hidden lg:flex' : 'flex'
          } flex-1 flex-col lg:h-full lg:overflow-y-auto px-4 sm:px-5 pt-5 pb-28 lg:pb-8`}
        >
          {/* Editorial Hero & Search (Hidden on Mobile Saved Tab) */}
          {mobileTab !== 'saved' ? (
            <div className="space-y-4 mb-5">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-[#D4AF37] font-semibold">
                  Yangon Luxury Portfolio
                </p>
                <h2 className="font-luxury text-3xl sm:text-4xl font-semibold leading-[1.12] text-[#FAF6EC] mt-1">
                  Find Your{' '}
                  <span className="gold-text">Masterpiece</span>
                </h2>
              </div>

              {/* Pill AI Search Input */}
              <form
                onSubmit={handleAiSearch}
                className="flex items-center gap-2 rounded-full bg-[#141720] border border-[#D4AF37]/25 focus-within:border-[#D4AF37] px-3.5 py-2 transition shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
              >
                <svg className="w-4 h-4 text-[#D4AF37] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
                </svg>
                <input
                  id="yoma-ai-input"
                  type="text"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder='Try: "3 bed Bahan condo under 40L"'
                  className="flex-1 bg-transparent text-sm text-[#F5F2EB] placeholder:text-[#7E7A70] focus:outline-none min-w-0"
                />
                {!showPostModal && (<button
                  type="submit"
                  disabled={aiLoading}
                  className="gold-gradient px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wide shrink-0 disabled:opacity-60 transition"
                >
                  {aiLoading ? 'Thinking...' : 'AI Search'}
                </button>)}
              </form>

              {/* Category Icon Chips */}
              <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar pb-1">
                {CATEGORIES.map((cat) => {
                  const active = category === cat.key;
                  return (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => setCategory(cat.key)}
                      className={`shrink-0 flex flex-col items-center justify-center min-w-[76px] px-3 py-2.5 rounded-2xl border transition ${
                        active
                          ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-[#F5E6B3] shadow-[0_0_16px_rgba(212,175,55,0.18)]'
                          : 'border-white/10 bg-[#13161F] text-[#A8A296] hover:border-[#D4AF37]/40 hover:text-[#EAE4D7]'
                      }`}
                    >
                      <svg className="w-4 h-4 mb-1 text-[#D4AF37]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                        {cat.key === 'penthouse' ? (
                          <path d="M4 20h16M6 20V7l6-4 6 4v13M10 12h4M10 16h4" strokeLinecap="round" strokeLinejoin="round" />
                        ) : cat.key === 'condo' ? (
                          <path d="M5 20V5a1 1 0 011-1h12a1 1 0 011 1v15M3 20h18M9 8h2M13 8h2M9 12h2M13 12h2M10 20v-4h4v4" strokeLinecap="round" strokeLinejoin="round" />
                        ) : (
                          <path d="M3 11l9-7 9 7M5 10v10h14V10M9 20v-6h6v6" strokeLinecap="round" strokeLinejoin="round" />
                        )}
                      </svg>
                      <span className="text-[11px] font-medium">{cat.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Quick Mode & Essential Toggles */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                {(['all', 'rent', 'buy'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider border transition shrink-0 ${
                      mode === m
                        ? 'gold-gradient border-transparent'
                        : 'border-white/10 bg-[#141720] text-[#B7B1A4] hover:border-[#D4AF37]/40'
                    }`}
                  >
                    {m === 'all' ? 'All' : m === 'rent' ? 'For Rent' : 'For Buy'}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setOnlyGenerator((v) => !v)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition shrink-0 ${
                    onlyGenerator
                      ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-[#F5E6B3]'
                      : 'border-white/10 bg-[#141720] text-[#B7B1A4] hover:border-[#D4AF37]/40'
                  }`}
                >
                  ⚡ 24/7 Power
                </button>
                <button
                  type="button"
                  onClick={() => setOnlyOwner((v) => !v)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition shrink-0 ${
                    onlyOwner
                      ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-[#F5E6B3]'
                      : 'border-white/10 bg-[#141720] text-[#B7B1A4] hover:border-[#D4AF37]/40'
                  }`}
                >
                  Owner Direct
                </button>
              </div>
            </div>
          ) : (
            <div className="mb-5">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[#D4AF37] font-semibold">
                Private Collection
              </p>
              <h2 className="font-luxury text-3xl font-semibold text-[#FAF6EC] mt-1">
                Saved <span className="gold-text">Masterpieces</span>
              </h2>
            </div>
          )}

          {/* Active Gemini AI Filter Banner */}
          {aiFilters && (
            <div className="mb-4 rounded-2xl border border-[#D4AF37]/45 bg-[#1B1810] px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#F3D58D]">
                  ✦ Gemini AI Filter Active
                </p>
                <p className="text-xs text-[#E8E2D4] truncate mt-0.5">
                  {aiFilters.summary}
                </p>
              </div>
              <button
                type="button"
                onClick={resetAllFilters}
                className="w-7 h-7 rounded-full border border-[#D4AF37]/40 text-[#F3D58D] hover:bg-[#D4AF37]/20 flex items-center justify-center text-xs shrink-0"
              >
                ✕
              </button>
            </div>
          )}

          {/* Error Alerts */}
          {aiError && (
            <div className="mb-4 rounded-2xl border border-amber-500/40 bg-amber-950/30 px-4 py-3 text-xs text-amber-200">
              {aiError}
            </div>
          )}
          {errorMsg && (
            <div className="mb-4 rounded-2xl border border-red-500/40 bg-red-950/35 px-4 py-3 text-xs text-red-200">
              Database error: {errorMsg}
            </div>
          )}

          {/* Section Header */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-luxury text-lg text-[#F5EFE2]">
              {mobileTab === 'saved' || showSavedOnly
                ? 'Saved Properties'
                : 'Featured Masterpieces'}
            </h3>
            <span className="text-[11px] uppercase tracking-[0.16em] text-[#D4AF37] font-semibold">
              {loading
                ? 'Loading...'
                : `${displayedListings.length} Verified ${
                    displayedListings.length === 1 ? 'Estate' : 'Estates'
                  }`}
            </span>
          </div>

          {/* Property Cards Grid */}
          {loading ? (
            <div className="space-y-4">
              {[1, 2].map((n) => (
                <div
                  key={n}
                  className="luxury-card rounded-3xl h-72 animate-pulse"
                />
              ))}
            </div>
          ) : displayedListings.length === 0 ? (
            <div className="luxury-card rounded-3xl p-8 text-center my-2">
              <p className="font-luxury text-lg text-[#F5EFE2]">
                {mobileTab === 'saved'
                  ? 'No saved residences yet'
                  : 'No matching estates found'}
              </p>
              <p className="text-xs text-[#9A9589] mt-1.5">
                {mobileTab === 'saved'
                  ? 'Tap the heart icon on any residence to curate your shortlist.'
                  : 'Try broadening your budget or resetting active filters.'}
              </p>
              <button
                type="button"
                onClick={() =>
                  mobileTab === 'saved'
                    ? setMobileTab('home')
                    : resetAllFilters()
                }
                className="gold-gradient mt-4 px-5 py-2.5 rounded-full text-xs font-semibold"
              >
                {mobileTab === 'saved' ? 'Explore Estates' : 'Reset All Filters'}
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {displayedListings.map((p) => {
                const isSaved = savedIds.includes(p.id);
                const isSelected = selected?.id === p.id;
                const cleanPhone = (p.contact_phone || '').replace(/\+/g, '');

                return (
                  <article
                    key={p.id}
                    onClick={() => {
                      setSelected(p);
                      setDetailProp(p);
                    }}
                    className={`luxury-card rounded-3xl overflow-hidden cursor-pointer transition duration-300 hover:border-[#D4AF37]/60 ${
                      isSelected ? 'ring-1 ring-[#D4AF37]' : ''
                    }`}
                  >
                    {/* Full-Bleed Hero Photo */}
                    <div className="relative h-56 sm:h-60 w-full overflow-hidden">
                      <img
                        src={
                          p.image_url ||
                          'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80'
                        }
                        alt={p.title}
                        className="w-full h-full object-cover transition duration-500 hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0B0C10] via-[#0B0C10]/25 to-transparent" />

                      {/* Top Badges & Save Heart */}
                      <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {p.is_sponsored && (
                            <span className="gold-gradient px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow">
                              ★ Premier Featured
                            </span>
                          )}
                          <span className="luxury-glass px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider text-[#F5EFE2]">
                            {p.mode === 'rent' ? 'For Rent' : 'For Sale'}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSave(p.id);
                          }}
                          aria-label="Save property"
                          className="w-9 h-9 rounded-full luxury-glass flex items-center justify-center hover:border-[#D4AF37] transition"
                        >
                          <svg
                            className="w-4 h-4"
                            viewBox="0 0 24 24"
                            fill={isSaved ? '#D4AF37' : 'none'}
                            stroke={isSaved ? '#D4AF37' : '#F5EFE2'}
                            strokeWidth="1.9"
                          >
                            <path d="M12 21s-7-4.5-9.2-8.4C1.1 9.5 2.7 5.5 6.5 5.1c2.1-.2 4 1 5.5 2.7 1.5-1.7 3.4-2.9 5.5-2.7 3.8.4 5.4 4.4 3.7 7.5C19 16.5 12 21 12 21z" />
                          </svg>
                        </button>
                      </div>

                      {/* Bottom Frosted Price Pill */}
                      <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
                        <span className="luxury-glass px-3.5 py-1.5 rounded-xl text-sm font-semibold text-[#F5E6B3] border-[#D4AF37]/40">
                          {formatPrice(p)}
                        </span>
                        {p.owner_direct && (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-950/80 border border-emerald-400/35 text-emerald-200">
                            Owner Direct
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Card Details */}
                    <div className="p-4 sm:p-5">
                      <h4 className="font-luxury text-xl font-semibold text-[#FAF6EC] leading-snug">
                        {p.title}
                      </h4>
                      <p className="text-xs text-[#ABA599] mt-1">
                        {p.township} Township • {p.property_type}
                        {p.floor_level ? ` • ${p.floor_level}` : ''}
                      </p>

                      {/* Specs Row */}
                      <div className="flex items-center flex-wrap gap-x-3 gap-y-1.5 text-xs text-[#D8D2C5] mt-3 pt-3 border-t border-white/10">
                        <span>{p.beds} Beds</span>
                        <span className="text-[#D4AF37]/60">•</span>
                        <span>{p.baths} Baths</span>
                        <span className="text-[#D4AF37]/60">•</span>
                        <span>{Number(p.sqft).toLocaleString()} sqft</span>
                        {p.backup_power && (
                          <>
                            <span className="text-[#D4AF37]/60">•</span>
                            <span className="text-[#F3D58D]">⚡ 24/7 Power</span>
                          </>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="mt-4 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetailProp(p);
                          }}
                          className="flex-1 gold-gradient py-2.5 px-4 rounded-xl text-xs font-semibold tracking-wide hover:brightness-105 transition"
                        >
                          Details &amp; Calculator
                        </button>
                        {p.contact_phone && (
                          <>
                            <a
                              href={`tel:${p.contact_phone}`}
                              onClick={(e) => e.stopPropagation()}
                              className="px-3.5 py-2.5 rounded-xl bg-[#191C26] border border-[#D4AF37]/25 text-xs font-medium text-[#EFE9DC] hover:border-[#D4AF37] transition"
                            >
                              Call
                            </a>
                            <a
                              href={`https://t.me/+${cleanPhone}`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="px-3.5 py-2.5 rounded-xl bg-[#191C26] border border-[#D4AF37]/25 text-xs font-medium text-[#EFE9DC] hover:border-[#D4AF37] transition"
                            >
                              Telegram
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Mobile Glassmorphic Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 luxury-glass border-x-0 border-b-0 px-4 py-2.5 flex items-center justify-around">
        <button
          type="button"
          onClick={() => setMobileTab('home')}
          className={`flex flex-col items-center gap-1 text-[11px] font-medium transition ${
            mobileTab === 'home' ? 'text-[#F3D58D]' : 'text-[#8C877D]'
          }`}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5.5v-6.5h-5V21H4a1 1 0 01-1-1v-9.5z" strokeLinejoin="round" />
          </svg>
          Home
        </button>

        <button
          type="button"
          onClick={() => setMobileTab('map')}
          className={`flex flex-col items-center gap-1 text-[11px] font-medium transition ${
            mobileTab === 'map' ? 'text-[#F3D58D]' : 'text-[#8C877D]'
          }`}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
          Map
        </button>

        <button
          type="button"
          onClick={() => setMobileTab('saved')}
          className={`flex flex-col items-center gap-1 text-[11px] font-medium transition relative ${
            mobileTab === 'saved' ? 'text-[#F3D58D]' : 'text-[#8C877D]'
          }`}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill={mobileTab === 'saved' ? '#D4AF37' : 'none'} stroke="currentColor" strokeWidth="1.8">
            <path d="M12 21s-7-4.5-9.2-8.4C1.1 9.5 2.7 5.5 6.5 5.1c2.1-.2 4 1 5.5 2.7 1.5-1.7 3.4-2.9 5.5-2.7 3.8.4 5.4 4.4 3.7 7.5C19 16.5 12 21 12 21z" />
          </svg>
          Saved{savedIds.length > 0 ? ` (${savedIds.length})` : ''}
        </button>

        <button
          type="button"
          onClick={() => setShowPostModal(true)}
          className="flex flex-col items-center gap-1 text-[11px] font-medium text-[#8C877D] hover:text-[#F3D58D] transition"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v8M8 12h8" strokeLinecap="round" />
          </svg>
          Post
        </button>
      </nav>

      {/* Slide-Up / Modal Elite Filters Drawer */}
      {showFilters && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowFilters(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-[#11131A] border border-[#D4AF37]/30 p-5 sm:p-6 max-h-[88dvh] overflow-y-auto shadow-[0_20px_60px_rgba(0,0,0,0.8)]"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <button
                type="button"
                onClick={() => setShowFilters(false)}
                className="text-sm text-[#9A9589] hover:text-white"
              >
                ✕
              </button>
              <h3 className="font-luxury text-lg text-[#FAF6EC]">
                Elite Filters
              </h3>
              <button
                type="button"
                onClick={resetAllFilters}
                className="text-xs font-semibold text-[#F3D58D] hover:underline"
              >
                Reset
              </button>
            </div>

            <div className="space-y-5 py-5">
              {/* Mode */}
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-[#ABA599] font-semibold mb-2.5">
                  Acquisition Type
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {(['all', 'rent', 'buy'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className={`py-2.5 rounded-xl text-xs font-semibold border transition ${
                        mode === m
                          ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-[#F5E6B3]'
                          : 'border-white/10 bg-[#171A24] text-[#B8B2A5]'
                      }`}
                    >
                      {m === 'all' ? 'All' : m === 'rent' ? 'For Rent' : 'For Sale'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Property Type */}
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-[#ABA599] font-semibold mb-2.5">
                  Property Type
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => setCategory(cat.key)}
                      className={`py-2.5 px-3 rounded-xl text-xs font-medium border transition text-left ${
                        category === cat.key
                          ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-[#F5E6B3]'
                          : 'border-white/10 bg-[#171A24] text-[#B8B2A5]'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Max Price Range */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#ABA599] font-semibold">
                    Max Budget (Lakhs)
                  </p>
                  <span className="text-xs font-semibold text-[#F3D58D]">
                    {maxPriceLakhs === 0
                      ? 'Any Budget'
                      : `Up to ${maxPriceLakhs.toLocaleString()} L`}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={20000}
                  step={50}
                  value={maxPriceLakhs}
                  onChange={(e) => setMaxPriceLakhs(Number(e.target.value))}
                  className="w-full accent-[#D4AF37]"
                />
                <div className="flex justify-between text-[11px] text-[#7E7A70] mt-1">
                  <span>Any</span>
                  <span>5,000L</span>
                  <span>20,000L+</span>
                </div>
              </div>

              {/* Minimum Bedrooms */}
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-[#ABA599] font-semibold mb-2.5">
                  Minimum Bedrooms
                </p>
                <div className="grid grid-cols-5 gap-2">
                  {[0, 1, 2, 3, 4].map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setMinBeds(b)}
                      className={`py-2 rounded-xl text-xs font-semibold border transition ${
                        minBeds === b
                          ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-[#F5E6B3]'
                          : 'border-white/10 bg-[#171A24] text-[#B8B2A5]'
                      }`}
                    >
                      {b === 0 ? 'Any' : `${b}+`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Elite Amenities */}
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-[#ABA599] font-semibold mb-2.5">
                  Elite Amenities
                </p>
                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setOnlyGenerator((v) => !v)}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border transition ${
                      onlyGenerator
                        ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-[#F5E6B3]'
                        : 'border-white/10 bg-[#171A24] text-[#B8B2A5]'
                    }`}
                  >
                    <span>{onlyGenerator ? '✓' : '○'}</span> 24/7 Power
                  </button>
                  <button
                    type="button"
                    onClick={() => setOnlyOwner((v) => !v)}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border transition ${
                      onlyOwner
                        ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-[#F5E6B3]'
                        : 'border-white/10 bg-[#171A24] text-[#B8B2A5]'
                    }`}
                  >
                    <span>{onlyOwner ? '✓' : '○'}</span> Owner Direct
                  </button>
                  <button
                    type="button"
                    onClick={() => setOnlyElevator((v) => !v)}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border transition ${
                      onlyElevator
                        ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-[#F5E6B3]'
                        : 'border-white/10 bg-[#171A24] text-[#B8B2A5]'
                    }`}
                  >
                    <span>{onlyElevator ? '✓' : '○'}</span> Elevator
                  </button>
                  <button
                    type="button"
                    onClick={() => setOnlyFloodFree((v) => !v)}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border transition ${
                      onlyFloodFree
                        ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-[#F5E6B3]'
                        : 'border-white/10 bg-[#171A24] text-[#B8B2A5]'
                    }`}
                  >
                    <span>{onlyFloodFree ? '✓' : '○'}</span> Flood-Free
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowFilters(false)}
              className="w-full gold-gradient py-3.5 rounded-2xl text-sm font-semibold tracking-wide shadow-[0_10px_28px_rgba(212,175,55,0.3)]"
            >
              Apply Elite Filters ({filtered.length} Estates)
            </button>
          </div>
        </div>
      )}

      {/* Property Detail & Post/Boost Modals */}
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
