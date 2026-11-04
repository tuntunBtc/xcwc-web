export const MAX_BIRDS=3;
export function chooseBird(selected,id,birds){const b=birds.find(x=>x.id===id);if(!b?.adopted)return {selected,error:'这只小鸟还未领养'};if(selected.includes(id))return {selected:selected.filter(x=>x!==id)};if(selected.length>=MAX_BIRDS)return {selected,error:'最多选择 3 只小鸟一起合照'};return {selected:[...selected,id]};}
export function sortedBirds(birds){return [...birds].sort((a,b)=>Number(b.adopted)-Number(a.adopted));}
export function sortedMemories(entries){return [...entries].sort((a,b)=>b.createdAt-a.createdAt||String(b.id).localeCompare(String(a.id)));}
export function earnedPoints(entries){return entries.reduce((n,e)=>n+(e.reward===1?1:0),0);}
export function arrangement(ids){const centers=ids.length===1?[735]:ids.length===2?[515,790]:[285,550,810];const size=ids.length===1?34:ids.length===2?28:24;return Object.fromEntries(ids.map((id,i)=>[id,{cx:centers[i],cy:850-size*6.3,size}]));}
export function rectFor(pose,ratio=1){const w=pose.size*12.6,h=w*ratio;return {x:pose.cx-w/2,y:pose.cy-h/2,w,h};}
export function constrain(pose,ratio=1){pose.size=Math.max(12,Math.min(55,812/(12.6*ratio),pose.size));const {w,h}=rectFor(pose,ratio);pose.cx=Math.max(38+w/2,Math.min(962-w/2,pose.cx));pose.cy=Math.max(38+h/2,Math.min(850-h/2,pose.cy));return pose;}

// Retain existing edits when the cast changes; only new birds receive a default pose.
export function reconcilePoses(ids,previous={}){const defaults=arrangement(ids);return Object.fromEntries(ids.map(id=>[id,{...(previous[id]||defaults[id])}]))}
export function resetPose(ids,previous,id){const next=reconcilePoses(ids,previous);if(ids.includes(id))next[id]={...arrangement(ids)[id]};return next}
export function photoPlacement(width,height,mode='cover',horizontal=50,vertical=50){
 const x=38,y=38,w=924,h=812,scale=(mode==='contain'?Math.min:Math.max)(w/width,h/height),dw=width*scale,dh=height*scale;
 const fraction=value=>Math.max(0,Math.min(100,Number(value)||0))/100;
 return {x:x+(w-dw)*(mode==='contain'?.5:fraction(horizontal)),y:y+(h-dh)*(mode==='contain'?.5:fraction(vertical)),width:dw,height:dh,horizontal:dw>w+.5,vertical:dh>h+.5};
}
