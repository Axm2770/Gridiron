import * as S from './state.mjs';
import * as W from './world.mjs';
import * as P from './personnel.mjs';
import * as L from './lifecycle.mjs';
import {ensureCalendar,advanceDate,addDays,leagueDates,validateTargetDate} from './calendar-core.mjs';
import {ensureDelegation,deputy,handleDelegatedOffice,delegatedRoster,withDelegatedAuthority} from './delegation.mjs';
import {processRumors} from './world-events.mjs';
export function nextCalendarAction(s,target){validateDateRange(s,target);const c=ensureCalendar(s);if(s.phase!=='offseason'&&c.nextRoundDate&&c.nextRoundDate<=target&&c.nextRoundDate<=addDays(c.date,1))return{kind:'game',date:c.nextRoundDate<c.date?c.date:c.nextRoundDate};if(c.date>=target)return{kind:'done',date:c.date};return{kind:'day',date:addDays(c.date,1)};}
function validateDateRange(s,target){const c=ensureCalendar(s);if(target<c.date)throw Error('The holiday target is before today.');}
export function beginCalendarHoliday(s,target,delegate=true){validateTargetDate(s,target);const c=ensureCalendar(s);if(delegate&&!deputy(s))throw Error('Hire an assistant or senior coach before delegating the holiday.');c.session={id:'holiday-'+s.year+'-'+s.franchise.clock.day+'-'+target,target,delegated:delegate,status:'running',started:c.date,rounds:0,days:0,message:''};return c.session;}
export function prepareCalendarGame(s,date){const c=ensureCalendar(s);advanceDate(s,date);if(c.session?.delegated){handleDelegatedOffice(s);delegatedRoster(s);}return c;}
export function advanceCalendarDay(s,date){const c=ensureCalendar(s);if(date!==addDays(c.date,1))throw Error('Advance the calendar one day at a time.');advanceDate(s,date);if(c.session)c.session.days++;const session=c.session,delegated=!!session?.delegated,delegate=deputy(s),prefs=ensureDelegation(s).preferences;
 for(const club of s.franchise.clubs)for(const project of club.stadium.projects.filter(p=>p.remaining>0)){project.daysRemaining??=project.remaining*7;project.daysRemaining--;project.remaining=Math.ceil(project.daysRemaining/7);if(project.daysRemaining<=0){club.stadium[project.area]=(club.stadium[project.area]||0)+project.gain;S.log(s,'Facility project completed',project.name,'club');}}
 if(s.phase==='offseason'){
  const dates=leagueDates(s.year,s.schedule.length);s.franchise.calendar.stage=date<dates.tampering?'League meeting':date<dates.freeAgency?'Legal tampering':date<dates.draft?'Free agency':date<dates.camp?'Offseason preparation':'Training camp';
  if(date>=dates.tampering&&!c.offseasonDays['market:'+date]){W.marketDay(s,{calendarManaged:true});c.offseasonDays['market:'+date]=true;}
  if(delegated&&prefs.offseason&&date>=dates.draft&&!c.offseasonDays['draft:'+s.year]){withDelegatedAuthority(s,()=>{if(!s.franchise.draft)P.beginDraft(s);while(s.franchise.draft.cursor<s.franchise.draft.picks.length){P.ensureDraftRoom(s);const player=s.prospects.slice().sort((a,b)=>b.ovr-a.ovr)[0];if(!player)throw Error('No draft prospect is available.');P.draftPick(s,player.id);}});c.offseasonDays['draft:'+s.year]=true;c.events.unshift({id:'draft-'+s.year,date,kind:'Draft completed',status:'Completed'});}
  if(date>=dates.camp){if(!delegated||!prefs.offseason)throw Error('Training camp requires the offseason plan and draft to be completed. Enable staff delegation or open the offseason.');const oldYear=s.year;L.rollSeason(s);delegatedRoster(s);c.offseasonDays['camp:'+oldYear]=true;}
 }
 processRumors(s,'calendar:'+date);if(delegated)handleDelegatedOffice(s);c.events=c.events.slice(0,180);return c;
}
