/**
 * Entity Alias Mappings for Major Sports
 *
 * Maps common team name variations to canonical names.
 * Used by MarketNormalizer for entity resolution.
 */

import { EntityAliasMap } from "../matching/normalizer";

/**
 * College Football (CFB) aliases
 */
export const CFB_ALIASES: EntityAliasMap = {
  // Texas
  "Longhorns": "Texas",
  "UT": "Texas",
  "Texas Longhorns": "Texas",

  // Oklahoma
  "Sooners": "Oklahoma",
  "OU": "Oklahoma",
  "Oklahoma Sooners": "Oklahoma",

  // Alabama
  "Crimson Tide": "Alabama",
  "Bama": "Alabama",
  "Alabama Crimson Tide": "Alabama",

  // Georgia
  "Bulldogs": "Georgia",
  "UGA": "Georgia",
  "Georgia Bulldogs": "Georgia",

  // Ohio State
  "Buckeyes": "Ohio State",
  "OSU": "Ohio State",
  "Ohio St": "Ohio State",
  "Ohio State Buckeyes": "Ohio State",

  // Michigan
  "Wolverines": "Michigan",
  "Michigan Wolverines": "Michigan",

  // USC
  "Trojans": "USC",
  "Southern California": "USC",
  "USC Trojans": "USC",

  // LSU
  "Tigers": "LSU",
  "Louisiana State": "LSU",
  "LSU Tigers": "LSU",

  // Clemson
  "Clemson Tigers": "Clemson",

  // Florida State
  "Seminoles": "Florida State",
  "FSU": "Florida State",
  "Florida St": "Florida State",

  // Florida
  "Gators": "Florida",
  "UF": "Florida",
  "Florida Gators": "Florida",

  // Penn State
  "Nittany Lions": "Penn State",
  "PSU": "Penn State",
  "Penn St": "Penn State",

  // Notre Dame
  "Fighting Irish": "Notre Dame",
  "ND": "Notre Dame",

  // Miami
  "Hurricanes": "Miami Florida",
  "Miami (FL)": "Miami Florida",
  "Miami FL": "Miami Florida",
  "The U": "Miami Florida",

  // Miami (OH)
  "Miami (OH)": "Miami Ohio",
  "Miami OH": "Miami Ohio",
  "Miami RedHawks": "Miami Ohio",

  // Oregon
  "Ducks": "Oregon",
  "Oregon Ducks": "Oregon",

  // Washington
  "Huskies": "Washington",
  "UW": "Washington",
  "Washington Huskies": "Washington",

  // Tennessee
  "Volunteers": "Tennessee",
  "Vols": "Tennessee",
  "Tennessee Volunteers": "Tennessee",

  // Auburn
  "Auburn Tigers": "Auburn",

  // Texas A&M
  "Aggies": "Texas A&M",
  "TAMU": "Texas A&M",
  "Texas AM": "Texas A&M",

  // Ole Miss
  "Rebels": "Ole Miss",
  "Mississippi": "Ole Miss",
  "Ole Miss Rebels": "Ole Miss",
};

/**
 * NFL aliases
 */
export const NFL_ALIASES: EntityAliasMap = {
  // Kansas City Chiefs
  "Chiefs": "Kansas City Chiefs",
  "KC Chiefs": "Kansas City Chiefs",
  "KC": "Kansas City Chiefs",

  // Buffalo Bills
  "Bills": "Buffalo Bills",

  // San Francisco 49ers
  "49ers": "San Francisco 49ers",
  "Niners": "San Francisco 49ers",
  "SF 49ers": "San Francisco 49ers",

  // Philadelphia Eagles
  "Eagles": "Philadelphia Eagles",
  "Philly Eagles": "Philadelphia Eagles",

  // Dallas Cowboys
  "Cowboys": "Dallas Cowboys",

  // New England Patriots
  "Patriots": "New England Patriots",
  "Pats": "New England Patriots",
  "NE Patriots": "New England Patriots",

  // Green Bay Packers
  "Packers": "Green Bay Packers",
  "GB Packers": "Green Bay Packers",

  // Los Angeles Rams
  "Rams": "Los Angeles Rams",
  "LA Rams": "Los Angeles Rams",

  // Los Angeles Chargers
  "Chargers": "Los Angeles Chargers",
  "LA Chargers": "Los Angeles Chargers",

  // Baltimore Ravens
  "Ravens": "Baltimore Ravens",

  // Miami Dolphins
  "Dolphins": "Miami Dolphins",

  // Cincinnati Bengals
  "Bengals": "Cincinnati Bengals",

  // Tampa Bay Buccaneers
  "Buccaneers": "Tampa Bay Buccaneers",
  "Bucs": "Tampa Bay Buccaneers",
  "TB Buccaneers": "Tampa Bay Buccaneers",

  // Las Vegas Raiders
  "Raiders": "Las Vegas Raiders",
  "LV Raiders": "Las Vegas Raiders",

  // Seattle Seahawks
  "Seahawks": "Seattle Seahawks",

  // Minnesota Vikings
  "Vikings": "Minnesota Vikings",

  // Denver Broncos
  "Broncos": "Denver Broncos",

  // Pittsburgh Steelers
  "Steelers": "Pittsburgh Steelers",
};

/**
 * NBA aliases
 */
export const NBA_ALIASES: EntityAliasMap = {
  // Los Angeles Lakers
  "Lakers": "Los Angeles Lakers",
  "LA Lakers": "Los Angeles Lakers",
  "LAL": "Los Angeles Lakers",

  // Los Angeles Clippers
  "Clippers": "Los Angeles Clippers",
  "LA Clippers": "Los Angeles Clippers",
  "LAC": "Los Angeles Clippers",

  // Boston Celtics
  "Celtics": "Boston Celtics",
  "BOS": "Boston Celtics",

  // Golden State Warriors
  "Warriors": "Golden State Warriors",
  "GSW": "Golden State Warriors",
  "GS Warriors": "Golden State Warriors",

  // Miami Heat
  "Heat": "Miami Heat",
  "MIA": "Miami Heat",

  // Milwaukee Bucks
  "Bucks": "Milwaukee Bucks",
  "MIL": "Milwaukee Bucks",

  // Phoenix Suns
  "Suns": "Phoenix Suns",
  "PHX": "Phoenix Suns",

  // Denver Nuggets
  "Nuggets": "Denver Nuggets",
  "DEN": "Denver Nuggets",

  // Dallas Mavericks
  "Mavericks": "Dallas Mavericks",
  "Mavs": "Dallas Mavericks",
  "DAL": "Dallas Mavericks",

  // Philadelphia 76ers
  "76ers": "Philadelphia 76ers",
  "Sixers": "Philadelphia 76ers",
  "PHI": "Philadelphia 76ers",

  // New York Knicks
  "Knicks": "New York Knicks",
  "NY Knicks": "New York Knicks",
  "NYK": "New York Knicks",

  // Brooklyn Nets
  "Nets": "Brooklyn Nets",
  "BKN": "Brooklyn Nets",

  // Toronto Raptors
  "Raptors": "Toronto Raptors",
  "TOR": "Toronto Raptors",

  // Chicago Bulls
  "Bulls": "Chicago Bulls",
  "CHI": "Chicago Bulls",
};

/**
 * MLB aliases
 */
export const MLB_ALIASES: EntityAliasMap = {
  // New York Yankees
  "Yankees": "New York Yankees",
  "NY Yankees": "New York Yankees",
  "NYY": "New York Yankees",

  // Los Angeles Dodgers
  "Dodgers": "Los Angeles Dodgers",
  "LA Dodgers": "Los Angeles Dodgers",
  "LAD": "Los Angeles Dodgers",

  // Boston Red Sox
  "Red Sox": "Boston Red Sox",
  "BOS": "Boston Red Sox",

  // Houston Astros
  "Astros": "Houston Astros",
  "HOU": "Houston Astros",

  // Atlanta Braves
  "Braves": "Atlanta Braves",
  "ATL": "Atlanta Braves",

  // San Francisco Giants
  "Giants": "San Francisco Giants",
  "SF Giants": "San Francisco Giants",
  "SFG": "San Francisco Giants",

  // St. Louis Cardinals
  "Cardinals": "St. Louis Cardinals",
  "STL Cardinals": "St. Louis Cardinals",
  "STL": "St. Louis Cardinals",

  // Chicago Cubs
  "Cubs": "Chicago Cubs",
  "CHC": "Chicago Cubs",

  // Chicago White Sox
  "White Sox": "Chicago White Sox",
  "CHW": "Chicago White Sox",

  // New York Mets
  "Mets": "New York Mets",
  "NY Mets": "New York Mets",
  "NYM": "New York Mets",
};

/**
 * Combined alias map for all sports
 */
export const ALL_SPORTS_ALIASES: EntityAliasMap = {
  ...CFB_ALIASES,
  ...NFL_ALIASES,
  ...NBA_ALIASES,
  ...MLB_ALIASES,
};

/**
 * Get alias map for specific sport
 */
export function getAliasMapForSport(sport: "cfb" | "nfl" | "nba" | "mlb" | "all"): EntityAliasMap {
  switch (sport) {
    case "cfb":
      return CFB_ALIASES;
    case "nfl":
      return NFL_ALIASES;
    case "nba":
      return NBA_ALIASES;
    case "mlb":
      return MLB_ALIASES;
    case "all":
    default:
      return ALL_SPORTS_ALIASES;
  }
}
