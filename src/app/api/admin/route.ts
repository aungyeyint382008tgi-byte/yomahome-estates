import { NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/adminAuth';
import { extractStoragePath, getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const [propsRes, boostsRes] = await Promise.all([
      supabaseAdmin.from('properties').select('*'),
      supabaseAdmin.from('boost_requests').select('*').order('created_at', { ascending: false }),
    ]);

    if (propsRes.error) throw propsRes.error;
    if (boostsRes.error) throw boostsRes.error;

    const properties = (propsRes.data || []).sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });

    return NextResponse.json({
      properties,
      boostRequests: boostsRes.data || [],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to load admin data.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const body = await req.json();
    const action = String(body?.action || '');

    if (action === 'delete_property' || action === 'bulk_delete_properties') {
      const ids: string[] =
        action === 'bulk_delete_properties'
          ? Array.isArray(body.ids)
            ? body.ids.map(String).filter(Boolean)
            : []
          : body.id
            ? [String(body.id)]
            : [];

      if (ids.length === 0) {
        return NextResponse.json({ error: 'No listing ID provided.' }, { status: 400 });
      }

      const { data: existingProps } = await supabaseAdmin
        .from('properties')
        .select('id, image_url')
        .in('id', ids);

      const { data: linkedBoosts } = await supabaseAdmin
        .from('boost_requests')
        .select('id, receipt_url')
        .in('property_id', ids);

      // Remove linked boost requests first to satisfy foreign key constraints
      await supabaseAdmin.from('boost_requests').delete().in('property_id', ids);

      const { error: delErr } = await supabaseAdmin.from('properties').delete().in('id', ids);
      if (delErr) throw delErr;

      // Best-effort cleanup of uploaded storage files
      const listingPaths = (existingProps || [])
        .map((p) => extractStoragePath(p.image_url, 'listings'))
        .filter((p): p is string => Boolean(p));
      if (listingPaths.length > 0) {
        await supabaseAdmin.storage.from('listings').remove(listingPaths).catch(() => {});
      }

      const receiptPaths = (linkedBoosts || [])
        .map((b) => extractStoragePath(b.receipt_url, 'payment-receipts'))
        .filter((p): p is string => Boolean(p));
      if (receiptPaths.length > 0) {
        await supabaseAdmin.storage.from('payment-receipts').remove(receiptPaths).catch(() => {});
      }

      return NextResponse.json({ ok: true, deletedCount: ids.length });
    }

    if (action === 'update_property') {
      const id = String(body.id || '');
      const updates = body.updates || {};
      if (!id) return NextResponse.json({ error: 'Missing property ID.' }, { status: 400 });

      const allowedPayload: Record<string, unknown> = {};
      if (typeof updates.title === 'string') allowedPayload.title = updates.title.trim();
      if (typeof updates.mode === 'string') allowedPayload.mode = updates.mode.trim();
      if (typeof updates.property_type === 'string') allowedPayload.property_type = updates.property_type.trim();
      if (typeof updates.township === 'string') allowedPayload.township = updates.township.trim();
      if (updates.price_lakhs !== undefined && Number.isFinite(Number(updates.price_lakhs))) {
        allowedPayload.price_lakhs = Number(updates.price_lakhs);
      }
      if (updates.beds !== undefined && Number.isFinite(Number(updates.beds))) {
        allowedPayload.beds = Number(updates.beds);
      }
      if (updates.baths !== undefined && Number.isFinite(Number(updates.baths))) {
        allowedPayload.baths = Number(updates.baths);
      }
      if (updates.sqft !== undefined && Number.isFinite(Number(updates.sqft))) {
        allowedPayload.sqft = Number(updates.sqft);
      }
      if (updates.floor_level !== undefined) {
        allowedPayload.floor_level = String(updates.floor_level || '').trim() || null;
      }
      if (typeof updates.contact_phone === 'string') {
        allowedPayload.contact_phone = updates.contact_phone.trim();
      }
      if (updates.ownership_doc !== undefined) {
        allowedPayload.ownership_doc = String(updates.ownership_doc || '').trim() || null;
      }
      if (typeof updates.has_elevator === 'boolean') allowedPayload.has_elevator = updates.has_elevator;
      if (typeof updates.owner_direct === 'boolean') allowedPayload.owner_direct = updates.owner_direct;
      if (typeof updates.flood_free === 'boolean') allowedPayload.flood_free = updates.flood_free;

      const { data, error } = await supabaseAdmin
        .from('properties')
        .update(allowedPayload)
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return NextResponse.json({ ok: true, property: data });
    }

    if (action === 'boost_property') {
      const id = String(body.id || '');
      const days = Number(body.days ?? 7);
      if (!id) return NextResponse.json({ error: 'Missing property ID.' }, { status: 400 });

      let nextUntil: string | null = null;
      if (days > 0) {
        const { data: current } = await supabaseAdmin
          .from('properties')
          .select('sponsored_until')
          .eq('id', id)
          .single();

        const currentMs = current?.sponsored_until ? new Date(current.sponsored_until).getTime() : 0;
        const baseMs = Math.max(Date.now(), Number.isFinite(currentMs) ? currentMs : 0);
        nextUntil = new Date(baseMs + days * 24 * 60 * 60 * 1000).toISOString();
      }

      const { data, error } = await supabaseAdmin
        .from('properties')
        .update({ sponsored_until: nextUntil })
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return NextResponse.json({ ok: true, property: data });
    }

    if (action === 'approve_boost') {
      const boostId = String(body.boostId || '');
      const days = Math.max(1, Number(body.days ?? 7));
      if (!boostId) return NextResponse.json({ error: 'Missing boost ID.' }, { status: 400 });

      const { data: boostRow, error: fetchErr } = await supabaseAdmin
        .from('boost_requests')
        .select('*')
        .eq('id', boostId)
        .single();

      if (fetchErr || !boostRow) {
        return NextResponse.json({ error: 'Boost request not found.' }, { status: 404 });
      }

      const { error: updBoostErr } = await supabaseAdmin
        .from('boost_requests')
        .update({ status: 'approved' })
        .eq('id', boostId);
      if (updBoostErr) throw updBoostErr;

      if (boostRow.property_id) {
        const { data: propRow } = await supabaseAdmin
          .from('properties')
          .select('sponsored_until')
          .eq('id', boostRow.property_id)
          .single();

        const currentMs = propRow?.sponsored_until ? new Date(propRow.sponsored_until).getTime() : 0;
        const baseMs = Math.max(Date.now(), Number.isFinite(currentMs) ? currentMs : 0);
        const sponsoredUntil = new Date(baseMs + days * 24 * 60 * 60 * 1000).toISOString();

        const { error: propErr } = await supabaseAdmin
          .from('properties')
          .update({ sponsored_until: sponsoredUntil })
          .eq('id', boostRow.property_id);
        if (propErr) throw propErr;
      }

      return NextResponse.json({ ok: true });
    }

    if (action === 'reject_boost') {
      const boostId = String(body.boostId || '');
      if (!boostId) return NextResponse.json({ error: 'Missing boost ID.' }, { status: 400 });

      const { error } = await supabaseAdmin
        .from('boost_requests')
        .update({ status: 'rejected' })
        .eq('id', boostId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === 'delete_boost_request') {
      const boostId = String(body.boostId || '');
      if (!boostId) return NextResponse.json({ error: 'Missing boost ID.' }, { status: 400 });

      const { data: existing } = await supabaseAdmin
        .from('boost_requests')
        .select('receipt_url')
        .eq('id', boostId)
        .single();

      const { error } = await supabaseAdmin.from('boost_requests').delete().eq('id', boostId);
      if (error) throw error;

      const receiptPath = extractStoragePath(existing?.receipt_url, 'payment-receipts');
      if (receiptPath) {
        await supabaseAdmin.storage.from('payment-receipts').remove([receiptPath]).catch(() => {});
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown admin action.' }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Admin action failed.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
