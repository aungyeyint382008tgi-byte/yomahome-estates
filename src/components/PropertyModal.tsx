'use client';

import { useState, useEffect, useRef } from 'react';
import type { Property } from '@/components/YomaMap';

type DetailedProperty = Property & { panorama_url?: string };

export default function PropertyModal({
  property,
  onClose,
}: {
  property: DetailedProperty;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'photo' | 'tour360'>('photo');

  // 360° Virtual Tour Pan & Auto-Rotate State
  const [panX, setPanX] = useState(0);
  const [zoom, setZoom] = useState(1.15);
  const [autoRotate, setAutoRotate] = useState(true);
  const draggingRef = useRef(false);
  const lastXRef = useRef(0);

  // Rent Move-In Calculator State (Yangon standard 6 or 12 months upfront)
  const [leaseMonths, setLeaseMonths] = useState<6 | 12>(12);
  const [includeDeposit, setIncludeDeposit] = useState(true);

  // Buy Mortgage Calculator State
  const [downPercent, setDownPercent] = useState(30);
  const [loanYears, setLoanYears] = useState(15);
  const [interestRate, setInterestRate] = useState(11);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (tab !== 'tour360' || !autoRotate) return;
    const id = window.setInterval(() => {
      if (!draggingRef.current) {
        setPanX((prev) => (prev + 0.35) % 100);
      }
    }, 30);
    return () => window.clearInterval(id);
  }, [tab, autoRotate]);

  const heroImage =
    property.image_url ||
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80';
  const panoImage = property.panorama_url || heroImage;

  const priceLakhs = Number(property.price_lakhs || 0);
  const cleanPhone = (property.contact_phone || '').replace(/\+/g, '');

  // Rent calculations
  const rentUpfront = priceLakhs * leaseMonths;
  const depositAmount = includeDeposit ? priceLakhs : 0;
  const totalMoveIn = rentUpfront + depositAmount;

  // Buy mortgage calculations
  const downPayment = (priceLakhs * downPercent) / 100;
  const loanPrincipal = Math.max(0, priceLakhs - downPayment);
  const monthlyRate = interestRate / 100 / 12;
  const totalPayments = loanYears * 12;
  const monthlyPayment =
    monthlyRate === 0
      ? loanPrincipal / Math.max(1, totalPayments)
      : (loanPrincipal *
          (monthlyRate * Math.pow(1 + monthlyRate, totalPayments))) /
        (Math.pow(1 + monthlyRate, totalPayments) - 1);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    setAutoRotate(false);
    lastXRef.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - lastXRef.current;
    lastXRef.current = e.clientX;
    setPanX((prev) => (prev - dx * 0.25 + 100) % 100);
  };

  const handlePointerUp = () => {
    draggingRef.current = false;
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-2xl h-[94dvh] sm:h-auto sm:max-h-[92dvh] rounded-t-3xl sm:rounded-3xl bg-[#0D0F15] border border-[#D4AF37]/30 overflow-hidden flex flex-col shadow-[0_24px_80px_rgba(0,0,0,0.85)]"
      >
        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Edge-to-Edge Hero Photo / 360° Viewer */}
          <div className="relative h-64 sm:h-80 w-full bg-[#090A0E] overflow-hidden select-none">
            {tab === 'photo' ? (
              <img
                src={heroImage}
                alt={property.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="w-full h-full cursor-grab active:cursor-grabbing relative overflow-hidden touch-none"
                style={{
                  backgroundImage: `url(${panoImage})`,
                  backgroundRepeat: 'repeat-x',
                  backgroundSize: `${zoom * 140}% 100%`,
                  backgroundPosition: `${panX}% center`,
                }}
              >
                <div className="absolute bottom-14 left-3 right-3 flex items-center justify-between gap-2 pointer-events-auto">
                  <span className="luxury-glass px-3 py-1 rounded-full text-[11px] text-[#F5E6B3]">
                    360° Drag to Explore
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setAutoRotate((v) => !v)}
                      className="luxury-glass px-2.5 py-1 rounded-full text-[11px] text-[#F5EFE2]"
                    >
                      {autoRotate ? 'Pause Spin' : 'Auto Spin'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setZoom((z) => Math.max(1, Number((z - 0.15).toFixed(2))))}
                      className="luxury-glass w-7 h-7 rounded-full text-xs text-[#F5EFE2]"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      onClick={() => setZoom((z) => Math.min(2, Number((z + 0.15).toFixed(2))))}
                      className="luxury-glass w-7 h-7 rounded-full text-xs text-[#F5EFE2]"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-[#0D0F15] via-transparent to-black/45 pointer-events-none" />

            {/* Top Overlay Controls */}
            <div className="absolute top-3.5 left-3.5 right-3.5 flex items-center justify-between">
              <button
                type="button"
                onClick={onClose}
                aria-label="Close details"
                className="w-9 h-9 rounded-full luxury-glass flex items-center justify-center text-sm text-[#FAF6EC] hover:border-[#D4AF37] transition"
              >
                ←
              </button>

              <div className="flex items-center gap-1.5 luxury-glass p-1 rounded-full">
                <button
                  type="button"
                  onClick={() => setTab('photo')}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                    tab === 'photo'
                      ? 'gold-gradient'
                      : 'text-[#D6D0C4] hover:text-white'
                  }`}
                >
                  Gallery
                </button>
                <button
                  type="button"
                  onClick={() => setTab('tour360')}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                    tab === 'tour360'
                      ? 'gold-gradient'
                      : 'text-[#D6D0C4] hover:text-white'
                  }`}
                >
                  360° Tour
                </button>
              </div>
            </div>

            {/* Price Pill Overlay */}
            <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between gap-2">
              <span className="luxury-glass px-3.5 py-1.5 rounded-xl text-sm font-semibold text-[#F5E6B3] border-[#D4AF37]/45">
                {priceLakhs.toLocaleString()} Lakhs{' '}
                {property.mode === 'rent' ? '/ month' : 'MMK'}
              </span>
              {property.ownership_doc && (
                <span className="luxury-glass px-3 py-1 rounded-full text-[11px] text-[#E6E0D3]">
                  {property.ownership_doc}
                </span>
              )}
            </div>
          </div>

          {/* Body Content */}
          <div className="p-5 sm:p-6 space-y-6">
            {/* Title & Location */}
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                {property.is_sponsored && (
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#D4AF37]">
                    ★ Premier Featured
                  </span>
                )}
                <span className="text-[10px] uppercase tracking-[0.18em] text-[#9A9589]">
                  {property.mode === 'rent' ? 'For Rent' : 'For Sale'} •{' '}
                  {property.property_type}
                </span>
              </div>
              <h2 className="font-luxury text-2xl sm:text-3xl font-semibold text-[#FAF6EC] mt-1 leading-tight">
                {property.title}
              </h2>
              <p className="text-xs text-[#ABA599] mt-1.5">
                {property.township} Township, Yangon
                {property.floor_level ? ` • ${property.floor_level}` : ''}
              </p>
            </div>

            {/* Key Specs Strip */}
            <div className="grid grid-cols-4 gap-2">
              <div className="rounded-2xl bg-[#141720] border border-white/10 p-3 text-center">
                <p className="text-base font-semibold text-[#F5E6B3]">
                  {property.beds}
                </p>
                <p className="text-[11px] text-[#9A9589]">Bedrooms</p>
              </div>
              <div className="rounded-2xl bg-[#141720] border border-white/10 p-3 text-center">
                <p className="text-base font-semibold text-[#F5E6B3]">
                  {property.baths}
                </p>
                <p className="text-[11px] text-[#9A9589]">Baths</p>
              </div>
              <div className="rounded-2xl bg-[#141720] border border-white/10 p-3 text-center">
                <p className="text-base font-semibold text-[#F5E6B3]">
                  {Number(property.sqft).toLocaleString()}
                </p>
                <p className="text-[11px] text-[#9A9589]">Sqft</p>
              </div>

            </div>

            {/* Luxury Amenities */}
            <div>
              <h3 className="font-luxury text-base text-[#F5EFE2] mb-2.5">
                Luxury Amenities &amp; Verification
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <div
                  className={`px-3 py-2.5 rounded-xl border ${
                    false
                      ? 'border-[#D4AF37]/40 bg-[#1B1810] text-[#F5E6B3]'
                      : 'border-white/5 bg-[#13161E] text-[#6E6A61]'
                  }`}
                >
                  ⚡ 24/7 Backup Power
                </div>
                <div
                  className={`px-3 py-2.5 rounded-xl border ${
                    property.has_elevator
                      ? 'border-[#D4AF37]/40 bg-[#1B1810] text-[#F5E6B3]'
                      : 'border-white/5 bg-[#13161E] text-[#6E6A61]'
                  }`}
                >
                  ✦ Private / Lift Access
                </div>
                <div
                  className={`px-3 py-2.5 rounded-xl border ${
                    property.flood_free
                      ? 'border-[#D4AF37]/40 bg-[#1B1810] text-[#F5E6B3]'
                      : 'border-white/5 bg-[#13161E] text-[#6E6A61]'
                  }`}
                >
                  ✓ Flood-Free Zone
                </div>
                <div
                  className={`px-3 py-2.5 rounded-xl border ${
                    property.owner_direct
                      ? 'border-emerald-400/35 bg-emerald-950/30 text-emerald-200'
                      : 'border-white/10 bg-[#13161E] text-[#ABA599]'
                  }`}
                >
                  {property.owner_direct ? '✓ Owner Direct' : 'Verified Agency'}
                </div>
              </div>
            </div>

            {/* Financial Calculator (Rent vs Buy) */}
            <div className="luxury-card rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-luxury text-base text-[#FAF6EC]">
                  {property.mode === 'rent'
                    ? 'Yangon Move-In Calculator'
                    : 'Estimated Financing Calculator'}
                </h3>
                <span className="text-[10px] uppercase tracking-[0.16em] text-[#D4AF37]">
                  MMK Lakhs
                </span>
              </div>

              {property.mode === 'rent' ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {([6, 12] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setLeaseMonths(m)}
                        className={`py-2 rounded-xl text-xs font-semibold border transition ${
                          leaseMonths === m
                            ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-[#F5E6B3]'
                            : 'border-white/10 bg-[#171A24] text-[#ABA599]'
                        }`}
                      >
                        {m} Months Upfront
                      </button>
                    ))}
                  </div>

                  <label className="flex items-center justify-between text-xs text-[#D5CFC2] cursor-pointer">
                    <span>Include 1-Month Security Deposit</span>
                    <input
                      type="checkbox"
                      checked={includeDeposit}
                      onChange={(e) => setIncludeDeposit(e.target.checked)}
                      className="accent-[#D4AF37] w-4 h-4"
                    />
                  </label>

                  <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                    <span className="text-xs text-[#ABA599]">
                      Total Move-In Cash Required
                    </span>
                    <span className="font-luxury text-xl font-semibold text-[#F5E6B3]">
                      {totalMoveIn.toLocaleString()} Lakhs
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-3 text-xs">
                    <div>
                      <div className="flex justify-between text-[#D5CFC2] mb-1">
                        <span>Down Payment ({downPercent}%)</span>
                        <span className="text-[#F3D58D] font-semibold">
                          {Math.round(downPayment).toLocaleString()} L
                        </span>
                      </div>
                      <input
                        type="range"
                        min={10}
                        max={70}
                        step={5}
                        value={downPercent}
                        onChange={(e) => setDownPercent(Number(e.target.value))}
                        className="w-full accent-[#D4AF37]"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="flex justify-between text-[#D5CFC2] mb-1">
                          <span>Term</span>
                          <span className="text-[#F3D58D]">{loanYears} yrs</span>
                        </div>
                        <input
                          type="range"
                          min={5}
                          max={25}
                          step={1}
                          value={loanYears}
                          onChange={(e) => setLoanYears(Number(e.target.value))}
                          className="w-full accent-[#D4AF37]"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-[#D5CFC2] mb-1">
                          <span>Interest</span>
                          <span className="text-[#F3D58D]">{interestRate}%</span>
                        </div>
                        <input
                          type="range"
                          min={6}
                          max={16}
                          step={0.5}
                          value={interestRate}
                          onChange={(e) => setInterestRate(Number(e.target.value))}
                          className="w-full accent-[#D4AF37]"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                    <span className="text-xs text-[#ABA599]">
                      Est. Monthly Installment
                    </span>
                    <span className="font-luxury text-xl font-semibold text-[#F5E6B3]">
                      {Math.round(monthlyPayment).toLocaleString()} Lakhs / mo
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Sticky Bottom Concierge Bar */}
        <div className="p-4 border-t border-[#D4AF37]/20 bg-[#0B0C10]/95 flex items-center gap-2.5">
          {property.contact_phone ? (
            <>
              <a
                href={`https://t.me/+${cleanPhone}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-3 rounded-xl bg-[#161922] border border-[#D4AF37]/30 text-center text-xs sm:text-sm font-semibold text-[#F5EFE2] hover:border-[#D4AF37] transition"
              >
                Telegram
              </a>
              <a
                href={`tel:${property.contact_phone}`}
                className="flex-[1.5] py-3 rounded-xl gold-gradient text-center text-xs sm:text-sm font-semibold shadow-[0_8px_24px_rgba(212,175,55,0.3)] hover:brightness-105 transition"
              >
                Consult Agent
              </a>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 rounded-xl gold-gradient text-sm font-semibold"
            >
              Close Estate View
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
