// ============================================================
// CONFIG
// ============================================================
const SUPABASE_URL = 'https://jvpnnaamcynydqrjnuve.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2cG5uYWFtY3lueWRxcmpudXZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NDY5MzQsImV4cCI6MjA5MzMyMjkzNH0.AnEI3zZGxoHidMCqWKfl18MPxKzezUterSo4vrfBYng';
const GOOGLE_CLIENT_ID = '692096767036-gklqud4ip2sughqf035esejtrl2f8qh1.apps.googleusercontent.com';

const KILMORE_SUBURB_DISTANCES = {
  // Kilmore / immediate area
  'kilmore': 0, 'kilmore east': 3, 'wandong': 10, 'heathcote junction': 12,
  'pyalong': 25, 'wallan': 22, 'broadford': 18, 'clonbinane': 14,
  'springsteen': 8, 'tantaraboo': 6, 'willowmavin': 5, 'mt disappointment': 18,
  // Seymour / Nagambie / Mitchell Shire
  'seymour': 30, 'nagambie': 45, 'tallarook': 15, 'puckapunyal': 28,
  'mangalore': 32, 'avenel': 38, 'euroa': 65, 'longwood': 50,
  'violet town': 70, 'benalla': 100, 'shepparton': 140,
  // Lancefield / Romsey / Macedon Ranges
  'lancefield': 20, 'romsey': 35, 'riddells creek': 40, 'macedon': 50,
  'woodend': 45, 'kyneton': 60, 'malmsbury': 65, 'metcalfe': 72,
  'gisborne': 48, 'new gisborne': 50, 'bullengarook': 52,
  'sunbury': 55, 'diggers rest': 62, 'toolern vale': 58,
  'trentham': 72, 'tylden': 65, 'mt macedon': 52,
  'carlsruhe': 55, 'kyneton south': 62,
  // Beveridge / Craigieburn / Northern Suburbs
  'beveridge': 28, 'donnybrook': 32, 'mickelham': 36,
  'craigieburn': 52, 'roxburgh park': 58, 'meadow heights': 60,
  'coolaroo': 62, 'broadmeadows': 63, 'dallas': 64, 'jacana': 64,
  'glenroy': 66, 'gladstone park': 64, 'tullamarine': 62,
  'airport west': 63, 'keilor': 65, 'keilor east': 64, 'keilor park': 63,
  'sunshine north': 70, 'albanvale': 72, 'st albans': 70,
  'taylors lakes': 65, 'watergardens': 66, 'taylors hill': 67,
  'caroline springs': 72, 'derrimut': 74, 'truganina': 76,
  // Whittlesea / Diamond Valley
  'whittlesea': 45, 'doreen': 50, 'mernda': 53, 'south morang': 60,
  'plenty': 52, 'yarrambat': 50, 'hurstbridge': 58, 'diamond creek': 55,
  'eltham': 57, 'research': 55, 'templestowe': 60, 'doncaster': 62,
  'warrandyte': 58, 'wonga park': 56, 'chirnside park': 60,
  'christmas hills': 55, 'panton hill': 52, 'st andrews': 48,
  'kinglake': 40, 'kinglake west': 38, 'strathewen': 38,
  // Epping / Mill Park / Bundoora
  'epping': 58, 'lalor': 58, 'thomastown': 60, 'mill park': 57,
  'bundoora': 60, 'wollert': 55, 'eden park': 52, 'woodstock': 48,
  // Preston / Reservoir / Northcote
  'reservoir': 63, 'thornbury': 66, 'northcote': 70, 'clifton hill': 70,
  'fitzroy': 76, 'fitzroy north': 74, 'brunswick': 72, 'brunswick west': 72,
  'brunswick east': 73, 'coburg': 68, 'coburg north': 66,
  'pascoe vale': 66, 'pascoe vale south': 67, 'oak park': 66,
  'moonee ponds': 68, 'essendon': 68, 'essendon north': 66,
  'niddrie': 66, 'avondale heights': 67, 'aberfeldie': 68,
  'ascot vale': 70, 'flemington': 71, 'kensington': 72,
  // Preston
  'preston': 65, 'reservoir': 63, 'heidelberg': 63, 'heidelberg west': 63,
  'heidelberg heights': 62, 'rosanna': 62, 'viewbank': 61,
  'montmorency': 60, 'greensborough': 58, 'watsonia': 60,
  'macleod': 63, 'yallambie': 61, 'bellfield': 64,
  // Melbourne CBD & inner
  'melbourne cbd': 75, 'melbourne': 75, 'cbd': 75,
  'docklands': 75, 'southbank': 76, 'south yarra': 77,
  'prahran': 77, 'windsor': 77, 'st kilda': 78,
  'st kilda east': 78, 'st kilda west': 78,
  'elwood': 80, 'brighton': 82, 'brighton east': 82,
  'hampton': 83, 'sandringham': 84, 'black rock': 85,
  'beaumaris': 86, 'mentone': 84, 'parkdale': 85,
  'mordialloc': 86, 'cheltenham': 84, 'highett': 83,
  'moorabbin': 83, 'bentleigh': 82, 'bentleigh east': 82,
  'mckinnon': 82, 'ormond': 82, 'glen huntly': 82,
  'caulfield': 80, 'caulfield north': 80, 'caulfield south': 80,
  'carnegie': 81, 'murrumbeena': 81, 'oakleigh': 80,
  'oakleigh south': 80, 'oakleigh east': 80, 'hughesdale': 81,
  'huntingdale': 81, 'springvale': 82, 'springvale south': 83,
  'noble park': 82, 'noble park north': 81,
  'keysborough': 84, 'dingley village': 84,
  // East / SE Suburbs
  'richmond': 78, 'hawthorn': 78, 'hawthorn east': 78,
  'glen iris': 78, 'malvern': 79, 'malvern east': 79,
  'glen waverley': 80, 'mount waverley': 80, 'wheelers hill': 82,
  'mulgrave': 81, 'rowville': 82, 'lysterfield': 82,
  'vermont': 78, 'vermont south': 80, 'forest hill': 79,
  'surrey hills': 78, 'box hill': 78, 'box hill south': 78,
  'box hill north': 77, 'mont albert': 77, 'mont albert north': 77,
  'blackburn': 76, 'blackburn north': 76, 'blackburn south': 77,
  'nunawading': 76, 'mitcham': 76, 'ringwood': 75,
  'ringwood east': 76, 'ringwood north': 75,
  'heathmont': 77, 'croydon': 74, 'croydon north': 73,
  'croydon south': 74, 'croydon hills': 73,
  'mooroolbark': 72, 'kilsyth': 70, 'kilsyth south': 72,
  'bayswater': 75, 'bayswater north': 74, 'boronia': 76,
  'the basin': 76, 'ferntree gully': 78, 'upper ferntree gully': 78,
  'knoxfield': 78, 'scoresby': 80, 'knox': 79,
  'wantirna': 79, 'wantirna south': 80,
  // Dandenong / Casey
  'dandenong': 83, 'dandenong north': 82, 'dandenong south': 84,
  'dandenong south industrial': 85, 'cleeland': 84, 'lynbrook': 86,
  'lyndhurst': 88, 'cranbourne': 94, 'cranbourne north': 92,
  'cranbourne east': 96, 'cranbourne west': 93, 'cranbourne south': 96,
  'botanic ridge': 98, 'clyde': 100, 'clyde north': 100,
  'officer': 96, 'officer south': 97, 'pakenham': 100,
  'pakenham upper': 98, 'east pakenham': 101,
  'berwick': 92, 'harkaway': 90, 'beaconsfield': 94,
  'beaconsfield upper': 95, 'narre warren': 90,
  'narre warren north': 88, 'narre warren south': 92,
  'hallam': 88, 'hampton park': 88, 'endeavour hills': 86,
  // Frankston / Mornington Peninsula
  'frankston': 90, 'frankston north': 88, 'frankston south': 92,
  'seaford': 92, 'carrum downs': 90, 'karingal': 90,
  'langwarrin': 92, 'langwarrin south': 93,
  'mornington': 100, 'mount eliza': 96, 'mount martha': 104,
  'dromana': 110, 'rosebud': 115, 'rye': 120,
  'blairgowrie': 122, 'portsea': 130, 'sorrento': 128,
  'safety beach': 108, 'mc crae': 112, 'capel sound': 114,
  'fingal': 125, 'shoreham': 120, 'red hill': 115,
  'red hill south': 116, 'main ridge': 118, 'merricks': 110,
  'somers': 118, 'balnarring': 112, 'baxter': 96,
  'tyabb': 98, 'moorooduc': 94,
  // Western Suburbs
  'footscray': 72, 'yarraville': 72, 'seddon': 72,
  'williamstown': 74, 'newport': 74, 'spotswood': 73,
  'altona': 76, 'altona meadows': 78, 'altona north': 74,
  'laverton': 78, 'hoppers crossing': 80, 'werribee': 83,
  'werribee south': 86, 'point cook': 82, 'williams landing': 82,
  'wyndham vale': 86, 'manor lakes': 87, 'little river': 90,
  'lara': 88, 'geelong': 110, 'geelong north': 110,
  'belmont': 112, 'south geelong': 112, 'newtown geelong': 112,
  'corio': 108, 'norlane': 108, 'newcomb': 114,
  'st albans park': 114, 'breakwater': 114,
  'torquay': 125, 'jan juc': 126, 'anglesea': 130,
  'lorne': 148, 'apollo bay': 175,
  // Melton
  'melton': 80, 'melton south': 82, 'melton west': 78,
  'rockbank': 76, 'eynesbury': 80, 'cobblebank': 82,
  'kurunjang': 80, 'strathtulloh': 81, 'burnside': 82,
  'burnside heights': 80, 'hillside': 76,
  // Bacchus Marsh / Ballarat
  'bacchus marsh': 95, 'hopetoun park': 92,
  'ballan': 108, 'gordon': 120, 'buninyong': 145,
  'ballarat': 150, 'ballarat central': 150, 'ballarat east': 150,
  'sebastopol': 150, 'mount clear': 150, 'alfredton': 152,
  'delacombe': 152, 'lucas': 150, 'winter valley': 153,
  'invermay park': 152, 'smythes creek': 152,
  // Bendigo direction
  'bendigo': 120, 'heathcote': 55, 'rochester': 110,
  'echuca': 160, 'elmore': 100, 'mckinnons bridge': 85,
  'redesdale': 70, 'tooborac': 52, 'baynton': 65,
  'axedale': 80, 'goornong': 100, 'raywood': 110,
  'emu creek': 45, 'glenhope': 60, 'eppalock': 68,
  // Yarra Valley / Lilydale
  'lilydale': 65, 'coldstream': 65, 'yering': 66,
  'yarra glen': 65, 'healesville': 75, 'badger creek': 78,
  'don valley': 80, 'toolangi': 72, 'marysville': 90,
  'narbethong': 85, 'buxton': 95, 'murrindindi': 85,
  'whittlesea township': 45,
  // Mildura / NW Victoria
  'mildura': 400, 'red cliffs': 405, 'irymple': 400,
  'ouyen': 320, 'sea lake': 340, 'hopetoun': 350,
  // Wangaratta / Wodonga / NE Victoria
  'wangaratta': 145, 'wodonga': 240, 'albury': 245,
  'bright': 200, 'myrtleford': 185, 'beechworth': 210,
  'rutherglen': 220, 'corowa': 230,
  // Gippsland
  'traralgon': 185, 'sale': 215, 'bairnsdale': 270,
  'lakes entrance': 290, 'warragul': 148, 'drouin': 140,
  'yarragon': 152, 'trafalgar': 155, 'moe': 162,
  'morwell': 170, 'latrobe city': 170, 'leongatha': 180,
  'korumburra': 170, 'wonthaggi': 175, 'cowes': 195,
  'san remo': 188, 'inverloch': 185,
  // South Gippsland
  'foster': 198, 'fish creek': 195, 'meeniyan': 185,
  'mirboo north': 180,
  // Horsham / Wimmera
  'horsham': 270, 'ararat': 200, 'stawell': 215,
  'hamilton': 280, 'warrnambool': 290, 'portland': 340,
  // Albury direction
  'thurgoona': 245, 'lavington': 244,
};


const BEDROOM_TO_METRES = {
  '2': 45, '3': 62, '4': 80, '5+': 105
};

const BEDROOM_TO_SQM = {
  '2': 120, '3': 160, '4': 200, '5+': 260
};

const OWNER_PIN = '1234SS'; // Simon's owner PIN — change this
