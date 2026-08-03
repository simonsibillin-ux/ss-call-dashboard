// SS Exterior Services — SERVICES catalogue
// Extracted from index.html (Stage 2A). Do not edit directly — see modularisation plan.
// Load order: after /js/config.js, before main inline script.

const DEFAULT_PRICING = {
  global: {
    minimumJob: 150,
    travelPerKm: 1,
    debrisRemoval: 100
  },
  gutterCleaning: {
    singleStoreyPerMetre: 3,
    doubleStoreyPerMetre: 6,
    structurePerMetre: 3,
    gutterGuardMultiplier: 2,
    difficultAccessMultiplier: 1.5,
    debrisMediumMultiplier: 1.5,
    debrisHeavyMultiplier: 2
  },
  solarCleaning: {
    lessThan1YearPerPanel: 5.5,
    oneToTwoYearsPerPanel: 6.75,
    twoToFourYearsPerPanel: 8.25,
    fourPlusYearsPerPanel: 10.5,
    hardAccessMultiplier: 2
  },
  windowCleaning: {
    singleExteriorPerPane: 6,
    doubleExteriorPerPane: 10.5,
    postConstructionSinglePerPane: 17.5,
    postConstructionDoublePerPane: 24,
    interiorMultiplier: 2,
    flyscreenEach: 5,
    trackDeepCleanEach: 9
  },
  houseWashing: {
    singleStoreyPhone: 450,
    doubleStoreyPhone: 650,
    patioSingleAddOn: 150,
    patioMultipleAddOn: 250
  },
  roofCleaning: {
    under10SinglePerSqm: 4,
    under10DoublePerSqm: 5,
    tenTo20SinglePerSqm: 5,
    tenTo20DoublePerSqm: 6,
    twentyPlusSinglePerSqm: 6,
    twentyPlusDoublePerSqm: 7
  },
  roofBiocide: {
    singlePerSqm: 2,
    doublePerSqm: 3.25
  },
  pressureWashing: {
    lessThan1YearPerSqm: 4,
    oneToThreeYearsPerSqm: 4.5,
    threePlusYearsPerSqm: 5,
    biocidePerSqm: 2
  },
  gutterSoftwash: {
    singleStoreyPerMetre: 3,
    doubleStoreyPerMetre: 5
  },
  birdProofing: {
    singleStoreyMeshPerMetre: 35,
    doubleStoreyMeshPerMetre: 55,
    nestRemovalFlat: 200,
    meshEstimateMultiplier: 0.7
  }
};

let PRICING = JSON.parse(JSON.stringify(DEFAULT_PRICING));

function _deepMergePricing(base, overrides) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  Object.entries(overrides || {}).forEach(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value) && base && typeof base[key] === 'object') {
      out[key] = _deepMergePricing(base[key], value);
    } else if (value !== undefined && value !== null && value !== '') {
      const numericValue = Number(value);
      out[key] = Number.isFinite(numericValue) ? numericValue : value;
    }
  });
  return out;
}

function applyPricingOverrides(overrides) {
  PRICING = _deepMergePricing(DEFAULT_PRICING, overrides || {});
}

function price(path, fallback) {
  const found = String(path).split('.').reduce((obj, key) => (obj && obj[key] !== undefined ? obj[key] : undefined), PRICING);
  const value = Number(found);
  return Number.isFinite(value) ? value : fallback;
}

function minJob() {
  return price('global.minimumJob', 150);
}

const SERVICES = {

  'gutter-cleaning': {
    name: 'Gutter Cleaning',
    steps: [
      {
        id: 'storeys',
        label: 'How many storeys is the property?',
        script: '"How many storeys is the property?"',
        type: 'options',
        options: ['Single storey', 'Double storey', '3+ storeys', 'Commercial / Industrial'],
        onSelect: (val) => {
          if (val === '3+ storeys' || val === 'Commercial / Industrial') return 'custom';
        }
      },
      {
        id: 'bedrooms',
        label: 'How many bedrooms does the property have?',
        script: '"How many bedrooms does the property have?"',
        type: 'options',
        options: ['2 bed', '3 bed', '4 bed', '5+ bed']
      },
      {
        id: 'gutter_guard',
        label: 'Do you have gutter guard or leaf guard installed?',
        script: '"Do you have any gutter guard or leaf guard installed on your gutters?"',
        type: 'options',
        options: ['No', 'Yes']
      },
      {
        id: 'debris',
        label: 'When did you last have your gutters cleaned?',
        script: '"When did you last have your gutters cleaned, or have they ever been cleaned?"',
        type: 'options',
        options: ['Less than 12 months', '1–3 years ago', '3+ years ago / never']
      },
      {
        id: 'access',
        label: 'Is there anything that might make roof access difficult?',
        script: '"Is there anything that might make roof access difficult — for example, a steep pitch, large trees close to the roofline, or extensions?"',
        type: 'options',
        options: ['No', 'Yes — difficult access']
      },
      {
        id: 'structures',
        label: 'Additional structures to clean?',
        script: '"Are there any additional structures on the property that also need their gutters cleaned — for example, a shed, bungalow, or granny flat?"',
        type: 'structures',
        structureOptions: ['Small shed (~20m guttering)', 'Medium shed (~28m guttering)', 'Large shed (~40m guttering)', 'Bungalow / Granny flat (~50m guttering)'],
        rateKey: 'gutter'
      }
    ],
    inclusions: [
      'All debris removed from gutters (dry or wet)',
      'All downpipes flushed',
      'Before and after photos provided',
      'Debris disposed of on client\'s property (bin or designated spot)',
      'Off-site removal available at additional $100',
      'Additional structures included if selected'
    ],
    calcQuote: (a) => {
      const bedroomKey = a.bedrooms ? (a.bedrooms === '5+ bed' ? '5+' : a.bedrooms.replace(' bed','')) : null;
      // Phase 4: support exact metre override when supplied and valid
      const exactMetres = Number(a.gutterMetresExact);
      const usingExactMetres = Number.isFinite(exactMetres) && exactMetres > 0;
      const metres = usingExactMetres
        ? Math.round(exactMetres)
        : (BEDROOM_TO_METRES[bedroomKey] || 62);
      const metresBasis = usingExactMetres
        ? `Based on ${metres} metres stated`
        : `Est. linear metres (${bedroomKey || '?'} bed avg)`;
      const storeyRate = a.storeys === 'Single storey' ? price('gutterCleaning.singleStoreyPerMetre', 3) : price('gutterCleaning.doubleStoreyPerMetre', 6);
      const guardMult = a.gutter_guard === 'Yes' ? price('gutterCleaning.gutterGuardMultiplier', 2) : 1;
      const debrisMult = a.debris === '1–3 years ago' ? price('gutterCleaning.debrisMediumMultiplier', 1.5) : a.debris === '3+ years ago / never' ? price('gutterCleaning.debrisHeavyMultiplier', 2) : 1;
      const accessMult = a.access === 'Yes — difficult access' ? price('gutterCleaning.difficultAccessMultiplier', 1.5) : 1;
      const base = metres * storeyRate * guardMult * debrisMult * accessMult;
      // Additional structures from looping collector
      const STRUCTURE_METRES = { 'Small shed (~20m guttering)': 20, 'Medium shed (~28m guttering)': 28, 'Large shed (~40m guttering)': 40, 'Bungalow / Granny flat (~50m guttering)': 50 };
      const structures = Array.isArray(a.structures) ? a.structures : [];
      let structureLines = [];
      let structureTotal = 0;
      structures.forEach(s => {
        // New: explicit gutterMetres field takes priority over legacy type label.
        // Legacy presets still carry a 'type' string and use STRUCTURE_METRES.
        // Custom structures carry an explicit gutterMetres number.
        // The || 20 fallback is intentionally removed — the adapter guarantees
        // only confirmed measurements reach here. If somehow neither path
        // resolves, the structure is skipped (sMetres === null means skip).
        const sMetres = (s.gutterMetres !== undefined && s.gutterMetres !== null)
          ? Number(s.gutterMetres)
          : (STRUCTURE_METRES[s.type] != null ? STRUCTURE_METRES[s.type] : null);
        if (sMetres === null || !Number.isFinite(sMetres)) return; // skip incomplete
        const sGuardMult = s.gutter_guard === 'Yes' ? price('gutterCleaning.gutterGuardMultiplier', 2) : guardMult;
        const sDebrisMult = s.debris === '1–3 years ago' ? price('gutterCleaning.debrisMediumMultiplier', 1.5) : s.debris === '3+ years ago / never' ? price('gutterCleaning.debrisHeavyMultiplier', 2) : debrisMult;
        const sTotal = sMetres * price('gutterCleaning.structurePerMetre', 3) * sGuardMult * sDebrisMult;
        structureTotal += sTotal;
        const sLabel = s.name || s.type || `Structure (~${sMetres}m)`;
        structureLines.push({ label: `${sLabel} (~${sMetres}m${s.gutter_guard === 'Yes' ? ', guard ×2' : ''})`, value: `$${sTotal.toFixed(2)}` });
      });
      return {
        lines: [
          { label: metresBasis, value: `${metres}m` },
          { label: `Rate (${a.storeys})`, value: `$${storeyRate.toFixed(2)}/m` },
          a.gutter_guard === 'Yes' ? { label: 'Gutter guard multiplier', value: '×2' } : null,
          debrisMult > 1 ? { label: 'Debris multiplier', value: `×${debrisMult}` } : null,
          accessMult > 1 ? { label: 'Difficult access', value: '×1.5' } : null,
          { label: 'Main structure subtotal', value: `$${base.toFixed(2)}` },
          ...structureLines,
        ].filter(Boolean),
        travel: clientInfo.travelCost,
        total: Math.max(minJob(), base + structureTotal)
      };
    }
  },

  'solar-cleaning': {
    name: 'Solar Panel Cleaning',
    steps: [
      {
        id: 'panels',
        label: 'How many solar panels do you have?',
        script: '"How many solar panels do you have on the roof?"',
        type: 'input',
        inputType: 'number',
        placeholder: 'e.g. 16'
      },
      {
        id: 'storeys',
        label: 'How many storeys is the property?',
        script: '"And how many storeys is the property?"',
        type: 'options',
        options: ['Single storey', 'Double storey', '3+ storeys', 'Commercial / Industrial'],
        onSelect: (val) => { if (val === '3+ storeys' || val === 'Commercial / Industrial') return 'custom'; }
      },
      {
        id: 'last_clean',
        label: 'When were the panels last professionally cleaned?',
        script: '"When did you last have your solar panels professionally cleaned, or have they ever been cleaned?"',
        type: 'options',
        options: ['Less than 1 year ago', '1–2 years ago', '2–4 years ago', '4+ years ago / never cleaned']
      },
      {
        id: 'hard_access',
        label: 'Double storey — is roof access difficult?',
        script: '"Is access to your roof difficult in any way — steep pitch, tight areas, anything like that?"',
        type: 'options',
        options: ['No — standard access', 'Yes — difficult access'],
        showIf: (a) => a.storeys === 'Double storey'
      }
    ],
    inclusions: [
      'Removal of organic material, lichen, and debris from panel surfaces and frames',
      'Scrubbed with non-abrasive nylon brushes — completely safe for panels',
      'Purified deionised water used exclusively',
      'All methods follow solar panel manufacturer specifications',
      'Before and after photos'
    ],
    calcQuote: (a) => {
      const panels = parseInt(a.panels) || 0;
      const rateMap = {
        'Less than 1 year ago': price('solarCleaning.lessThan1YearPerPanel', 5.5),
        '1–2 years ago': price('solarCleaning.oneToTwoYearsPerPanel', 6.75),
        '2–4 years ago': price('solarCleaning.twoToFourYearsPerPanel', 8.25),
        '4+ years ago / never cleaned': price('solarCleaning.fourPlusYearsPerPanel', 10.5)
      };
      let rate = rateMap[a.last_clean] || price('solarCleaning.oneToTwoYearsPerPanel', 6.75);
      if (a.storeys === 'Double storey' && a.hard_access === 'Yes — difficult access') rate *= price('solarCleaning.hardAccessMultiplier', 2);
      const base = panels * rate;
      return {
        lines: [
          { label: 'Panel count', value: `${panels} panels` },
          { label: 'Rate (time since last clean)', value: `$${rate.toFixed(2)}/panel` },
          a.hard_access === 'Yes — difficult access' ? { label: 'Hard access double storey', value: '×2' } : null,
          { label: 'Service subtotal', value: `$${Math.max(minJob(), base).toFixed(2)}` },
        ].filter(Boolean),
        travel: clientInfo.travelCost,
        total: Math.max(minJob(), base)
      };
    }
  },

  'window-cleaning': {
    name: 'Window Cleaning',
    steps: [
      {
        id: 'storeys',
        label: 'How many storeys is the property?',
        script: '"How many storeys is the property?"',
        type: 'options',
        options: ['Single storey', 'Double storey', '3+ storeys', 'Commercial / Industrial'],
        onSelect: (val) => { if (val === '3+ storeys' || val === 'Commercial / Industrial') return 'custom'; }
      },
      {
        id: 'windows',
        label: 'How many windows does the property have?',
        script: '"How many windows does the property have? We\'ll work from there."',
        type: 'input',
        inputType: 'number',
        placeholder: 'e.g. 12'
      },
      {
        id: 'scope',
        label: 'Exterior only, or interior and exterior?',
        script: '"Are you after exterior cleaning only, or would you like interior and exterior?"',
        type: 'options',
        options: ['Exterior only', 'Interior + exterior']
      },
      {
        id: 'post_construction',
        label: 'Is this a post-construction clean?',
        script: '"Is this a post-construction clean — for example after a renovation or new build?"',
        type: 'options',
        options: ['No — standard clean', 'Yes — post-construction']
      },
      {
        id: 'flyscreens',
        label: 'Do you have flyscreens you\'d like cleaned?',
        script: '"Do you have any flyscreens you\'d like cleaned as well?"',
        type: 'options',
        options: ['No', 'Yes — include flyscreens'],
      },
      {
        id: 'tracks',
        label: 'Would you like window tracks deep cleaned?',
        script: '"Would you like the window tracks deep cleaned as well?"',
        type: 'options',
        options: ['No', 'Yes — deep clean tracks']
      }
    ],
    inclusions: [
      'Clean of all panes, frames, sills, and tracks',
      'Method: bucket and squeegee or water-fed pole with purified deionised water',
      'Standard clean disclaimer: does not include hard water stains, paint residue, silicone, or heavy buildup without prior agreement'
    ],
    calcQuote: (a) => {
      const windows = parseInt(a.windows) || 0;
      const panes = windows * 2;
      const isPost = a.post_construction === 'Yes — post-construction';
      const isDouble = a.storeys === 'Double storey';
      const isInterior = !isPost && a.scope === 'Interior + exterior';
      let paneRate = isPost
        ? (isDouble ? price('windowCleaning.postConstructionDoublePerPane', 24) : price('windowCleaning.postConstructionSinglePerPane', 17.5))
        : (isDouble ? price('windowCleaning.doubleExteriorPerPane', 10.5) : price('windowCleaning.singleExteriorPerPane', 6));
      let exteriorTotal = panes * paneRate;
      let total = exteriorTotal;
      if (isInterior) total *= price('windowCleaning.interiorMultiplier', 2);
      const flyTotal = a.flyscreens === 'Yes — include flyscreens' ? windows * price('windowCleaning.flyscreenEach', 5) : 0;
      const trackTotal = a.tracks === 'Yes — deep clean tracks' ? windows * price('windowCleaning.trackDeepCleanEach', 9) : 0;
      total += flyTotal + trackTotal;
      const scopeLabel = isPost ? 'Post-construction' : (isInterior ? 'Interior + exterior' : 'Exterior only');
      const dynamicInclusions = [
        'Scope: ' + scopeLabel,
        isInterior
          ? 'Clean of all panes, frames, sills, and tracks — interior AND exterior'
          : 'Clean of all panes, frames, sills, and tracks — EXTERIOR ONLY',
        'Method: bucket and squeegee or water-fed pole with purified deionised water',
        'Standard clean disclaimer: does not include hard water stains, paint residue, silicone, or heavy buildup without prior agreement',
      ];
      if (flyTotal > 0) dynamicInclusions.push('Flyscreens cleaned');
      if (trackTotal > 0) dynamicInclusions.push('Window tracks deep cleaned');
      return {
        lines: [
          { label: 'Scope', value: scopeLabel },
          { label: 'Windows × 2 panes', value: panes + ' panes' },
          { label: 'Rate (' + (isPost ? 'post-construction ' : '') + (a.storeys || 'standard') + ')', value: '$' + paneRate.toFixed(2) + '/pane' },
          isInterior ? { label: 'Interior + exterior (×2)', value: '$' + (exteriorTotal * 2).toFixed(2) } : null,
          flyTotal > 0 ? { label: 'Flyscreens (' + windows + ' × $' + price('windowCleaning.flyscreenEach', 5) + ')', value: '$' + flyTotal.toFixed(2) } : null,
          trackTotal > 0 ? { label: 'Track deep clean (' + windows + ' × $' + price('windowCleaning.trackDeepCleanEach', 9) + ')', value: '$' + trackTotal.toFixed(2) } : null,
          total < minJob() ? { label: 'Minimum call-out applied', value: '$' + minJob().toFixed(2) } : null,
        ].filter(Boolean),
        inclusions: dynamicInclusions,
        travel: clientInfo.travelCost,
        total: Math.max(minJob(), total),
        disclaimer: 'Remind client: standard clean only — no hard water stains, paint residue, or silicone included.'
      };
    }
  },

  'house-washing': {
    name: 'House Washing',
    steps: [
      {
        id: 'suburb_check',
        label: 'What suburb is the property in?',
        script: '"What suburb is the property in?" [Check distance from Kilmore — within 30km = in-person quote]',
        type: 'options',
        options: ['Within 30km of Kilmore → In-person quote', 'Beyond 30km → Phone quote']
      },
      {
        id: 'storeys',
        label: 'How many storeys is the property?',
        script: '"How many storeys is the property?"',
        type: 'options',
        options: ['Single storey', 'Double storey', '3+ storeys', 'Commercial / Industrial'],
        onSelect: (val) => { if (val === '3+ storeys' || val === 'Commercial / Industrial') return 'custom'; },
        showIf: (a) => a.suburb_check === 'Beyond 30km → Phone quote'
      },
      {
        id: 'staining',
        label: 'Any staining or buildup on the exterior?',
        script: '"Are you aware of any staining or buildup on the exterior — things like mould, algae, or any other marks?"',
        type: 'options',
        options: ['Organic growth only (moss, algae, dirt)', 'Non-organic staining (rust, oil, paint, etc.)'],
        showIf: (a) => a.suburb_check === 'Beyond 30km → Phone quote'
      },
      {
        id: 'patio',
        label: 'Does the property have any patios or verandas?',
        script: '"Does the property have any patios, verandas, or undercover outdoor areas you\'d like included?"',
        type: 'options',
        options: ['No', 'Yes — single patio/veranda', 'Yes — multiple / large areas'],
        showIf: (a) => a.suburb_check === 'Beyond 30km → Phone quote' && a.staining === 'Organic growth only (moss, algae, dirt)'
      }
    ],
    inclusions: [
      'Complete clean of exterior walls, facades, gutters, fascia, and eaves',
      'Does NOT include roof (separate service)',
      'All methods comply with manufacturer specifications — warranty compliant',
      'Before and after photos',
      'Stain removal (non-organic) is a separate custom quote'
    ],
    calcQuote: (a) => {
      if (a.suburb_check === 'Within 30km of Kilmore → In-person quote') {
        return { inPerson: true };
      }
      if (a.staining === 'Non-organic staining (rust, oil, paint, etc.)') {
        return { customQuote: true, reason: 'Non-organic staining requires specialist treatment — escalate to Simon with photos.' };
      }
      const base = a.storeys === 'Single storey' ? price('houseWashing.singleStoreyPhone', 450) : price('houseWashing.doubleStoreyPhone', 650);
      const patioAdd = a.patio === 'Yes — single patio/veranda' ? price('houseWashing.patioSingleAddOn', 150) : a.patio === 'Yes — multiple / large areas' ? price('houseWashing.patioMultipleAddOn', 250) : 0;
      return {
        lines: [
          { label: `${a.storeys} house wash (phone rate)`, value: `$${base.toFixed(2)}` },
          patioAdd > 0 ? { label: 'Patio/veranda add-on', value: `+$${patioAdd.toFixed(2)}` } : null,
        ].filter(Boolean),
        travel: clientInfo.travelCost,
        total: Math.max(minJob(), base + patioAdd),
        upsell: 'Offer roof cleaning quote at end of call.'
      };
    }
  },

  'roof-cleaning': {
    name: 'Roof Cleaning',
    steps: [
      {
        id: 'storeys',
        label: 'How many storeys is the property?',
        script: '"How many storeys is the property?"',
        type: 'options',
        options: ['Single storey', 'Double storey', '3+ storeys', 'Commercial / Industrial'],
        onSelect: (val) => { if (val === '3+ storeys' || val === 'Commercial / Industrial') return 'custom'; }
      },
      {
        id: 'roof_type',
        label: 'What type of roof does the property have?',
        script: '"What type of roof does the property have — concrete tiles, terra cotta tiles, or Colorbond metal?"',
        type: 'options',
        options: ['Concrete tiles', 'Terra cotta tiles', 'Colorbond / metal']
      },
      {
        id: 'age',
        label: 'How old is the property approximately?',
        script: '"How old is the property approximately?"',
        type: 'options',
        options: ['Under 10 years', '10–20 years', '20+ years']
      },
      {
        id: 'bedrooms',
        label: 'How many bedrooms does the property have?',
        script: '"How many bedrooms does the property have?"',
        type: 'options',
        options: ['2 bed', '3 bed', '4 bed', '5+ bed']
      }
    ],
    inclusions: [
      'Complete killing and removal of lichen, moss, algae, and organic material',
      'Softwash method — safe for all roof types',
      'All methods comply with manufacturer specifications',
      'Before and after photos'
    ],
    calcQuote: (a) => {
      if (a.roof_type === 'Terra cotta tiles') {
        return { rerouteToService: 'roof-biocide', message: 'Terra cotta roof — redirect to Roof Biocide Treatment only. Explain this is the recommended and safer option for their roof type.' };
      }
      const bedroomKey = a.bedrooms ? (a.bedrooms === '5+ bed' ? '5+' : a.bedrooms.replace(' bed','')) : null;
      // roofSqmExact: explicit confirmed roof area from property model. Takes priority over bedroom proxy.
      const _exactRoofSqm = Number(a.roofSqmExact);
      const sqm = (Number.isFinite(_exactRoofSqm) && _exactRoofSqm > 0)
        ? Math.round(_exactRoofSqm)
        : (BEDROOM_TO_SQM[bedroomKey] || 160);
      const isDouble = a.storeys === 'Double storey';
      const ageRateMap = {
        'Under 10 years': isDouble ? price('roofCleaning.under10DoublePerSqm', 5) : price('roofCleaning.under10SinglePerSqm', 4),
        '10–20 years': isDouble ? price('roofCleaning.tenTo20DoublePerSqm', 6) : price('roofCleaning.tenTo20SinglePerSqm', 5),
        '20+ years': isDouble ? price('roofCleaning.twentyPlusDoublePerSqm', 7) : price('roofCleaning.twentyPlusSinglePerSqm', 6)
      };
      const rate = ageRateMap[a.age] || price('roofCleaning.tenTo20SinglePerSqm', 5);
      const base = sqm * rate;
      const dynamicInclusions = [
        'Complete killing and removal of lichen, moss, algae, and organic material',
        'Softwash method — safe for all roof types',
        'All methods comply with manufacturer specifications',
        'Before and after photos',
      ];
      return {
        lines: [
          { label: `Est. roof sqm (${bedroomKey} bed avg)`, value: `${sqm}sqm` },
          { label: `Softwash rate (${a.age})`, value: `$${rate.toFixed(2)}/sqm` },
          { label: 'Service subtotal', value: `$${base.toFixed(2)}` },
          base < minJob() ? { label: 'Minimum call-out applied', value: '$' + minJob().toFixed(2) } : null,
        ].filter(Boolean),
        inclusions: dynamicInclusions,
        travel: clientInfo.travelCost,
        total: Math.max(minJob(), base)
      };
    }
  },

  'roof-biocide': {
    name: 'Roof Biocide Treatment',
    steps: [
      {
        id: 'explain',
        label: 'Explain the service to the client',
        script: '"A roof biocide treatment is a specialised chemical treatment we apply directly to your roof surface. It kills all existing lichen, moss, and algae at the root — not just on the surface — and prevents regrowth for up to 2 to 4 years. You\'ll see the lichen gradually dying off over the following months. It\'s much gentler than pressure washing and completely safe for all roof types including terra cotta."',
        type: 'confirm',
        confirmLabel: 'Client understands — continue'
      },
      {
        id: 'storeys',
        label: 'How many storeys is the property?',
        script: '"How many storeys is the property?"',
        type: 'options',
        options: ['Single storey', 'Double storey', '3+ storeys', 'Commercial / Industrial'],
        onSelect: (val) => { if (val === '3+ storeys' || val === 'Commercial / Industrial') return 'custom'; }
      },
      {
        id: 'bedrooms',
        label: 'How many bedrooms does the property have?',
        script: '"How many bedrooms does the property have?"',
        type: 'options',
        options: ['2 bed', '3 bed', '4 bed', '5+ bed']
      }
    ],
    inclusions: [
      'Complete biocide treatment application across entire roof surface',
      'Kills existing lichen, moss, and algae at the root',
      'Prevents regrowth for 2–4 years',
      'Safe for all roof types including terra cotta',
      'Before and after photos'
    ],
    calcQuote: (a) => {
      const bedroomKey = a.bedrooms ? (a.bedrooms === '5+ bed' ? '5+' : a.bedrooms.replace(' bed','')) : null;
      // roofSqmExact: explicit confirmed roof area from property model. Takes priority over bedroom proxy.
      const _exactBioSqm = Number(a.roofSqmExact);
      const sqm = (Number.isFinite(_exactBioSqm) && _exactBioSqm > 0)
        ? Math.round(_exactBioSqm)
        : (BEDROOM_TO_SQM[bedroomKey] || 160);
      const rate = a.storeys === 'Double storey' ? price('roofBiocide.doublePerSqm', 3.25) : price('roofBiocide.singlePerSqm', 2);
      const base = sqm * rate;
      return {
        lines: [
          { label: `Est. roof sqm (${bedroomKey} bed avg)`, value: `${sqm}sqm` },
          { label: `Biocide rate (${a.storeys})`, value: `$${rate.toFixed(2)}/sqm` },
          { label: 'Service subtotal', value: `$${Math.max(minJob(), base).toFixed(2)}` },
        ],
        travel: clientInfo.travelCost,
        total: Math.max(minJob(), base)
      };
    }
  },

  'pressure-washing': {
    name: 'Pressure Washing',
    steps: [
      {
        id: 'surface_type',
        label: 'What are we pressure washing?',
        script: '"What are we pressure washing today — driveway, paths around the house, an entertaining area or patio, or something else?"',
        type: 'options',
        options: ['Driveway', 'Paths around the house', 'Entertaining area / patio', 'Other']
      },
      {
        id: 'painted_concrete',
        label: 'Is the surface painted concrete?',
        script: '"Just quickly — is the surface painted concrete at all?"',
        type: 'options',
        options: ['No', 'Yes — painted concrete'],
        onSelect: (val) => { if (val === 'Yes — painted concrete') return 'custom-photos'; }
      },
      {
        id: 'bedrooms',
        label: 'How many bedrooms? (for size estimate)',
        script: '"How many bedrooms does the property have? Just helps us get a size estimate."',
        type: 'options',
        options: ['2 bed', '3 bed', '4 bed', '5+ bed'],
        showIf: (a) => ['Driveway', 'Paths around the house'].includes(a.surface_type)
      },
      {
        id: 'dimensions',
        label: 'Approximate dimensions of the area?',
        script: '"Could you give me a rough idea of the size — approximately how long and wide is the area in metres?"',
        type: 'input',
        placeholder: 'e.g. 6m × 10m',
        showIf: (a) => ['Entertaining area / patio', 'Other'].includes(a.surface_type)
      },
      {
        id: 'last_wash',
        label: 'When was this area last pressure washed?',
        script: '"When was this area last pressure washed, or has it ever been done?"',
        type: 'options',
        options: ['Less than 1 year ago', '1–3 years ago', '3+ years ago / never done']
      },
      {
        id: 'staining',
        label: 'Any non-organic staining on the surface?',
        script: '"Is there any non-organic staining on the surface — things like rust, oil, paint, glue, or chemical spills?"',
        type: 'options',
        options: ['No — dirt, grime, organic growth only', 'Yes — non-organic staining present'],
        onSelect: (val) => { if (val === 'Yes — non-organic staining present') return 'custom-photos'; }
      },
      {
        id: 'biocide',
        label: 'Add biocide post-treatment?',
        script: '"We also offer a biocide post-treatment as an add-on. After we pressure wash, we apply a specialised treatment that kills any remaining organic spores and prevents moss, algae, and lichen from coming back for up to 2 to 4 years. Without it, you\'ll typically start seeing regrowth within months — especially in shaded areas. Would you like me to include that?"',
        type: 'options',
        options: ['No thanks', 'Yes — add biocide post-treatment']
      }
    ],
    inclusions: [
      'Complete pressure wash of all flat surfaces',
      'Removal of dirt, grime, debris, and organic material',
      'Before and after photos',
      'Optional biocide post-treatment: prevents regrowth for 2–4 years'
    ],
    calcQuote: (a) => {
      const rateMap = {
        'Less than 1 year ago': price('pressureWashing.lessThan1YearPerSqm', 4),
        '1–3 years ago': price('pressureWashing.oneToThreeYearsPerSqm', 4.5),
        '3+ years ago / never done': price('pressureWashing.threePlusYearsPerSqm', 5)
      };
      const rate = rateMap[a.last_wash] || price('pressureWashing.oneToThreeYearsPerSqm', 4.5);
      let sqm = 0;
      // areaSqmExact: explicit confirmed surface area from property model. Takes priority.
      const _exactAreaSqm = Number(a.areaSqmExact);
      if (Number.isFinite(_exactAreaSqm) && _exactAreaSqm > 0) {
        sqm = Math.round(_exactAreaSqm);
      } else if (a.bedrooms) {
        const key = a.bedrooms === '5+ bed' ? '5+' : a.bedrooms.replace(' bed','');
        sqm = a.surface_type === 'Driveway' ? BEDROOM_TO_SQM[key] * 0.4 : BEDROOM_TO_SQM[key] * 0.3;
        sqm = Math.round(sqm);
      } else if (a.dimensions) {
        const parts = a.dimensions.toLowerCase().replace('m','').split(/[x×]/);
        if (parts.length === 2) sqm = Math.round(parseFloat(parts[0]) * parseFloat(parts[1])) || 30;
        else sqm = 30;
      }
      const base = sqm * rate;
      const biocideRate = price('pressureWashing.biocidePerSqm', 2);
      const biocide = a.biocide === 'Yes — add biocide post-treatment' ? sqm * biocideRate : 0;
      return {
        lines: [
          { label: `Est. area`, value: `~${sqm}sqm` },
          { label: `Rate (${a.last_wash})`, value: `$${rate.toFixed(2)}/sqm` },
          { label: 'Service subtotal', value: `$${base.toFixed(2)}` },
          biocide > 0 ? { label: `Biocide post-treatment (${sqm}sqm × $${biocideRate})`, value: `$${biocide.toFixed(2)}` } : null,
          biocide === 0 && base < minJob() ? { label: 'Minimum call-out applied', value: '$' + minJob().toFixed(2) } : null,
        ].filter(Boolean),
        travel: clientInfo.travelCost,
        total: Math.max(minJob(), base + biocide),
        note: 'From price on call — confirm sqm via Google Earth and call back with confirmed total.'
      };
    }
  },

  'gutter-softwash': {
    name: 'Gutter Exterior Softwash',
    steps: [
      {
        id: 'storeys',
        label: 'How many storeys is the property?',
        script: '"How many storeys is the property?"',
        type: 'options',
        options: ['Single storey', 'Double storey', '3+ storeys', 'Commercial / Industrial'],
        onSelect: (val) => { if (val === '3+ storeys' || val === 'Commercial / Industrial') return 'custom'; }
      },
      {
        id: 'bedrooms',
        label: 'How many bedrooms does the property have?',
        script: '"How many bedrooms does the property have?"',
        type: 'options',
        options: ['2 bed', '3 bed', '4 bed', '5+ bed']
      }
    ],
    inclusions: [
      'Complete cleaning of dirt, grime, debris, and organic material from exterior gutter surfaces',
      'Before and after photos'
    ],
    calcQuote: (a) => {
      const bedroomKey = a.bedrooms ? (a.bedrooms === '5+ bed' ? '5+' : a.bedrooms.replace(' bed','')) : null;
      // gutterMetresExact override for property-model adapter
      const _exactSoftMetres = Number(a.gutterMetresExact);
      const metres = (Number.isFinite(_exactSoftMetres) && _exactSoftMetres > 0)
        ? Math.round(_exactSoftMetres)
        : (BEDROOM_TO_METRES[bedroomKey] || 62);
      const rate = a.storeys === 'Single storey' ? price('gutterSoftwash.singleStoreyPerMetre', 3) : price('gutterSoftwash.doubleStoreyPerMetre', 5);
      const base = metres * rate;
      return {
        lines: [
          { label: `Est. linear metres (${bedroomKey || '?'} bed avg)`, value: `${metres}m` },
          { label: `Rate (${a.storeys})`, value: `$${rate.toFixed(2)}/m` },
          { label: 'Service subtotal', value: `$${Math.max(minJob(), base).toFixed(2)}` },
        ],
        travel: clientInfo.travelCost,
        total: Math.max(minJob(), base)
      };
    }
  },

  'bird-proofing': {
    name: 'Solar Bird Proofing',
    steps: [
      {
        id: 'bundle_explain',
        label: 'Explain the bundle to the client',
        script: '"Our solar bird proofing is part of a complete service package. We include a full gutter clean and solar panel clean at the same time. That way the job is done to a complete standard — it also means you\'re not dealing with blocked gutters or dirty panels voiding any warranty on the proofing. It works out much better value all round."',
        type: 'confirm',
        confirmLabel: 'Client understands the bundle — continue'
      },
      {
        id: 'panels',
        label: 'How many solar panels do you have?',
        script: '"How many solar panels do you have on the roof?"',
        type: 'input',
        inputType: 'number',
        placeholder: 'e.g. 16'
      },
      {
        id: 'nesting',
        label: 'Are there currently birds nesting under the panels?',
        script: '"Are there currently any birds nesting under your panels?"',
        type: 'options',
        options: ['No', 'Yes — birds currently nesting']
      },
      {
        id: 'storeys',
        label: 'How many storeys is the property?',
        script: '"How many storeys is the property?"',
        type: 'options',
        options: ['Single storey', 'Double storey', '3+ storeys', 'Commercial / Industrial'],
        onSelect: (val) => { if (val === '3+ storeys' || val === 'Commercial / Industrial') return 'custom'; }
      },
      {
        id: 'address',
        label: 'Get full address for Google Earth measurement',
        script: '"Could I grab your full address so we can take some measurements on Google Earth and call you back with your confirmed price?"',
        type: 'input',
        placeholder: 'Full street address'
      },
      // Gutter cleaning sub-questions
      {
        id: 'bedrooms',
        label: 'How many bedrooms? (for gutter estimate)',
        script: '"How many bedrooms does the property have?"',
        type: 'options',
        options: ['2 bed', '3 bed', '4 bed', '5+ bed']
      },
      {
        id: 'gutter_guard',
        label: 'Do you have gutter guard installed?',
        script: '"Do you have any gutter guard or leaf guard installed?"',
        type: 'options',
        options: ['No', 'Yes']
      },
      {
        id: 'debris',
        label: 'When were gutters last cleaned?',
        script: '"When were your gutters last cleaned?"',
        type: 'options',
        options: ['Less than 12 months', '1–3 years ago', '3+ years ago / never']
      },
      // Solar cleaning sub-questions
      {
        id: 'last_clean',
        label: 'When were panels last cleaned?',
        script: '"And when were your solar panels last professionally cleaned, or have they ever been done?"',
        type: 'options',
        options: ['Less than 1 year ago', '1–2 years ago', '2–4 years ago', '4+ years ago / never cleaned']
      }
    ],
    inclusions: [
      'Nest and debris removal from under solar panels',
      'General clean and wash of the area under panels',
      'Full gutter clean (debris removal + downpipes flushed)',
      'Solar panel clean (purified deionised water + nylon brushes)',
      'Solar bird proofing mesh installation (linear metres around panel perimeter)',
      'From price given on call — confirmed after Google Earth measurement'
    ],
    calcQuote: (a) => {
      const panels = parseInt(a.panels) || 0;
      const bedroomKey = a.bedrooms ? (a.bedrooms === '5+ bed' ? '5+' : a.bedrooms.replace(' bed','')) : '3';
      // gutterMetresExact override for property-model adapter
      const _exactBirdMetres = Number(a.gutterMetresExact);
      const gutterMetres = (Number.isFinite(_exactBirdMetres) && _exactBirdMetres > 0)
        ? Math.round(_exactBirdMetres)
        : (BEDROOM_TO_METRES[bedroomKey] || 62);
      const isDouble = a.storeys === 'Double storey';
      const gutterRate = isDouble ? price('gutterCleaning.doubleStoreyPerMetre', 6) : price('gutterCleaning.singleStoreyPerMetre', 3);
      const guardMult = a.gutter_guard === 'Yes' ? price('gutterCleaning.gutterGuardMultiplier', 2) : 1;
      const debrisMult = a.debris === '1–3 years ago' ? price('gutterCleaning.debrisMediumMultiplier', 1.5) : a.debris === '3+ years ago / never' ? price('gutterCleaning.debrisHeavyMultiplier', 2) : 1;
      const gutterTotal = gutterMetres * gutterRate * guardMult * debrisMult;
      const panelRateMap = { 'Less than 1 year ago': price('solarCleaning.lessThan1YearPerPanel', 5.5), '1–2 years ago': price('solarCleaning.oneToTwoYearsPerPanel', 6.75), '2–4 years ago': price('solarCleaning.twoToFourYearsPerPanel', 8.25), '4+ years ago / never cleaned': price('solarCleaning.fourPlusYearsPerPanel', 10.5) };
      const panelRate = panelRateMap[a.last_clean] || price('solarCleaning.oneToTwoYearsPerPanel', 6.75);
      const panelTotal = panels * panelRate;
      const nestFee = a.nesting === 'Yes — birds currently nesting' ? price('birdProofing.nestRemovalFlat', 200) : 0;
      const meshRate = isDouble ? price('birdProofing.doubleStoreyMeshPerMetre', 55) : price('birdProofing.singleStoreyMeshPerMetre', 35);
      const meshEstimate = gutterMetres * price('birdProofing.meshEstimateMultiplier', 0.7);
      const meshEstTotal = meshEstimate * meshRate;
      return {
        lines: [
          { label: `Gutter clean (${gutterMetres}m × $${gutterRate})`, value: `$${gutterTotal.toFixed(2)}` },
          guardMult > 1 ? { label: 'Gutter guard ×2', value: '' } : null,
          debrisMult > 1 ? { label: `Debris ×${debrisMult}`, value: '' } : null,
          { label: `Solar panel clean (${panels} panels × $${panelRate})`, value: `$${panelTotal.toFixed(2)}` },
          nestFee > 0 ? { label: 'Nest/dropping removal', value: `$${nestFee.toFixed(2)}` } : null,
          { label: `Bird proofing mesh (~${Math.round(meshEstimate)}m est. × $${meshRate})`, value: `$${meshEstTotal.toFixed(2)} est.` },
        ].filter(Boolean),
        travel: clientInfo.travelCost,
        total: Math.max(minJob(), gutterTotal + panelTotal + nestFee + meshEstTotal),
        note: '⚠️ Mesh price is ESTIMATED. Measure linear metres on Google Earth and call client back with confirmed total.'
      };
    }
  }
};
