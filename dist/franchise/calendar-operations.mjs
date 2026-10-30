import * as S from './state.mjs';
import * as W from './world.mjs';
import {ensureCalendar,advanceDate,addDays,leagueDates,validateTargetDate} from './calendar-core.mjs';
import {processRumors} from './world-events.mjs';
export function nextCalendarAction(s,target){validateDateRange(s,target);const c=ensureCalendar(s);if(s.phase!=='offseason'&&c.nextRoundDate&&c.nextRoundDate<=target&&c.nextRoundDate<=addDays(c.date,1))return{kind:'game',date:c.nextRoundDate<c.date?c.date:c.nextRoundDate};if(c.date>=target)return{kind:'done',date:c.date};return{kind:'day',date:addDays(c.date,1)};}
function validateDateRange(s,target){const c=ensureCalendar(s);if(target<c.date)throw Error('The holiday target is before today.');}
// The user makes every club decision; the calendar only advances time and pauses when something needs them.
export function beginCalendarHoliday(s,target){validateTargetDate(s,target);const c=ensureCalendar(s);c.session={id:'holiday-'+s.year+'-'+s.franchise.clock.day+'-'+target,target,status:'running',started:c.date,rounds:0,days:0,message:''};return c.session;}
export function prepareCalendarGame(s,date){const c=ensureCalendar(s);advanceDate(s,date);return c;}
export function advanceCalendarDay(s,date){const c=ensureCalendar(s);if(date!==addDays(c.date,1))throw Error('Advance the calendar one day at a time.');advanceDate(s,date);if(c.session)c.session.days++;
 for(const club of s.franchise.clubs)for(const project of club.stadium.projects.filter(p=>p.remaining>0)){project.daysRemaining??=project.remaining*7;project.daysRemaining--;project.remaining=Math.ceil(project.daysRemaining/7);if(project.daysRemaining<=0){club.stadium[project.area]=(club.stadium[project.area]||0)+project.gain;S.log(s,'Facility project completed',project.name,'club');}}
 if(s.phase==='offseason'){
  const dates=leagueDates(s.year,s.schedule.length);s.franchise.calendar.stage=date<dates.tampering?'League meeting':date<dates.freeAgency?'Legal tampering':date<dates.draft?'Free agency':date<dates.camp?'Offseason preparation':'Training camp';
  if(date>=dates.tampering&&!c.offseasonDays['market:'+date]){W.marketDay(s,{calendarManaged:true});c.offseasonDays['market:'+date]=true;}
  if(date>=dates.camp)throw Error('Training camp opens when you finish the draft and start the new season from the offseason screen.');
 }
 processRumors(s,'calendar:'+date);c.events=c.events.slice(0,180);return c;
}
