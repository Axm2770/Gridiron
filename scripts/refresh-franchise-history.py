"""Build factual heritage and completed-season career baselines from primary sources.
Requires the official 2026 NFL Record & Fact Book PDF path as the first argument.
Provenance is stored in the JSON, never injected into game dialogue.
"""
import csv, io, json, pathlib, re, sys, urllib.request, html, concurrent.futures, unicodedata
import fitz
from html.parser import HTMLParser
ROOT=pathlib.Path(__file__).resolve().parents[1]
URL='https://static.clubs.nfl.com/image/upload/saints/v7osb9amhz2za6ggkxkz.pdf'
ABBR='BUF MIA NE NYJ BAL CIN CLE PIT HOU IND JAX TEN DEN KC LV LAC DAL NYG PHI WAS CHI DET GB MIN ATL CAR NO TB ARI LAR SF SEA'.split()
TEAMS=['Buffalo Bills','Miami Dolphins','New England Patriots','New York Jets','Baltimore Ravens','Cincinnati Bengals','Cleveland Browns','Pittsburgh Steelers','Houston Texans','Indianapolis Colts','Jacksonville Jaguars','Tennessee Titans','Denver Broncos','Kansas City Chiefs','Las Vegas Raiders','Los Angeles Chargers','Dallas Cowboys','New York Giants','Philadelphia Eagles','Washington Commanders','Chicago Bears','Detroit Lions','Green Bay Packers','Minnesota Vikings','Atlanta Falcons','Carolina Panthers','New Orleans Saints','Tampa Bay Buccaneers','Arizona Cardinals','Los Angeles Rams','San Francisco 49ers','Seattle Seahawks']
ICONS=['Jim Kelly','Dan Marino','John Hannah','Joe Namath','Ray Lewis','Anthony Munoz','Jim Brown','Joe Greene','Andre Johnson','Peyton Manning','Tony Boselli','Bruce Matthews','John Elway','Derrick Thomas','Tim Brown','LaDainian Tomlinson','Emmitt Smith','Lawrence Taylor','Reggie White','Darrell Green','Walter Payton','Barry Sanders','Vince Lombardi','Fran Tarkenton','Deion Sanders','Sam Mills','Willie Roaf','Derrick Brooks','Larry Wilson','Eric Dickerson','Jerry Rice','Walter Jones']
ROLES='QB QB OL QB LB OL RB DL WR QB OL OL QB LB WR RB RB LB DL CB RB RB Coach QB CB LB OL LB S RB WR OL'.split()
def get(url):
 with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'GridironDirectorData/1.0'}),timeout=35) as r:return r.read()
def norm(s):return re.sub(r'(jr|sr|iii|ii)$','',re.sub('[^a-z0-9]','',unicodedata.normalize('NFKD',s).lower()))
def clean(t):return html.unescape(re.sub('<[^>]+>',' ',t)).strip()
class Tables(HTMLParser):
 def __init__(self):super().__init__();self.tables=[];self.table=None;self.row=None;self.cell=None
 def handle_starttag(self,tag,attrs):
  if tag=='table':self.table=[]
  if tag=='tr' and self.table is not None:self.row=[]
  if tag in ('td','th') and self.row is not None:self.cell=['',int(dict(attrs).get('colspan','1'))]
 def handle_data(self,data):
  if self.cell is not None:self.cell[0]+=data
 def handle_endtag(self,tag):
  if tag in ('td','th') and self.cell is not None:
   self.row.extend([self.cell[0].strip()]+['']*(self.cell[1]-1));self.cell=None
  if tag=='tr' and self.row is not None:self.table.append(self.row);self.row=None
  if tag=='table' and self.table is not None:self.tables.append(self.table);self.table=None
p=fitz.open(sys.argv[1]);page=next(x for x in p if 'RETIRED UNIFORM NUMBERS BY FRANCHISE' in x.get_text())
retired={name:[] for name in TEAMS}
for block in page.get_text('blocks'):
 lines=block[4].splitlines();team=lines[0].strip() if lines else ''
 if team not in retired:continue
 for line in lines[1:]:
  m=re.match(r'\x07?(.+?)\.\s*\.[.\s]*(\d+)\s*$',line)
  if m:retired[team].append({'name':re.sub(r'[.\s]+$','',m.group(1)).replace('\u2008',' ').strip('“”'),'number':int(m.group(2))})
# The printed 2026 book lists Greene as 79; the club's official retired-number record is 75.
for x in retired['Pittsburgh Steelers']:
 if x['name']=='Joe Greene':x['number']=75
old=json.loads((ROOT/'dist/data/legends.json').read_text());by_name={norm(x['name']):x for x in old}
assets=ROOT/'dist/assets/legends';assets.mkdir(parents=True,exist_ok=True)
def legend(job):
 i,name=job;slug=name.lower().replace(' ','-');url='https://www.profootballhof.com/'+'players/'+slug
 if norm(name) in by_name:
  v={**by_name[norm(name)],'teamIds':[i]};return v
 try:
  raw=get(url).decode();plain=clean(raw);year=re.search(r'<meta[^>]*article:tag[^>]*content=["\'][^"\']*Player class (19\d\d|20\d\d)',raw,re.I)
  if not year and name=='Vince Lombardi':year=re.search(r'(1971)',plain)
  image=re.search(r'<meta[^>]*property=["\']og:image["\'][^>]*content=["\']([^"\']+)',raw)
  image_path=None
  if image:
   blob=get(html.unescape(image.group(1)));dest=assets/(slug+'-heritage.webp');dest.write_bytes(blob);image_path='assets/legends/'+dest.name
  parser=Tables();parser.feed(raw);stats={}
  for table in parser.tables:
   header=next((r for r in table if any(x.strip().lower()=='year' for x in r)),None)
   totals=next((r for r in reversed(table) if any(re.fullmatch(r'(career\s*)?totals?',x,re.I) for x in r)),None)
   if not header or not totals:continue
   if len(totals)<len(header):totals=['']*(len(header)-len(totals))+totals
   used={}
   for k,v in zip(header,totals):
    k=re.sub(r'\s+',' ',k).strip();v=v.replace(',','').strip()
    if k in ('G','GS','Yds','TD','Att','Comp','Int','No.','Rec') and re.fullmatch(r'\d+(?:\.\d+)?',v):
     used[k]=used.get(k,0)+1;label=({'G':'Games','GS':'Starts','Yds':'Passing yards' if ROLES[i]=='QB' else 'Rushing yards' if ROLES[i]=='RB' else 'Receiving yards' if ROLES[i] in ('WR','TE') else 'Interception return yards','TD':'Touchdowns','Att':'Pass attempts' if ROLES[i]=='QB' else 'Carries','Comp':'Completions','Int':'Interceptions','No.':'Receptions','Rec':'Receptions'})[k]
     if used[k]==1:stats[label]=float(v) if '.' in v else int(v)
   if stats:break
  if name=='Vince Lombardi':stats.update({'Regular-season wins':96,'Regular-season losses':34,'Regular-season ties':6,'NFL championships':5,'Super Bowl victories':2})
  if year:stats['Hall of Fame class']=int(year.group(1))
  return {'id':slug,'name':name,'category':'Coaches' if ROLES[i]=='Coach' else 'Players','role':ROLES[i],'team':TEAMS[i],'teamIds':[i],'classYear':int(year.group(1)) if year else None,'headline':'A name woven into franchise history.','bio':f'{name} is part of {TEAMS[i]} history. '+(f'Enshrined in the Pro Football Hall of Fame in {year.group(1)}.' if year else 'His legacy is preserved in the franchise archive.'),'stats':stats,'achievements':([f'Pro Football Hall of Fame · Class of {year.group(1)}'] if year else [])+[f'Franchise great · {TEAMS[i]}'],'image':image_path,'source':url}
 except Exception as e:
  print('Profile unavailable',name,str(e)[:120]);return {'id':slug,'name':name,'role':ROLES[i],'category':'Players','team':TEAMS[i],'teamIds':[i],'stats':{},'achievements':['Franchise great'],'bio':f'{name} is remembered in {TEAMS[i]} history.','source':url}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:new=list(ex.map(legend,enumerate(ICONS)))
index={x['id']:x for x in old}
for x in new:
 if x['id'] in index:index[x['id']]['teamIds']=sorted(set(index[x['id']].get('teamIds',[])+x['teamIds']))
 else:index[x['id']]=x
# Associate existing multi-club icons with their documented playing/coaching franchises.
associations={'joe-montana':[13,30],'reggie-white':[18,22,25],'peyton-manning':[9,12],'jerry-rice':[14,30,31],'lawrence-taylor':[17],'emmitt-smith':[16,28],'george-halas':[20],'bill-walsh':[30],'john-madden':[14],'don-shula':[1,9]}
for k,ids in associations.items():
 if k in index:index[k]['teamIds']=sorted(set(index[k].get('teamIds',[])+ids))
heritage={'version':1,'asOf':'2026-07-14','source':URL,'retiredNumbersPage':320,'teams':[{'id':i,'abbr':ABBR[i],'name':t,'retiredNumbers':retired[t],'legendIds':[x['id'] for x in index.values() if i in x.get('teamIds',[])]}for i,t in enumerate(TEAMS)],'legends':list(index.values()),'corrections':[{'name':'Joe Greene','number':75,'source':'https://www.steelers.com/history/retired-numbers/'}]}
(ROOT/'dist/data/franchise-heritage.json').write_text(json.dumps(heritage,separators=(',',':'))+'\n')
if '--heritage-only' in sys.argv:
 print('Heritage profiles refreshed');sys.exit(0)
print('Heritage:',len(heritage['teams']),'teams',sum(len(x['retiredNumbers'])for x in heritage['teams']),'retired numbers',len(index),'profiles')
# Completed-season, regular-season career totals for the current real-player database.
rosters=json.loads((ROOT/'dist/data/nfl-rosters.json').read_text());active={norm(p['name']) for t in rosters['teams']for p in t['players']}
fields={'games':'games','attempts':'attempts','completions':'completions','passing_yards':'passYards','passing_tds':'passTD','passing_interceptions':'interceptions','carries':'rushAttempts','rushing_yards':'rushYards','rushing_tds':'rushTD','receptions':'receptions','receiving_yards':'recYards','receiving_tds':'recTD','def_sacks':'sacks','def_interceptions':'defInterceptions','fg_att':'fgAttempts','fg_made':'fgMade'}
family=lambda p: {'DE':'DL','DT':'DL','NT':'DL','EDGE':'DL','MLB':'LB','OLB':'LB','ILB':'LB','FS':'S','SS':'S','DB':'CB','FB':'RB','HB':'RB','OT':'OL','OG':'OL','G':'OL','T':'OL','C':'OL','LS':'OL'}.get(p,p)
def season(year):
 url=f'https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_reg_{year}.csv'
 return year,list(csv.DictReader(io.StringIO(get(url).decode())))
players={}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
 for year,rows in ex.map(season,range(1999,2026)):
  for r in rows:
   name=r.get('player_display_name')or r.get('player_name')or''
   if norm(name)not in active:continue
   pos=family(r.get('position',''));key=(r.get('player_id')or name,pos)
   p=players.setdefault(key,{'name':name,'pos':pos,'stats':{},'firstSeason':year,'through':2025,'years':[]});p['years'].append(year)
   for source,target in fields.items():p['stats'][target]=p['stats'].get(target,0)+float(r.get(source)or 0)
   p['stats']['tackles']=p['stats'].get('tackles',0)+sum(float(r.get(k)or 0)for k in ['def_tackles_solo','def_tackles_with_assist'])
output={'version':1,'through':2025,'scope':'Regular season','source':'https://github.com/nflverse/nflverse-data/releases/tag/stats_player','players':list(players.values())}
(ROOT/'dist/data/player-careers.json').write_text(json.dumps(output,separators=(',',':'))+'\n')
print('Completed historical career totals:',len(players))
