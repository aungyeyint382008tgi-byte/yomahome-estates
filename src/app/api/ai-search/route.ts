import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';

const FilterSchema = z.object({
  mode: z.enum(['all', 'rent', 'buy']).default('all'),
  township: z.string().default(''),
  property_type: z.string().default(''),
  max_price_lakhs: z.number().default(0),
  min_price_lakhs: z.number().default(0),
  min_beds: z.number().int().default(0),
  only_generator: z.boolean().default(false),
  only_owner: z.boolean().default(false),
  flood_free: z.boolean().default(false),
  summary: z.string().default(''),
});

const MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.8-flash',
];

const filterJsonSchema = {
  type: 'object',
  properties: {
    mode: { type: 'string', enum: ['all', 'rent', 'buy'] },
    township: { type: 'string' },
    property_type: { type: 'string' },
    max_price_lakhs: { type: 'number' },
    min_price_lakhs: { type: 'number' },
    min_beds: { type: 'integer' },
    only_generator: { type: 'boolean' },
    only_owner: { type: 'boolean' },
    flood_free: { type: 'boolean' },
    summary: { type: 'string' },
  },
  required: [
    'mode',
    'township',
    'property_type',
    'max_price_lakhs',
    'min_price_lakhs',
    'min_beds',
    'only_generator',
    'only_owner',
    'flood_free',
    'summary',
  ],
};

// Local Burmese + English backup parser if all Gemini models are temporarily busy (503)
function localFallbackParse(raw: string) {
  const myanmarDigits = '၀၁၂၃၄၅၆၇၈၉';
  const normalized = raw
    .replace(/[၀-၉]/g, (d) => String(myanmarDigits.indexOf(d)))
    .toLowerCase();

  let mode: 'all' | 'rent' | 'buy' = 'all';
  if (/rent|lease|အငှား|အငှါး|ငှား/.test(normalized)) mode = 'rent';
  else if (/buy|sale|sell|အရောင်း|ဝယ်|ရောင်း/.test(normalized)) mode = 'buy';

  const townships: [RegExp, string][] = [
    [/bahan|ဗဟန်း/, 'Bahan'],
    [/kamayut|ကမာရွတ်|inya|အင်းလျား/, 'Kamayut'],
    [/yankin|ရန်ကင်း/, 'Yankin'],
    [/dagon|ဒဂုံ/, 'Dagon'],
    [/mayangone|မရမ်းကုန်း/, 'Mayangone'],
    [/sanchaung|စမ်းချောင်း/, 'Sanchaung'],
  ];
  const township = townships.find(([re]) => re.test(normalized))?.[1] || '';

  const types: [RegExp, string][] = [
    [/penthouse/, 'Penthouse'],
    [/condo|ကွန်ဒို/, 'Condo'],
    [/villa|လုံးချင်း/, 'Villa'],
    [/apartment|flat|တိုက်ခန်း/, 'Apartment'],
  ];
  const property_type = types.find(([re]) => re.test(normalized))?.[1] || '';

  const only_generator = false;
  const only_owner = /owner|direct|no agent|ပိုင်ရှင်/.test(normalized);
  const flood_free = /flood/.test(normalized);

  const bedMatch = normalized.match(/(\d+)\s*(bed|br|ခန်း)/);
  const min_beds = bedMatch ? Number(bedMatch[1]) : 0;

  let max_price_lakhs = 0;
  const maxMatch =
    normalized.match(/(?:under|below|max|<=)\s*(\d[\d,]*)/) ||
    normalized.match(/သိန်း\s*(\d[\d,]*)\s*အောက်/) ||
    normalized.match(/(\d[\d,]*)\s*(?:l|lakhs?)\s*(?:or less|max)/);
  if (maxMatch) max_price_lakhs = Number(maxMatch[1].replace(/,/g, ''));

  const parts = [
    mode !== 'all' ? (mode === 'rent' ? 'Rent' : 'Buy') : null,
    township || null,
    property_type || null,
    min_beds > 0 ? `${min_beds}+ Beds` : null,
    max_price_lakhs > 0 ? `≤${max_price_lakhs}L` : null,
    only_generator ? '24/7 Power' : null,
    only_owner ? 'Owner Direct' : null,
  ].filter(Boolean);

  return {
    mode,
    township,
    property_type,
    max_price_lakhs,
    min_price_lakhs: 0,
    min_beds,
    only_generator,
    only_owner,
    flood_free,
    summary: parts.length ? parts.join(' • ') : raw,
  };
}

export async function POST(req: Request) {
  let query = '';
  try {
    const body = await req.json();
    query = typeof body?.query === 'string' ? body.query.trim() : '';
    if (!query) {
      return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(localFallbackParse(query));
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `You are a Yangon, Myanmar luxury real estate search parser.
Convert the user's English or Burmese search request into structured filters.
Convert Myanmar Lakhs (သိန်း) directly to numbers (e.g. "40 lakhs" or "သိန်း ၄၀" -> 40; "15,000 lakhs" -> 15000).
Translate Burmese townships/types into English (ဗဟန်း -> Bahan, ကမာရွတ် -> Kamayut, ရန်ကင်း -> Yankin, ဒဂုံ -> Dagon, မရမ်းကုန်း -> Mayangone, စမ်းချောင်း -> Sanchaung; ကွန်ဒို -> Condo, လုံးချင်း -> Villa, တိုက်ခန်း -> Apartment; အငှား/အငှါး -> rent, အရောင်း -> buy).
Use empty string "" or 0 when a field is not mentioned.
Provide a clean short English summary like "Rent • Yankin • Condo".

User query: "${query}"`;

    for (const model of MODELS) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseJsonSchema: filterJsonSchema,
          },
        });

        const parsed = FilterSchema.parse(JSON.parse(response.text || '{}'));
        return NextResponse.json(parsed);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // If high demand / overloaded / unavailable, try the next Gemini model automatically
        if (
          msg.includes('503') ||
          msg.includes('429') ||
          msg.includes('UNAVAILABLE') ||
          msg.includes('NOT_FOUND')
        ) {
          continue;
        }
        throw err;
      }
    }

    // If every Gemini model is spiking at once, return instant local parse instead of failing
    return NextResponse.json(localFallbackParse(query));
  } catch (err) {
    if (query) {
      return NextResponse.json(localFallbackParse(query));
    }
    const message = err instanceof Error ? err.message : 'AI search failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
