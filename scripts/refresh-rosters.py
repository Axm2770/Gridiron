"""Capture factual ESPN roster identities. Game ratings/contracts are generated separately."""
import concurrent.futures, datetime, json, pathlib, urllib.request, time
IDS=[2,15,17,20,33,4,5,23,34,11,30,10,7,12,13,24,6,19,21,28,3,8,9,16,1,29,18,27,22,14,25,26]
CODES='BUF MIA NE NYJ BAL CIN CLE PIT HOU IND JAX TEN DEN KC LV LAC DAL NYG PHI WAS CHI DET GB MIN ATL CAR NO TB ARI LAR SF SEA'.split()
POS={'QB':'QB','RB':'RB','FB':'RB','WR':'WR','TE':'TE','OT':'OL','G':'OL','OG':'OL','C':'OL','OL':'OL','T':'OL','LT':'OL','RT':'OL','LG':'OL','RG':'OL','DT':'DL','DE':'DL','NT':'DL','DL':'DL','EDGE':'DL','LB':'LB','ILB':'LB','OLB':'LB','MLB':'LB','CB':'CB','S':'S','SS':'S','FS':'S','DB':'CB','K':'K','PK':'K','P':'P','LS':'LS'}
ROOT=pathlib.Path(__file__).resolve().parent.parent

def get(team):
 i,code=team; url=f'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{IDS[i]}/roster'
 for attempt in range(3):
  try:
   request=urllib.request.Request(url,headers={'User-Agent':'GridironDirector-roster-snapshot/1.0'})
   with urllib.request.urlopen(request,timeout=35) as r:data=json.load(r)
   break
  except Exception:
   if attempt==2:raise
   time.sleep(1)
 players=[]
 for group in data['athletes']:
  for p in group.get('items',[]):
   raw=p.get('position',{}).get('abbreviation','');position=POS.get(raw)
   if not position:raise ValueError(f'Unmapped position {code}: {raw}')
   exp=p.get('experience',{});exp=exp.get('years',0) if isinstance(exp,dict) else 0
   players.append({'id':'espn-'+p['id'],'espnId':p['id'],'name':p.get('displayName') or p.get('fullName'),'pos':position,'position':raw,'age':p.get('age',25),'jersey':p.get('jersey',''),'experience':exp,'college':p.get('college',{}).get('name',''),'group':group['position'],'height':p.get('displayHeight',''),'weight':p.get('weight',0),'headshot':p.get('headshot',{}).get('href','')})
 coach=data.get('coach',[]);coach=coach[0] if isinstance(coach,list) and coach else coach
 return {'teamId':i,'abbr':code,'season':data['season']['year'],'source':url,'sourceTimestamp':data.get('timestamp'),'coach':coach.get('displayName') if isinstance(coach,dict) else None,'players':players}

if __name__=='__main__':
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:teams=sorted(pool.map(get,enumerate(CODES)),key=lambda t:t['teamId'])
 # A player can transiently appear in two feeds after a transaction: retain one identity.
 seen=set()
 for team in teams:
  unique=[]
  for p in team['players']:
   if p['id'] not in seen:seen.add(p['id']);unique.append(p)
  team['players']=unique
 payload={'version':1,'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'season':max(t['season'] for t in teams),'source':'ESPN NFL team roster feeds','identityOnly':True,'teams':teams}
 dest=ROOT/'dist/data/nfl-rosters.json';dest.write_text(json.dumps(payload,separators=(',',':'))+'\n')
 print(json.dumps({'teams':len(teams),'players':len(seen),'season':payload['season'],'bytes':dest.stat().st_size,'counts':{t['abbr']:len(t['players']) for t in teams}}))
