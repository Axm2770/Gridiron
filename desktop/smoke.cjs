// Runs only with --gridiron-smoke-test, against an isolated temporary save directory.
const {setTimeout:delay}=require('node:timers/promises');
async function verifyWindow(window){
 const deadline=Date.now()+75000;
 while(Date.now()<deadline){
  const ready=await window.webContents.executeJavaScript("Boolean(window.Career && window.Calendar && window.W && window.careerStore && !document.getElementById('startup-status'))");
  if(ready)break;
  if(Date.now()+500>=deadline)throw Error('Career workspace did not finish loading within 75 seconds.');
  await delay(500);
 }
 return window.webContents.executeJavaScript(`(async()=>{
   const {addDays}=await import('./franchise/calendar-core.mjs');
   if(addDays('2026-12-31',1)!=='2027-01-01')throw Error('ES module failed');
   const response=await fetch('./data/nfl-rosters.json');
   if(!response.ok)throw Error('Packaged roster database could not load');
   const rosters=await response.json();
   if(!rosters||typeof rosters!=='object')throw Error('Invalid roster database');
   await window.careerStore.setting('desktop-smoke','roundtrip');
   const stored=await window.careerStore.read('settings','desktop-smoke');
   if(stored?.value!=='roundtrip')throw Error('Career storage did not persist');
   const workerResult=await new Promise((resolve,reject)=>{
     const worker=new Worker('./franchise/fast-worker.mjs',{type:'module'});
     const timer=setTimeout(()=>{worker.terminate();reject(Error('Simulation worker timed out'));},15000);
     worker.onerror=event=>{clearTimeout(timer);worker.terminate();reject(Error(event.message||'Simulation worker failed'));};
     worker.onmessage=event=>{clearTimeout(timer);worker.terminate();resolve(event.data);};
     const opponent=(state.team+1)%32;
     worker.postMessage({id:'desktop-launch',jobs:[{a:state.team,b:opponent,userTeam:state.team,home:state.roster,away:state.franchise.clubs[opponent].players,seed:43,target:'play',directives:{}}]});
   });
   if(workerResult?.error)throw Error('Simulation worker: '+workerResult.error);
   if(workerResult?.results?.[0]?.plays!==1)throw Error('Simulation worker did not execute one play');
   const navigation=document.getElementById('nav').textContent;
   if(!navigation.includes('Calendar'))throw Error('Calendar navigation unavailable');
   return {workspace:true,modules:true,database:true,indexedDB:true,moduleWorker:true,calendar:true};
 })()`);
}
module.exports={verifyWindow};
