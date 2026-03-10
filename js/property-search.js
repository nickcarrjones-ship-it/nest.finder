/**
 * property-search.js
 * ─────────────────────────────────────────────────────────────
 * Generates property search URLs for Rightmove and Zoopla
 * with correct radius (from user's walk distance setting)
 * ─────────────────────────────────────────────────────────────
 */

'use strict';

// Rightmove station IDs — these are internal identifiers Rightmove uses
var RIGHTMOVE_IDS = {
  'Angel': 'STATION^5336', 'Old Street': 'STATION^5264', 'Shoreditch High Street': 'STATION^5536',
  'Bethnal Green': 'STATION^5368', 'Whitechapel': 'STATION^5647', 'Aldgate': 'STATION^5316',
  'Aldgate East': 'STATION^5317', 'Bank': 'STATION^5344', 'Canary Wharf': 'STATION^5396',
  'London Bridge': 'STATION^5201', 'Borough': 'STATION^5374', 'Elephant & Castle': 'STATION^5449',
  'Bermondsey': 'STATION^5367', 'Southwark': 'STATION^5555', 'Kennington': 'STATION^5486',
  'Stockwell': 'STATION^5559', 'Brixton': 'STATION^5378', 'Clapham Common': 'STATION^5412',
  'Clapham South': 'STATION^5413', 'Clapham North': 'STATION^5411', 'Clapham Junction': 'STATION^5414',
  'Balham': 'STATION^5342', 'Tooting': 'STATION^5579', 'Wandsworth': 'STATION^5637',
  'Putney': 'STATION^5515', 'Vauxhall': 'STATION^5624', 'Pimlico': 'STATION^5504',
  'Victoria': 'STATION^5626', 'Westminster': 'STATION^5645', 'Green Park': 'STATION^5462',
  'Hyde Park Corner': 'STATION^5476', 'Knightsbridge': 'STATION^5490',
  'Sloane Square': 'STATION^5544', 'South Kensington': 'STATION^5551',
  'Gloucester Road': 'STATION^5458', 'High Street Kensington': 'STATION^5471',
  'Earl\'s Court': 'STATION^5444', 'Hammersmith': 'STATION^5466', 'Paddington': 'STATION^5489',
  'Marylebone': 'STATION^5520', 'Baker Street': 'STATION^5341', 'Bond Street': 'STATION^5372',
  'Oxford Circus': 'STATION^5285', 'Euston': 'STATION^5451', 'Warren Street': 'STATION^5638',
  'Goodge Street': 'STATION^5459', 'Holborn': 'STATION^5473', 'Chancery Lane': 'STATION^5403',
  'Russell Square': 'STATION^5527', 'King\'s Cross St Pancras': 'STATION^5491',
  'Farringdon': 'STATION^5453', 'Barbican': 'STATION^5346', 'Moorgate': 'STATION^5532',
  'Liverpool Street': 'STATION^5203', 'Haggerston': 'STATION^5464', 'Hoxton': 'STATION^5474',
  'Dalston Junction': 'STATION^5425', 'Highbury & Islington': 'STATION^5470',
  'Nine Elms': 'STATION^5261', 'Battersea Power Station': 'STATION^5352',
  'Lambeth North': 'STATION^5493', 'Embankment': 'STATION^5448', 'Temple': 'STATION^5572',
  'Blackfriars': 'STATION^5370', 'Tower Hill': 'STATION^5581', 'Monument': 'STATION^5531',
  'Cannon Street': 'STATION^5397', 'St Paul\'s': 'STATION^5561', 'Covent Garden': 'STATION^5420',
  'Leicester Square': 'STATION^5496', 'Piccadilly Circus': 'STATION^5503',
  'Charing Cross': 'STATION^5404', 'Lancaster Gate': 'STATION^5494', 'Marble Arch': 'STATION^5519',
  'Waterloo': 'STATION^5230', 'Stratford': 'STATION^5564', 'Hackney Central': 'STATION^5463',
  'Regent\'s Park': 'STATION^5237'
};

// Zoopla area codes (these are different — Zoopla uses area names or postcodes)
// For simplicity, we'll use the station name directly in the URL
var ZOOPLA_IDS = {
  'Angel': 'angel',
  'Old Street': 'old-street',
  'Bethnal Green': 'bethnal-green',
  'Whitechapel': 'whitechapel',
  'Aldgate': 'aldgate',
  'Bank': 'bank',
  'Canary Wharf': 'canary-wharf',
  'London Bridge': 'london-bridge',
  'Borough': 'borough',
  'Elephant & Castle': 'elephant-and-castle',
  'Bermondsey': 'bermondsey',
  'Southwark': 'southwark',
  'Kennington': 'kennington',
  'Vauxhall': 'vauxhall',
  'Pimlico': 'pimlico',
  'Victoria': 'victoria',
  'Westminster': 'westminster',
  'Sloane Square': 'sloane-square',
  'South Kensington': 'south-kensington',
  'Gloucester Road': 'gloucester-road',
  'High Street Kensington': 'high-street-kensington',
  'Earl\'s Court': 'earls-court',
  'Paddington': 'paddington',
  'Marylebone': 'marylebone',
  'Baker Street': 'baker-street',
  'Bond Street': 'bond-street',
  'Oxford Circus': 'oxford-circus',
  'Euston': 'euston',
  'Warren Street': 'warren-street',
  'Goodge Street': 'goodge-street',
  'Holborn': 'holborn',
  'Chancery Lane': 'chancery-lane',
  'Russell Square': 'russell-square',
  'King\'s Cross St Pancras': 'kings-cross',
  'Farringdon': 'farringdon',
  'Barbican': 'barbican',
  'Moorgate': 'moorgate',
  'Liverpool Street': 'liverpool-street',
  'Haggerston': 'haggerston',
  'Hoxton': 'hoxton',
  'Dalston Junction': 'dalston',
  'Highbury & Islington': 'highbury-and-islington',
  'Nine Elms': 'nine-elms',
  'Battersea Power Station': 'battersea',
  'Lambeth North': 'lambeth-north',
  'Embankment': 'embankment',
  'Temple': 'temple',
  'Blackfriars': 'blackfriars',
  'Tower Hill': 'tower-hill',
  'Monument': 'monument',
  'Cannon Street': 'cannon-street',
  'St Paul\'s': 'st-pauls',
  'Covent Garden': 'covent-garden',
  'Leicester Square': 'leicester-square',
  'Piccadilly Circus': 'piccadilly-circus',
  'Charing Cross': 'charing-cross',
  'Lancaster Gate': 'lancaster-gate',
  'Marble Arch': 'marble-arch',
  'Waterloo': 'waterloo',
  'Regent\'s Park': 'regents-park'
};

/**
 * convertKmToMiles(km)
 * Convert kilometers to miles (for Rightmove radius)
 * 1 km = 0.621371 miles
 */
function convertKmToMiles(km) {
  return parseFloat((km * 0.621371).toFixed(2));
}

/**
 * generateRightmoveUrl(stationName, searchType, maxPrice, beds, walkKm)
 * 
 * Generates a Rightmove property search URL with:
 * - Station location ID
 * - Radius set to the walk distance (converted to miles)
 * - Price filter
 * - Bedroom filter
 * 
 * @param {string} stationName - The station name (e.g. "Angel")
 * @param {string} searchType  - 'rent' or 'sale'
 * @param {string} maxPrice    - Max price (e.g. "2000" for rent or "500000" for sale)
 * @param {string} beds        - Number of beds ('1', '2', '3', '4', or 'any')
 * @param {number} walkKm      - Walk distance from home to station in km
 * @returns {string|null} URL or null if station not found
 */
function generateRightmoveUrl(stationName, searchType, maxPrice, beds, walkKm) {
  var stationId = RIGHTMOVE_IDS[stationName];
  if (!stationId) return null;

  var base = 'https://www.rightmove.co.uk/property-' + searchType + '/find.html';
  var radiusMiles = convertKmToMiles(walkKm);
  
  var params = '?locationIdentifier=' + stationId + '&radius=' + radiusMiles;

  if (beds && beds !== 'any') {
    params += '&minBedrooms=' + beds + '&maxBedrooms=' + beds;
  }

  if (maxPrice && maxPrice !== 'any') {
    params += '&maxPrice=' + maxPrice;
  }

  return base + params;
}

/**
 * generateZooplaUrl(stationName, searchType, maxPrice, beds, walkKm)
 * 
 * Generates a Zoopla property search URL with:
 * - Station area ID
 * - Radius set to the walk distance (in km)
 * - Price filter
 * - Bedroom filter
 * 
 * @param {string} stationName - The station name (e.g. "Angel")
 * @param {string} searchType  - 'rent' or 'sale'
 * @param {string} maxPrice    - Max price (e.g. "2000" for rent or "500000" for sale)
 * @param {string} beds        - Number of beds ('1', '2', '3', '4', or 'any')
 * @param {number} walkKm      - Walk distance from home to station in km
 * @returns {string|null} URL or null if station not found
 */
function generateZooplaUrl(stationName, searchType, maxPrice, beds, walkKm) {
  var areaId = ZOOPLA_IDS[stationName];
  if (!areaId) return null;

  var searchTypeZoopla = searchType === 'rent' ? 'rent' : 'for-sale';
  var base = 'https://www.zoopla.co.uk/property/' + searchTypeZoopla + '/' + areaId + '/';
  
  var params = [];

  // Add radius in km
  params.push('radius=' + walkKm);

  // Add max price
  if (maxPrice && maxPrice !== 'any') {
    if (searchType === 'rent') {
      params.push('price_max=' + maxPrice);
    } else {
      params.push('price_max=' + maxPrice);
    }
  }

  // Add beds
  if (beds && beds !== 'any') {
    params.push('beds_min=' + beds + '&beds_max=' + beds);
  }

  return base + (params.length > 0 ? '?' + params.join('&') : '');
}

/**
 * openPropertySearch(stationName, searchType, maxPrice, beds, walkKm)
 * 
 * Opens both Rightmove and Zoopla URLs (or just opens the one that has
 * a valid station ID). Could be called from a "View Properties" button.
 */
function openPropertySearch(stationName, searchType, maxPrice, beds, walkKm) {
  var rmUrl = generateRightmoveUrl(stationName, searchType, maxPrice, beds, walkKm);
  var zpUrl = generateZooplaUrl(stationName, searchType, maxPrice, beds, walkKm);

  // Try Rightmove first, fall back to Zoopla
  if (rmUrl) {
    window.open(rmUrl, '_blank');
  } else if (zpUrl) {
    window.open(zpUrl, '_blank');
  } else {
    alert('Property search not available for ' + stationName + '.');
  }
}

// Make functions globally available
window.generateRightmoveUrl = generateRightmoveUrl;
window.generateZooplaUrl = generateZooplaUrl;
window.openPropertySearch = openPropertySearch;
