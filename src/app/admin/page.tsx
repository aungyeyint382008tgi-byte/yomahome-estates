'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

interface AdminProperty {
  id: string;
  title: string;
  mode: string;
  property_type: string;
  township: string;
  price_lakhs: number;
  beds: number;
  baths: number;
  sqft: number;
  floor_level: string | null;
  has_elevator: boolean;
  owner_direct: boolean;
  flood_free: boolean;
  ownership_doc: string | null;
  contact_phone: string;
  image_url: string | null;
  sponsored_until: string | null;
  created_at?: string | null;
}

interface BoostRequest {
  id: string;
  property_id: string | null;
  payment_method: string;
  amount_mmk: number;
  reference_code: string;
  receipt_url: string | null;
  status: string;
  created_at: string;
}

function toProxiedUrl(url: string | null | undefined): string {
  if (!url) return '';
  const match = url.match(/^https?:\/\/[^/]+\.supabase\.co\/(.*)$/i);
  return match ? `/supabase/${match[1]}` : url;
}

function isBoostActive(sponsoredUntil: string | null): boolean {
  if (!sponsoredUntil) return false;
  const ts = new Date(sponsoredUntil).getTime();
  return Number.isFinite(ts) && ts > Date.now();
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function downloadCsv(filename: string, headers: string[], rows: (string | number | boolean | null | undefined)[][]) {
  const escape = (val: string | number | boolean | null | undefined) => {
    const s = String(val ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const inputCls =
  'w-full bg-[#151822] border border-[#D4AF37]/25 focus:border-[#D4AF37] rounded-xl px-3 py-2 text-xs text-[#F5F2EB] placeholder:text-[#7E7A70] outline-none transition';

export default function AdminDashboardPage() {
  const [authLoading, setAuthLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [missingEnv, setMissingEnv] = useState<string[]>([]);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [loadingData, setLoadingData] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [properties, setProperties] = useState<AdminProperty[]>([]);
  const [boostRequests, setBoostRequests] = useState<BoostRequest[]>([]);

  const [tab, setTab] = useState<'boosts' | 'listings' | 'tools'>('boosts');
  const [boostFilter, setBoostFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [search, setSearch] = useState('');
  const [listingFilter, setListingFilter] = useState<'all' | 'boosted' | 'standard'>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [receiptPreview, setReceiptPreview] = useState<{ url: string; refCode: string } | null>(null);
  const [editing, setEditing] = useState<AdminProperty | null>(null);

  const loadData = useCallback(async () => {
    setLoadingData(true);
    try {
      const res = await fetch('/api/admin', { cache: 'no-store' });
      if (res.status === 401) {
        setAuthenticated(false);
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load admin dashboard.');
      setProperties(data.properties || []);
      setBoostRequests(data.boostRequests || []);
      setSelectedIds([]);
    } catch (err: unknown) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Could not fetch dashboard data.',
      });
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/auth', { cache: 'no-store' });
        const data = await res.json();
        setMissingEnv(data.missing || []);
        setAuthenticated(Boolean(data.authenticated));
        if (data.authenticated) {
          await loadData();
        }
      } catch {
        setAuthError('Failed to verify session.');
      } finally {
        setAuthLoading(false);
      }
    })();
  }, [loadData]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setLoggingIn(true);
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed.');
      setPassword('');
      setAuthenticated(true);
      await loadData();
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/admin/auth', { method: 'DELETE' });
    setAuthenticated(false);
    setProperties([]);
    setBoostRequests([]);
  };

  const runAction = async (payload: Record<string, unknown>, successText: string, busyKey: string) => {
    setBusyId(busyKey);
    setBanner(null);
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed.');
      setBanner({ type: 'ok', text: successText });
      await loadData();
      return true;
    } catch (err: unknown) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Action failed.',
      });
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const propertyMap = useMemo(() => {
    const map = new Map<string, AdminProperty>();
    properties.forEach((p) => map.set(p.id, p));
    return map;
  }, [properties]);

  const stats = useMemo(() => {
    const totalListings = properties.length;
    const rentCount = properties.filter((p) => p.mode?.toLowerCase().includes('rent')).length;
    const saleCount = totalListings - rentCount;
    const activeBoosts = properties.filter((p) => isBoostActive(p.sponsored_until)).length;
    const pendingBoosts = boostRequests.filter((b) => b.status === 'pending').length;
    const approvedRevenueMmk = boostRequests
      .filter((b) => b.status === 'approved')
      .reduce((sum, b) => sum + (Number(b.amount_mmk) || 0), 0);
    return { totalListings, rentCount, saleCount, activeBoosts, pendingBoosts, approvedRevenueMmk };
  }, [properties, boostRequests]);

  const filteredBoosts = useMemo(() => {
    if (boostFilter === 'all') return boostRequests;
    return boostRequests.filter((b) => b.status === boostFilter);
  }, [boostRequests, boostFilter]);

  const filteredListings = useMemo(() => {
    const q = search.trim().toLowerCase();
    return properties.filter((p) => {
      const active = isBoostActive(p.sponsored_until);
      if (listingFilter === 'boosted' && !active) return false;
      if (listingFilter === 'standard' && active) return false;
      if (!q) return true;
      return (
        (p.title || '').toLowerCase().includes(q) ||
        (p.township || '').toLowerCase().includes(q) ||
        (p.contact_phone || '').toLowerCase().includes(q) ||
        (p.property_type || '').toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q)
      );
    });
  }, [properties, search, listingFilter]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0B0C10] text-[#F5F2EB] flex items-center justify-center text-sm">
        Checking admin session...
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[#0B0C10] text-[#F5F2EB] flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl border border-[#D4AF37]/30 bg-[#12141C] p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[11px] uppercase tracking-widest text-[#D4AF37]">YomaHome Estates</p>
              <h1 className="text-xl font-semibold text-[#F5F2EB]">Admin Console</h1>
            </div>
            <Link
              href="/"
              className="text-xs text-[#C9C3B4] hover:text-[#F3D58D] border border-[#D4AF37]/25 px-3 py-1.5 rounded-lg"
            >
              Live Site
            </Link>
          </div>

          {missingEnv.length > 0 && (
            <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-950/40 p-3 text-xs text-amber-200">
              <p className="font-semibold mb-1">Server setup needed in Vercel:</p>
              <p>Add these environment variables and redeploy:</p>
              <code className="block mt-1 text-[#F3D58D]">{missingEnv.join(', ')}</code>
            </div>
          )}

          {authError && (
            <div className="mb-4 rounded-xl border border-red-500/40 bg-red-950/40 p-3 text-xs text-red-200">
              {authError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <label className="block text-[11px] text-[#C9C3B4] mb-1">Admin Passcode</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter ADMIN_PASSWORD"
                className={inputCls}
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={loggingIn || missingEnv.length > 0}
              className="w-full rounded-xl bg-gradient-to-r from-[#C59B27] to-[#E5C158] py-2.5 text-xs font-bold text-[#0B0C10] hover:opacity-95 disabled:opacity-50 transition"
            >
              {loggingIn ? 'Unlocking...' : 'Unlock Admin Dashboard'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0C10] text-[#F5F2EB] pb-16">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 border-b border-[#D4AF37]/20 bg-[#0B0C10]/95 backdrop-blur px-4 py-3">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#D4AF37]">YomaHome Estates</p>
            <h1 className="text-lg font-semibold leading-tight">Admin Dashboard</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={loadingData}
              className="rounded-lg border border-[#D4AF37]/30 bg-[#151822] px-3 py-1.5 text-xs text-[#F3D58D] hover:bg-[#1D1910] disabled:opacity-50"
            >
              {loadingData ? 'Refreshing...' : 'Refresh'}
            </button>
            <Link
              href="/"
              className="rounded-lg border border-[#D4AF37]/25 px-3 py-1.5 text-xs text-[#C9C3B4] hover:text-[#F5F2EB]"
            >
              Live App
            </Link>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-red-500/30 bg-red-950/30 px-3 py-1.5 text-xs text-red-200 hover:bg-red-950/60"
            >
              Log Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 pt-5 space-y-5">
        {/* Status Banner */}
        {banner && (
          <div
            className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs ${
              banner.type === 'ok'
                ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-200'
                : 'border-red-500/40 bg-red-950/40 text-red-200'
            }`}
          >
            <span>{banner.text}</span>
            <button onClick={() => setBanner(null)} className="ml-3 opacity-75 hover:opacity-100">
              ✕
            </button>
          </div>
        )}

        {/* KPI Cards */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-[#D4AF37]/20 bg-[#12141C] p-3.5">
            <p className="text-[11px] text-[#9A9589]">Total Listings</p>
            <p className="text-2xl font-bold text-[#F5F2EB] mt-0.5">{stats.totalListings}</p>
            <p className="text-[11px] text-[#7E7A70] mt-1">
              {stats.rentCount} Rent · {stats.saleCount} Sale
            </p>
          </div>
          <div className="rounded-2xl border border-[#D4AF37]/25 bg-[#12141C] p-3.5">
            <p className="text-[11px] text-[#9A9589]">Pending Boosts</p>
            <p className={`text-2xl font-bold mt-0.5 ${stats.pendingBoosts > 0 ? 'text-[#F3D58D]' : 'text-[#F5F2EB]'}`}>
              {stats.pendingBoosts}
            </p>
            <p className="text-[11px] text-[#7E7A70] mt-1">Awaiting slip check</p>
          </div>
          <div className="rounded-2xl border border-[#D4AF37]/20 bg-[#12141C] p-3.5">
            <p className="text-[11px] text-[#9A9589]">Active Boosts</p>
            <p className="text-2xl font-bold text-emerald-400 mt-0.5">{stats.activeBoosts}</p>
            <p className="text-[11px] text-[#7E7A70] mt-1">Sponsored live now</p>
          </div>
          <div className="rounded-2xl border border-[#D4AF37]/20 bg-[#12141C] p-3.5">
            <p className="text-[11px] text-[#9A9589]">Approved Revenue</p>
            <p className="text-2xl font-bold text-[#F3D58D] mt-0.5">
              {stats.approvedRevenueMmk.toLocaleString()} <span className="text-xs font-normal">Ks</span>
            </p>
            <p className="text-[11px] text-[#7E7A70] mt-1">Verified KBZPay/WavePay</p>
          </div>
        </section>

        {/* Navigation Tabs */}
        <div className="flex gap-2 border-b border-[#D4AF37]/15 pb-3 overflow-x-auto">
          <button
            onClick={() => setTab('boosts')}
            className={`shrink-0 rounded-xl px-4 py-2 text-xs font-semibold transition ${
              tab === 'boosts'
                ? 'bg-[#D4AF37] text-[#0B0C10]'
                : 'bg-[#151822] text-[#C9C3B4] border border-[#D4AF37]/20'
            }`}
          >
            Boost Requests {stats.pendingBoosts > 0 ? `(${stats.pendingBoosts})` : ''}
          </button>
          <button
            onClick={() => setTab('listings')}
            className={`shrink-0 rounded-xl px-4 py-2 text-xs font-semibold transition ${
              tab === 'listings'
                ? 'bg-[#D4AF37] text-[#0B0C10]'
                : 'bg-[#151822] text-[#C9C3B4] border border-[#D4AF37]/20'
            }`}
          >
            All Listings ({properties.length})
          </button>
          <button
            onClick={() => setTab('tools')}
            className={`shrink-0 rounded-xl px-4 py-2 text-xs font-semibold transition ${
              tab === 'tools'
                ? 'bg-[#D4AF37] text-[#0B0C10]'
                : 'bg-[#151822] text-[#C9C3B4] border border-[#D4AF37]/20'
            }`}
          >
            Export & Tools
          </button>
        </div>

        {/* TAB 1: BOOST REQUESTS */}
        {tab === 'boosts' && (
          <section className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setBoostFilter(f)}
                  className={`rounded-lg px-3 py-1.5 text-xs capitalize border transition ${
                    boostFilter === f
                      ? 'border-[#D4AF37] bg-[#1D1910] text-[#F3D58D]'
                      : 'border-[#D4AF37]/15 bg-[#12141C] text-[#9A9589]'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {filteredBoosts.length === 0 ? (
              <div className="rounded-2xl border border-[#D4AF37]/15 bg-[#12141C] p-8 text-center text-xs text-[#9A9589]">
                No {boostFilter === 'all' ? '' : boostFilter} boost requests found.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredBoosts.map((req) => {
                  const linked = req.property_id ? propertyMap.get(req.property_id) : undefined;
                  const receiptSrc = toProxiedUrl(req.receipt_url);
                  const isBusy = busyId === `boost-${req.id}`;

                  return (
                    <div
                      key={req.id}
                      className="rounded-2xl border border-[#D4AF37]/20 bg-[#12141C] p-4 flex flex-col md:flex-row gap-4 justify-between"
                    >
                      <div className="flex gap-3.5 min-w-0">
                        {receiptSrc ? (
                          <button
                            type="button"
                            onClick={() => setReceiptPreview({ url: receiptSrc, refCode: req.reference_code })}
                            className="shrink-0 w-20 h-24 rounded-xl overflow-hidden border border-[#D4AF37]/30 bg-black relative group"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={receiptSrc} alt="Receipt" className="w-full h-full object-cover" />
                            <span className="absolute inset-x-0 bottom-0 bg-black/75 text-[10px] py-0.5 text-[#F3D58D]">
                              View Slip
                            </span>
                          </button>
                        ) : (
                          <div className="shrink-0 w-20 h-24 rounded-xl border border-[#D4AF37]/15 bg-[#151822] flex items-center justify-center text-[10px] text-[#7E7A70]">
                            No Slip
                          </div>
                        )}

                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-[#F3D58D]">{req.reference_code}</span>
                            <span className="rounded-md bg-[#1D1910] border border-[#D4AF37]/30 px-2 py-0.5 text-[10px] text-[#F3D58D]">
                              {req.payment_method} · {(Number(req.amount_mmk) || 0).toLocaleString()} Ks
                            </span>
                            <span
                              className={`rounded-md px-2 py-0.5 text-[10px] uppercase font-semibold ${
                                req.status === 'approved'
                                  ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-500/30'
                                  : req.status === 'rejected'
                                    ? 'bg-red-950/70 text-red-300 border border-red-500/30'
                                    : 'bg-amber-950/70 text-amber-300 border border-amber-500/30'
                              }`}
                            >
                              {req.status}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-[#F5F2EB] truncate">
                            {linked ? linked.title : 'Linked listing deleted or missing'}
                          </p>
                          <p className="text-xs text-[#9A9589]">
                            {linked ? `${linked.township} · ${linked.price_lakhs} Lakhs · ${linked.contact_phone}` : req.property_id}
                          </p>
                          <p className="text-[11px] text-[#7E7A70]">Submitted {formatDate(req.created_at)}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 md:self-center shrink-0">
                        {req.status !== 'approved' && (
                          <>
                            <button
                              disabled={isBusy}
                              onClick={() =>
                                runAction(
                                  { action: 'approve_boost', boostId: req.id, days: 7 },
                                  `Approved ${req.reference_code} and boosted listing for 7 days.`,
                                  `boost-${req.id}`
                                )
                              }
                              className="rounded-xl bg-emerald-500/90 px-3 py-2 text-xs font-bold text-[#0B0C10] hover:bg-emerald-400 disabled:opacity-50"
                            >
                              Approve (+7d)
                            </button>
                            <button
                              disabled={isBusy}
                              onClick={() =>
                                runAction(
                                  { action: 'approve_boost', boostId: req.id, days: 30 },
                                  `Approved ${req.reference_code} and boosted listing for 30 days.`,
                                  `boost-${req.id}`
                                )
                              }
                              className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-950/70 disabled:opacity-50"
                            >
                              +30d
                            </button>
                          </>
                        )}
                        {req.status === 'pending' && (
                          <button
                            disabled={isBusy}
                            onClick={() =>
                              runAction(
                                { action: 'reject_boost', boostId: req.id },
                                `Marked ${req.reference_code} as rejected.`,
                                `boost-${req.id}`
                              )
                            }
                            className="rounded-xl border border-amber-500/40 bg-amber-950/40 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-950/70 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        )}
                        <button
                          disabled={isBusy}
                          onClick={() => {
                            if (!confirm(`Delete boost request ${req.reference_code}?`)) return;
                            runAction(
                              { action: 'delete_boost_request', boostId: req.id },
                              `Deleted boost request ${req.reference_code}.`,
                              `boost-${req.id}`
                            );
                          }}
                          className="rounded-xl border border-red-500/35 bg-red-950/35 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-950/70 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* TAB 2: ALL LISTINGS */}
        {tab === 'listings' && (
          <section className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title, township, phone, type, or ID..."
                className={inputCls}
              />
              <select
                value={listingFilter}
                onChange={(e) => setListingFilter(e.target.value as 'all' | 'boosted' | 'standard')}
                className="sm:w-44 bg-[#151822] border border-[#D4AF37]/25 rounded-xl px-3 py-2 text-xs text-[#F5F2EB] outline-none"
              >
                <option value="all">All Listings</option>
                <option value="boosted">Boosted Only</option>
                <option value="standard">Standard Only</option>
              </select>
            </div>

            {selectedIds.length > 0 && (
              <div className="flex items-center justify-between rounded-xl border border-red-500/40 bg-red-950/35 px-3.5 py-2.5 text-xs">
                <span className="text-red-100 font-medium">{selectedIds.length} listing(s) selected</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedIds([])}
                    className="rounded-lg border border-white/15 px-2.5 py-1 text-xs text-[#C9C3B4]"
                  >
                    Clear
                  </button>
                  <button
                    disabled={busyId === 'bulk-delete'}
                    onClick={() => {
                      if (!confirm(`Permanently delete ${selectedIds.length} selected listing(s) and their photos?`)) return;
                      runAction(
                        { action: 'bulk_delete_properties', ids: selectedIds },
                        `Deleted ${selectedIds.length} listing(s).`,
                        'bulk-delete'
                      );
                    }}
                    className="rounded-lg bg-red-600 px-3 py-1 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-50"
                  >
                    {busyId === 'bulk-delete' ? 'Deleting...' : 'Delete Selected'}
                  </button>
                </div>
              </div>
            )}

            {filteredListings.length === 0 ? (
              <div className="rounded-2xl border border-[#D4AF37]/15 bg-[#12141C] p-8 text-center text-xs text-[#9A9589]">
                No matching listings found.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredListings.map((prop) => {
                  const active = isBoostActive(prop.sponsored_until);
                  const imgSrc = toProxiedUrl(prop.image_url);
                  const isBusy = busyId === `prop-${prop.id}`;
                  const checked = selectedIds.includes(prop.id);

                  return (
                    <div
                      key={prop.id}
                      className={`rounded-2xl border p-3.5 flex flex-col md:flex-row gap-3.5 justify-between transition ${
                        checked
                          ? 'border-red-500/60 bg-red-950/15'
                          : active
                            ? 'border-[#D4AF37]/45 bg-[#14151E]'
                            : 'border-[#D4AF37]/15 bg-[#12141C]'
                      }`}
                    >
                      <div className="flex gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelect(prop.id)}
                          className="mt-1 h-4 w-4 accent-[#D4AF37] shrink-0"
                        />
                        {imgSrc ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={imgSrc}
                            alt={prop.title}
                            className="w-20 h-20 rounded-xl object-cover shrink-0 border border-[#D4AF37]/20 bg-black"
                          />
                        ) : (
                          <div className="w-20 h-20 rounded-xl shrink-0 border border-[#D4AF37]/15 bg-[#151822] flex items-center justify-center text-[10px] text-[#7E7A70]">
                            No Photo
                          </div>
                        )}

                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {active && (
                              <span className="rounded-md bg-[#D4AF37] px-2 py-0.5 text-[10px] font-bold text-[#0B0C10]">
                                ★ BOOSTED
                              </span>
                            )}
                            <span className="rounded-md bg-[#1B1E2B] px-2 py-0.5 text-[10px] text-[#C9C3B4]">
                              {prop.mode} · {prop.property_type}
                            </span>
                            <span className="text-xs font-bold text-[#F3D58D]">
                              {prop.price_lakhs} Lakhs
                            </span>
                          </div>
                          <h3 className="text-sm font-semibold text-[#F5F2EB] truncate">{prop.title}</h3>
                          <p className="text-xs text-[#9A9589]">
                            {prop.township} · {prop.beds} Bed · {prop.baths} Bath · {prop.sqft} sqft
                            {prop.floor_level ? ` · ${prop.floor_level}` : ''}
                          </p>
                          <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#7E7A70]">
                            <a href={`tel:${prop.contact_phone}`} className="text-[#F3D58D] hover:underline">
                              ☎ {prop.contact_phone}
                            </a>
                            {active && (
                              <span className="text-emerald-400">
                                Boost ends {formatDate(prop.sponsored_until)}
                              </span>
                            )}
                            {prop.created_at && <span>Posted {formatDate(prop.created_at)}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 md:self-center shrink-0 pl-7 md:pl-0">
                        <button
                          disabled={isBusy}
                          onClick={() => setEditing({ ...prop })}
                          className="rounded-xl border border-[#D4AF37]/30 bg-[#151822] px-3 py-1.5 text-xs font-semibold text-[#F5F2EB] hover:bg-[#1E2230]"
                        >
                          Edit
                        </button>
                        <button
                          disabled={isBusy}
                          onClick={() =>
                            runAction(
                              { action: 'boost_property', id: prop.id, days: 7 },
                              `Boosted "${prop.title}" for +7 days.`,
                              `prop-${prop.id}`
                            )
                          }
                          className="rounded-xl border border-[#D4AF37]/40 bg-[#1D1910] px-3 py-1.5 text-xs font-semibold text-[#F3D58D] hover:bg-[#D4AF37]/20"
                        >
                          +7d Boost
                        </button>
                        {active && (
                          <button
                            disabled={isBusy}
                            onClick={() =>
                              runAction(
                                { action: 'boost_property', id: prop.id, days: 0 },
                                `Removed boost from "${prop.title}".`,
                                `prop-${prop.id}`
                              )
                            }
                            className="rounded-xl border border-amber-500/35 bg-amber-950/35 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-950/60"
                          >
                            Unboost
                          </button>
                        )}
                        <button
                          disabled={isBusy}
                          onClick={() => {
                            if (!confirm(`Permanently delete "${prop.title}"? This cannot be undone.`)) return;
                            runAction(
                              { action: 'delete_property', id: prop.id },
                              `Deleted "${prop.title}".`,
                              `prop-${prop.id}`
                            );
                          }}
                          className="rounded-xl border border-red-500/40 bg-red-950/40 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-950/75"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* TAB 3: EXPORT & TOOLS */}
        {tab === 'tools' && (
          <section className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-[#D4AF37]/20 bg-[#12141C] p-5 space-y-3">
              <h2 className="text-sm font-semibold text-[#F3D58D]">Export Listings CSV</h2>
              <p className="text-xs text-[#9A9589]">
                Download all {properties.length} properties with agent phone numbers, prices, townships, and boost status.
              </p>
              <button
                onClick={() =>
                  downloadCsv(
                    `yomahome-listings-${new Date().toISOString().slice(0, 10)}.csv`,
                    ['ID', 'Title', 'Mode', 'Type', 'Township', 'Price_Lakhs', 'Beds', 'Baths', 'Sqft', 'Floor', 'Phone', 'Sponsored_Until'],
                    properties.map((p) => [
                      p.id,
                      p.title,
                      p.mode,
                      p.property_type,
                      p.township,
                      p.price_lakhs,
                      p.beds,
                      p.baths,
                      p.sqft,
                      p.floor_level,
                      p.contact_phone,
                      p.sponsored_until,
                    ])
                  )
                }
                className="rounded-xl bg-[#D4AF37] px-4 py-2 text-xs font-bold text-[#0B0C10]"
              >
                Download Listings CSV
              </button>
            </div>

            <div className="rounded-2xl border border-[#D4AF37]/20 bg-[#12141C] p-5 space-y-3">
              <h2 className="text-sm font-semibold text-[#F3D58D]">Export Boost Payments CSV</h2>
              <p className="text-xs text-[#9A9589]">
                Download all {boostRequests.length} KBZPay and WavePay boost transactions for bookkeeping.
              </p>
              <button
                onClick={() =>
                  downloadCsv(
                    `yomahome-boosts-${new Date().toISOString().slice(0, 10)}.csv`,
                    ['Boost_ID', 'Reference', 'Method', 'Amount_MMK', 'Status', 'Property_Title', 'Created_At'],
                    boostRequests.map((b) => [
                      b.id,
                      b.reference_code,
                      b.payment_method,
                      b.amount_mmk,
                      b.status,
                      b.property_id ? propertyMap.get(b.property_id)?.title || b.property_id : '',
                      b.created_at,
                    ])
                  )
                }
                className="rounded-xl border border-[#D4AF37]/40 bg-[#1D1910] px-4 py-2 text-xs font-bold text-[#F3D58D]"
              >
                Download Payments CSV
              </button>
            </div>
          </section>
        )}
      </main>

      {/* RECEIPT LIGHTBOX */}
      {receiptPreview && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setReceiptPreview(null)}
        >
          <div
            className="max-w-lg w-full rounded-2xl border border-[#D4AF37]/30 bg-[#12141C] p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-[#F3D58D]">Receipt · {receiptPreview.refCode}</p>
              <button
                onClick={() => setReceiptPreview(null)}
                className="text-xs text-[#C9C3B4] hover:text-white px-2 py-1"
              >
                Close ✕
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={receiptPreview.url}
              alt="Payment receipt"
              className="w-full max-h-[75vh] object-contain rounded-xl bg-black"
            />
          </div>
        </div>
      )}

      {/* EDIT LISTING MODAL */}
      {editing && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setEditing(null)}
        >
          <div
            className="max-w-lg w-full rounded-2xl border border-[#D4AF37]/35 bg-[#12141C] p-5 space-y-3 my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#F3D58D]">Edit Listing</h2>
              <button onClick={() => setEditing(null)} className="text-xs text-[#9A9589]">
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-[11px] text-[#C9C3B4] mb-1">Title</label>
                <input
                  className={inputCls}
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-[11px] text-[#C9C3B4] mb-1">Price (Lakhs)</label>
                <input
                  type="number"
                  className={inputCls}
                  value={editing.price_lakhs}
                  onChange={(e) => setEditing({ ...editing, price_lakhs: Number(e.target.value) })}
                />
              </div>

              <div>
                <label className="block text-[11px] text-[#C9C3B4] mb-1">Township</label>
                <input
                  className={inputCls}
                  value={editing.township}
                  onChange={(e) => setEditing({ ...editing, township: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-[11px] text-[#C9C3B4] mb-1">Mode</label>
                <input
                  className={inputCls}
                  value={editing.mode}
                  onChange={(e) => setEditing({ ...editing, mode: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-[11px] text-[#C9C3B4] mb-1">Property Type</label>
                <input
                  className={inputCls}
                  value={editing.property_type}
                  onChange={(e) => setEditing({ ...editing, property_type: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-[11px] text-[#C9C3B4] mb-1">Floor Level</label>
                <input
                  className={inputCls}
                  value={editing.floor_level || ''}
                  onChange={(e) => setEditing({ ...editing, floor_level: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-[11px] text-[#C9C3B4] mb-1">Contact Phone</label>
                <input
                  className={inputCls}
                  value={editing.contact_phone}
                  onChange={(e) => setEditing({ ...editing, contact_phone: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-[11px] text-[#C9C3B4] mb-1">Beds / Baths / Sqft</label>
                <div className="grid grid-cols-3 gap-1.5">
                  <input
                    type="number"
                    className={inputCls}
                    value={editing.beds}
                    onChange={(e) => setEditing({ ...editing, beds: Number(e.target.value) })}
                  />
                  <input
                    type="number"
                    className={inputCls}
                    value={editing.baths}
                    onChange={(e) => setEditing({ ...editing, baths: Number(e.target.value) })}
                  />
                  <input
                    type="number"
                    className={inputCls}
                    value={editing.sqft}
                    onChange={(e) => setEditing({ ...editing, sqft: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-[#C9C3B4] mb-1">Ownership Doc</label>
                <input
                  className={inputCls}
                  value={editing.ownership_doc || ''}
                  onChange={(e) => setEditing({ ...editing, ownership_doc: e.target.value })}
                />
              </div>

              <div className="col-span-2 flex flex-wrap gap-4 pt-1 text-xs text-[#C9C3B4]">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={editing.has_elevator}
                    onChange={(e) => setEditing({ ...editing, has_elevator: e.target.checked })}
                    className="accent-[#D4AF37]"
                  />
                  Elevator
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={editing.owner_direct}
                    onChange={(e) => setEditing({ ...editing, owner_direct: e.target.checked })}
                    className="accent-[#D4AF37]"
                  />
                  Owner Direct
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={editing.flood_free}
                    onChange={(e) => setEditing({ ...editing, flood_free: e.target.checked })}
                    className="accent-[#D4AF37]"
                  />
                  Flood-Free
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditing(null)}
                className="rounded-xl border border-[#D4AF37]/20 px-4 py-2 text-xs text-[#C9C3B4]"
              >
                Cancel
              </button>
              <button
                disabled={busyId === `save-${editing.id}`}
                onClick={async () => {
                  const ok = await runAction(
                    { action: 'update_property', id: editing.id, updates: editing },
                    `Saved updates to "${editing.title}".`,
                    `save-${editing.id}`
                  );
                  if (ok) setEditing(null);
                }}
                className="rounded-xl bg-[#D4AF37] px-4 py-2 text-xs font-bold text-[#0B0C10] disabled:opacity-50"
              >
                {busyId === `save-${editing.id}` ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
