export const BASE_SOURCES = Object.freeze([
  { id: 'beyazelma', name: 'BeyazElma' },
  { id: 'domino', name: 'Domino TV' },
  { id: 'inat', name: 'İnat TV' },
  { id: 'kralspor', name: 'KralSporHD' },
  { id: 'betmatiktv', name: 'BetmatikTV' },
  { id: 'patron', name: 'PatronHD' },
  { id: 'viontv', name: 'VİONTV' },
  { id: 'selcuk', name: 'SelçukSports' },
  { id: 'taraftarium', name: 'Taraftarium24' },
  { id: 'arda', name: 'ArdaSpor' },
  { id: 'mahsun', name: 'MahsunSports' },
  { id: 'crex', name: 'Crex' },
  { id: 'domates', name: 'Domates TV' },
  { id: 'intersportv', name: 'İnterSporTV' },
  { id: 'mackeyfi', name: 'MaçKeyfi' },
  { id: 'zbahistv', name: 'ZbahisTV' },
  { id: 'inatbox', name: 'İnat Box' },
  { id: 'papazsports', name: 'PapazSports' },
  { id: 'jestyayin', name: 'JestYayın' }
]);

const aslanItems = [
  ['viplistem', 'VIP Listem'],
  ['vipkankatv', 'Kanka TV'],
  ['tabiispor', 'Tabii Spor'],
  ['kraltv', 'Kral TV'],
  ['ekiptvplaylist', 'Ekip TV'],
  ['yenitv', 'Yeni TV'],
  ['izletv', 'İzle TV'],
  ['ilooktvworld', 'Ilook TV'],
  ['turkiyeizle', 'Türkiye İzle'],
  ['canlitvturk', 'Canlı TV Türk'],
  ['fmedya', 'F Medya'],
  ['worldhasiptv', 'World Has IPTV'],
  ['46tv', '46 TV'],
  ['realtopcdntv', 'Realtop TV'],
  ['birazsports', 'Biraz Sports'],
  ['yasarsports', 'Yaşar Sports'],
  ['betconnetsports', 'Betconnet Sports'],
  ['karmasports', 'Karma Sports'],
  ['gecesports', 'Gece Sports'],
  ['alemsports', 'Alem Sports'],
  ['siralisports', 'Sıralı Sports'],
  ['ugursports', 'Uğur Sports'],
  ['atomspor', 'Atom Spor'],
  ['selcuksportss', 'Selçuk Sportss'],
  ['iptvsevgisi', 'IPTV Sevgisi'],
  ['markusta', 'Mark Usta'],
  ['ozcantv', 'Özcan TV']
];

export const ASLAN_SOURCES = Object.freeze(aslanItems.map(([sourceId, name]) => Object.freeze({
  id: `aslan_${sourceId}`,
  sourceId,
  name: `Aslan • ${name}`,
  title: name
})));

export const WIOSPOR_SOURCES = Object.freeze([...BASE_SOURCES, ...ASLAN_SOURCES]);
export const WIOSPOR_SOURCE_COUNT = WIOSPOR_SOURCES.length;
