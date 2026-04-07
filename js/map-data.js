// ── GYM BRANDS data ───────────────────────────────────────────
// Logos embedded as base64. gymFilter state controls distance filtering.
// gymFilter is a per-member array: [{ brand: null, km: 1 }, ...].
// Initialised as empty; populated in buildGymToggles() once profile is loaded.
var gymFilter = [];

var GYM_BRANDS = {
  virginactive: {
    name: 'Virgin Active',
    logo: GYM_LOGOS.virginactive,
    color: '#dc2626',
    locations: [{"name":"Virgin Active Barbican","lat":51.5203,"lng":-0.0978},{"name":"Virgin Active Islington","lat":51.5356,"lng":-0.1038},{"name":"Virgin Active Victoria","lat":51.4965,"lng":-0.1445},{"name":"Virgin Active Holborn","lat":51.5176,"lng":-0.1101},{"name":"Virgin Active Fulham","lat":51.4808,"lng":-0.1978}]
  },
  onerebe: {
    name: '1Rebel',
    logo: GYM_LOGOS.onerebe,
    color: '#222222',
    locations: [{"name":"1Rebel Oxford Circus","lat":51.515742,"lng":-0.144505},{"name":"1Rebel Holborn","lat":51.516645,"lng":-0.124015},{"name":"1Rebel Victoria","lat":51.497161,"lng":-0.14298},{"name":"1Rebel Chelsea","lat":51.488686,"lng":-0.165391},{"name":"1Rebel Clapham","lat":51.463012,"lng":-0.134227}]
  },
  f45: {
    name: 'F45',
    logo: GYM_LOGOS.f45,
    color: '#1a237e',
    locations: [{"name":"F45 Oxford Circus","lat":51.517408,"lng":-0.140404},{"name":"F45 Battersea Park","lat":51.479441,"lng":-0.148613},{"name":"F45 Old Street","lat":51.524953,"lng":-0.090424},{"name":"F45 Chelsea","lat":51.48428,"lng":-0.176546},{"name":"F45 Brixton","lat":51.471766,"lng":-0.112938},{"name":"F45 Fulham","lat":51.48238,"lng":-0.199777}]
  },
  thirdspace: {
    name: 'Third Space',
    logo: GYM_LOGOS.thirdspace,
    color: '#000000',
    locations: [{"name":"Third Space Soho","lat":51.51127,"lng":-0.135746},{"name":"Third Space Mayfair","lat":51.507581,"lng":-0.145922},{"name":"Third Space Marylebone","lat":51.517991,"lng":-0.150586},{"name":"Third Space City","lat":51.510258,"lng":-0.080543},{"name":"Third Space Battersea","lat":51.480444,"lng":-0.143762},{"name":"Third Space Islington","lat":51.538906,"lng":-0.103695},{"name":"Third Space Clapham Junction","lat":51.463636,"lng":-0.16753},{"name":"Third Space Canary Wharf","lat":51.504786,"lng":-0.016741},{"name":"Third Space Wimbledon","lat":51.421891,"lng":-0.204202},{"name":"Third Space Richmond","lat":51.460292,"lng":-0.306152}]
  },
  psycle: {
    name: 'Psycle',
    logo: GYM_LOGOS.psycle,
    color: '#000000',
    locations: [{"name":"Psycle Oxford Circus","lat":51.5175,"lng":-0.1421},{"name":"Psycle Shoreditch","lat":51.5242,"lng":-0.0791},{"name":"Psycle Clapham","lat":51.4600,"lng":-0.1572},{"name":"Psycle Notting Hill","lat":51.5133,"lng":-0.1878},{"name":"Psycle Victoria","lat":51.4938,"lng":-0.1477},{"name":"Psycle Bank","lat":51.5147,"lng":-0.0889},{"name":"Psycle London Bridge","lat":51.5045,"lng":-0.0865}]
  }
};

// ── Council Tax 2024/25 — Band D annual (London boroughs) ────
// Source: GLA / individual council published rates
// 2024/25 Band D council tax (annual), ranked cheapest → most expensive across 33 London authorities
var COUNCIL_TAX = {
  'Wandsworth':            { annual: 845,  rank: 1  },
  'Westminster':           { annual: 871,  rank: 2  },
  'City of London':        { annual: 1017, rank: 3  },
  'Hammersmith and Fulham':{ annual: 1471, rank: 4  },
  'Kensington and Chelsea':{ annual: 1589, rank: 5  },
  'Barking and Dagenham':  { annual: 1789, rank: 6  },
  'Newham':                { annual: 1804, rank: 7  },
  'Havering':              { annual: 1821, rank: 8  },
  'Bexley':                { annual: 1832, rank: 9  },
  'Croydon':               { annual: 1839, rank: 10 },
  'Sutton':                { annual: 1851, rank: 11 },
  'Enfield':               { annual: 1864, rank: 12 },
  'Waltham Forest':        { annual: 1871, rank: 13 },
  'Hillingdon':            { annual: 1889, rank: 14 },
  'Bromley':               { annual: 1893, rank: 15 },
  'Redbridge':             { annual: 1902, rank: 16 },
  'Harrow':                { annual: 1918, rank: 17 },
  'Ealing':                { annual: 1921, rank: 18 },
  'Hounslow':              { annual: 1934, rank: 19 },
  'Barnet':                { annual: 1952, rank: 20 },
  'Greenwich':             { annual: 1961, rank: 21 },
  'Lewisham':              { annual: 1974, rank: 22 },
  'Haringey':              { annual: 1989, rank: 23 },
  'Merton':                { annual: 1998, rank: 24 },
  'Southwark':             { annual: 2001, rank: 25 },
  'Tower Hamlets':         { annual: 2013, rank: 26 },
  'Hackney':               { annual: 2019, rank: 27 },
  'Lambeth':               { annual: 2034, rank: 28 },
  'Brent':                 { annual: 2041, rank: 29 },
  'Islington':             { annual: 2058, rank: 30 },
  'Richmond upon Thames':  { annual: 2119, rank: 31 },
  'Kingston upon Thames':  { annual: 2201, rank: 32 },
  'Camden':                { annual: 2289, rank: 33 }
};

// Map station names to London boroughs for council tax lookup
var STATION_BOROUGH = {
  // Central / City
  'Angel': 'Islington', 'Old Street': 'Islington', 'Shoreditch High Street': 'Tower Hamlets',
  'Bethnal Green': 'Tower Hamlets', 'Whitechapel': 'Tower Hamlets', 'Stepney Green': 'Tower Hamlets',
  'Aldgate': 'City of London', 'Aldgate East': 'Tower Hamlets', 'Bank': 'City of London',
  'Monument': 'City of London', 'Mansion House': 'City of London', 'Cannon Street': 'City of London',
  'Blackfriars': 'City of London', 'City Thameslink': 'City of London', 'St Pauls': 'City of London',
  'Fenchurch Street': 'City of London', 'Tower Gateway': 'Tower Hamlets',
  'Tower Hill': 'Tower Hamlets', 'Moorgate': 'City of London', 'Barbican': 'City of London',
  'Farringdon': 'Islington', 'Chancery Lane': 'Camden', 'Holborn': 'Camden',
  'Covent Garden': 'Westminster', 'Leicester Square': 'Westminster',
  'Piccadilly Circus': 'Westminster', 'Charing Cross': 'Westminster',
  'Embankment': 'Westminster', 'Temple': 'Westminster',
  // Westminster / West End
  'Paddington': 'Westminster', 'Edgware Road': 'Westminster', 'Marylebone': 'Westminster',
  'Baker Street': 'Westminster', 'Bond Street': 'Westminster', 'Oxford Circus': 'Westminster',
  'Regent\'s Park': 'Westminster', 'Regents Park': 'Westminster',
  'Great Portland Street': 'Westminster', 'Warren Street': 'Camden',
  'Victoria': 'Westminster', 'Westminster': 'Westminster',
  'St James\'s Park': 'Westminster', 'St James Park': 'Westminster',
  'Green Park': 'Westminster', 'Hyde Park Corner': 'Westminster',
  'Pimlico': 'Westminster', 'Vauxhall': 'Lambeth',
  'Lancaster Gate': 'Westminster', 'Marble Arch': 'Westminster',
  'Tottenham Court Road': 'Camden', 'Goodge Street': 'Camden',
  // Camden / Euston
  'Euston': 'Camden', 'Euston Square': 'Camden', 'Kings Cross St Pancras': 'Camden',
  'King\'s Cross St Pancras': 'Camden', 'Russell Square': 'Camden',
  'Camden Town': 'Camden', 'Chalk Farm': 'Camden', 'Belsize Park': 'Camden',
  'Hampstead': 'Camden', 'Kentish Town': 'Camden', 'Gospel Oak': 'Camden',
  'Tufnell Park': 'Islington', 'Archway': 'Islington',
  'Highgate': 'Haringey', 'East Finchley': 'Barnet', 'Finchley Central': 'Barnet',
  'West Finchley': 'Barnet', 'Mill Hill East': 'Barnet', 'Finchley Road': 'Camden',
  'Swiss Cottage': 'Camden', 'South Hampstead': 'Camden', 'West Hampstead': 'Camden',
  'Kilburn': 'Brent', 'Brondesbury': 'Brent', 'Brondesbury Park': 'Brent',
  'Kensal Rise': 'Brent', 'Kensal Green': 'Kensington and Chelsea',
  // Islington / Hackney / Tower Hamlets
  'Liverpool Street': 'City of London', 'Haggerston': 'Hackney', 'Hoxton': 'Hackney',
  'Dalston Junction': 'Hackney', 'Dalston Kingsland': 'Hackney',
  'Hackney Central': 'Hackney', 'Hackney Wick': 'Hackney', 'London Fields': 'Hackney',
  'Highbury and Islington': 'Islington', 'Highbury & Islington': 'Islington',
  'Canonbury': 'Islington', 'Essex Road': 'Islington', 'Caledonian Road': 'Islington',
  'Caledonian Road & Barnsbury': 'Islington', 'Barnsbury': 'Islington',
  'Drayton Park': 'Islington', 'Arsenal': 'Islington', 'Finsbury Park': 'Islington',
  'Manor House': 'Haringey', 'Seven Sisters': 'Haringey', 'South Tottenham': 'Haringey',
  'Stamford Hill': 'Hackney', 'Stoke Newington': 'Hackney', 'Rectory Road': 'Hackney',
  'Clapton': 'Hackney', 'Hackney Downs': 'Hackney', 'Upper Clapton': 'Hackney',
  'Wapping': 'Tower Hamlets', 'Shadwell': 'Tower Hamlets', 'Limehouse': 'Tower Hamlets',
  'Canary Wharf': 'Tower Hamlets', 'Heron Quays': 'Tower Hamlets',
  'Westferry': 'Tower Hamlets', 'Poplar': 'Tower Hamlets', 'Bow Church': 'Tower Hamlets',
  'Bow Road': 'Tower Hamlets', 'Mile End': 'Tower Hamlets', 'Bethnal Green': 'Tower Hamlets',
  'Cambridge Heath': 'Tower Hamlets', 'London Fields': 'Hackney',
  'Devons Road': 'Tower Hamlets', 'Langdon Park': 'Tower Hamlets',
  'All Saints': 'Tower Hamlets', 'East India': 'Tower Hamlets',
  'Canning Town': 'Newham', 'West Silvertown': 'Newham', 'Pontoon Dock': 'Newham',
  // Stratford / Newham / East London
  'Stratford': 'Newham', 'West Ham': 'Newham', 'Upton Park': 'Newham',
  'East Ham': 'Newham', 'Plaistow': 'Newham', 'Forest Gate': 'Newham',
  'Wanstead Park': 'Newham', 'Woodgrange Park': 'Newham', 'Manor Park': 'Newham',
  'Maryland': 'Newham', 'Stratford International': 'Newham',
  'Pudding Mill Lane': 'Tower Hamlets', 'Star Lane': 'Newham',
  'Abbey Road': 'Newham', 'Beckton': 'Newham', 'Cyprus': 'Newham',
  'Gallions Reach': 'Newham', 'Crossharbour': 'Tower Hamlets',
  'Mudchute': 'Tower Hamlets', 'Island Gardens': 'Tower Hamlets',
  'Cutty Sark': 'Greenwich', 'Greenwich': 'Greenwich', 'Deptford Bridge': 'Lewisham',
  'Elverson Road': 'Lewisham', 'Lewisham': 'Lewisham',
  // Southwark / Lambeth / Bermondsey
  'London Bridge': 'Southwark', 'Borough': 'Southwark',
  'Elephant and Castle': 'Southwark', 'Elephant & Castle': 'Southwark',
  'Bermondsey': 'Southwark', 'Southwark': 'Southwark',
  'Canada Water': 'Southwark', 'Surrey Quays': 'Southwark', 'Rotherhithe': 'Southwark',
  'New Cross': 'Lewisham', 'New Cross Gate': 'Lewisham', 'Brockley': 'Lewisham',
  'Honor Oak Park': 'Lewisham', 'Forest Hill': 'Lewisham',
  'Peckham Rye': 'Southwark', 'Peckham': 'Southwark', 'Queens Road Peckham': 'Southwark',
  'Loughborough Junction': 'Lambeth', 'Denmark Hill': 'Southwark',
  'Herne Hill': 'Lambeth', 'North Dulwich': 'Southwark', 'East Dulwich': 'Southwark',
  'West Dulwich': 'Lambeth', 'Tulse Hill': 'Lambeth', 'Streatham': 'Lambeth',
  'Streatham Common': 'Lambeth', 'Streatham Hill': 'Lambeth',
  'Gipsy Hill': 'Lambeth', 'Crystal Palace': 'Bromley',
  'Waterloo': 'Lambeth', 'Lambeth North': 'Lambeth', 'Kennington': 'Lambeth',
  'Stockwell': 'Lambeth', 'Brixton': 'Lambeth', 'Clapham': 'Lambeth',
  'Clapham Common': 'Lambeth', 'Clapham South': 'Lambeth', 'Clapham North': 'Lambeth',
  'Brixton': 'Lambeth', 'Loughborough Junction': 'Lambeth',
  // Wandsworth / Battersea / SW
  'Clapham Junction': 'Wandsworth', 'Balham': 'Wandsworth', 'Tooting': 'Wandsworth',
  'Tooting Broadway': 'Merton', 'Tooting Bec': 'Wandsworth',
  'Wandsworth': 'Wandsworth', 'Wandsworth Common': 'Wandsworth',
  'Wandsworth Road': 'Lambeth', 'Wandsworth Town': 'Wandsworth',
  'Putney': 'Wandsworth', 'East Putney': 'Wandsworth', 'Putney Bridge': 'Hammersmith and Fulham',
  'Nine Elms': 'Wandsworth', 'Battersea Power Station': 'Wandsworth',
  'Queenstown Road': 'Wandsworth', 'Battersea Park': 'Wandsworth',
  'Earlsfield': 'Wandsworth', 'Haydons Road': 'Merton',
  'Wimbledon': 'Merton', 'Wimbledon Chase': 'Merton', 'South Wimbledon': 'Merton',
  'Colliers Wood': 'Merton', 'Morden': 'Merton', 'Morden Road': 'Merton',
  'Mitcham': 'Merton', 'Mitcham Junction': 'Merton', 'Beddington Lane': 'Merton',
  'Phipps Bridge': 'Merton', 'Belgrave Walk': 'Merton',
  // Kensington / Chelsea / Fulham
  'Knightsbridge': 'Kensington and Chelsea', 'Sloane Square': 'Kensington and Chelsea',
  'South Kensington': 'Kensington and Chelsea', 'Gloucester Road': 'Kensington and Chelsea',
  'High Street Kensington': 'Kensington and Chelsea', 'Earls Court': 'Kensington and Chelsea',
  'West Brompton': 'Kensington and Chelsea', 'Kensington Olympia': 'Kensington and Chelsea',
  'West Kensington': 'Hammersmith and Fulham', 'Barons Court': 'Hammersmith and Fulham',
  'Fulham Broadway': 'Hammersmith and Fulham', 'Parsons Green': 'Hammersmith and Fulham',
  'Hammersmith': 'Hammersmith and Fulham', 'Ravenscourt Park': 'Hammersmith and Fulham',
  'Stamford Brook': 'Hounslow', 'Turnham Green': 'Hounslow',
  'Gunnersbury': 'Hounslow', 'Kew Gardens': 'Richmond upon Thames',
  'Richmond': 'Richmond upon Thames', 'Mortlake': 'Richmond upon Thames',
  'Barnes': 'Richmond upon Thames', 'Barnes Bridge': 'Richmond upon Thames',
  'Chiswick': 'Hounslow', 'Chiswick Park': 'Hounslow',
  // Shepherd's Bush / Notting Hill / Brent
  'Shepherds Bush': 'Hammersmith and Fulham', 'Shepherd\'s Bush Market': 'Hammersmith and Fulham',
  'Wood Lane': 'Hammersmith and Fulham', 'Latimer Road': 'Kensington and Chelsea',
  'Ladbroke Grove': 'Kensington and Chelsea', 'Notting Hill Gate': 'Kensington and Chelsea',
  'Westbourne Park': 'Kensington and Chelsea', 'Royal Oak': 'Westminster',
  // Brent / Harrow / Wembley
  'Wembley': 'Brent', 'Wembley Central': 'Brent', 'Wembley Stadium': 'Brent',
  'North Wembley': 'Brent', 'South Kenton': 'Brent', 'Kenton': 'Harrow',
  'Harrow and Wealdstone': 'Harrow', 'Harrow-on-the-Hill': 'Harrow',
  'North Harrow': 'Harrow', 'Rayners Lane': 'Harrow',
  'Queensbury': 'Harrow', 'Kingsbury': 'Brent', 'Neasden': 'Brent',
  'Dollis Hill': 'Brent', 'Willesden Green': 'Brent', 'Willesden Junction': 'Brent',
  'Stonebridge Park': 'Brent', 'Harlesden': 'Brent', 'Kensal Green': 'Brent',
  // Ealing / Acton
  'Ealing Broadway': 'Ealing', 'Ealing Common': 'Ealing', 'West Ealing': 'Ealing',
  'Hanwell': 'Ealing', 'Southall': 'Ealing', 'Hayes & Harlington': 'Hillingdon',
  'West Drayton': 'Hillingdon', 'Langley': 'Slough',
  'North Acton': 'Ealing', 'East Acton': 'Ealing', 'Acton Town': 'Ealing',
  'Acton Central': 'Ealing', 'South Acton': 'Ealing', 'Acton Main Line': 'Ealing',
  'Park Royal': 'Ealing', 'Hanger Lane': 'Ealing', 'Perivale': 'Ealing',
  'Greenford': 'Ealing', 'Northolt': 'Ealing', 'South Ruislip': 'Hillingdon',
  'Ruislip Gardens': 'Hillingdon', 'West Ruislip': 'Hillingdon',
  'Ruislip': 'Hillingdon', 'Ruislip Manor': 'Hillingdon', 'Ickenham': 'Hillingdon',
  'Hillingdon': 'Hillingdon', 'Uxbridge': 'Hillingdon',
  // Hounslow / Richmond / TW
  'Hounslow': 'Hounslow', 'Hounslow Central': 'Hounslow', 'Hounslow East': 'Hounslow',
  'Hounslow West': 'Hounslow', 'Hatton Cross': 'Hillingdon',
  'Heathrow Terminals 2 & 3': 'Hillingdon', 'Heathrow Terminal 4': 'Hillingdon',
  'Heathrow Terminal 5': 'Hillingdon', 'Twickenham': 'Richmond upon Thames',
  'Strawberry Hill': 'Richmond upon Thames', 'Fulwell': 'Richmond upon Thames',
  'Kingston': 'Kingston upon Thames', 'Norbiton': 'Kingston upon Thames',
  'New Malden': 'Kingston upon Thames', 'Berrylands': 'Kingston upon Thames',
  'Surbiton': 'Kingston upon Thames', 'Tolworth': 'Kingston upon Thames',
  'Chessington North': 'Kingston upon Thames', 'Chessington South': 'Kingston upon Thames',
  // Merton / Sutton / Croydon
  'Morden South': 'Merton', 'St Helier': 'Merton', 'Sutton Common': 'Sutton',
  'Sutton': 'Sutton', 'Carshalton': 'Sutton', 'Carshalton Beeches': 'Sutton',
  'Wallington': 'Sutton', 'Waddon': 'Croydon', 'West Croydon': 'Croydon',
  'Croydon': 'Croydon', 'East Croydon': 'Croydon', 'South Croydon': 'Croydon',
  'Sanderstead': 'Croydon', 'Purley': 'Croydon', 'Purley Oaks': 'Croydon',
  'Selsdon': 'Croydon', 'Addington Village': 'Croydon', 'Fieldway': 'Croydon',
  'New Addington': 'Croydon', 'Beddington Lane': 'Croydon', 'Ampere Way': 'Croydon',
  'Therapia Lane': 'Croydon', 'Mitcham Eastfields': 'Merton',
  'Norwood Junction': 'Croydon', 'Selhurst': 'Croydon',
  // Greenwich / Bexley / SE London
  'Woolwich': 'Greenwich', 'Woolwich Arsenal': 'Greenwich',
  'Plumstead': 'Greenwich', 'Abbey Wood': 'Greenwich', 'Thamesmead': 'Greenwich',
  'Charlton': 'Greenwich', 'Westcombe Park': 'Greenwich', 'Maze Hill': 'Greenwich',
  'Blackheath': 'Greenwich', 'Kidbrooke': 'Greenwich', 'Eltham': 'Greenwich',
  'Mottingham': 'Bromley', 'Hither Green': 'Lewisham', 'Lee': 'Lewisham',
  'Grove Park': 'Lewisham', 'Sydenham': 'Lewisham', 'Lower Sydenham': 'Lewisham',
  'Bell Green': 'Lewisham', 'Catford': 'Lewisham', 'Catford Bridge': 'Lewisham',
  'Ladywell': 'Lewisham', 'Crofton Park': 'Lewisham',
  'Bexleyheath': 'Bexley', 'Bexley': 'Bexley', 'Sidcup': 'Bexley',
  'Albany Park': 'Bexley', 'Barnehurst': 'Bexley', 'Erith': 'Bexley',
  // North London / Haringey / Enfield
  'Wood Green': 'Haringey', 'Bounds Green': 'Haringey', 'Arnos Grove': 'Enfield',
  'Palmers Green': 'Enfield', 'Winchmore Hill': 'Enfield', 'Grange Park': 'Enfield',
  'Enfield Chase': 'Enfield', 'Enfield Town': 'Enfield',
  'Bowes Park': 'Haringey', 'Alexandra Palace': 'Haringey',
  'Tottenham': 'Haringey', 'Tottenham Hale': 'Haringey', 'Blackhorse Road': 'Waltham Forest',
  'Walthamstow Central': 'Waltham Forest', 'Walthamstow Queens Road': 'Waltham Forest',
  'Wood Street': 'Waltham Forest', 'Highams Park': 'Waltham Forest',
  'Chingford': 'Waltham Forest', 'Leyton': 'Waltham Forest', 'Leytonstone': 'Waltham Forest',
  'Leyton Midland Road': 'Waltham Forest', 'Wanstead': 'Redbridge',
  'Snaresbrook': 'Redbridge', 'South Woodford': 'Redbridge', 'Woodford': 'Redbridge',
  'Buckhurst Hill': 'Epping Forest', 'Loughton': 'Epping Forest', 'Debden': 'Epping Forest',
  'Theydon Bois': 'Epping Forest', 'Epping': 'Epping Forest',
  'Grange Hill': 'Redbridge', 'Hainault': 'Redbridge', 'Fairlop': 'Redbridge',
  'Barkingside': 'Redbridge', 'Newbury Park': 'Redbridge', 'Seven Kings': 'Redbridge',
  'Goodmayes': 'Redbridge', 'Chadwell Heath': 'Barking and Dagenham',
  'Romford': 'Havering', 'Gidea Park': 'Havering', 'Harold Wood': 'Havering',
  'Emerson Park': 'Havering', 'Elm Park': 'Havering', 'Hornchurch': 'Havering',
  'Upminster Bridge': 'Havering', 'Upminster': 'Havering',
  'Barking': 'Barking and Dagenham', 'Upney': 'Barking and Dagenham',
  'Becontree': 'Barking and Dagenham', 'Dagenham Heathway': 'Barking and Dagenham',
  'Dagenham East': 'Barking and Dagenham', 'Hornchurch': 'Havering',
  // Northern line south
  'Tooting Bec': 'Wandsworth', 'Morden': 'Merton',
  // Misc / Elizabeth line outer
  'Ilford': 'Redbridge', 'Manor Park': 'Newham', 'Goodmayes': 'Redbridge',
  'Harold Wood': 'Havering', 'Brentwood': 'Brentwood', 'Shenfield': 'Chelmsford',
  'Slough': 'Slough', 'Langley': 'Slough', 'Taplow': 'Buckinghamshire',
  'Maidenhead': 'Royal Borough of Windsor and Maidenhead', 'Reading': 'Reading',
  // Alias variants
  'Elephant & Castle': 'Southwark', 'King\'s Cross': 'Camden',
  'Highbury & Islington': 'Islington', 'St Paul\'s': 'City of London',
  'Regent\'s Park': 'Westminster', 'St James\'s Park': 'Westminster'
};

function getCouncilTax(areaName) {
  var borough = STATION_BOROUGH[areaName];
  if (!borough) return null;
  return COUNCIL_TAX[borough] ? { borough: borough, data: COUNCIL_TAX[borough] } : null;
}

// ── Load data then initialise ─────────────────────────────────

/**
 * loadData()
 * Fetches stations.json and journey-times.json in parallel,
 * then calls initMap() once both are ready.
 *
 * WHY JSON FILES?  Keeping data separate means we can update
 * journey times or add stations without touching any JS code.
 */
function loadData() {
  Promise.all([
    fetch('data/stations.json').then(function(r) { return r.json(); }),
    fetch('data/journey-times.json').then(function(r) { return r.json(); })
  ])
  .then(function(results) {
    AREAS = results[0];
    JOURNEY_TIMES = results[1];
    initMap();
  })
  .catch(function(err) {
    console.error('[Maloca] Failed to load data files:', err);
    document.body.innerHTML = '<div style="padding:40px;font-family:sans-serif;color:#C0392B">' +
      '<h2>⚠️ Could not load map data</h2>' +
      '<p style="margin-top:12px">Make sure you are running this from a web server ' +
      '(not by double-clicking the file). See the README for instructions.</p></div>';
  });
}

// ── Claude API: lifestyle ─────────────────────────────────────
function nfAiErrorMessage(e, fallback) {
  console.error('[Maloca AI]', e && e.message, e);
  if (e && e.code === 'AUTH_REQUIRED') return '🔒 Sign in with Google (top right) to unlock AI insights.';
  if (e && e.code === 'NO_KEY') return '⚙️ AI not configured — sign in on the live site to use this feature.';
  if (e && e.status === 401) return '⚙️ AI API key is invalid — please check GitHub secrets.';
  if (e && e.status === 429) return '⚠️ AI rate limit reached — try again in a moment.';
  if (e && e.message && e.message.indexOf('Anthropic API error') !== -1) return '⚠️ AI error: ' + e.message;
  if (e && e.message && e.message.indexOf('fetch') !== -1) return '⚠️ AI service temporarily unavailable.';
  return fallback;
}

async function fetchLifestyle(areaName) {
  if (!document.getElementById('ai-lifestyle-content')) return;
  try {
    var data = await callAnthropicMessages({
      model: 'claude-sonnet-4-6', max_tokens: 150,
      system: 'You are a London local knowledge expert. Respond ONLY with valid JSON, no markdown. Format: {"pubs_bars_restaurants":NUMBER,"coffee_shops":NUMBER,"vibe":"2-3 word description"}',
      messages: [{ role: 'user', content: 'For ' + areaName + ' in London: estimate pubs/bars/restaurants within 1 mile, coffee shops within 1 mile, describe the area vibe in 2-3 words. Return only JSON.' }]
    });
    var text   = data.content && data.content[0] ? data.content[0].text : '';
    var parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    var vibeEsc = nfEscapeHtml(parsed.vibe);
    document.getElementById('ai-lifestyle-content').innerHTML =
      '<div class="lifestyle-grid">' +
        '<div class="lifestyle-stat"><div class="lifestyle-num">' + nfEscapeHtml(parsed.pubs_bars_restaurants) + '</div><div class="lifestyle-lbl">Pubs, Bars &amp; Restaurants</div></div>' +
        '<div class="lifestyle-stat"><div class="lifestyle-num">' + nfEscapeHtml(parsed.coffee_shops) + '</div><div class="lifestyle-lbl">Coffee Shops</div></div>' +
        '<div class="lifestyle-stat"><div class="lifestyle-num" style="font-size:12px;padding-top:4px">' + vibeEsc + '</div><div class="lifestyle-lbl">Area Vibe</div></div>' +
      '</div>';
  } catch(e) {
    document.getElementById('ai-lifestyle-content').innerHTML = '<div class="lifestyle-loading" style="color:#f43f8e">' + nfAiErrorMessage(e, 'Could not load lifestyle data') + '</div>';
  }
}

async function fetchCrime(areaName) {
  if (!document.getElementById('ai-crime-content')) return;
  try {
    var data = await callAnthropicMessages({
      model: 'claude-sonnet-4-6', max_tokens: 200,
      system: 'London local knowledge expert. Respond ONLY with valid JSON. Format: {"score":NUMBER_1_TO_10,"level":"Low|Moderate|High","summary":"one short sentence"}. Score 1=very safe, 10=very high crime.',
      messages: [{ role: 'user', content: 'Rate the crime level in ' + areaName + ' London on 1-10 (1=very safe, 10=high crime). Return only JSON.' }]
    });
    var parsed = JSON.parse((data.content[0] ? data.content[0].text : '').replace(/```json|```/g, '').trim());
    var s = parsed.score;
    var cls = s <= 4 ? 'crime-low' : s <= 7 ? 'crime-mid' : 'crime-high';
    var levelEsc = nfEscapeHtml(parsed.level);
    var sumEsc = nfEscapeHtml(parsed.summary);
    document.getElementById('ai-crime-content').innerHTML =
      '<div class="score-display">' +
        '<div class="score-circle ' + cls + '">' + nfEscapeHtml(s) + '</div>' +
        '<div class="score-detail"><b>' + nfEscapeHtml(s) + '/10 — ' + levelEsc + '</b><br>' + sumEsc + '</div>' +
      '</div>';
  } catch(e) {
    document.getElementById('ai-crime-content').innerHTML = '<div class="lifestyle-loading" style="color:#f43f8e">' + nfAiErrorMessage(e, 'Could not load data') + '</div>';
  }
}

async function fetchNoise(areaName) {
  if (!document.getElementById('ai-noise-content')) return;
  try {
    var data = await callAnthropicMessages({
      model: 'claude-sonnet-4-6', max_tokens: 200,
      system: 'London local knowledge expert. Respond ONLY with valid JSON. Format: {"score":NUMBER_1_TO_10,"summary":"one short sentence"}. Score 1=very quiet, 10=very noisy/polluted.',
      messages: [{ role: 'user', content: 'Rate noise and pollution in ' + areaName + ' London, 1-10 (1=quiet/clean, 10=noisy/polluted). Consider traffic, flight paths, rail. Return only JSON.' }]
    });
    var parsed = JSON.parse((data.content[0] ? data.content[0].text : '').replace(/```json|```/g, '').trim());
    var s = parsed.score;
    var cls = s <= 4 ? 'noise-low' : s <= 7 ? 'noise-mid' : 'noise-high';
    var lbl = s <= 4 ? 'Low' : s <= 7 ? 'Moderate' : 'High';
    var sumEsc = nfEscapeHtml(parsed.summary);
    document.getElementById('ai-noise-content').innerHTML =
      '<div class="score-display">' +
        '<div class="score-circle ' + cls + '">' + nfEscapeHtml(s) + '</div>' +
        '<div class="score-detail"><b>' + nfEscapeHtml(s) + '/10 — ' + lbl + '</b><br>' + sumEsc + '</div>' +
      '</div>';
  } catch(e) {
    document.getElementById('ai-noise-content').innerHTML = '<div class="lifestyle-loading" style="color:#f43f8e">' + nfAiErrorMessage(e, 'Could not load data') + '</div>';
  }
}

async function fetchTransport(areaName) {
  if (!document.getElementById('ai-transport')) return;
  try {
    var data = await callAnthropicMessages({
      model: 'claude-haiku-4-5-20251001', max_tokens: 300,
      system: 'London transport expert. Respond ONLY with valid JSON, no markdown. Format: {"lines":["Line1","Line2"],"night_tube":true,"zone":1,"peak_frequency":"every X min","elizabeth_line":false,"overground":false}',
      messages: [{ role: 'user', content: 'For ' + areaName + ' station in London: list all tube/overground/Elizabeth line lines serving it, night tube yes/no, zone number (1-6), peak frequency, elizabeth line yes/no, overground yes/no. Return only JSON.' }]
    });
    var parsed = JSON.parse((data.content[0] ? data.content[0].text : '').replace(/```json|```/g, '').trim());
    var lines = (parsed.lines || []).map(nfEscapeHtml);
    var badges = lines.map(function(l) {
      return '<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:#1f2937;color:#fff;margin:2px">' + l + '</span>';
    }).join('');
    if (parsed.elizabeth_line) badges += '<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:#6950a1;color:#fff;margin:2px">Elizabeth</span>';
    if (parsed.overground) badges += '<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:#ee7c0e;color:#fff;margin:2px">Overground</span>';
    document.getElementById('ai-transport').innerHTML =
      '<div style="margin-bottom:8px">' + badges + '</div>' +
      '<div class="lifestyle-grid" style="grid-template-columns:repeat(3,1fr)">' +
        '<div class="lifestyle-stat"><div class="lifestyle-num">Z' + nfEscapeHtml(parsed.zone) + '</div><div class="lifestyle-lbl">Zone</div></div>' +
        '<div class="lifestyle-stat"><div class="lifestyle-num" style="font-size:12px">' + nfEscapeHtml(parsed.peak_frequency || '—') + '</div><div class="lifestyle-lbl">Peak freq.</div></div>' +
        '<div class="lifestyle-stat"><div class="lifestyle-num" style="font-size:12px">' + (parsed.night_tube ? '✓' : '✗') + '</div><div class="lifestyle-lbl">Night Tube</div></div>' +
      '</div>';
  } catch(e) {
    document.getElementById('ai-transport').innerHTML = '<div class="lifestyle-loading" style="color:#f43f8e">' + nfAiErrorMessage(e, 'Could not load transport data') + '</div>';
  }
}

async function fetchHighStreet(areaName) {
  var el = document.getElementById('ai-highstreet');
  if (!el) return;

  // Look up lat/lng from the global AREAS array
  var areaObj = (typeof AREAS !== 'undefined') && AREAS.find(function(a) { return a.name === areaName; });
  if (!areaObj) {
    el.innerHTML = '<div class="lifestyle-loading">Location not found.</div>';
    return;
  }
  var lat = areaObj.lat, lng = areaObj.lng, r = 800;

  try {
    var query =
      '[out:json][timeout:25];(' +
        'node["amenity"~"cafe|restaurant|pub|bar|fast_food|takeaway|bank|pharmacy"](around:' + r + ',' + lat + ',' + lng + ');' +
        'node["shop"~"hairdresser|beauty|nail_salon|bookmaker|convenience|supermarket|charity|clothes|money_lender|pharmacy"](around:' + r + ',' + lat + ',' + lng + ');' +
      ');out tags;';

    var resp = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: query });
    var data = await resp.json();

    var counts = { cafes:0, restaurants:0, pubs:0, fastFood:0, beauty:0, betting:0, convenience:0, charity:0, banks:0, clothes:0, pharmacy:0 };

    (data.elements || []).forEach(function(node) {
      var a = node.tags && node.tags.amenity;
      var s = node.tags && node.tags.shop;
      if      (a === 'cafe')                                      counts.cafes++;
      else if (a === 'restaurant')                                counts.restaurants++;
      else if (a === 'pub' || a === 'bar')                        counts.pubs++;
      else if (a === 'fast_food' || a === 'takeaway')             counts.fastFood++;
      else if (a === 'bank' || s === 'money_lender')              counts.banks++;
      else if (a === 'pharmacy' || s === 'pharmacy')              counts.pharmacy++;
      else if (s === 'hairdresser' || s === 'beauty' || s === 'nail_salon') counts.beauty++;
      else if (s === 'bookmaker')                                 counts.betting++;
      else if (s === 'convenience' || s === 'supermarket')        counts.convenience++;
      else if (s === 'charity')                                   counts.charity++;
      else if (s === 'clothes')                                   counts.clothes++;
    });

    var items = [
      { label: '☕ Cafes & coffee',          count: counts.cafes,       flag: false },
      { label: '🍽️ Restaurants',             count: counts.restaurants, flag: false },
      { label: '🍺 Pubs & bars',             count: counts.pubs,        flag: false },
      { label: '🍟 Takeaways',               count: counts.fastFood,    flag: false },
      { label: '✂️ Hair & beauty',           count: counts.beauty,      flag: false },
      { label: '🎰 Betting shops',           count: counts.betting,     flag: true  },
      { label: '🛒 Food & convenience',      count: counts.convenience, flag: false },
      { label: '👗 Clothes',                 count: counts.clothes,     flag: false },
      { label: '💊 Pharmacies',             count: counts.pharmacy,    flag: false },
      { label: '🏦 Banks',                  count: counts.banks,       flag: false },
      { label: '🧸 Charity shops',          count: counts.charity,     flag: false },
    ].filter(function(i) { return i.count > 0; })
     .sort(function(a, b) { return b.count - a.count; });

    if (!items.length) {
      el.innerHTML = '<div style="font-size:12px;color:#9ca3af;padding:4px 0">No commercial data found for this area.</div>';
      return;
    }

    var maxCount = items[0].count;
    var total    = items.reduce(function(s, i) { return s + i.count; }, 0);

    var rows = items.map(function(item) {
      var pct      = Math.round(item.count / maxCount * 100);
      var barColor = item.flag ? '#dc2626' : 'var(--copper)';
      return '<div style="margin-bottom:7px">' +
        '<div style="display:flex;justify-content:space-between;align-items:baseline;font-size:12px;margin-bottom:3px">' +
          '<span>' + item.label + '</span>' +
          '<span style="font-weight:700;color:var(--ink);min-width:20px;text-align:right">' + item.count + '</span>' +
        '</div>' +
        '<div style="height:5px;background:#f3f4f6;border-radius:3px">' +
          '<div style="height:5px;width:' + pct + '%;background:' + barColor + ';border-radius:3px;transition:width 0.4s ease"></div>' +
        '</div>' +
      '</div>';
    }).join('');

    el.innerHTML =
      '<div style="font-size:11px;color:#9ca3af;margin-bottom:10px">Within 800m · ' + total + ' venues found via OpenStreetMap</div>' +
      rows;

  } catch(e) {
    el.innerHTML = '<div class="lifestyle-loading" style="color:#f43f8e">Could not load high street data</div>';
  }
}

async function fetchAirQuality(areaName) {
  if (!document.getElementById('ai-airquality')) return;
  try {
    var data = await callAnthropicMessages({
      model: 'claude-haiku-4-5-20251001', max_tokens: 200,
      system: 'London local knowledge expert. Respond ONLY with valid JSON, no markdown. Format: {"score":NUMBER_1_TO_10,"level":"Good|Moderate|Poor","main_source":"one phrase e.g. heavy traffic","summary":"one short sentence"}. Score 1=excellent clean air, 10=very polluted.',
      messages: [{ role: 'user', content: 'Rate air quality in ' + areaName + ' London 1-10 (1=clean, 10=very polluted). Consider NO2, PM2.5, proximity to major roads and industrial sources. Return only JSON.' }]
    });
    var parsed = JSON.parse((data.content[0] ? data.content[0].text : '').replace(/```json|```/g, '').trim());
    var s = parsed.score;
    var cls = s <= 3 ? 'noise-low' : s <= 6 ? 'noise-mid' : 'noise-high';
    document.getElementById('ai-airquality').innerHTML =
      '<div class="score-display">' +
        '<div class="score-circle ' + cls + '">' + nfEscapeHtml(s) + '</div>' +
        '<div class="score-detail"><b>' + nfEscapeHtml(s) + '/10 — ' + nfEscapeHtml(parsed.level) + '</b><br>' +
          '<span style="font-size:11px;color:#6b7280">Main source: ' + nfEscapeHtml(parsed.main_source) + '</span><br>' +
          nfEscapeHtml(parsed.summary) + '</div>' +
      '</div>';
  } catch(e) {
    document.getElementById('ai-airquality').innerHTML = '<div class="lifestyle-loading" style="color:#f43f8e">' + nfAiErrorMessage(e, 'Could not load air quality data') + '</div>';
  }
}


async function fetchEV(lat, lng) {
  try {
    var body = '[out:json][timeout:15];node["amenity"="charging_station"](around:1609,' + lat + ',' + lng + ');out body;';
    var resp = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: body });
    var data = await resp.json();
    var total = 0, bands = { u5: 0, u10: 0, u30: 0, u50: 0 };
    data.elements.forEach(function(el) {
      var tags = el.tags || {};
      var hasType2 = ['socket:type2','socket:type2_combo','socket:iec_62196_t2'].some(function(f) { return tags[f] && tags[f] !== 'no'; });
      var noInfo = !Object.keys(tags).some(function(k) { return k.startsWith('socket:'); });
      if (!hasType2 && !noInfo) return;
      var kw = 0;
      if (tags['socket:type2:output']) kw = parseFloat(tags['socket:type2:output']);
      else if (tags.maxpower) kw = parseFloat(tags.maxpower) / 1000;
      else if (tags.capacity) kw = 7.4;
      var count = Math.min(parseInt(tags['socket:type2'] || tags.capacity || 1) || 1, 10);
      for (var i = 0; i < count; i++) {
        if (kw >= 50) continue;
        total++;
        if (kw < 5) bands.u5++; else if (kw < 10) bands.u10++; else if (kw < 30) bands.u30++; else bands.u50++;
      }
    });
    var quality = total >= 20 ? '#16a34a' : total >= 8 ? '#d97706' : '#9ca3af';
    var breakdown = '';
    if (bands.u5)  breakdown += '<div class="ev-row"><span class="ev-band">&lt;5 kW</span><span class="ev-count">' + bands.u5 + '</span></div>';
    if (bands.u10) breakdown += '<div class="ev-row"><span class="ev-band">&lt;10 kW</span><span class="ev-count">' + bands.u10 + '</span></div>';
    if (bands.u30) breakdown += '<div class="ev-row"><span class="ev-band">&lt;30 kW</span><span class="ev-count">' + bands.u30 + '</span></div>';
    if (bands.u50) breakdown += '<div class="ev-row"><span class="ev-band">&lt;50 kW</span><span class="ev-count">' + bands.u50 + '</span></div>';
    if (!breakdown) breakdown = '<div style="font-size:11px;color:#9ca3af;margin-top:4px">No Type 2 chargers found nearby</div>';
    document.getElementById('ai-ev').innerHTML =
      '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 12px;margin-top:8px">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
          '<span style="font-size:18px">⚡</span>' +
          '<div><div style="font-size:13px;font-weight:700;color:' + quality + '">' + total + ' EV charger' + (total === 1 ? '' : 's') + ' within 1 mile</div>' +
          '<div style="font-size:11px;color:#6b7280">OpenStreetMap data</div></div>' +
        '</div>' + breakdown +
      '</div>';
  } catch(e) {
    var ev = document.getElementById('ai-ev');
    if (ev) ev.innerHTML = '<div style="font-size:11px;color:#9ca3af;padding:4px 0">⚡ EV data unavailable</div>';
  }
}

// ── Route trace animation ──────────────────────────────────────
// Cache so re-opening the same area doesn't fire another AI call.
var routeTraceCache = {};

async function fetchRouteTrace(areaStation, workId, workLabel, containerId) {
  var container = document.getElementById(containerId);
  if (!container) return;

  var cacheKey = areaStation + '|' + workId;
  if (routeTraceCache[cacheKey]) {
    renderRouteTrace(container, routeTraceCache[cacheKey], containerId);
    return;
  }

  container.innerHTML = '<div class="rt-loading">Loading route…</div>';

  try {
    var data = await callAnthropicMessages({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: 'What is the fastest typical commute route from ' + areaStation + ' to ' + (workLabel || workId) + ' in London? Include National Rail, Overground, Elizabeth line, or Underground as appropriate — use whichever services actually serve those stations. Reply with valid JSON only, no explanation:\n{"segments":[{"line":"Southern","colour":"#78BE20","from":"Wandsworth Common","to":"London Bridge","stops":5}]}\nOfficial hex colours: Underground lines use their standard colours (Northern #000000, Victoria #009FE0, Jubilee #A0A5A9, Central #E1251B, Piccadilly #003888, District #007229, Circle #FFD329, Hammersmith #F3A9BB, Bakerloo #894E24, Metropolitan #751056, Waterloo&City #6BCDB2), National Rail #000000, Overground #EE7C0E, Elizabeth line #9364CC, DLR #00AFAD. One segment if no change needed.'
      }]
    });
    var text = (data.content[0] || {}).text || '';
    var match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('no json');
    var parsed = JSON.parse(match[0]);
    if (!parsed.segments || !parsed.segments.length) throw new Error('no segments');
    routeTraceCache[cacheKey] = parsed;
    renderRouteTrace(container, parsed, containerId);
  } catch(e) {
    container.innerHTML = '<div class="rt-loading">Route unavailable</div>';
  }
}

function renderRouteTrace(container, routeData, containerId) {
  var segs = routeData.segments;
  if (!segs || !segs.length) { container.innerHTML = ''; return; }

  var totalStops = segs.reduce(function(s, seg) { return s + (seg.stops || 1); }, 0);

  // Track: start dot, then alternating coloured line + interchange dot per segment
  var track = '<div class="rt-track">';
  track += '<div class="rt-station rt-end-dot"></div>';
  segs.forEach(function(seg, i) {
    var flex = ((seg.stops || 1) / totalStops) * 100;
    var col  = seg.colour || '#9ca3af';
    track += '<div class="rt-line-seg" style="background:' + col + ';flex:' + flex + '"></div>';
    var cls  = (i === segs.length - 1) ? 'rt-end-dot' : 'rt-interchange';
    var bord = (i < segs.length - 1) ? 'border-color:' + col + ';' : '';
    track += '<div class="rt-station ' + cls + '" style="' + bord + '"></div>';
  });

  // Labels: interchange stations only, pinned at their exact position along the track
  var labels = '<div class="rt-labels">';
  if (segs.length > 1) {
    var cumulative = 0;
    segs.slice(0, -1).forEach(function(seg) {
      cumulative += (seg.stops || 1);
      var pct = (cumulative / totalStops * 100).toFixed(1);
      labels += '<span class="rt-lbl-mid" style="left:' + pct + '%">' + nfEscapeHtml(seg.to) + '</span>';
    });
  }
  labels += '</div>';
  track += labels + '</div>';

  // Line badges: just the line name, no stop count
  var badges = '<div class="rt-badges">';
  segs.forEach(function(seg) {
    badges += '<span class="rt-badge" style="background:' + (seg.colour || '#9ca3af') + '">' +
      nfEscapeHtml(seg.line) + '</span>';
  });
  badges += '</div>';

  container.innerHTML = track + badges;
}

window.fetchRouteTrace = fetchRouteTrace;

async function loadNearbyGyms(lat, lng, containerId) {
  var el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '<span style="font-size:11px;color:#9ca3af">Loading\u2026</span>';

  try {
    var query =
      '[out:json][timeout:15];(' +
        'node["leisure"="fitness_centre"](around:1200,' + lat + ',' + lng + ');' +
        'node["leisure"="gym"](around:1200,' + lat + ',' + lng + ');' +
      ');out body;';
    var resp = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: query });
    var data = await resp.json();

    var results = (data.elements || [])
      .filter(function(n) { return n.lat && n.lon && n.tags && n.tags.name; })
      .map(function(n) {
        var R = 6371, dLat = (n.lat - lat) * Math.PI / 180, dLng = (n.lon - lng) * Math.PI / 180;
        var a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat*Math.PI/180)*Math.cos(n.lat*Math.PI/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
        var km = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return { name: n.tags.name, website: n.tags.website || n.tags['contact:website'] || '', km: km };
      })
      .sort(function(a, b) { return a.km - b.km; })
      .slice(0, 5);

    if (!results.length) {
      el.innerHTML = '<span style="font-size:11px;color:#9ca3af">No gyms found nearby.</span>';
      return;
    }

    var rows = results.map(function(r) {
      var nameHtml = r.website
        ? '<a href="' + (r.website.match(/^https?:\/\//) ? r.website : 'https://' + r.website) + '" target="_blank" rel="noopener" style="color:#0891b2;text-decoration:none">' + nfEscapeHtml(r.name) + ' \u2197</a>'
        : nfEscapeHtml(r.name);
      return '<div style="display:flex;justify-content:space-between;align-items:baseline;font-size:11px;margin-bottom:2px">' +
        '<span>' + nameHtml + '</span>' +
        '<span style="color:#9ca3af;margin-left:8px;flex-shrink:0">' + r.km.toFixed(1) + 'km</span>' +
      '</div>';
    }).join('');

    el.innerHTML =
      '<div style="font-size:10px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#9ca3af;margin-bottom:4px">\uD83C\uDFCB\uFE0F Nearest Gyms</div>' +
      rows;

    if (window.nfMap) window.nfMap.invalidateSize();

  } catch(e) {
    el.innerHTML = '<span style="font-size:11px;color:#f43f8e">Could not load gym data.</span>';
  }
}
window.loadNearbyGyms = loadNearbyGyms;
