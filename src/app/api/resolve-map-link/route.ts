import { NextResponse } from 'next/server';

function isValidCoord(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

function extractCoords(text: string): { lat: number; lng: number } | null {
  if (!text) return null;

  // 1. Exact Google Maps building pin (!3dLAT!4dLNG)
  const pinMatches = [...text.matchAll(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/g)];
  if (pinMatches.length > 0) {
    const last = pinMatches[pinMatches.length - 1];
    const lat = parseFloat(last[1]);
    const lng = parseFloat(last[2]);
    if (isValidCoord(lat, lng)) return { lat, lng };
  }

  // 2. Reverse embed format (!2dLNG!3dLAT)
  const revPin = text.match(/!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)/);
  if (revPin) {
    const lng = parseFloat(revPin[1]);
    const lat = parseFloat(revPin[2]);
    if (isValidCoord(lat, lng)) return { lat, lng };
  }

  // 3. Static map OG preview center
  const staticCenter = text.match(/staticmap\?[^"'\\s]*center=(-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)/i);
  if (staticCenter) {
    const lat = parseFloat(staticCenter[1]);
    const lng = parseFloat(staticCenter[2]);
    if (isValidCoord(lat, lng)) return { lat, lng };
  }

  // 4. Query params (?q=lat,lng, ?ll=lat,lng, /search/lat,lng)
  const queryMatch = text.match(
    /(?:[?&](?:q|query|ll)=|\/search\/)(-?\d+\.\d+)(?:%2C|,)\s*\+?(-?\d+\.\d+)/i
  );
  if (queryMatch) {
    const lat = parseFloat(queryMatch[1]);
    const lng = parseFloat(queryMatch[2]);
    if (isValidCoord(lat, lng)) return { lat, lng };
  }

  // 5. Viewport coordinates (@lat,lng)
  const atMatch = text.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]);
    const lng = parseFloat(atMatch[2]);
    if (isValidCoord(lat, lng)) return { lat, lng };
  }

  // 6. Google Maps initialization JSON ([null,null,lat,lng])
  const jsonMatch = text.match(/\[null,null,(-?\d+\.\d+),(-?\d+\.\d+)\]/);
  if (jsonMatch) {
    const lat = parseFloat(jsonMatch[1]);
    const lng = parseFloat(jsonMatch[2]);
    if (isValidCoord(lat, lng)) return { lat, lng };
  }

  return null;
}

function isAllowedGoogleHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === 'maps.app.goo.gl' ||
    h === 'goo.gl' ||
    h === 'g.co' ||
    h === 'google.com' ||
    h.endsWith('.google.com') ||
    /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(h)
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const raw = String(body?.url || '').trim();
    if (!raw) {
      return NextResponse.json({ error: 'Please paste a Google Maps location link.' }, { status: 400 });
    }

    // Support direct "lat, lng" paste
    const directCoords = raw.match(/^\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/);
    if (directCoords) {
      const lat = parseFloat(directCoords[1]);
      const lng = parseFloat(directCoords[2]);
      if (isValidCoord(lat, lng)) {
        return NextResponse.json({ lat, lng });
      }
    }

    // Extract URL even if user pasted "Building Name https://maps.app.goo.gl/..."
    const urlMatch = raw.match(/https?:\/\/[^\s]+/i);
    if (!urlMatch) {
      return NextResponse.json(
        { error: 'Please paste a valid Google Maps link (from Google Maps → Share → Copy link).' },
        { status: 400 }
      );
    }

    const cleanedUrl = urlMatch[0].replace(/[),.;]+$/, '');
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(cleanedUrl);
    } catch {
      return NextResponse.json({ error: 'Invalid URL format.' }, { status: 400 });
    }

    if (!isAllowedGoogleHost(parsedUrl.hostname)) {
      return NextResponse.json(
        { error: 'Please use an official Google Maps link (maps.app.goo.gl or google.com/maps).' },
        { status: 400 }
      );
    }

    // Fast path: coordinates already present in pasted URL
    const immediate = extractCoords(cleanedUrl) || extractCoords(decodeURIComponent(cleanedUrl));
    if (immediate) {
      return NextResponse.json(immediate);
    }

    // Resolve short links server-side
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(cleanedUrl, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    clearTimeout(timer);

    const candidates = [res.url];
    try {
      const finalParsed = new URL(res.url);
      const cont = finalParsed.searchParams.get('continue');
      if (cont) candidates.push(cont);
    } catch {}

    for (const candidate of candidates) {
      const found =
        extractCoords(candidate) ||
        extractCoords(decodeURIComponent(candidate).replace(/\\u0026/g, '&'));
      if (found) return NextResponse.json(found);
    }

    const html = (await res.text()).slice(0, 350000);
    const fromHtml = extractCoords(html);
    if (fromHtml) {
      return NextResponse.json(fromHtml);
    }

    return NextResponse.json(
      { error: 'Could not find exact coordinates in this link. Tap the building pin in Google Maps → Share → Copy link.' },
      { status: 400 }
    );
  } catch {
    return NextResponse.json(
      { error: 'Failed to resolve Google Maps link. Please check the link and try again.' },
      { status: 400 }
    );
  }
}
