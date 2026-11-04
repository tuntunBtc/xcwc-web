// User-supplied authorized camera recording; processing notes in assets/audio/README.md.
// Embedded by the build: no audio request or work until the first valid click.
function createCheckinShutterAudio(signal){
 let context=null,buffer=null,decoding=null,voice=null,generation=0;
 const encoded='__CHECKIN_SHUTTER_AUDIO__';
 function dispose(){
  generation++;
  const previous=context,current=voice;context=null;buffer=null;decoding=null;voice=null;
  if(current){current.source.onended=null;try{current.source.stop();}catch{}try{current.source.disconnect();current.filter.disconnect();current.gain.disconnect();}catch{}}
  if(previous&&previous.state!=='closed')try{Promise.resolve(previous.close()).catch(()=>{});}catch{}
 }
 function play(){
  if(signal.aborted||document.hidden||voice)return;
  try{
   const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
   if(!context||context.state==='closed'){context=new Audio({latencyHint:'interactive'});buffer=null;decoding=null;}
   const current=context,ticket=++generation,at=performance.now();
   // Invoke resume while the click is still active; never await it in the photo flow.
   const ready=current.state==='running'?Promise.resolve():Promise.resolve(current.resume());
   if(!buffer&&!decoding){
    const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
    decoding=new Promise((resolve,reject)=>current.decodeAudioData(bytes.buffer,resolve,reject)).then(decoded=>{if(context===current)buffer=decoded;return decoded;});
   }
   void Promise.all([ready,buffer||decoding]).then(([,decoded])=>{
    if(signal.aborted||document.hidden||ticket!==generation||current!==context||current.state!=='running')return;
    // A delayed permission/resume must not make a shutter sound long after the tap.
    if(performance.now()-at>700){try{Promise.resolve(current.suspend()).catch(()=>{});}catch{}return;}
    try{
     const source=current.createBufferSource(),filter=current.createBiquadFilter(),gain=current.createGain();
     voice={source,filter,gain};source.buffer=decoded;filter.type='lowpass';filter.frequency.value=6500;filter.Q.value=.5;
     const start=current.currentTime+.005;
     gain.gain.setValueAtTime(.75,start);
     source.connect(filter);filter.connect(gain);gain.connect(current.destination);
     source.onended=()=>{
      source.disconnect();filter.disconnect();gain.disconnect();
      if(voice?.source===source)voice=null;
      if(current===context&&!voice&&current.state==='running')try{Promise.resolve(current.suspend()).catch(()=>{});}catch{}
     };
     source.start(start);source.stop(start+decoded.duration);
    }catch{if(current===context)dispose();}
   }).catch(()=>{if(current===context)dispose();});
  }catch{dispose();}
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden)dispose();},{signal});
 window.addEventListener('pagehide',dispose,{signal});signal.addEventListener('abort',dispose,{once:true});
 return {play,dispose};
}
