const vm=require('node:vm'),fs=require('node:fs');const nodes={};let saved;
function node(id){return nodes[id]??={innerHTML:'',textContent:'',style:{},open:false,showModal(){this.open=true},close(){this.open=false}}}
const c={console,Date,Math,setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},window:{addEventListener(){}},localStorage:{getItem:()=>saved||null,setItem:(k,v)=>saved=v},document:{getElementById:node,querySelector:()=>node('footer'),querySelectorAll:()=>[]}};
vm.createContext(c);vm.runInContext(fs.readFileSync('dist/game.js','utf8'),c);vm.runInContext(fs.readFileSync('dist/match.js','utf8'),c);
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
