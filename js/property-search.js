/**
 * property-links-fixed.js
 * 
 * FIXES:
 * 1. Station name matching - handles variations like "Elephant & Castle" vs "Elephant and Castle"
 * 2. Both Rightmove AND Zoopla buttons always show
 * 3. Better error handling if URLs can't be generated
 * 4. Logging to diagnose issues
 */

'use strict';

// ── Rightmove station identifiers ────────────────────────────
var RIGHTMOVE_IDS = {
  'Angel': 'STATION^5336',
  'Aldgate': 'STATION^5316',
  'Aldgate East': 'STATION^5317',
  'Baker Street': 'STATION^5341',
  'Bank': 'STATION^5344',
  'Barbican': 'STATION^5346',
  'Battersea Power Station': 'STATION^5352',
  'Bermondsey': 'STATION^5367',
  'Bethnal Green': 'STATION^5368',
  'Blackfriars': 'STATION^5370',
  'Bond Street': 'STATION^5372',
  'Borough': 'STATION^5374',
  'Canary Wharf': 'STATION^5396',
  'Cannon Street': 'STATION^5397',
  'Chancery Lane': 'STATION^5403',
  'Charing Cross': 'STATION^5404',
  'Covent Garden': 'STATION^5420',
  'Dalston Junction': 'STATION^5425',
  'Elephant and Castle': 'STATION^5449',
  'Elephant & Castle': 'STATION^5449',
  'Embankment': 'STATION^5448',
  'Euston': 'STATION^5451',
  'Farringdon': 'STATION^5453',
  'Fenchurch Street': 'STATION^5452',
  'Gloucester Road': 'STATION^5458',
  'Goodge Street': 'STATION^5459',
  'Great Portland Street': 'STATION^5460',
  'Green Park': 'STATION^5462',
  'Haggerston': 'STATION^5464',
  'High Street Kensington': 'STATION^5471',
  'Highbury and Islington': 'STATION^5470',
  'Highbury & Islington': 'STATION^5470',
  'Holborn': 'STATION^5473',
  'Hoxton': 'STATION^5474',
  'Hyde Park Corner': 'STATION^5476',
  'Kennington': 'STATION^5486',
  'King\'s Cross St Pancras': 'STATION^5491',
  'Kings Cross St Pancras': 'STATION^5491',
  'Knightsbridge': 'STATION^5490',
  'Lambeth North': 'STATION^5493',
  'Lancaster Gate': 'STATION^5494',
  'Leicester Square': 'STATION^5496',
  'Liverpool Street': 'STATION^5203',
  'London Bridge': 'STATION^5201',
  'Mansion House': 'STATION^5530',
  'Marble Arch': 'STATION^5519',
  'Marylebone': 'STATION^5520',
  'Monument': 'STATION^5531',
  'Moorgate': 'STATION^5532',
  'Nine Elms': 'STATION^5261',
  'Old Street': 'STATION^5264',
  'Oxford Circus': 'STATION^5285',
  'Paddington': 'STATION^5489',
  'Piccadilly Circus': 'STATION^5503',
  'Pimlico': 'STATION^5504',
  'Regent\'s Park': 'STATION^5237',
  'Regents Park': 'STATION^5237',
  'Russell Square': 'STATION^5527',
  'Shoreditch High Street': 'STATION^5536',
  'Sloane Square': 'STATION^5544',
  'South Kensington': 'STATION^5551',
  'Southwark': 'STATION^5555',
  'St James\'s Park': 'STATION^5560',
  'St James Park': 'STATION^5560',
  'St Paul\'s': 'STATION^5561',
  'St Pauls': 'STATION^5561',
  'Stepney Green': 'STATION^5557',
  'Temple': 'STATION^5572',
  'Tower Gateway': 'STATION^5582',
  'Tower Hill': 'STATION^5581',
  'Vauxhall': 'STATION^5624',
  'Victoria': 'STATION^5626',
  'Warren Street': 'STATION^5638',
  'Waterloo': 'STATION^5230',
  'Westminster': 'STATION^5645',
  'Whitechapel': 'STATION^5647'
};

// ── Zoopla area codes ────────────────────────────────────────
var ZOOPLA_SLUGS = {
  'Angel': 'angel',
  'Aldgate': 'aldgate',
  'Aldgate East': 'aldgate-east',
  'Baker Street': 'baker-street',
  'Bank': 'bank',
  'Barbican': 'barbican',
  'Battersea Power Station': 'battersea',
  'Bermondsey': 'bermondsey',
  'Bethnal Green': 'bethnal-green',
  'Blackfriars': 'blackfriars',
  'Bond Street': 'bond-street',
  'Borough': 'borough',
  'Canary Wharf': 'canary-wharf',
  'Cannon Street': 'cannon-street',
  'Chancery Lane': 'chancery-lane',
  'Charing Cross': 'charing-cross',
  'Covent Garden': 'covent-garden',
  'Dalston Junction': 'dalston',
  'Elephant and Castle': 'elephant-and-castle',
  'Elephant & Castle': 'elephant-and-castle',
  'Embankment': 'embankment',
  'Euston': 'euston',
  'Farringdon': 'farringdon',
  'Fenchurch Street': 'fenchurch-street',
  'Gloucester Road': 'gloucester-road',
  'Goodge Street': 'goodge-street',
  'Great Portland Street': 'great-portland-street',
  'Green Park': 'green-park',
  'Haggerston': 'haggerston',
  'High Street Kensington': 'high-street-kensington',
  'Highbury and Islington': 'highbury-islington',
  'Highbury & Islington': 'highbury-islington',
  'Holborn': 'holborn',
  'Hoxton': 'hoxton',
  'Hyde Park Corner': 'hyde-park-corner',
  'Kennington': 'kennington',
  'King\'s Cross St Pancras': 'kings-cross',
  'Kings Cross St Pancras': 'kings-cross',
  'Knightsbridge': 'knightsbridge',
  'Lambeth North': 'lambeth-north',
  'Lancaster Gate': 'lancaster-gate',
  'Leicester Square': 'leicester-square',
  'Liverpool Street': 'liverpool-street',
  'London Bridge': 'london-bridge',
  'Mansion House': 'mansion-house',
  'Marble Arch': 'marble-arch',
  'Marylebone': 'marylebone',
  'Monument': 'monument',
  'Moorgate': 'moorgate',
  'Nine Elms': 'nine-elms',
  'Old Street': 'old-street',
  'Oxford Circus': 'oxford-circus',
  'Paddington': 'paddington',
  'Piccadilly Circus': 'piccadilly-circus',
  'Pimlico': 'pimlico',
  'Regent\'s Park': 'regents-park',
  'Regents Park': 'regents-park',
  'Russell Square': 'russell-square',
  'Shoreditch High Street': 'shoreditch',
  'Sloane Square': 'sloane-square',
  'South Kensington': 'south-kensington',
  'Southwark': 'southwark',
  'St James\'s Park': 'st-james-park',
  'St James Park': 'st-james-park',
  'St Paul\'s': 'st-pauls',
  'St Pauls': 'st-pauls',
  'Stepney Green': 'stepney-green',
  'Temple': 'temple',
  'Tower Gateway': 'tower-gateway',
  'Tower Hill': 'tower-hill',
  'Vauxhall': 'vauxhall',
  'Victoria': 'victoria',
  'Warren Street': 'warren-street',
  'Waterloo': 'waterloo',
  'Westminster': 'westminster',
  'Whitechapel': 'whitechapel'
};

/**
 * Normalize station name to handle variations
 * "Elephant & Castle" → "Elephant and Castle"
 * "King's Cross" → "King\'s Cross"
 */
function normalizeStationName(name) {
  // First try exact match
  if (RIGHTMOVE_IDS[name]) return name;
  
  // Try with ampersand replaced
  var normalized = name.replace(/&/g, 'and');
  if (RIGHTMOVE_IDS[normalized]) return normalized;
  
  // Try with apostrophe handling
  var withApostrophe = name.replace(/s /g, '\'s ').replace(/s'/g, '\'s');
  if (RIGHTMOVE_IDS[withApostrophe]) return withApostrophe;
  
  // Return original (will show "No match" message)
  return name;
}

function getRightmoveUrl(areaName, searchType, maxPrice, beds, radius) {
  var normalizedName = normalizeStationName(areaName);
  var id = RIGHTMOVE_IDS[normalizedName];

  if (!id) {
    console.warn('[Rightmove] No ID found for: ' + areaName);
    return null;
  }

  var r = radius || '1.0';
  // Rightmove uses 'property-for-sale' and 'property-to-rent' (not 'property-sale'/'property-rent')
  var pathType = searchType === 'rent' ? 'to-rent' : 'for-sale';
  var base = 'https://www.rightmove.co.uk/property-' + pathType + '/find.html';
  // Encode the ^ character in station IDs
  var encodedId = id.replace('^', '%5E');
  var params = '?locationIdentifier=' + encodedId + '&radius=' + r;

  if (beds && beds !== 'any') {
    params += '&minBedrooms=' + beds + '&maxBedrooms=' + beds;
  }
  if (maxPrice && maxPrice !== 'any') {
    params += '&maxPrice=' + maxPrice;
  }
  params += '&sortType=6';

  return base + params;
}

function getZooplaUrl(areaName, searchType, maxPrice, beds, radius) {
  var normalizedName = normalizeStationName(areaName);
  var type = searchType === 'rent' ? 'to-rent' : 'for-sale';

  // Build area slug: lowercase, hyphens, no special chars
  var areaSlug = normalizedName.toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  // Beds segment in path (singular/plural)
  var bedsSegment = (beds && beds !== 'any')
    ? beds + (beds === '1' ? '-bedroom' : '-bedrooms') + '/'
    : '';

  var path = type + '/property/' + bedsSegment + 'london/' + areaSlug + '/';

  // Query params
  var qParts = [];
  if (maxPrice && maxPrice !== 'any') qParts.push('price_max=' + maxPrice);
  qParts.push('q=' + encodeURIComponent(normalizedName + ', London'));
  qParts.push('radius=' + (radius || '1'));
  qParts.push('search_source=' + type);

  return 'https://www.zoopla.co.uk/' + path + '?' + qParts.join('&');
}

// Make these globally available for map.js to call
window.getRightmoveUrl = getRightmoveUrl;
window.getZooplaUrl = getZooplaUrl;
window.normalizeStationName = normalizeStationName;
