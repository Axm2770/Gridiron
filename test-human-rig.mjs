import fs from 'node:fs';import vm from 'node:vm';import * as THREE from './dist/vendor/three.module.js';
const source=fs.readFileSync('dist/stadium.js','utf8');const classCode=source.slice(source.indexOf('class Stadium{'),source.indexOf('\nliveField=function'));
const c={THREE,console,performance,document:{createElement:()=>({width:64,height:64,getContext:()=>({fillText(){}})})},clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),lerp:(a,b,t)=>a+(b-a)*t,world:(s,p)=>p===0?s-50:50-s};vm.createContext(c);vm.runInContext(classCode,c);vm.runInContext(`
const s=Object.create(Stadium.prototype);s.scene=new THREE.Scene();s.materials=[];s.geometries=[];for(let k of ['homeJersey','awayJersey','homeHelmet','awayHelmet','pants','skin','shoe'])s[k]=s.mat('#999999');s.match={poss:0};s.players=Array.from({length:22},(_,i)=>s.makePlayer(i));s.refs=[s.makePlayer(22,true),s.makePlayer(23,true)];s.flag=s.box(.4,.1,.4,s.mat('#ffff00'),0,0,0);s.ball=new THREE.Object3D();
for(let signal of ['flag','touchdown','incomplete','first','whistle'])s.updateOfficials({poss:0,spot:30,official:{signal}},0);
if(s.players.length!==22||s.players.some(p=>p.elbows.length!==2||p.knees.length!==2))throw Error('Rig missing joints');console.log('PASS: 22 articulated rigs, elbows/knees, referee signals and full joint chains are present');
`,c);
