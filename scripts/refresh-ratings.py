"""Refresh factual EA ratings and completed-season nflverse production snapshots.

No proprietary OVR formula is reproduced. The game's adjustments live in ratings.mjs.
Run from any directory: python scripts/refresh-ratings.py --stats-season 2025
"""
import argparse, concurrent.futures, csv, datetime, io, json, math, pathlib, re, urllib.request
ROOT = pathlib.Path(__file__).resolve().parent.parent
EA_URL = 'https://www.ea.com/games/madden-nfl/ratings'

def get(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'GridironDirector-data-snapshot/1.0'})
    with urllib.request.urlopen(request, timeout=50) as response:
        return response.read().decode('utf-8-sig')

def ea_page(number):
    text = get(EA_URL + '?page=' + str(number))
    match = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', text)
    if not match:
        raise ValueError('EA snapshot structure changed; inspect the public page before refreshing.')
    return json.loads(match.group(1))['props']['pageProps']['ratingDetails']

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stats-season', type=int, default=2025)
    args = parser.parse_args()
    first = ea_page(1)
    items = first['items'][:]
    pages = math.ceil(first['totalItems'] / len(items))
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        for result in pool.map(ea_page, range(2, pages + 1)):
            items.extend(result['items'])
    unique = {p['id']: p for p in items}
    if len(unique) != first['totalItems']:
        raise ValueError('Pagination changed during capture; no files were replaced.')
    if len({p['iteration']['label'] for p in unique.values()}) != 1:
        raise ValueError('Mixed rating revisions; no files were replaced.')
    edition = re.search(r'Madden NFL \d+', get(EA_URL)).group()
    ratings = {'version': 1, 'source': EA_URL, 'capturedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'edition': edition, 'players': [
        {'name': p['firstName'] + ' ' + p['lastName'], 'eaId': p['id'], 'ovr': p['overallRating'], 'position': p['position'], 'team': p['team'], 'attributes': {k: v['value'] for k, v in p['stats'].items() if isinstance(v['value'], (int, float))}, 'iteration': p['iteration']['label']} for p in unique.values()
    ]}
    url = f'https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_reg_{args.stats_season}.csv'
    rows = list(csv.DictReader(io.StringIO(get(url))))
    fields = {'games': 'games', 'attempts': 'attempts', 'completions': 'completions', 'passing_yards': 'passYards', 'passing_tds': 'passTD', 'passing_interceptions': 'interceptions', 'carries': 'rushAttempts', 'rushing_yards': 'rushYards', 'rushing_tds': 'rushTD', 'receptions': 'receptions', 'receiving_yards': 'recYards', 'receiving_tds': 'recTD', 'def_sacks': 'sacks', 'def_interceptions': 'defInterceptions', 'fg_att': 'fgAttempts', 'fg_made': 'fgMade'}
    players = []
    for row in rows:
        totals = {target: float(row.get(source) or 0) for source, target in fields.items()}
        totals['tackles'] = sum(float(row.get(key) or 0) for key in ['def_tackles_solo', 'def_tackles_with_assist'])
        players.append({'name': row['player_display_name'], 'position': row['position'], 'team': row['recent_team'], 'stats': totals})
    production = {'version': 1, 'season': args.stats_season, 'source': 'https://github.com/nflverse/nflverse-data/releases/tag/stats_player', 'players': players}
    for filename, payload in [('madden-ratings.json', ratings), ('player-production.json', production)]:
        destination = ROOT / 'dist/data' / filename
        destination.write_text(json.dumps(payload, separators=(',', ':')) + '\n')
    print(json.dumps({'edition': edition, 'players': len(unique), 'productionSeason': args.stats_season, 'productionRecords': len(players)}))

if __name__ == '__main__':
    main()
