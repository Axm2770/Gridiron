const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const nodes={};const context={console,Date,Math,setTimeout:()=>{},localStorage:{getItem:()=>null,setItem:()=>{}},document:{getElementById:id=>nodes[id]??=( {innerHTML:'',style:{},open:false,showModal(){this.open=true},close(){this.open=false}}),querySelector:()=>({})}};vm.createContext(context);vm.runInContext(fs.readFileSync('dist/game.js','utf8'),context);vm.runInContext(`
for(let w=0;w<17;w++){let ids=state.schedule[w].flatMap(g=>[g.a,g.b]);if(new Set(ids).size!==32)throw Error('Schedule duplicate');advance();closeModal()}
if(state.phase!=='playoffs'||state.teams.some(t=>t.w+t.l!==17))throw Error('Season totals');
for(let r=0;r<3;r++){advance();closeModal()}
if(state.phase!=='offseason'||state.history.length!==1)throw Error('Playoffs progression');
let len=state.roster.length;draftPlayer(state.prospects[0].id);if(state.roster.length!==len+1||state.drafted!==1)throw Error('Draft');
let id=state.agents[0].id;signPlayer(id);if(!state.roster.find(p=>p.id===id))throw Error('Free agency');
nextSeason();if(state.year!==2027||state.week!==0||state.phase!=='season')throw Error('Rollover');
for(let v of navs.map(n=>n[0]))go(v);
console.log('PASS: schedule integrity, 17 games per team, postseason, draft, free agency, season rollover, all page renders');
`,context);
