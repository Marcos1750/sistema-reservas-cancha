const sportThemes = {
  'Fútbol 5': 'football',
  'Pádel': 'padel',
  'Tenis': 'tennis',
};

export function getSportTheme(sport) {
  return sportThemes[sport] || 'football';
}

export function getUniqueSports(sports = []) {
  return [...new Set(sports.filter((sport) => sportThemes[sport]))];
}

export function getComplexTheme(sports = []) {
  const uniqueSports = getUniqueSports(sports);
  return uniqueSports.length === 1 ? getSportTheme(uniqueSports[0]) : 'multisport';
}
