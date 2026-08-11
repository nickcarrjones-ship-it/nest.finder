/** Mirrors the profile shape written by js/profile.js. */
export interface Member {
  id: string;
  name: string;
  workId: string;
  workLabel: string;
  offWalk?: number;
  gym?: string;
  email?: string;
  /** Per-member override — only read when the profile has sharedCommuteLimit: false. */
  maxCommuteMins?: number;
  /** Per-member override — only read when the profile has sharedWalkLimit: false. */
  walkHomeKm?: number;
}

export interface Profile {
  members: Member[];
  isDemo?: boolean;
  sharedCommuteLimit?: boolean;
  maxCommuteMins?: number;
  sharedWalkLimit?: boolean;
  walkHomeKm?: number;
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
