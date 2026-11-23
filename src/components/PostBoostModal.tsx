'use client';

import { useState, FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import type { Property } from '@/components/YomaMap';

const TOWNSHIP_COORDS: Record<string, [number, number]> = {
  Bahan: [16.8185, 96.154],
  Kamayut: [16.824, 96.1325],
  Yankin: [16.8285, 96.1652],
  Dagon: [16.794, 96.1435],
  Mayangone: [16.858, 96.142],
  Sanchaung: [16.805, 96.1365],
};

// Replace with your real KBZPay / WavePay number before going live
const MERCHANT_PHONE = '09-777-000-999';
const MERCHANT_NAME = 'YomaHome Estates';
const BOOST_PRICE_MMK = 25000;

export default function PostBoostModal({
  properties,
  onClose,
  onSuccess,
}: {
  properties: Property[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [tab, setTab] = useState<'post' | 'boost'>('post');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Post Property Form State
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<'rent' | 'buy'>('rent');
  const [propertyType, setPropertyType] = useState('Condo');
  const [township, setTownship] = useState('Bahan');
  const [priceLakhs, setPriceLakhs] = useState('');
  const [beds, setBeds] = useState('2');
  const [baths, setBaths] = useState('2');
  const [sqft, setSqft] = useState('1400');
  const [floorLevel, setFloorLevel] = useState('8th Floor');
  const [ownershipDoc, setOwnershipDoc] = useState('BCC Condo');
  const [contactPhone, setContactPhone] = useState('+959');
  const [backupPower, setBackupPower] = useState(true);
  const [hasElevator, setHasElevator] = useState(true);
  const [ownerDirect, setOwnerDirect] = useState(true);
  const [floodFree, setFloodFree] = useState(true);
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  // Boost Request Form State
  const [selectedPropId, setSelectedPropId] = useState(properties[0]?.id || '');
  const [paymentMethod, setPaymentMethod] = useState<'KBZPay' | 'WavePay'>('KBZPay');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [refCode] = useState(
    () => `YOMA-${Math.floor(100000 + Math.random() * 900000)}`
  );

  const uploadToBucket = async (file: File, folder: string) => {
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from('property-media')
      .upload(path, file, { upsert: false });
    if (uploadErr) throw uploadErr;

    const { data } = supabase.storage.from('property-media').getPublicUrl(path);
    return data.publicUrl;
  };

  const handlePostSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      let imageUrl =
        'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=900&q=80';
      if (photoFile) {
        imageUrl = await uploadToBucket(photoFile, 'listings');
      }

      const [baseLat, baseLng] = TOWNSHIP_COORDS[township] || [16.822, 96.15];
      // Slight offset so new pins in the same township don't overlap directly
      const lat = baseLat + (Math.random() - 0.5) * 0.008;
      const lng = baseLng + (Math.random() - 0.5) * 0.008;

      const { error: insertErr } = await supabase.from('properties').insert({
        title: title.trim(),
        mode,
        property_type: propertyType,
        township,
        price_lakhs: Number(priceLakhs),
        beds: Number(beds) || 1,
        baths: Number(baths) || 1,
        sqft: Number(sqft) || 1000,
        floor_level: floorLevel.trim() || null,
        backup_power: backupPower,
        has_elevator: hasElevator,
        owner_direct: ownerDirect,
        flood_free: floodFree,
        ownership_doc: ownershipDoc.trim() || null,
        contact_phone: contactPhone.trim(),
        image_url: imageUrl,
        location: `POINT(${lng} ${lat})`,
      });

      if (insertErr) throw insertErr;

      setSuccessMsg('Listing published live on the Yangon map!');
      onSuccess();
      setTimeout(() => onClose(), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish listing.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBoostSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedPropId) {
      setError('Please select a property to boost.');
      return;
    }
    if (!receiptFile) {
      setError('Please upload your KBZPay or WavePay transfer screenshot.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const receiptUrl = await uploadToBucket(receiptFile, 'receipts');
      const { error: boostErr } = await supabase.from('boost_requests').insert({
        property_id: selectedPropId,
        reference_code: refCode,
        payment_method: paymentMethod,
        amount_mmk: BOOST_PRICE_MMK,
        receipt_url: receiptUrl,
        status: 'pending',
      });

      if (boostErr) throw boostErr;

      setSuccessMsg(
        `Boost request ${refCode} received! Once verified, your listing turns Gold ★ Premier for 14 days.`
      );
      setTimeout(() => onClose(), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit boost request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[2000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl bg-[#0F131C] border border-amber-500/30 shadow-2xl text-slate-100 p-5 space-y-4"
      >
        {/* Header & Tab Switcher */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setTab('post');
                setError(null);
                setSuccessMsg(null);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                tab === 'post'
                  ? 'bg-amber-400 text-[#0A0B0E]'
                  : 'bg-[#161B26] text-slate-300 border border-slate-700'
              }`}
            >
              + Post Property
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('boost');
                setError(null);
                setSuccessMsg(null);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                tab === 'boost'
                  ? 'bg-gradient-to-r from-amber-300 to-amber-500 text-[#0A0B0E]'
                  : 'bg-[#161B26] text-amber-300 border border-amber-500/40'
              }`}
            >
              ★ Boost Ad (KBZPay / Wave)
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="rounded-xl bg-rose-950/50 border border-rose-500/50 p-3 text-xs text-rose-200">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="rounded-xl bg-emerald-950/50 border border-emerald-500/50 p-3 text-xs text-emerald-200 font-semibold">
            ✓ {successMsg}
          </div>
        )}

        {tab === 'post' ? (
          <form onSubmit={handlePostSubmit} className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">Property Title *</label>
              <input
                required
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Golden Valley Luxury 3BR Condo"
                className="w-full bg-[#151B28] border border-slate-700 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-amber-400"
              />
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-slate-400 mb-1">Mode</label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as 'rent' | 'buy')}
                  className="w-full bg-[#151B28] border border-slate-700 rounded-xl px-2.5 py-2 text-slate-100"
                >
                  <option value="rent">For Rent</option>
                  <option value="buy">For Buy</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Type</label>
                <select
                  value={propertyType}
                  onChange={(e) => setPropertyType(e.target.value)}
                  className="w-full bg-[#151B28] border border-slate-700 rounded-xl px-2.5 py-2 text-slate-100"
                >
                  <option value="Condo">Condo</option>
                  <option value="Penthouse">Penthouse</option>
                  <option value="Villa">Villa</option>
                  <option value="Apartment">Apartment</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Township</label>
                <select
                  value={township}
                  onChange={(e) => setTownship(e.target.value)}
                  className="w-full bg-[#151B28] border border-slate-700 rounded-xl px-2.5 py-2 text-slate-100"
                >
                  {Object.keys(TOWNSHIP_COORDS).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div>
                <label className="block text-slate-400 mb-1">Price (Lakhs) *</label>
                <input
                  required
                  type="number"
                  min={1}
                  value={priceLakhs}
                  onChange={(e) => setPriceLakhs(e.target.value)}
                  placeholder="25"
                  className="w-full bg-[#151B28] border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Beds</label>
                <input
                  type="number"
                  min={1}
                  value={beds}
                  onChange={(e) => setBeds(e.target.value)}
                  className="w-full bg-[#151B28] border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Baths</label>
                <input
                  type="number"
                  min={1}
                  value={baths}
                  onChange={(e) => setBaths(e.target.value)}
                  className="w-full bg-[#151B28] border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Sqft</label>
                <input
                  type="number"
                  min={200}
                  value={sqft}
                  onChange={(e) => setSqft(e.target.value)}
                  className="w-full bg-[#151B28] border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-slate-400 mb-1">Contact Phone *</label>
                <input
                  required
                  type="text"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+959..."
                  className="w-full bg-[#151B28] border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Floor Level</label>
                <input
                  type="text"
                  value={floorLevel}
                  onChange={(e) => setFloorLevel(e.target.value)}
                  placeholder="e.g. 12th Floor"
                  className="w-full bg-[#151B28] border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Ownership Doc</label>
                <input
                  type="text"
                  value={ownershipDoc}
                  onChange={(e) => setOwnershipDoc(e.target.value)}
                  placeholder="BCC / Grant Land"
                  className="w-full bg-[#151B28] border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-4 py-1 text-slate-300">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={backupPower}
                  onChange={(e) => setBackupPower(e.target.checked)}
                  className="accent-amber-400"
                />
                ⚡ 24/7 Power
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasElevator}
                  onChange={(e) => setHasElevator(e.target.checked)}
                  className="accent-amber-400"
                />
                Elevator
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ownerDirect}
                  onChange={(e) => setOwnerDirect(e.target.checked)}
                  className="accent-amber-400"
                />
                Owner Direct
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={floodFree}
                  onChange={(e) => setFloodFree(e.target.checked)}
                  className="accent-amber-400"
                />
                Flood-Free
              </label>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">
                Property Photo (optional — uploads to Supabase Storage)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                className="w-full text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-800 file:text-amber-300 file:font-semibold"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#0A0B0E] font-extrabold text-xs transition disabled:opacity-60"
            >
              {submitting ? 'Publishing to Yangon Map...' : 'Publish Listing Free'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleBoostSubmit} className="space-y-4 text-xs">
            <div className="rounded-2xl bg-gradient-to-br from-amber-500/15 to-yellow-900/10 border border-amber-400/40 p-4 space-y-1.5">
              <p className="text-amber-300 font-extrabold text-sm">
                ★ Premier Featured Placement — {BOOST_PRICE_MMK.toLocaleString()} MMK / 14 Days
              </p>
              <p className="text-slate-300">
                Pins your listing to the top of the feed with a Gold ★ Map Pin so Yangon
                buyers & expat renters see it first.
              </p>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Select Listing to Boost</label>
              <select
                value={selectedPropId}
                onChange={(e) => setSelectedPropId(e.target.value)}
                className="w-full bg-[#151B28] border border-slate-700 rounded-xl px-3 py-2.5 text-slate-100"
              >
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({p.township} • {Number(p.price_lakhs).toLocaleString()}L)
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {(['KBZPay', 'WavePay'] as const).map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  className={`py-2.5 rounded-xl font-bold border transition ${
                    paymentMethod === method
                      ? 'bg-amber-400 text-[#0A0B0E] border-amber-300'
                      : 'bg-[#151B28] text-slate-300 border-slate-700'
                  }`}
                >
                  {method}
                </button>
              ))}
            </div>

            <div className="rounded-xl bg-[#151B28] border border-slate-700 p-3.5 space-y-1">
              <p className="text-slate-400">
                1. Transfer <strong className="text-amber-300">25,000 MMK</strong> via{' '}
                <strong className="text-white">{paymentMethod}</strong> to:
              </p>
              <p className="text-base font-extrabold text-white tracking-wide">
                {MERCHANT_PHONE}{' '}
                <span className="text-xs font-normal text-slate-400">
                  ({MERCHANT_NAME})
                </span>
              </p>
              <p className="text-slate-400 pt-1">
                2. Put Reference Code in transfer note:{' '}
                <strong className="text-emerald-300">{refCode}</strong>
              </p>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">
                3. Upload {paymentMethod} Transfer Screenshot *
              </label>
              <input
                required
                type="file"
                accept="image/*"
                onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                className="w-full text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-800 file:text-amber-300 file:font-semibold"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-300 to-amber-500 hover:from-amber-200 hover:to-amber-400 text-[#0A0B0E] font-extrabold text-xs transition disabled:opacity-60"
            >
              {submitting ? 'Submitting Receipt...' : `Submit ${paymentMethod} Boost Request`}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
