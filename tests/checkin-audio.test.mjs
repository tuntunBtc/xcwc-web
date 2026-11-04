import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/checkin-audio.js',import.meta.url),'utf8');
const recording=readFileSync(new URL('../assets/audio/camera.mp3',import.meta.url));
const encoded=recording.toString('base64');
const flush=()=>new Promise(resolve=>setImmediate(resolve));

function fixture({api='standard',resume='ok',decode='ok'}={}){
 const contexts=[],controller=new AbortController(),document=new EventTarget(),window=new EventTarget();
 document.hidden=false;let clock=0,resolveResume,resolveDecode;
 const node=kind=>({kind,connections:[],disconnects:0,connect(target){this.connections.push(target)},disconnect(){this.disconnects++}});
 class AudioContext{
  constructor(options){
   this.options=options;this.state='suspended';this.sampleRate=48000;this.currentTime=0;this.destination={};
   this.resumes=0;this.suspends=0;this.closes=0;this.decodes=0;this.decodedBytes=[];this.buffers=[];this.sources=[];this.filters=[];this.gains=[];contexts.push(this);
  }
  resume(){
   this.resumes++;
   if(resume==='reject')return Promise.reject(Error('audio blocked'));
   if(resume==='throw')throw Error('audio unavailable');
   if(resume==='pending')return new Promise(resolve=>{resolveResume=()=>{if(this.state!=='closed')this.state='running';resolve()}});
   this.state='running';return Promise.resolve();
  }
  suspend(){this.suspends++;this.state='suspended';return Promise.resolve()}
  close(){this.closes++;this.state='closed';return Promise.resolve()}
  decodeAudioData(bytes,onSuccess,onFailure){
   this.decodes++;this.decodedBytes.push(Array.from(new Uint8Array(bytes)));
   if(decode==='throw')throw Error('decode unavailable');
   if(decode==='reject'){onFailure(Error('recording cannot be decoded'));return;}
   const complete=()=>{
    const buffer={channels:1,numberOfChannels:1,length:Math.ceil(this.sampleRate*.35),sampleRate:this.sampleRate,duration:.35};
    this.buffers.push(buffer);onSuccess(buffer);
   };
   if(decode==='pending')resolveDecode=complete;else complete();
  }
  createBufferSource(){
   const source={...node('source'),starts:[],stops:[],onended:null,start(at){this.starts.push(at)},stop(at){this.stops.push(at)}};
   this.sources.push(source);return source;
  }
  createBiquadFilter(){const filter={...node('filter'),frequency:{value:0},Q:{value:0}};this.filters.push(filter);return filter}
  createGain(){const gain={...node('gain'),gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}}};this.gains.push(gain);return gain}
 }
 if(api==='standard')window.AudioContext=AudioContext;
 if(api==='webkit')window.webkitAudioContext=AudioContext;
 const runtime=vm.createContext({window,document,atob,performance:{now:()=>clock}});
 vm.runInContext(source.replaceAll('__CHECKIN_SHUTTER_AUDIO__',encoded)+'\nglobalThis.makeAudio=createCheckinShutterAudio;',runtime);
 const audio=runtime.makeAudio(controller.signal);
 return{audio,contexts,controller,document,window,setClock(value){clock=value},resolveResume(){resolveResume?.()},resolveDecode(){resolveDecode?.()}};
}

test('shutter has no audio context or allocation until an explicit play',async()=>{
 const f=fixture();assert.equal(f.contexts.length,0);
 f.audio.play();assert.equal(f.contexts.length,1);assert.equal(f.contexts[0].resumes,1,'resume is invoked before play returns');
 await flush();
 const c=f.contexts[0];assert.equal(c.sources.length,1);assert.equal(c.sources[0].starts.length,1);
 assert.equal(c.decodes,1);assert.deepEqual(c.decodedBytes[0],Array.from(recording),'decode the embedded shutter recording');
 assert.equal(c.buffers.length,1);assert.equal(c.buffers[0].numberOfChannels,1);assert(c.buffers[0].duration<=.5,'only a short decoded recording is retained');
 assert.equal(c.sources[0].stops[0]-c.sources[0].starts[0],c.buffers[0].duration);
 f.audio.dispose();
});

test('one voice at a time, cached buffer on later shots, suspended after sound ends',async()=>{
 const f=fixture();f.audio.play();await flush();const c=f.contexts[0],first=c.sources[0];
 f.audio.play();await flush();assert.equal(c.sources.length,1,'repeated play cannot stack voices');
 first.onended();assert.equal(c.suspends,1);assert.equal(c.state,'suspended');
 assert.equal(first.disconnects,1);assert.equal(c.filters[0].disconnects,1);assert.equal(c.gains[0].disconnects,1);
 f.audio.play();assert.equal(c.resumes,2);await flush();
 assert.equal(f.contexts.length,1);assert.equal(c.decodes,1,'reuse the decoded recording');assert.equal(c.buffers.length,1);assert.equal(c.sources.length,2);
 assert.equal(c.sources[1].buffer,c.buffers[0]);c.sources[1].onended();assert.equal(c.suspends,2);
 f.audio.dispose();
});

test('abort stops/disconnects active sound, closes the context, and prevents future playback',async()=>{
 const f=fixture();f.audio.play();await flush();const c=f.contexts[0],voice=c.sources[0],before=voice.stops.length;
 f.controller.abort();assert.equal(c.closes,1);assert.equal(c.state,'closed');assert.equal(voice.stops.length,before+1);
 assert.equal(voice.onended,null);assert.equal(voice.disconnects,1);assert.equal(c.filters[0].disconnects,1);assert.equal(c.gains[0].disconnects,1);
 f.audio.play();await flush();assert.equal(f.contexts.length,1);assert.equal(c.sources.length,1);
});

test('visibility and pagehide release sound, and a hidden page stays silent',async()=>{
 const f=fixture();f.document.hidden=true;f.audio.play();assert.equal(f.contexts.length,0);
 f.document.hidden=false;f.audio.play();await flush();f.document.hidden=true;f.document.dispatchEvent(new Event('visibilitychange'));
 assert.equal(f.contexts[0].state,'closed');
 f.document.hidden=false;f.audio.play();await flush();assert.equal(f.contexts.length,2);
 f.window.dispatchEvent(new Event('pagehide'));assert.equal(f.contexts[1].state,'closed');
 f.controller.abort();
});

for(const resume of ['reject','throw'])test(`resume ${resume} never escapes to or blocks the photo flow`,async()=>{
 const f=fixture({resume});assert.doesNotThrow(()=>f.audio.play());await flush();
 assert.equal(f.contexts.length,1);assert.equal(f.contexts[0].sources.length,0);assert.equal(f.contexts[0].state,'closed');
 f.controller.abort();
});

test('a delayed resume cannot produce a late shutter sound',async()=>{
 const f=fixture({resume:'pending'});f.audio.play();const c=f.contexts[0];assert.equal(c.resumes,1);
 f.setClock(5000);f.resolveResume();await flush();assert.equal(c.sources.length,0);assert.equal(c.state,'suspended');
 f.controller.abort();
});

test('aborting during resume prevents playback after that promise resolves',async()=>{
 const f=fixture({resume:'pending'});f.audio.play();const c=f.contexts[0];f.controller.abort();f.resolveResume();await flush();
 assert.equal(c.sources.length,0);assert.equal(c.state,'closed');
});

test('missing Web Audio safely degrades and the prefixed constructor remains supported',async()=>{
 const missing=fixture({api:'none'});assert.doesNotThrow(()=>missing.audio.play());await flush();assert.equal(missing.contexts.length,0);missing.controller.abort();
 const legacy=fixture({api:'webkit'});legacy.audio.play();await flush();assert.equal(legacy.contexts.length,1);assert.equal(legacy.contexts[0].sources.length,1);legacy.controller.abort();
});


for(const decode of ['reject','throw'])test(`decode ${decode} never escapes or plays a failed recording`,async()=>{
 const f=fixture({decode});assert.doesNotThrow(()=>f.audio.play());await flush();
 const c=f.contexts[0];assert.equal(c.decodes,1);assert.equal(c.sources.length,0);assert.equal(c.state,'closed');
 // Retrying an unavailable decoder must remain harmless to the photo flow.
 assert.doesNotThrow(()=>f.audio.play());await flush();assert.equal(f.contexts[1].sources.length,0);assert.equal(f.contexts[1].state,'closed');f.controller.abort();
});

test('pending decode is shared, and abort prevents sound when decoding completes later',async()=>{
 const f=fixture({decode:'pending'});f.audio.play();f.audio.play();const c=f.contexts[0];
 assert.equal(c.decodes,1,'do not decode twice while a recording is pending');assert.equal(c.sources.length,0);
 f.controller.abort();f.resolveDecode();await flush();assert.equal(c.sources.length,0);assert.equal(c.state,'closed');
});

test('slow decode never causes a shutter sound long after the original click',async()=>{
 const f=fixture({decode:'pending'});f.audio.play();const c=f.contexts[0];
 f.setClock(5000);f.resolveDecode();await flush();assert.equal(c.sources.length,0);assert.equal(c.state,'suspended');f.controller.abort();
});
