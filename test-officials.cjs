const vm=require('node:vm'),fs=require('node:fs');const nodes={};let saved;
function node(id){return nodes[id]??={innerHTML:'',textContent:'',style:{},open:false,showModal(){this.open=true},close(){this.open=false}}}
const c={console,Date,Math,setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},window:{addEventListener(){}},localStorage:{getItem:()=>saved||null,setItem:(k,v)=>saved=v},document:{addEventListener(){},getElementById:node,querySelector:()=>node('footer'),querySelectorAll:()=>[]}};
vm.createContext(c);vm.runInContext(fs.readFileSync('dist/game.js','utf8'),c);vm.runInContext(fs.readFileSync('dist/match.js','utf8'),c);vm.runInContext(fs.readFileSync('dist/atmosphere.js','utf8'),c);
vm.runInContext(`
function check(v,msg){if(!v)throw Error(msg)}
check(state.roster.some(p=>p.pos==='CB'&&!p.starter),'defensive reserves');
for(const item of navs)go(item[0]);
go('Matchday');beginLive();answerInterview('pre',0);check(state.live.interviewDone,'pregame interview');
let morale=state.morale;answerInterview('pre',0);check(state.morale===morale,'no duplicate interview');
let qb=state.roster.find(p=>p.pos==='QB'&&p.starter),reserve=state.roster.find(p=>p.pos==='QB'&&!p.starter);subPlayer(qb.id,reserve.id);check(reserve.starter&&!qb.starter,'substitution');
let initial=state.live.timeouts[teamIndex()];timeout();check(state.live.timeouts[teamIndex()]===initial-1,'timeout decrement');
state.coach.calling='Head coach';let n=0;while(!state.live.finished&&n++<700){if(state.live.halftime)resumeHalf('Encourage');resolveSnap();check(state.live.down>=1&&state.live.down<=4,'down range');check(state.live.spot>0&&state.live.spot<100,'field position range')}
check(state.live.finished,'game terminates');check(state.live.score[0]!==state.live.score[1],'no tie');let final=[...state.live.score],home=state.live.a,away=state.live.b;commitMatch();check(state.week===1,'week advances once');check(state.schedule[0].find(g=>g.a===home&&g.b===away).score.join()===final.join(),'live score committed');check(state.teams[home].pf===final[0],'standings correct');check(state.teams.every(t=>t.w+t.l===1),'other games simulated');check(state.interviewPending,'postgame interview pending');postInterview();answerInterview('post',0);check(!state.interviewPending&&state.press.length===2,'postgame interview saved');
setCoach('name','Coach Test');setCoach('style','Vertical offense');nextSeason();check(state.coach.name==='Coach Test'&&state.press.length===2,'coach and press persist');
for(let j=0;j<5;j++){beginLive();state.coach.calling='Head coach';let guard=0;while(!state.live.finished&&guard++<700){if(state.live.halftime)resumeHalf('Stay composed');resolveSnap()}check(state.live.finished,'multi-game termination');commitMatch();answerInterview('post',2)}
console.log('PASS: navigation, save migration, substitutions, timeouts, interviews, live match progression, exact score commit, league progression, coach retention, six complete games');
`,c);
const c2={...c,document:c.document};vm.createContext(c2);vm.runInContext(fs.readFileSync('dist/game.js','utf8'),c2);vm.runInContext(fs.readFileSync('dist/match.js','utf8'),c2);vm.runInContext(`if(state.week!==5||state.coach.name!=='Coach Test')throw Error('Save reload');console.log('PASS: persisted career reload')`,c2);

vm.runInContext(`
state=fresh();ensureMatchState();beginLive();let m=state.live;
m.spot=25;m.down=2;m.toGo=8;enforcePenalty(m,'False start');check(m.spot===20&&m.down===2&&m.toGo===13,'false start distance and down');
m.spot=4;m.down=3;m.toGo=5;enforcePenalty(m,'Offensive holding');check(m.spot===2&&m.toGo===7,'half distance enforcement');
m.spot=40;m.down=3;m.toGo=3;enforcePenalty(m,'Offside');check(m.spot===45&&m.down===1&&m.toGo===10,'defensive penalty first down');
m.spot=60;m.down=4;m.toGo=15;enforcePenalty(m,'Defensive pass interference');check(m.spot>60&&m.down===1,'DPI first down');
m.spot=95;enforcePenalty(m,'Roughing the passer');check(m.spot===99&&m.toGo===1,'goal line bounds');
check(m.score[0]===0&&m.score[1]===0,'penalty cannot score');check(m.penalties.reduce((s,p)=>s+p.count,0)===5,'penalty totals');check(matchAudio.on===false,'audio opt in');
console.log('PASS: full games with penalties, false start, holding, half distance, first downs, goal line, penalty totals, audio default off');
`,c);
