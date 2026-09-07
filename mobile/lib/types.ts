/** Mirrors the profile shape written by js/profile.js. */
export interface Member {
  id: string;
  name: string;
  workId: string;
  workLabel: string;
  offWalk?: number;
  gym?: string;
  email?: string;
  /** Per-member override. Read whenever present — NOT gated on
   *  sharedCommuteLimit, despite what this comment used to claim; see
   *  lib/commuteSettings.ts, which matches the web app's behaviour. */
  maxCommuteMins?: number;
  /** Per-member override. Read whenever present — see the note above. */
}

export interface Profile {
  members: Member[];
  isDemo?: boolean;
  sharedCommuteLimit?: boolean;
  maxCommuteMins?: number;
  /** Feeds the AI ranking prompt — see lib/ranking/prompt.ts. Nothing on
   *  mobile wrote this until the preferences screen (2026-08-23). */
  lifestyle?: Lifestyle;
  areaCards?: AreaCards;
  /** Which preference model this profile was written with. Absent means the
   *  web app wrote it — see lib/profileMigration.ts. */
  schemaVersion?: number;
  /**
   * When they finished the setup questions, ms since epoch.
   *
   * Persisted rather than session-only so that abandoning setup halfway and
   * relaunching resumes it, instead of dropping someone on the map with a
   * half-built profile. Absent on every profile written before 2026-08-30,
   * which is why the sign-in check treats "already has real preferences" as
   * finished too — see store/profileFirebaseSync.ts.
   */
  setupDoneAt?: number;
  /**
   * What kind of property the household is after — the payload for the
   * Rightmove search, and nothing else today (it does not affect which
   * areas are reachable or suggested).
   *
   * Household-level rather than per-member on purpose: whoever fills it in
   * first fills it in for everyone, so the second person to open the app
   * finds the button already live (Nick, 2026-09-06). It rides the shared
   * households/{hid}/profile node to get that for free.
   */
  propertyCriteria?: PropertyCriteria;
}

/** Buying or renting. Asked first, because it changes the price scale and
 *  which Rightmove URL the search goes to. */
export type ListingChannel = 'buy' | 'rent';

/** Rightmove offers exactly these three. Stored in our own casing and
 *  translated at the URL edge — see lib/rightmove.ts, where getting the
 *  case wrong silently throws the whole search away. */
export type Tenure = 'freehold' | 'leasehold' | 'shareOfFreehold';

/** The two "must have" features Rightmove supports that people actually
 *  ask for. Not a general feature list — these are the ones with a real
 *  filter behind them. */
export type PropertyFeature = 'garden' | 'parking';

export interface PropertyCriteria {
  channel: ListingChannel;
  /** Pounds. Per calendar month when renting, total when buying. */
  minPrice: number;
  maxPrice: number;
  minBeds: number;
  maxBeds: number;
  minBaths: number;
  maxBaths: number;
  /** Empty means "no preference", which is a real answer — Rightmove
   *  treats an absent tenureTypes as unfiltered, so empty is passed as
   *  nothing rather than as all three. */
  tenures: Tenure[];
  features: PropertyFeature[];
  /**
   * When it was saved, ms since epoch. Doubles as the "has anyone in this
   * household filled this in yet?" flag that decides whether the card
   * button reads "Find Properties" or "Rightmove Search".
   */
  setAt: number;
}

/** One entry in data/stations.json. */
export interface Area {
  name: string;
  lat: number;
  lng: number;
}

/** data/journey-times.json: area name -> { workId: minutes }. */
export type JourneyTimes = Record<string, Record<string, number>>;

/** One area that works for every member's commute. */
export interface ReachableArea {
  area: Area;
  /** Door-to-desk minutes per member, same order as profile.members. */
  memberTimes: number[];
}

/** data/destinations.json: workId -> real coordinates, verified against TfL. */
export type Destinations = Record<string, { id: string; lat: number; lng: number }>;

/**
 * The web app's lifestyle model (js/profile.js / js/map-filter.js),
 * collected conversationally — Maloca Agent asks things like "what does an
 * ideal weekend look like?" and turns the answers into these fields. Ported
 * as-is so existing web profiles carry straight over once auth links them.
 */
export interface Lifestyle {
  greenSpace?: 'essential' | 'nice' | 'unimportant';
  streetVibe?: 'buzzy' | 'quiet' | 'village';
  nightsOut?: 'frequent' | 'regular' | 'rarely';
  schoolsPriority?: 'now' | 'someday' | 'no';
  /**
   * WHICH schools matter — asked only when someone raises the subject.
   *
   * "Schools" is not one question. A household with a four-year-old and one
   * with a fourteen-year-old are asking different things of the same
   * street, and until 2026-09-07 the app could not tell them apart: it held
   * the nearest three schools by distance, which — primaries being roughly
   * five times denser — meant almost only primaries, for half of London
   * (Nick spotted it). The data is per-phase now, and this is the answer to
   * which half of it to lead with.
   */
  schoolPhase?: 'primary' | 'secondary' | 'both';
  /**
   * Whether fee-paying schools are on the table.
   *
   * Asked because it changes the answer completely and cannot be guessed
   * (Nick, 2026-09-07). Around Wandsworth Common and Dulwich the nearest
   * strong secondaries include Emanuel and Alleyn's, and to one household
   * that is the most useful fact about the area while to another it is
   * noise they should not have to read past. Absent means not asked, and
   * independents stay out — offering them uninvited reads as an assumption
   * about what someone can afford.
   */
  considerFeePaying?: boolean;
  safetyPriority?: 'veryimportant' | 'important' | 'flexible';
  dealbreakers?: string[];
  freeText?: string;

  /**
   * Added 2026-08-26 with the voice conversation. zone1Ok and riverSide both
   * change the SHAPE of the ranking rather than just feeding the prompt:
   * zone1Ok false removes Zone 1 neighbourhoods from the candidates entirely
   * (and true switches the model from fit-only to an even split between fit
   * and commute — see lib/ranking/prompt.ts), while riverSide drops the far
   * bank outright (lib/ranking/river.ts).
   *
   * riverSide was prompt-only until 2026-09-07, and that was a bug: the model
   * treated "wants to be south of the river" as a hint and ignored it, seven
   * times out of ten. The Thames is not a matter of degree, so it cannot be
   * left to persuasion. socialCircle remains prompt signal only.
   */
  zone1Ok?: boolean;
  riverSide?: 'north' | 'south' | 'either';
  socialCircle?: 'N' | 'E' | 'S' | 'W';
  /**
   * What they said they like about the areas they already love — the answer
   * to the Agent's second question (2026-08-28). Drives which measurements
   * are weighted when finding similar areas, so it is stored separately from
   * freeText rather than blended into it.
   */
  anchorReason?: string;
  /**
   * What they like, as tags the similarity engine weights directly
   * (lib/similarity/tags.ts). Stored alongside anchorReason rather than
   * instead of it: the free text is what a person actually said and belongs
   * in the prompt, the tags are what the arithmetic can act on.
   */
  preferenceTags?: string[];
}

/** area/neighbourhood name -> 'love' | 'hate', from swiping area cards. */
export type AreaCards = Record<string, 'love' | 'hate'>;
