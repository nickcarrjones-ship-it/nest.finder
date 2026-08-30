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
  walkHomeKm?: number;
}

export interface Profile {
  members: Member[];
  isDemo?: boolean;
  sharedCommuteLimit?: boolean;
  maxCommuteMins?: number;
  sharedWalkLimit?: boolean;
  walkHomeKm?: number;
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
  safetyPriority?: 'veryimportant' | 'important' | 'flexible';
  dealbreakers?: string[];
  freeText?: string;

  /**
   * Added 2026-08-26 with the voice conversation. zone1Ok is the only
   * lifestyle answer that changes the SHAPE of the ranking rather than just
   * feeding the prompt: false removes Zone 1 neighbourhoods from the
   * candidates entirely, true keeps them and switches the model from
   * fit-only to an even split between fit and commute (see
   * lib/ranking/prompt.ts). The other two are prompt signal only.
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
