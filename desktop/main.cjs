const {app,BrowserWindow,Menu,protocol,session,shell,dialog,ipcMain,net}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {spawn}=require('node:child_process');
const {appResponse}=require('./protocol.cjs');
const {createBridge}=require('./ue-bridge.cjs');
const {createUpdater}=require('./updater.cjs');
const smoke=process.argv.includes('--gridiron-smoke-test');
app.setName('Gridiron Director');
app.setPath('userData',smoke?fs.mkdtempSync(path.join(os.tmpdir(),'gridiron-launch-')):path.join(app.getPath('appData'),'Gridiron Director'));
app.setAppLogsPath();
const logFile=path.join(app.getPath('logs'),'desktop-launch.log');
function log(message){try{fs.mkdirSync(path.dirname(logFile),{recursive:true});fs.appendFileSync(logFile,new Date().toISOString()+' '+String(message)+'\n');}catch{}console.error(message);}
function startupFailure(error){log(error?.stack||error);if(smoke){app.exit(1);return;}dialog.showErrorBox('Gridiron Director could not start','Your saved careers have not been changed.\n\n'+String(error?.message||error)+'\n\nLaunch details: '+logFile);app.quit();}
process.on('uncaughtException',startupFailure);
process.on('unhandledRejection',startupFailure);
protocol.registerSchemesAsPrivileged([{scheme:'gridiron',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
const origin='gridiron://game';let mainWindow;
// Unreal bridge: loopback-only relay, off unless enabled from the Game menu or GRIDIRON_UE=1.
let ueBridge=null;
async function setUnrealBridge(enabled){try{if(enabled&&!ueBridge){ueBridge=createBridge({port:Number(process.env.GRIDIRON_UE_PORT)||47800,log,onUnrealMessage:msg=>mainWindow?.webContents.send('ue:message',msg)});await ueBridge.start();}else if(!enabled&&ueBridge){await ueBridge.stop();ueBridge=null;}}catch(error){log('Unreal bridge: '+error.message);ueBridge=null;}}
// Packaged Unreal renderer (unreal/Tools/package.ps1 -Install puts it in userData/renderer).
// Launched directly (no shell) with fixed arguments; it connects back to the loopback bridge.
let rendererProcess=null;
function rendererPath(){return [process.env.GRIDIRON_UE_EXE,path.join(app.getPath('userData'),'renderer','GridironDemo.exe')].filter(Boolean).find(p=>{try{return fs.statSync(p).isFile();}catch{return false;}})||null;}
async function openRenderer(){const exe=rendererPath();if(!exe){dialog.showMessageBox(mainWindow,{type:'info',title:'3D match view',message:'The Unreal 3D match view is not installed.',detail:'Build it once with "npm run ue:package -- -Install" (see unreal/README.md). Then choose Game → Open 3D match view.'});return;}await setUnrealBridge(true);const item=Menu.getApplicationMenu()?.getMenuItemById('ue-bridge');if(item)item.checked=true;if(rendererProcess&&rendererProcess.exitCode===null&&!rendererProcess.killed)return;rendererProcess=spawn(exe,['-windowed','-ResX=1600','-ResY=900'],{detached:true,stdio:'ignore',shell:false});rendererProcess.on('error',error=>log('3D match view: '+error.message));rendererProcess.unref();}
ipcMain.on('ue:send',(event,msg)=>{if(event.sender===mainWindow?.webContents)ueBridge?.broadcast(msg);});
ipcMain.on('ue:status',event=>{event.returnValue=ueBridge?ueBridge.status():{listening:false,clients:0,connected:false};});
// In-game updates: content downloads from GitHub Releases into userData; see updater.cjs.
const updater=createUpdater({packagedRoot:path.join(__dirname,'..','dist'),shellDir:__dirname,userData:app.getPath('userData'),appVersion:app.getVersion(),fetch:(url,options)=>net.fetch(url,options),log});
let healthTimer=null;
const fromGame=event=>event.sender===mainWindow?.webContents;
updater.onChange(status=>mainWindow?.webContents.send('updates:status',status));
ipcMain.on('updates:status',event=>{event.returnValue=updater.status();});
ipcMain.handle('updates:check',event=>fromGame(event)?updater.check():null);
ipcMain.handle('updates:download',event=>fromGame(event)?updater.download():null);
ipcMain.on('updates:reload',event=>{if(fromGame(event)){armHealthCheck();mainWindow.reload();}});
ipcMain.on('updates:ready',event=>{if(fromGame(event)){clearTimeout(healthTimer);updater.markHealthy().catch(error=>log('Updater: '+error.message));}});
ipcMain.on('updates:open-release',event=>{if(fromGame(event))safeExternal(updater.status().releaseUrl);});
// New content must boot and call ready within 45s, or it is rolled back to the packaged game.
function armHealthCheck(){clearTimeout(healthTimer);healthTimer=setTimeout(async()=>{if(!updater.isUnverified())return;log('Updater: new content did not report ready; rolling back.');await updater.rollback('The update did not start correctly, so the installed version was restored.');mainWindow?.reload();},45000);}
function scheduleUpdateChecks(){if(smoke||process.env.GRIDIRON_NO_UPDATES==='1')return;setTimeout(()=>updater.check(),8000);setInterval(()=>updater.check(),6*60*60*1000);}
function safeExternal(url){try{const parsed=new URL(url);if(parsed.protocol==='https:')shell.openExternal(parsed.href);}catch{}}
function createWindow(){
 mainWindow=new BrowserWindow({width:1440,height:960,minWidth:900,minHeight:650,title:'Gridiron Director',backgroundColor:'#101723',show:!smoke,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,preload:path.join(__dirname,'preload.cjs')}});
 mainWindow.webContents.setWindowOpenHandler(({url})=>{safeExternal(url);return{action:'deny'};});
 mainWindow.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(origin+'/')){event.preventDefault();safeExternal(url);}});
 mainWindow.webContents.on('did-fail-load',(_event,code,description,url,isMainFrame)=>{log('Load failed: '+code+' '+description+' '+url);if(isMainFrame)startupFailure(Error(description));});
 mainWindow.webContents.on('render-process-gone',(_event,details)=>startupFailure(Error('The game window stopped: '+details.reason)));
 mainWindow.webContents.on('console-message',(_event,details)=>{if(details.level==='error'||details.level===3)log('Game: '+details.message);});
 if(smoke){mainWindow.webContents.once('did-finish-load',()=>require('./smoke.cjs').verifyWindow(mainWindow).then(result=>{console.log('GRIDIRON_SMOKE_OK '+JSON.stringify(result));app.exit(0);}).catch(startupFailure));}
 mainWindow.loadURL(origin+'/').catch(startupFailure);
}
if(!app.requestSingleInstanceLock())app.quit();else{
 app.on('second-instance',()=>{if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.focus();}});
 app.whenReady().then(async()=>{
  await updater.init().catch(error=>log('Updater init: '+error.message));
  protocol.handle('gridiron',request=>appResponse(request,updater.root()));
  session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  const menu=[...(process.platform==='darwin'?[{label:app.name,submenu:[{role:'about'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{role:'quit'}]}]:[]),{label:'Game',submenu:[{label:'Open save data folder',click:()=>shell.openPath(app.getPath('userData'))},{label:'Open launch log',click:()=>shell.openPath(logFile)},{label:'Check for updates',click:()=>updater.check({manual:true})},{label:'Move a browser career into the app',click:()=>dialog.showMessageBox(mainWindow,{type:'info',title:'Import your career',message:'Export your career from Careers & saves in the browser, then choose Import a career in this app. Each app and browser keeps independent local saves.'})},{type:'separator'},...(process.platform==='win32'?[{label:'Open 3D match view (Unreal)',click:()=>openRenderer()}]:[]),{id:'ue-bridge',label:'Unreal Engine bridge (ws://127.0.0.1)',type:'checkbox',checked:process.env.GRIDIRON_UE==='1',click:item=>setUnrealBridge(item.checked)},{type:'separator'},...(process.platform==='darwin'?[{role:'close'}]:[{role:'quit'}])]},{role:'editMenu'},{label:'View',submenu:[{role:'reload'},{role:'togglefullscreen'},{type:'separator'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'}]},{role:'windowMenu'}];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menu));if(process.env.GRIDIRON_UE==='1'&&!smoke)setUnrealBridge(true);createWindow();if(updater.isUnverified())armHealthCheck();scheduleUpdateChecks();app.on('activate',()=>{if(!BrowserWindow.getAllWindows().length)createWindow();});
 }).catch(startupFailure);
 app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
}
