/**
 * SS Exterior Services — Controlled Service Catalogue
 *
 * This is the server-side source of truth for what the AI is allowed to extract.
 * Every serviceKey, every field name, and every allowed value is derived directly
 * from the SERVICES object in index.html — specifically from each calcQuote(answers)
 * function's expected inputs.
 *
 * DO NOT add fields here that don't exist in calcQuote. The AI must only extract
 * information that the pricing engine can actually consume.
 */

const SERVICE_CATALOGUE = {

  'gutter-cleaning': {
    displayName: 'Gutter Cleaning',
    pricingBasis: 'Per linear metre of guttering',
    fields: {
      storeys: {
        required: true,
        type: 'enum',
        allowedValues: ['Single storey', 'Double storey', '3+ storeys', 'Commercial / Industrial'],
        extractionHints: [
          'Single storey = one level, bungalow, low-set',
          'Double storey = two levels, two floors',
          '3+ storeys or Commercial = triggers custom quote escalation',
          'Colorbond, brick veneer, weatherboard all apply — roof type does not determine storey count'
        ],
        suggestedQuestion: 'How many storeys is the property?'
      },
      bedrooms: {
        required: true,
        type: 'enum',
        allowedValues: ['2 bed', '3 bed', '4 bed', '5+ bed'],
        extractionHints: [
          'Used to estimate linear metres of guttering',
          'If client gives metres directly, prefer gutterMetresExact instead and leave bedrooms null',
          '"About 55 metres" → set gutterMetresExact to 55, leave bedrooms null'
        ],
        suggestedQuestion: 'How many bedrooms does the property have?'
      },
      gutterMetresExact: {
        required: false,
        type: 'number',
        extractionHints: [
          'If client states an approximate metre count, capture it here',
          'This field is NOT consumed by calcQuote directly — it informs the CSR to override the bedroom estimate',
          'Example: "about 55 metres of guttering" → gutterMetresExact: 55'
        ],
        suggestedQuestion: 'Approximately how many metres of guttering does the property have?'
      },
      gutter_guard: {
        required: true,
        type: 'enum',
        allowedValues: ['No', 'Yes'],
        extractionHints: [
          'Any mention of leaf guard, gutter guard, mesh over gutters = Yes',
          'No guard, open gutters = No',
          '"Part of the house has gutter guard" → Yes (conservative — doubles rate for safety)',
          'Uncertainty = leave null and flag as missing'
        ],
        suggestedQuestion: 'Do you have any gutter guard or leaf guard installed?'
      },
      debris: {
        required: true,
        type: 'enum',
        allowedValues: ['Less than 12 months', '1–3 years ago', '3+ years ago / never'],
        extractionHints: [
          'This represents time since last clean, used as a debris-level multiplier',
          '"Last cleaned 2 years ago" → "1–3 years ago"',
          '"Medium debris" alone is ambiguous — ask when last cleaned',
          '"Never been done" or "never cleaned" → "3+ years ago / never"',
          '"About two years ago" → "1–3 years ago"',
          'Do not invent this value — if unknown, leave null'
        ],
        suggestedQuestion: 'When were the gutters last cleaned, or have they ever been done?'
      },
      access: {
        required: false,
        type: 'enum',
        allowedValues: ['No', 'Yes — difficult access'],
        extractionHints: [
          'Difficult access = steep pitch, large trees close to roofline, unusual extensions',
          'Pergola at rear does not automatically mean difficult access unless it blocks roof access',
          'Default to No if no access issues mentioned'
        ],
        suggestedQuestion: 'Is there anything that might make roof access difficult — steep pitch, large trees close to the roofline?'
      },
      structures: {
        required: false,
        type: 'array',
        itemSchema: {
          type: { type: 'enum', allowedValues: ['Small shed (~20m guttering)', 'Medium shed (~28m guttering)', 'Large shed (~40m guttering)', 'Bungalow / Granny flat (~50m guttering)'] },
          gutter_guard: { type: 'enum', allowedValues: ['No', 'Yes'] },
          debris: { type: 'enum', allowedValues: ['Less than 12 months', '1–3 years ago', '3+ years ago / never'] }
        },
        extractionHints: [
          'Sheds, bungalows, granny flats with guttering are additional structures',
          'Each gets its own debris and guard status'
        ],
        suggestedQuestion: 'Are there any additional structures — shed, bungalow, granny flat — that also need gutters cleaned?'
      }
    },
    requiredForPricing: ['storeys', 'bedrooms', 'gutter_guard', 'debris'],
    recommendedForPricing: ['access'],
    optionalForPricing: ['structures', 'gutterMetresExact'],
    escalationTriggers: [
      { field: 'storeys', value: '3+ storeys', action: 'custom-quote' },
      { field: 'storeys', value: 'Commercial / Industrial', action: 'custom-quote' }
    ]
  },

  'solar-cleaning': {
    displayName: 'Solar Panel Cleaning',
    pricingBasis: 'Per panel',
    fields: {
      panels: {
        required: true,
        type: 'number',
        extractionHints: [
          'Number of solar panels on the roof',
          '"18 solar panels" → 18',
          'Do not estimate — only extract if stated'
        ],
        suggestedQuestion: 'How many solar panels do you have on the roof?'
      },
      storeys: {
        required: true,
        type: 'enum',
        allowedValues: ['Single storey', 'Double storey', '3+ storeys', 'Commercial / Industrial'],
        extractionHints: ['Same definition as gutter-cleaning storeys'],
        suggestedQuestion: 'How many storeys is the property?'
      },
      last_clean: {
        required: true,
        type: 'enum',
        allowedValues: ['Less than 1 year ago', '1–2 years ago', '2–4 years ago', '4+ years ago / never cleaned'],
        extractionHints: [
          '"Never been cleaned" → "4+ years ago / never cleaned"',
          '"About 18 months ago" → "1–2 years ago"',
          'Do not guess — leave null if not stated'
        ],
        suggestedQuestion: 'When were the solar panels last professionally cleaned, or have they ever been done?'
      },
      hard_access: {
        required: false,
        type: 'enum',
        allowedValues: ['No — standard access', 'Yes — difficult access'],
        showIf: 'storeys === "Double storey"',
        extractionHints: [
          'Only relevant for double-storey properties',
          'Steep pitch, unusually tight roof access = Yes'
        ],
        suggestedQuestion: 'Is access to the roof difficult in any way for a double-storey property?'
      }
    },
    requiredForPricing: ['panels', 'storeys', 'last_clean'],
    recommendedForPricing: ['hard_access'],
    optionalForPricing: [],
    escalationTriggers: [
      { field: 'storeys', value: '3+ storeys', action: 'custom-quote' },
      { field: 'storeys', value: 'Commercial / Industrial', action: 'custom-quote' }
    ]
  },

  'window-cleaning': {
    displayName: 'Window Cleaning',
    pricingBasis: 'Per pane',
    fields: {
      storeys: {
        required: true,
        type: 'enum',
        allowedValues: ['Single storey', 'Double storey', '3+ storeys', 'Commercial / Industrial'],
        suggestedQuestion: 'How many storeys is the property?'
      },
      windows: {
        required: true,
        type: 'number',
        extractionHints: [
          'Number of window panes (not frames)',
          'If client says "windows" without specifying panes, flag as ambiguous',
          '"About 12 windows" → 12'
        ],
        suggestedQuestion: 'How many window panes does the property have?'
      },
      scope: {
        required: true,
        type: 'enum',
        allowedValues: ['Exterior only', 'Interior + exterior'],
        extractionHints: [
          '"Exterior windows quoted" from CSR notes → "Exterior only"',
          'If client says "inside and out" → "Interior + exterior"'
        ],
        suggestedQuestion: 'Are you after exterior cleaning only, or interior and exterior?'
      },
      post_construction: {
        required: true,
        type: 'enum',
        allowedValues: ['No — standard clean', 'Yes — post-construction'],
        extractionHints: [
          'Post-construction = after renovation, new build, or major work',
          'Default to No — standard clean if not mentioned'
        ],
        suggestedQuestion: 'Is this a post-construction clean — after a renovation or new build?'
      },
      flyscreens: {
        required: false,
        type: 'enum',
        allowedValues: ['No', 'Yes — include flyscreens'],
        extractionHints: [
          'If client mentions flyscreens, capture. Otherwise leave null for CSR to ask.'
        ],
        suggestedQuestion: 'Do you have flyscreens you would like cleaned as well?'
      }
    },
    requiredForPricing: ['storeys', 'windows', 'scope', 'post_construction'],
    recommendedForPricing: ['flyscreens'],
    optionalForPricing: [],
    escalationTriggers: [
      { field: 'storeys', value: '3+ storeys', action: 'custom-quote' },
      { field: 'storeys', value: 'Commercial / Industrial', action: 'custom-quote' }
    ]
  },

  'house-washing': {
    displayName: 'House Washing',
    pricingBasis: 'Flat rate by storeys',
    fields: {
      storeys: {
        required: true,
        type: 'enum',
        allowedValues: ['Single storey', 'Double storey', '3+ storeys', 'Commercial / Industrial'],
        suggestedQuestion: 'How many storeys is the property?'
      },
      suburb_check: {
        required: true,
        type: 'enum',
        allowedValues: ['Within 30km of Kilmore → In-person quote', 'More than 30km from Kilmore → Phone quote'],
        extractionHints: [
          'If suburb is within ~30km of Kilmore VIC: Wandong, Broadford, Seymour, Lancefield, Wallan, Pyalong — in-person quote',
          'Exact list is in KILMORE_SUBURB_DISTANCES in the frontend',
          'If distance is 0–30km → in-person quote',
          'If unclear, leave null and flag'
        ],
        suggestedQuestion: 'What suburb is the property in?'
      },
      staining: {
        required: true,
        type: 'enum',
        allowedValues: ['Organic growth only (moss, algae, dirt)', 'Non-organic staining (rust, oil, paint, etc.)'],
        extractionHints: [
          'Non-organic staining triggers custom quote escalation',
          'Default to organic only if not mentioned'
        ],
        suggestedQuestion: 'Is there any rust, oil, paint, or chemical staining on the exterior?'
      },
      patio: {
        required: false,
        type: 'enum',
        allowedValues: ['No patio', 'Yes — single patio/veranda', 'Yes — multiple / large areas'],
        extractionHints: [
          'Pergola at rear is not the same as a patio unless it has a roof being washed',
          'Only include if client specifically wants the patio/veranda washed'
        ],
        suggestedQuestion: 'Is there a patio or veranda you would like included?'
      }
    },
    requiredForPricing: ['storeys', 'suburb_check', 'staining'],
    recommendedForPricing: ['patio'],
    optionalForPricing: [],
    escalationTriggers: [
      { field: 'staining', value: 'Non-organic staining (rust, oil, paint, etc.)', action: 'custom-quote' },
      { field: 'suburb_check', value: 'Within 30km of Kilmore → In-person quote', action: 'in-person-quote' }
    ]
  },

  'roof-cleaning': {
    displayName: 'Roof Cleaning',
    pricingBasis: 'Per sqm',
    fields: {
      storeys: {
        required: true,
        type: 'enum',
        allowedValues: ['Single storey', 'Double storey', '3+ storeys', 'Commercial / Industrial'],
        suggestedQuestion: 'How many storeys is the property?'
      },
      roof_type: {
        required: true,
        type: 'enum',
        allowedValues: ['Concrete tiles', 'Terra cotta tiles', 'Colorbond / metal'],
        extractionHints: [
          'Colorbond is a metal roofing brand — Colorbond, Zincalume, metal = "Colorbond / metal"',
          'Terra cotta = clay/terracotta tiles, orange/red appearance',
          'Concrete tiles = most common, grey or coloured',
          'Terra cotta triggers a redirect to roof-biocide service'
        ],
        suggestedQuestion: 'What type of roof does the property have — concrete tiles, terra cotta tiles, or Colorbond metal?'
      },
      age: {
        required: true,
        type: 'enum',
        allowedValues: ['Under 10 years', '10–20 years', '20+ years'],
        extractionHints: [
          'Age of the property, not the roof',
          '"Built about 15 years ago" → "10–20 years"'
        ],
        suggestedQuestion: 'Approximately how old is the property?'
      },
      bedrooms: {
        required: true,
        type: 'enum',
        allowedValues: ['2 bed', '3 bed', '4 bed', '5+ bed'],
        extractionHints: ['Used to estimate roof sqm'],
        suggestedQuestion: 'How many bedrooms does the property have?'
      },
      biocide: {
        required: false,
        type: 'enum',
        allowedValues: ['No thanks', 'Yes — add biocide treatment'],
        extractionHints: [
          'Biocide add-on prevents lichen regrowth for 2–4 years',
          'Only set to Yes if client explicitly requests it'
        ],
        suggestedQuestion: 'Would you like to add a long-term lichen preventative biocide treatment?'
      }
    },
    requiredForPricing: ['storeys', 'roof_type', 'age', 'bedrooms'],
    recommendedForPricing: [],
    optionalForPricing: ['biocide'],
    escalationTriggers: [
      { field: 'storeys', value: '3+ storeys', action: 'custom-quote' },
      { field: 'storeys', value: 'Commercial / Industrial', action: 'custom-quote' },
      { field: 'roof_type', value: 'Terra cotta tiles', action: 'reroute-to-roof-biocide' }
    ]
  },

  'roof-biocide': {
    displayName: 'Roof Biocide Treatment',
    pricingBasis: 'Per sqm',
    fields: {
      storeys: {
        required: true,
        type: 'enum',
        allowedValues: ['Single storey', 'Double storey', '3+ storeys', 'Commercial / Industrial'],
        suggestedQuestion: 'How many storeys is the property?'
      },
      bedrooms: {
        required: true,
        type: 'enum',
        allowedValues: ['2 bed', '3 bed', '4 bed', '5+ bed'],
        suggestedQuestion: 'How many bedrooms does the property have?'
      }
    },
    requiredForPricing: ['storeys', 'bedrooms'],
    recommendedForPricing: [],
    optionalForPricing: [],
    escalationTriggers: [
      { field: 'storeys', value: '3+ storeys', action: 'custom-quote' },
      { field: 'storeys', value: 'Commercial / Industrial', action: 'custom-quote' }
    ]
  },

  'pressure-washing': {
    displayName: 'Pressure Washing',
    pricingBasis: 'Per sqm',
    fields: {
      surface_type: {
        required: true,
        type: 'enum',
        allowedValues: ['Driveway', 'Paths around the house', 'Entertaining area / patio', 'Other'],
        suggestedQuestion: 'What are we pressure washing — driveway, paths, entertaining area, or something else?'
      },
      painted_concrete: {
        required: false,
        type: 'enum',
        allowedValues: ['No', 'Yes — painted concrete'],
        extractionHints: ['Painted concrete triggers custom quote escalation'],
        suggestedQuestion: 'Is the surface painted concrete at all?'
      },
      bedrooms: {
        required: false,
        type: 'enum',
        allowedValues: ['2 bed', '3 bed', '4 bed', '5+ bed'],
        showIf: 'surface_type in ["Driveway", "Paths around the house"]',
        extractionHints: ['Used to estimate sqm for driveways and paths'],
        suggestedQuestion: 'How many bedrooms does the property have?'
      },
      dimensions: {
        required: false,
        type: 'string',
        showIf: 'surface_type in ["Entertaining area / patio", "Other"]',
        extractionHints: [
          'Approximate dimensions in metres for non-standard areas',
          'Format: "6m × 10m" or similar'
        ],
        suggestedQuestion: 'Approximately how long and wide is the area in metres?'
      },
      last_wash: {
        required: true,
        type: 'enum',
        allowedValues: ['Less than 1 year ago', '1–3 years ago', '3+ years ago / never done'],
        extractionHints: ['"Never been done" → "3+ years ago / never done"'],
        suggestedQuestion: 'When was this area last pressure washed, or has it ever been done?'
      },
      staining: {
        required: false,
        type: 'enum',
        allowedValues: ['No — dirt, grime, organic growth only', 'Yes — non-organic staining present'],
        extractionHints: ['Non-organic staining (rust, oil, paint) triggers custom quote'],
        suggestedQuestion: 'Is there any rust, oil, paint, or chemical staining on the surface?'
      },
      biocide: {
        required: false,
        type: 'enum',
        allowedValues: ['No thanks', 'Yes — add biocide post-treatment'],
        suggestedQuestion: 'Would you like a biocide post-treatment to prevent organic regrowth?'
      }
    },
    requiredForPricing: ['surface_type', 'last_wash'],
    recommendedForPricing: ['bedrooms'],
    optionalForPricing: ['painted_concrete', 'dimensions', 'staining', 'biocide'],
    escalationTriggers: [
      { field: 'painted_concrete', value: 'Yes — painted concrete', action: 'custom-quote' },
      { field: 'staining', value: 'Yes — non-organic staining present', action: 'custom-quote' }
    ]
  },

  'gutter-softwash': {
    displayName: 'Gutter Exterior Softwash',
    pricingBasis: 'Per linear metre',
    fields: {
      storeys: {
        required: true,
        type: 'enum',
        allowedValues: ['Single storey', 'Double storey', '3+ storeys', 'Commercial / Industrial'],
        suggestedQuestion: 'How many storeys is the property?'
      },
      bedrooms: {
        required: true,
        type: 'enum',
        allowedValues: ['2 bed', '3 bed', '4 bed', '5+ bed'],
        suggestedQuestion: 'How many bedrooms does the property have?'
      }
    },
    requiredForPricing: ['storeys', 'bedrooms'],
    recommendedForPricing: [],
    optionalForPricing: [],
    escalationTriggers: [
      { field: 'storeys', value: '3+ storeys', action: 'custom-quote' },
      { field: 'storeys', value: 'Commercial / Industrial', action: 'custom-quote' }
    ]
  },

  'bird-proofing': {
    displayName: 'Solar Bird Proofing',
    pricingBasis: 'Bundle — gutter clean + solar clean + mesh installation',
    fields: {
      panels: {
        required: true,
        type: 'number',
        suggestedQuestion: 'How many solar panels do you have on the roof?'
      },
      nesting: {
        required: true,
        type: 'enum',
        allowedValues: ['No', 'Yes — birds currently nesting'],
        suggestedQuestion: 'Are there currently any birds nesting under the panels?'
      },
      storeys: {
        required: true,
        type: 'enum',
        allowedValues: ['Single storey', 'Double storey', '3+ storeys', 'Commercial / Industrial'],
        suggestedQuestion: 'How many storeys is the property?'
      },
      bedrooms: {
        required: true,
        type: 'enum',
        allowedValues: ['2 bed', '3 bed', '4 bed', '5+ bed'],
        suggestedQuestion: 'How many bedrooms does the property have?'
      },
      gutter_guard: {
        required: false,
        type: 'enum',
        allowedValues: ['No', 'Yes'],
        suggestedQuestion: 'Do you have any gutter guard installed?'
      },
      debris: {
        required: false,
        type: 'enum',
        allowedValues: ['Less than 12 months', '1–3 years ago', '3+ years ago / never'],
        suggestedQuestion: 'When were the gutters last cleaned?'
      },
      last_clean: {
        required: false,
        type: 'enum',
        allowedValues: ['Less than 1 year ago', '1–2 years ago', '2–4 years ago', '4+ years ago / never cleaned'],
        suggestedQuestion: 'When were the solar panels last professionally cleaned?'
      }
    },
    requiredForPricing: ['panels', 'nesting', 'storeys', 'bedrooms'],
    recommendedForPricing: ['gutter_guard', 'debris', 'last_clean'],
    optionalForPricing: [],
    escalationTriggers: [
      { field: 'storeys', value: '3+ storeys', action: 'custom-quote' },
      { field: 'storeys', value: 'Commercial / Industrial', action: 'custom-quote' }
    ]
  }
};

// Flat list of valid service keys — used for validation
const VALID_SERVICE_KEYS = Object.keys(SERVICE_CATALOGUE);

// Flat list of fields that must never appear in an AI response
// (prevents the AI returning pricing information)
const FORBIDDEN_FIELDS = [
  'price', 'total', 'subtotal', 'cost', 'rate', 'amount', 'discount',
  'charge', 'fee', 'quote', 'estimate', 'dollar', 'aud', 'gst',
  'travel_cost', 'travel_km', 'travel_charge'
];

module.exports = { SERVICE_CATALOGUE, VALID_SERVICE_KEYS, FORBIDDEN_FIELDS };
