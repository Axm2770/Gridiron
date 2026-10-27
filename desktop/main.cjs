const {app,BrowserWindow,Menu,protocol,session,shell,dialog}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {appResponse}=require('./protocol.cjs');
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
function safeExternal(url){try{const parsed=new URL(url);if(parsed.protocol==='https:')shell.openExternal(parsed.href);}catch{}}
function createWindow(){
 mainWindow=new BrowserWindow({width:1440,height:960,minWidth:900,minHeight:650,title:'Gridiron Director',backgroundColor:'#101723',show:!smoke,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false}});
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
 app.whenReady().then(()=>{
  protocol.handle('gridiron',request=>appResponse(request,path.join(__dirname,'..','dist')));
  session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  const menu=[...(process.platform==='darwin'?[{label:app.name,submenu:[{role:'about'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{role:'quit'}]}]:[]),{label:'Game',submenu:[{label:'Open save data folder',click:()=>shell.openPath(app.getPath('userData'))},{label:'Open launch log',click:()=>shell.openPath(logFile)},{label:'Move a browser career into the app',click:()=>dialog.showMessageBox(mainWindow,{type:'info',title:'Import your career',message:'Export your career from Careers & saves in the browser, then choose Import a career in this app. Each app and browser keeps independent local saves.'})},{type:'separator'},...(process.platform==='darwin'?[{role:'close'}]:[{role:'quit'}])]},{role:'editMenu'},{label:'View',submenu:[{role:'reload'},{role:'togglefullscreen'},{type:'separator'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'}]},{role:'windowMenu'}];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menu));createWindow();app.on('activate',()=>{if(!BrowserWindow.getAllWindows().length)createWindow();});
 }).catch(startupFailure);
 app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
}
