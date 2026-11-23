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

  // Buy Financing Calculator State
  const [downPercent, setDownPercent] = useState(30);
  const [loanYears, setLoanYears] = useState(15);
  const [interestRate, setInterestRate] = useState(11);

  // Smooth auto-pan while viewing the 360° tour
  useEffect(() => {
    if (tab !== 'tour360' || !autoRotate) return;
    let rafId: number;
    const step = () => {
      if (!draggingRef.current) {
        setPanX((prev) => (prev + 0.45) % 2400);
      }
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [tab, autoRotate]);

  const price = Number(property.price_lakhs) || 0;

  // Rent calculations (Lakhs MMK)
  const advanceRent = price * leaseMonths;
  const securityDeposit = includeDeposit ? price : 0;
  const agentFee = property.owner_direct ? 0 : price;
  const totalMoveIn = advanceRent + securityDeposit + agentFee;

  // Buy mortgage calculations (Lakhs MMK)
  const downPayment = (price * downPercent) / 100;
  const loanPrincipal = price - downPayment;
  const monthlyRate = interestRate / 100 / 12;
  const totalPayments = loanYears * 12;
  const monthlyInstallment =
    monthlyRate > 0
      ? (loanPrincipal *
          (monthlyRate * Math.pow(1 + monthlyRate, totalPayments))) /
        (Math.pow(1 + monthlyRate, totalPayments) - 1)
      : loanPrincipal / totalPayments;

  const tourImage =
    property.panorama_url ||
    property.image_url ||
    'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=2000&q=85';

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[2000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl bg-[#0F131C] border border-amber-500/30 shadow-2xl text-slate-100"
      >
        {/* Top Hero Media: Photo or Interactive 360° Tour */}
        <div className="relative h-64 sm:h-80 w-full bg-slate-950 overflow-hidden">
          {tab === 'photo' ? (
            <img
              src={tourImage}
              alt={property.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              onPointerDown={(e) => {
                draggingRef.current = true;
                lastXRef.current = e.clientX;
                setAutoRotate(false);
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (!draggingRef.current) return;
                const dx = e.clientX - lastXRef.current;
                lastXRef.current = e.clientX;
                setPanX((prev) => prev - dx * 1.4);
              }}
              onPointerUp={() => {
                draggingRef.current = false;
              }}
              onPointerCancel={() => {
                draggingRef.current = false;
              }}
              className="relative h-full w-full cursor-grab active:cursor-grabbing touch-none select-none overflow-hidden"
              style={{
                backgroundImage: `url(${tourImage})`,
                backgroundRepeat: 'repeat-x',
                backgroundSize: `auto ${Math.round(zoom * 100)}%`,
                backgroundPosition: `${-panX}px center`,
              }}
            >
              <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/75 backdrop-blur px-3 py-1.5 rounded-full border border-amber-400/40 text-[11px] text-amber-200">
                <span>↔ Drag to look 360°</span>
              </div>
              <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setAutoRotate((r) => !r)}
                  className="px-2.5 py-1 rounded-full bg-black/75 border border-slate-600 text-[11px] font-semibold text-white"
                >
                  {autoRotate ? '⏸ Pause' : '▶ Auto-Pan'}
                </button>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(1.8, +(z + 0.15).toFixed(2)))}
                  className="h-7 w-7 rounded-full bg-black/75 border border-slate-600 text-xs font-bold text-white"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(1.0, +(z - 0.15).toFixed(2)))}
                  className="h-7 w-7 rounded-full bg-black/75 border border-slate-600 text-xs font-bold text-white"
                >
                  −
                </button>
              </div>
            </div>
          )}

          {/* Media Mode Switcher */}
          <div className="absolute top-3 left-3 flex gap-1.5 bg-black/75 backdrop-blur p-1 rounded-full border border-slate-700">
            <button
              type="button"
              onClick={() => setTab('photo')}
              className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                tab === 'photo'
                  ? 'bg-amber-400 text-[#0A0B0E]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              📷 Photo
            </button>
            <button
              type="button"
              onClick={() => setTab('tour360')}
              className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                tab === 'tour360'
                  ? 'bg-amber-400 text-[#0A0B0E]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              🌐 360° Virtual Tour
            </button>
          </div>

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 h-9 w-9 rounded-full bg-black/80 hover:bg-black text-white border border-slate-600 flex items-center justify-center text-sm font-bold"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-5">
          {/* Title & Price Header */}
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                {property.is_sponsored && (
                  <span className="bg-gradient-to-r from-amber-300 to-amber-500 text-[#0A0B0E] text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full">
                    ★ Premier Featured
                  </span>
                )}
                <span className="text-[11px] uppercase font-semibold bg-slate-800 text-slate-200 px-2.5 py-0.5 rounded-full">
                  For {property.mode}
                </span>
                {property.owner_direct && (
                  <span className="text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
                    Owner Direct • No Broker Fee
                  </span>
                )}
              </div>
              <h2 className="text-xl font-bold text-white">{property.title}</h2>
              <p className="text-sm text-slate-400">
                {property.township} Township • {property.property_type}
                {property.floor_level ? ` • ${property.floor_level}` : ''}
              </p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-2xl font-extrabold text-amber-300">
                {price.toLocaleString()} Lakhs
              </p>
              <p className="text-xs text-slate-400">
                {property.mode === 'rent' ? 'MMK per month' : 'MMK asking price'}
              </p>
            </div>
          </div>

          {/* Yangon Key Specifications Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <div className="rounded-xl bg-[#151B28] border border-slate-800 p-3">
              <p className="text-slate-400">Layout</p>
              <p className="font-bold text-slate-100 mt-0.5">
                {property.beds} Bed • {property.baths} Bath
              </p>
            </div>
            <div className="rounded-xl bg-[#151B28] border border-slate-800 p-3">
              <p className="text-slate-400">Floor Area</p>
              <p className="font-bold text-slate-100 mt-0.5">
                {Number(property.sqft).toLocaleString()} sqft
              </p>
            </div>
            <div className="rounded-xl bg-[#151B28] border border-slate-800 p-3">
              <p className="text-slate-400">24/7 Power</p>
              <p
                className={`font-bold mt-0.5 ${
                  property.backup_power ? 'text-emerald-300' : 'text-slate-400'
                }`}
              >
                {property.backup_power ? '⚡ Full Backup' : 'Standard EPC'}
              </p>
            </div>
            <div className="rounded-xl bg-[#151B28] border border-slate-800 p-3">
              <p className="text-slate-400">Ownership / Doc</p>
              <p className="font-bold text-amber-200 mt-0.5">
                {property.ownership_doc || 'Verified Title'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-3 py-1 rounded-full bg-slate-800/80 text-slate-200 border border-slate-700">
              {property.has_elevator ? '✓ Elevator Access' : '• Walk-Up / Ground'}
            </span>
            <span className="px-3 py-1 rounded-full bg-slate-800/80 text-slate-200 border border-slate-700">
              {property.flood_free ? '✓ Flood-Free Zone' : '• Check Rain Drainage'}
            </span>
          </div>

          {/* Yangon Financial Calculator */}
          <div className="rounded-2xl bg-[#141926] border border-amber-500/25 p-4 space-y-4">
            {property.mode === 'rent' ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-amber-200">
                      Yangon Move-In Cash Calculator
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Estimates total upfront MMK needed for Myanmar lease terms
                    </p>
                  </div>
                  <div className="flex gap-1.5 text-xs">
                    {([6, 12] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setLeaseMonths(m)}
                        className={`px-3 py-1 rounded-lg font-bold ${
                          leaseMonths === m
                            ? 'bg-amber-400 text-[#0A0B0E]'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {m} Months
                      </button>
                    ))}
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeDeposit}
                    onChange={(e) => setIncludeDeposit(e.target.checked)}
                    className="accent-amber-400"
                  />
                  Include 1-month refundable security deposit ({price.toLocaleString()} Lakhs)
                </label>

                <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t border-slate-800">
                  <div>
                    <p className="text-slate-400">Advance ({leaseMonths} mo)</p>
                    <p className="font-bold text-slate-100">
                      {advanceRent.toLocaleString()}L
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Deposit + Agent</p>
                    <p className="font-bold text-slate-100">
                      {(securityDeposit + agentFee).toLocaleString()}L
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-amber-300 font-semibold">Total Move-In</p>
                    <p className="text-base font-extrabold text-amber-300">
                      {totalMoveIn.toLocaleString()} Lakhs
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-amber-200">
                      Myanmar Home Loan & Down Payment Estimator
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Adjust down payment and bank installment term
                    </p>
                  </div>
                  <div className="flex gap-1.5 text-xs">
                    {[5, 10, 15, 20].map((yr) => (
                      <button
                        key={yr}
                        type="button"
                        onClick={() => setLoanYears(yr)}
                        className={`px-2.5 py-1 rounded-lg font-bold ${
                          loanYears === yr
                            ? 'bg-amber-400 text-[#0A0B0E]'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {yr}Y
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-300">Down Payment</span>
                      <span className="font-bold text-amber-300">{downPercent}%</span>
                    </div>
                    <input
                      type="range"
                      min={20}
                      max={60}
                      step={5}
                      value={downPercent}
                      onChange={(e) => setDownPercent(Number(e.target.value))}
                      className="w-full accent-amber-400"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-300">Bank Interest Rate</span>
                      <span className="font-bold text-amber-300">
                        {interestRate}% / yr
                      </span>
                    </div>
                    <input
                      type="range"
                      min={8}
                      max={15}
                      step={0.5}
                      value={interestRate}
                      onChange={(e) => setInterestRate(Number(e.target.value))}
                      className="w-full accent-amber-400"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t border-slate-800">
                  <div>
                    <p className="text-slate-400">Down Payment</p>
                    <p className="font-bold text-slate-100">
                      {Math.round(downPayment).toLocaleString()}L
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Bank Loan</p>
                    <p className="font-bold text-slate-100">
                      {Math.round(loanPrincipal).toLocaleString()}L
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-amber-300 font-semibold">Est. Monthly</p>
                    <p className="text-base font-extrabold text-amber-300">
                      {Math.round(monthlyInstallment).toLocaleString()}L / mo
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Direct Action Bar */}
          <div className="flex flex-wrap gap-2.5 pt-1">
            <a
              href={`tel:${property.contact_phone}`}
              className="flex-1 min-w-[140px] text-center py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#0A0B0E] font-extrabold text-xs transition"
            >
              Call {property.contact_phone}
            </a>
            <a
              href={`https://t.me/+${property.contact_phone.replace(/\+/g, '')}`}
              target="_blank"
              rel="noreferrer"
              className="px-5 py-3 rounded-xl bg-[#1A202C] hover:bg-slate-800 text-slate-100 border border-slate-700 font-bold text-xs transition"
            >
              Telegram
            </a>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${property.lat},${property.lng}`}
              target="_blank"
              rel="noreferrer"
              className="px-5 py-3 rounded-xl bg-[#1A73E8] hover:bg-blue-500 text-white font-bold text-xs transition"
            >
              Directions ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
