// Sample airport index for the mockup. Production: replace with the full OurAirports DB (airports.csv + runways.csv).
// rwy = primary landing heading (deg true); used to synthesize a runway layout when real runway data is missing.
export const AIRPORT_INDEX = [
  ['CYVR', 'YVR', 'Vancouver International', 'Vancouver', 49.1947, -123.1792, 280],
  ['KSEA', 'SEA', 'Seattle–Tacoma International', 'Seattle', 47.4502, -122.3088, 180],
  ['CYYC', 'YYC', 'Calgary International', 'Calgary', 51.1215, -114.0076, 352],
  ['CYYZ', 'YYZ', 'Toronto Pearson International', 'Toronto', 43.6777, -79.6248, 246],
  ['CYUL', 'YUL', 'Montréal–Trudeau International', 'Montréal', 45.4706, -73.7408, 240],
  ['CYEG', 'YEG', 'Edmonton International', 'Edmonton', 53.3097, -113.58, 20],
  ['CYWG', 'YWG', 'Winnipeg Richardson International', 'Winnipeg', 49.91, -97.2399, 180],
  ['CYYJ', 'YYJ', 'Victoria International', 'Victoria', 48.6469, -123.4258, 270],
  ['CYOW', 'YOW', 'Ottawa Macdonald–Cartier International', 'Ottawa', 45.3225, -75.6692, 70],
  ['CYHZ', 'YHZ', 'Halifax Stanfield International', 'Halifax', 44.8808, -63.5086, 230],
  ['KSFO', 'SFO', 'San Francisco International', 'San Francisco', 37.6213, -122.379, 280],
  ['KLAX', 'LAX', 'Los Angeles International', 'Los Angeles', 33.9416, -118.4085, 250],
  ['KPDX', 'PDX', 'Portland International', 'Portland', 45.5887, -122.5975, 100],
  ['KDEN', 'DEN', 'Denver International', 'Denver', 39.8561, -104.6737, 170],
  ['KORD', 'ORD', "Chicago O'Hare International", 'Chicago', 41.9742, -87.9073, 270],
  ['KJFK', 'JFK', 'John F. Kennedy International', 'New York', 40.6413, -73.7781, 310],
  ['KATL', 'ATL', 'Hartsfield–Jackson Atlanta International', 'Atlanta', 33.6407, -84.4277, 270],
  ['KDFW', 'DFW', 'Dallas/Fort Worth International', 'Dallas', 32.8998, -97.0403, 170],
  ['KLAS', 'LAS', 'Harry Reid International', 'Las Vegas', 36.084, -115.1537, 260],
  ['KPHX', 'PHX', 'Phoenix Sky Harbor International', 'Phoenix', 33.4352, -112.0101, 260],
  ['KMIA', 'MIA', 'Miami International', 'Miami', 25.7959, -80.287, 270],
  ['KBOS', 'BOS', 'Boston Logan International', 'Boston', 42.3656, -71.0096, 40],
  ['PHNL', 'HNL', 'Daniel K. Inouye International', 'Honolulu', 21.3187, -157.9225, 80],
  ['EGLL', 'LHR', 'London Heathrow', 'London', 51.47, -0.4543, 270],
  ['EHAM', 'AMS', 'Amsterdam Schiphol', 'Amsterdam', 52.3105, 4.7683, 180],
  ['EDDF', 'FRA', 'Frankfurt am Main', 'Frankfurt', 50.0379, 8.5622, 250],
  ['LFPG', 'CDG', 'Paris Charles de Gaulle', 'Paris', 49.0097, 2.5479, 270],
  ['LEMD', 'MAD', 'Adolfo Suárez Madrid–Barajas', 'Madrid', 40.4983, -3.5676, 320],
  ['LIRF', 'FCO', 'Rome Fiumicino', 'Rome', 41.8003, 12.2389, 160],
  ['LSZH', 'ZRH', 'Zürich', 'Zürich', 47.4582, 8.5555, 140],
  ['OMDB', 'DXB', 'Dubai International', 'Dubai', 25.2532, 55.3657, 300],
  ['VHHH', 'HKG', 'Hong Kong International', 'Hong Kong', 22.308, 113.9185, 70],
  ['RJTT', 'HND', 'Tokyo Haneda', 'Tokyo', 35.5494, 139.7798, 340],
  ['RJAA', 'NRT', 'Narita International', 'Tokyo', 35.772, 140.3929, 340],
  ['RKSI', 'ICN', 'Incheon International', 'Seoul', 37.4602, 126.4407, 330],
  ['WSSS', 'SIN', 'Singapore Changi', 'Singapore', 1.3644, 103.9915, 20],
  ['YSSY', 'SYD', 'Sydney Kingsford Smith', 'Sydney', -33.9399, 151.1753, 340],
  ['NZAA', 'AKL', 'Auckland', 'Auckland', -37.0082, 174.785, 230],
  ['MMMX', 'MEX', 'Mexico City International', 'Mexico City', 19.4361, -99.0719, 50],
  ['SBGR', 'GRU', 'São Paulo/Guarulhos International', 'São Paulo', -23.4356, -46.4731, 270],
].map(([icao, iata, name, city, lat, lon, rwy]) => ({ icao, iata, name, city, lat, lon, rwy }));

export function searchAirports(q, limit = 8) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  const score = a => {
    const i = a.icao.toLowerCase(), t = a.iata.toLowerCase(), n = a.name.toLowerCase(), c = a.city.toLowerCase();
    if (i === q || t === q) return 0;
    if (i.startsWith(q) || t.startsWith(q)) return 1;
    if (c.startsWith(q)) return 2;
    if (n.includes(q) || c.includes(q)) return 3;
    return -1;
  };
  return AIRPORT_INDEX.map(a => [score(a), a]).filter(x => x[0] >= 0).sort((a, b) => a[0] - b[0]).slice(0, limit).map(x => x[1]);
}
