const {app,BrowserWindow,Menu,protocol,session,shell,dialog,ipcMain,net}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {spawn}=require('node:child_process');
const {appResponse}=require('./protocol.cjs');
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
// In-game updates from GitHub Releases; see updater.cjs. Content updates download into userData.
// App updates replace the install itself, so they need a packaged app in a writable location: a
// macOS app still running from App Translocation (opened from Downloads, never moved) is read-only.
function appInstallTarget(){if(!app.isPackaged||smoke)return null;if(process.platform==='win32')return{platform:'Windows-x64',installDir:path.dirname(process.execPath),exe:process.execPath,pid:process.pid};if(process.platform==='darwin'){const bundle=path.resolve(process.execPath,'..','..','..');if(!bundle.endsWith('.app')||bundle.includes('/AppTranslocation/'))return null;return{platform:'macOS-'+(process.arch==='arm64'?'arm64':'x64'),bundle,pid:process.pid};}return null;}
// The OS's own unzip tools: tar.exe ships with Windows 10/11, ditto with macOS.
function extractZip(zip,dir){return new Promise((resolve,reject)=>{const [command,args]=process.platform==='win32'?[path.join(process.env.SystemRoot||'C:\\Windows','System32','tar.exe'),['-xf',zip,'-C',dir]]:['/usr/bin/ditto',['-x','-k',zip,dir]];const child=spawn(command,args,{stdio:'ignore',shell:false,windowsHide:true});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('unzip exited with '+code)));});}
function launchDetached(command,args){spawn(command,args,{detached:true,stdio:'ignore',shell:false,windowsHide:true}).unref();}
const updater=createUpdater({packagedRoot:path.join(__dirname,'..','dist'),shellDir:__dirname,userData:app.getPath('userData'),appVersion:app.getVersion(),fetch:(url,options)=>net.fetch(url,options),log,appInstall:appInstallTarget(),extract:extractZip,launch:launchDetached});
// Hands off to the install helper, then quits so it can replace the app and relaunch it.
let installingApp=false;
function restartIntoAppUpdate(){if(installingApp)return;installingApp=true;updater.installApp().then(started=>{if(started)app.quit();else installingApp=false;}).catch(error=>{installingApp=false;log('Updater install: '+error.message);});}
let healthTimer=null;
const fromGame=event=>event.sender===mainWindow?.webContents;
updater.onChange(status=>mainWindow?.webContents.send('updates:status',status));
ipcMain.on('updates:status',event=>{event.returnValue=updater.status();});
ipcMain.handle('updates:check',event=>fromGame(event)?updater.check():null);
ipcMain.handle('updates:download',event=>fromGame(event)?updater.download():null);
ipcMain.on('updates:reload',event=>{if(!fromGame(event))return;if(updater.appUpdateStaged()){restartIntoAppUpdate();return;}armHealthCheck();mainWindow.reload();});
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
  const menu=[...(process.platform==='darwin'?[{label:app.name,submenu:[{role:'about'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{role:'quit'}]}]:[]),{label:'Game',submenu:[{label:'Open save data folder',click:()=>shell.openPath(app.getPath('userData'))},{label:'Open launch log',click:()=>shell.openPath(logFile)},{label:'Check for updates',click:()=>updater.check({manual:true})},{label:'Move a browser career into the app',click:()=>dialog.showMessageBox(mainWindow,{type:'info',title:'Import your career',message:'Export your career from Careers & saves in the browser, then choose Import a career in this app. Each app and browser keeps independent local saves.'})},{type:'separator'},...(process.platform==='darwin'?[{role:'close'}]:[{role:'quit'}])]},{role:'editMenu'},{label:'View',submenu:[{role:'reload'},{role:'togglefullscreen'},{type:'separator'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'}]},{role:'windowMenu'}];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menu));createWindow();if(updater.isUnverified())armHealthCheck();scheduleUpdateChecks();app.on('activate',()=>{if(!BrowserWindow.getAllWindows().length)createWindow();});
 }).catch(startupFailure);
 app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
 // An app update downloaded during play ("After this session") installs when the game closes.
 app.on('before-quit',event=>{if(updater.appUpdateStaged()&&!installingApp){event.preventDefault();restartIntoAppUpdate();}});
}
