const {app,BrowserWindow,Menu,protocol,session,shell,dialog}=require('electron');
const path=require('node:path');
const {appResponse}=require('./protocol.cjs');
app.setName('Gridiron Director');
app.setPath('userData',path.join(app.getPath('appData'),'Gridiron Director'));
protocol.registerSchemesAsPrivileged([{scheme:'gridiron',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
const origin='gridiron://game';let mainWindow;
function safeExternal(url){try{const parsed=new URL(url);if(parsed.protocol==='https:')shell.openExternal(parsed.href);}catch{}}
function createWindow(){
 mainWindow=new BrowserWindow({width:1440,height:960,minWidth:900,minHeight:650,title:'Gridiron Director',backgroundColor:'#101723',show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false}});
 mainWindow.once('ready-to-show',()=>mainWindow.show());
 mainWindow.webContents.setWindowOpenHandler(({url})=>{safeExternal(url);return{action:'deny'};});
 mainWindow.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(origin+'/')){event.preventDefault();safeExternal(url);}});
 mainWindow.loadURL(origin+'/');
}
if(!app.requestSingleInstanceLock())app.quit();else{
 app.on('second-instance',()=>{if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.focus();}});
 app.whenReady().then(()=>{
  protocol.handle('gridiron',request=>appResponse(request,path.join(__dirname,'..','dist')));
  session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  const menu=[...(process.platform==='darwin'?[{label:app.name,submenu:[{role:'about'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{role:'quit'}]}]:[]),{label:'Game',submenu:[{label:'Open save data folder',click:()=>shell.openPath(app.getPath('userData'))},{label:'Move a browser career into the app',click:()=>dialog.showMessageBox(mainWindow,{type:'info',title:'Import your career',message:'Export your career from Careers & saves in the browser, then choose Import a career in this app. Each app and browser keeps independent local saves.'})},{type:'separator'},...(process.platform==='darwin'?[{role:'close'}]:[{role:'quit'}])]},{role:'editMenu'},{label:'View',submenu:[{role:'reload'},{role:'togglefullscreen'},{type:'separator'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'}]},{role:'windowMenu'}];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menu));createWindow();app.on('activate',()=>{if(!BrowserWindow.getAllWindows().length)createWindow();});
 });
 app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
}
