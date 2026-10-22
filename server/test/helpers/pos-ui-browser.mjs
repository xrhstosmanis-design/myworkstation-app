import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';

// Control the content viewport explicitly. Native Chrome's --window-size may
// include browser chrome; it is not a reliable declaration of CSS innerHeight.
export async function renderPosFixture({chrome,file,width,height,scale=1,profile,screenshot,steps=[]}) {
  const child=spawn(chrome,[
    '--headless=new','--no-sandbox',
    '--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--no-first-run',
    // Packed serverless Chromium needs these only in the restricted local
    // sandbox. Normal Chrome/CI must retain its multi-process startup.
    ...(process.env.POS_UI_CHROMIUM_PACKED==='1'?[
      '--no-zygote','--single-process','--use-gl=angle',
      '--use-angle=swiftshader','--enable-unsafe-swiftshader',
    ]:[]),
    '--remote-debugging-pipe','--no-startup-window','--user-data-dir='+profile,
  ],{stdio:['ignore','ignore','pipe','pipe','pipe'],detached:process.platform!=='win32'});
  let sequence=0,buffer='',errors='';
  const requests=new Map(),events=new Map();
  let timedOut=false,exited=false,markExited;
  const exit=new Promise(resolve=>{markExited=()=>{exited=true;resolve();};});
  const signalBrowser=signal=>{
    if(!child.pid)return;
    // Each fixture owns this process group, including renderer/GPU children.
    // Escalation must never leave children writing into a deleted profile.
    try{process.platform==='win32'?child.kill(signal):process.kill(-child.pid,signal);}
    catch(error){if(error.code!=='ESRCH')throw error;}
  };
  const waitForExit=ms=>exited?Promise.resolve(true):new Promise(resolve=>{
    const timeout=setTimeout(()=>resolve(false),ms);
    exit.then(()=>{clearTimeout(timeout);resolve(true);});
  });
  const timer=setTimeout(()=>{timedOut=true;signalBrowser('SIGKILL');},25000);
  const fail=error=>{
    for(const entry of requests.values())entry.reject(error);
    requests.clear();
    for(const entry of events.values())entry.reject(error);
    events.clear();
  };
  child.on('error',error=>{markExited();fail(error);});
  child.on('exit',(code,signal)=>{markExited();fail(new Error(`Chrome exited code=${code??'null'} signal=${signal??'none'}${timedOut?' (CDP startup/render timeout after 25000ms)':''}: ${errors.slice(-1500)}`));});
  child.stderr.on('data',value=>{errors=(errors+value).slice(-1500);});
  child.stdio[3].on('error',fail);
  child.stdio[4].on('error',fail);
  child.stdio[4].on('data',chunk=>{
    buffer+=chunk;
    let boundary;
    while((boundary=buffer.indexOf('\0'))>=0){
      const raw=buffer.slice(0,boundary);buffer=buffer.slice(boundary+1);
      if(!raw)continue;
      const message=JSON.parse(raw);
      if(message.id){
        const entry=requests.get(message.id);
        if(!entry)continue;
        requests.delete(message.id);
        if(message.error)entry.reject(new Error(JSON.stringify(message.error)));
        else entry.resolve(message.result);
      }else{
        const key=`${message.sessionId||''}:${message.method}`,entry=events.get(key);
        if(entry){events.delete(key);entry.resolve(message.params);}
      }
    }
  });
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{
    const id=++sequence;
    requests.set(id,{resolve,reject});
    child.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0',error=>{
      if(error){requests.delete(id);reject(error);}
    });
  });
  const nextEvent=(method,sessionId)=>new Promise((resolve,reject)=>events.set(`${sessionId}:${method}`,{resolve,reject}));
  try{
    const {targetId}=await send('Target.createTarget',{url:'about:blank'});
    const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
    await send('Emulation.setDeviceMetricsOverride',{
      width,height,screenWidth:width,screenHeight:height,
      deviceScaleFactor:scale,mobile:false,
    },sessionId);
    await send('Page.enable',{},sessionId);
    const loaded=nextEvent('Page.loadEventFired',sessionId);
    await send('Page.navigate',{url:'file://'+file},sessionId);
    await loaded;
    if(steps.length){await send('Page.bringToFront',{},sessionId);await send('Emulation.setFocusEmulationEnabled',{enabled:true},sessionId);}
    for(const step of steps){
      if(step.evaluate){const response=await send('Runtime.evaluate',{expression:step.evaluate,awaitPromise:true,returnByValue:true},sessionId);if(response.exceptionDetails)throw new Error(JSON.stringify(response.exceptionDetails));}
      if(step.key){const code=step.key==='Enter'?13:32;await send('Input.dispatchKeyEvent',{type:'keyDown',key:step.key,code:step.key==='Enter'?'Enter':'Space',windowsVirtualKeyCode:code,nativeVirtualKeyCode:code,text:step.key==='Enter'?'\r':' '},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key:step.key,code:step.key==='Enter'?'Enter':'Space',windowsVirtualKeyCode:code,nativeVirtualKeyCode:code},sessionId);}
    }
    const {result,exceptionDetails}=await send('Runtime.evaluate',{
      expression:'({result:document.body.dataset.result,viewport:{width:innerWidth,height:innerHeight,scale:devicePixelRatio}})',
      returnByValue:true,
    },sessionId);
    if(exceptionDetails)throw new Error(JSON.stringify(exceptionDetails));
    if(screenshot){
      const image=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId);
      await writeFile(screenshot,Buffer.from(image.data,'base64'));
    }
    return result.value;
  }finally{
    clearTimeout(timer);
    // Graceful Chrome shutdown closes renderer/GPU children and flushes the
    // profile before the caller removes it. SIGKILL alone raced fs.rm in CI.
    if(!exited){
      void send('Browser.close').catch(()=>{});
      if(!await waitForExit(3000)){
        signalBrowser('SIGTERM');
        if(!await waitForExit(1000)){
          signalBrowser('SIGKILL');
          if(!await waitForExit(1000))throw new Error('Chrome did not exit after bounded shutdown');
        }
      }
    }
    // If Chrome crashed before cleanup, remove any remaining owned children.
    signalBrowser('SIGTERM');
  }
}
