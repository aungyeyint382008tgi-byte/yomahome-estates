'use client';

import { useState, useEffect, FormEvent } from 'react';
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
  useEffect(() => {
    (window as unknown as { __yomaModalOpen?: boolean }).__yomaModalOpen = true;
    window.dispatchEvent(new CustomEvent('yoma-post-modal-toggle', { detail: { open: true } }));
    return () => {
      (window as unknown as { __yomaModalOpen?: boolean }).__yomaModalOpen = false;
      window.dispatchEvent(new CustomEvent('yoma-post-modal-toggle', { detail: { open: false } }));
    };
  }, []);

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
  const [sqft, setSqft] = useState('1200');
  const [floorLevel, setFloorLevel] = useState('');
  const [backupPower, setBackupPower] = useState(true);
  const [hasElevator, setHasElevator] = useState(true);
  const [ownerDirect, setOwnerDirect] = useState(false);
  const [floodFree, setFloodFree] = useState(true);
  const [ownershipDoc, setOwnershipDoc] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  // Boost Listing Form State
  const [selectedPropId, setSelectedPropId] = useState<string>(
    properties[0]?.id || ''
  );
  const [paymentMethod, setPaymentMethod] = useState<'KBZPay' | 'WavePay'>('KBZPay');
  const [refCode] = useState(() => 'YM' + Math.floor(100000 + Math.random() * 900000));
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const uploadToBucket = async (file: File, bucket: string): Promise<string> => {
    const ext = file.name.split('.').pop() || 'jpg';
    const filePath = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, { cacheControl: '3600', upsert: false });
    if (uploadErr) throw uploadErr;
    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
    return data.publicUrl;
  };

  const handlePostSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    if (!title.trim() || !priceLakhs || !contactPhone.trim()) {
      setError('Please fill in Property Title, Price (Lakhs), and Contact Phone.');
      return;
    }

    setSubmitting(true);
    try {
      let imageUrl =
        'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80';
      if (photoFile) {
        imageUrl = await uploadToBucket(photoFile, 'listings');
      }

      const [baseLat, baseLng] = TOWNSHIP_COORDS[township] || [16.822, 96.15];
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to publish listing.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBoostSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    if (!selectedPropId) {
      setError('Please select a listing to boost.');
      return;
    }
    if (!receiptFile) {
      setError('Please upload your KBZPay / WavePay payment screenshot.');
      return;
    }

    setSubmitting(true);
    try {
      const receiptUrl = await uploadToBucket(receiptFile, 'payment-receipts');

      const { error: boostErr } = await supabase.from('boost_requests').insert({
        property_id: selectedPropId,
        payment_method: paymentMethod,
        amount_mmk: BOOST_PRICE_MMK,
        reference_code: refCode,
        receipt_url: receiptUrl,
        status: 'pending',
      });

      if (boostErr) throw boostErr;

      setSuccessMsg(
        `Boost request (${refCode}) submitted! Our team will verify your ${paymentMethod} slip shortly.`
      );
      setTimeout(() => onClose(), 1600);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit boost request.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    'w-full bg-[#151822] border border-[#D4AF37]/25 focus:border-[#D4AF37] rounded-xl px-3 py-2 text-xs text-[#F5F2EB] placeholder:text-[#7E7A70] outline-none transition';

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#0E1017] border border-[#D4AF37]/30 p-5 sm:p-6 text-[#F5F2EB] shadow-[0_24px_80px_rgba(0,0,0,0.85)]"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#D4AF37] font-semibold">
              YomaHome Concierge
            </p>
            <h2 className="font-luxury text-xl font-semibold text-[#FAF6EC] mt-0.5">
              List or Boost an Estate
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#161923] border border-white/10 text-[#ABA599] hover:text-white flex items-center justify-center text-sm"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="grid grid-cols-2 gap-2 bg-[#141720] border border-white/10 p-1 rounded-2xl mb-4">
          <button
            type="button"
            onClick={() => {
              setTab('post');
              setError(null);
              setSuccessMsg(null);
            }}
            className={`py-2 rounded-xl text-xs font-semibold transition ${
              tab === 'post'
                ? 'gold-gradient'
                : 'text-[#ABA599] hover:text-[#F5F2EB]'
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
            className={`py-2 rounded-xl text-xs font-semibold transition ${
              tab === 'boost'
                ? 'gold-gradient'
                : 'text-[#ABA599] hover:text-[#F5F2EB]'
            }`}
          >
            ★ Boost ({BOOST_PRICE_MMK.toLocaleString()} Ks)
          </button>
        </div>

        {error && (
          <div className="mb-3 p-3 rounded-xl bg-red-950/45 border border-red-400/35 text-red-200 text-xs">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="mb-3 p-3 rounded-xl bg-emerald-950/45 border border-emerald-400/35 text-emerald-200 text-xs">
            {successMsg}
          </div>
        )}

        {tab === 'post' ? (
          <form onSubmit={handlePostSubmit} className="space-y-3 text-xs">
            <div>
              <label className="block text-[#ABA599] mb-1">Property Title *</label>
              <input
                required
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Golden Valley Luxury 3BR Condo"
                className={inputCls}
              />
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[#ABA599] mb-1">Mode</label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as 'rent' | 'buy')}
                  className={inputCls}
                >
                  <option value="rent">For Rent</option>
                  <option value="buy">For Buy</option>
                </select>
              </div>
              <div>
                <label className="block text-[#ABA599] mb-1">Type</label>
                <select
                  value={propertyType}
                  onChange={(e) => setPropertyType(e.target.value)}
                  className={inputCls}
                >
                  <option value="Condo">Condo</option>
                  <option value="Penthouse">Penthouse</option>
                  <option value="Villa">Villa</option>
                  <option value="House">House</option>
                </select>
              </div>
              <div>
                <label className="block text-[#ABA599] mb-1">Township</label>
                <select
                  value={township}
                  onChange={(e) => setTownship(e.target.value)}
                  className={inputCls}
                >
                  {Object.keys(TOWNSHIP_COORDS).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="block text-[#ABA599] mb-1">Price (Lakhs) *</label>
                <input
                  required
                  type="number"
                  min="1"
                  step="any"
                  value={priceLakhs}
                  onChange={(e) => setPriceLakhs(e.target.value)}
                  placeholder="25"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-[#ABA599] mb-1">Beds</label>
                <input
                  type="number"
                  min="0"
                  value={beds}
                  onChange={(e) => setBeds(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-[#ABA599] mb-1">Baths</label>
                <input
                  type="number"
                  min="0"
                  value={baths}
                  onChange={(e) => setBaths(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-[#ABA599] mb-1">Sqft</label>
                <input
                  type="number"
                  min="100"
                  value={sqft}
                  onChange={(e) => setSqft(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[#ABA599] mb-1">Floor Level</label>
                <input
                  type="text"
                  value={floorLevel}
                  onChange={(e) => setFloorLevel(e.target.value)}
                  placeholder="e.g. 8th Floor"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-[#ABA599] mb-1">
                  Contact Phone / Telegram *
                </label>
                <input
                  required
                  type="text"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+959777123456"
                  className={inputCls}
                />
              </div>
            </div>

            <div>
              <label className="block text-[#ABA599] mb-1">
                Ownership / Title Doc (Optional)
              </label>
              <input
                type="text"
                value={ownershipDoc}
                onChange={(e) => setOwnershipDoc(e.target.value)}
                placeholder="e.g. Strata / Grant / Owner Contract"
                className={inputCls}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 text-[#D8D2C5]">
              <label className="flex items-center gap-2 bg-[#141720] border border-white/10 p-2.5 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={backupPower}
                  onChange={(e) => setBackupPower(e.target.checked)}
                  className="accent-[#D4AF37]"
                />
                <span>24/7 Backup Power</span>
              </label>
              <label className="flex items-center gap-2 bg-[#141720] border border-white/10 p-2.5 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasElevator}
                  onChange={(e) => setHasElevator(e.target.checked)}
                  className="accent-[#D4AF37]"
                />
                <span>Elevator / Lift</span>
              </label>
              <label className="flex items-center gap-2 bg-[#141720] border border-white/10 p-2.5 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={ownerDirect}
                  onChange={(e) => setOwnerDirect(e.target.checked)}
                  className="accent-[#D4AF37]"
                />
                <span>Owner Direct</span>
              </label>
              <label className="flex items-center gap-2 bg-[#141720] border border-white/10 p-2.5 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={floodFree}
                  onChange={(e) => setFloodFree(e.target.checked)}
                  className="accent-[#D4AF37]"
                />
                <span>Flood-Free Zone</span>
              </label>
            </div>

            <div>
              <label className="block text-[#ABA599] mb-1">
                Property Photo (Optional — defaults to sample photo)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                className="w-full text-[#C9C3B4] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-[#D4AF37]/40 file:bg-[#1D1910] file:text-[#F3D58D] file:font-semibold"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl gold-gradient text-xs sm:text-sm font-semibold shadow-[0_8px_24px_rgba(212,175,55,0.28)] transition disabled:opacity-60"
            >
              {submitting ? 'Publishing Listing...' : 'Publish Listing'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleBoostSubmit} className="space-y-3.5 text-xs">
            <div>
              <label className="block text-[#ABA599] mb-1">Select Listing to Boost</label>
              <select
                value={selectedPropId}
                onChange={(e) => setSelectedPropId(e.target.value)}
                className={inputCls}
              >
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({p.township} — {p.price_lakhs}L)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[#ABA599] mb-1">Payment Wallet</label>
              <div className="grid grid-cols-2 gap-2">
                {(['KBZPay', 'WavePay'] as const).map((wallet) => (
                  <button
                    key={wallet}
                    type="button"
                    onClick={() => setPaymentMethod(wallet)}
                    className={`py-2.5 rounded-xl font-semibold border transition ${
                      paymentMethod === wallet
                        ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-[#F5E6B3]'
                        : 'bg-[#141720] border-white/10 text-[#ABA599]'
                    }`}
                  >
                    {wallet}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#16130C] border border-[#D4AF37]/30 space-y-1.5">
              <p className="text-[#F3D58D] font-semibold">
                1. Transfer {BOOST_PRICE_MMK.toLocaleString()} MMK via {paymentMethod}
              </p>
              <p className="text-[#C9C3B4]">
                Account:{' '}
                <span className="font-mono text-[#FAF6EC]">{MERCHANT_PHONE}</span> (
                {MERCHANT_NAME})
              </p>
              <p className="text-[#C9C3B4] pt-1">
                2. Put Reference Code in transfer note:{' '}
                <strong className="text-emerald-300 font-mono">{refCode}</strong>
              </p>
            </div>

            <div>
              <label className="block text-[#ABA599] mb-1">
                3. Upload {paymentMethod} Transfer Screenshot *
              </label>
              <input
                required
                type="file"
                accept="image/*"
                onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                className="w-full text-[#C9C3B4] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-[#D4AF37]/40 file:bg-[#1D1910] file:text-[#F3D58D] file:font-semibold"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl gold-gradient text-xs sm:text-sm font-semibold shadow-[0_8px_24px_rgba(212,175,55,0.28)] transition disabled:opacity-60"
            >
              {submitting
                ? 'Submitting Receipt...'
                : `Submit ${paymentMethod} Boost Request`}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
