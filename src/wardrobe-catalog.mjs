// Phase-one Huangying wardrobe. Names and 30/70-point tiers are configurable
// provisional labels for the supplied artwork, not official prices in the files.
export const WARDROBE_SKINS=Object.freeze([
 {id:'huangying_osmanthus',name:'桂花披风',price:30},
 {id:'huangying_peach',name:'桃花披风',price:30},
 {id:'huangying_bamboo',name:'竹影披风',price:30},
 {id:'huangying_sakura',name:'樱花披风',price:30},
 {id:'huangying_scholar',name:'江南书生',price:70},
 {id:'huangying_moon',name:'月白花嫁',price:70},
 {id:'huangying_jade',name:'青蛇仙子',price:70},
 {id:'huangying_pilgrim',name:'小小行者',price:70},
].map(skin=>Object.freeze({...skin,kind:'outfit',visualKey:skin.id,
 assetPath:'assets/wardrobe/huangying/'+skin.id.slice('huangying_'.length)+'-640.webp',
 thumbnailPath:'assets/wardrobe/huangying/'+skin.id.slice('huangying_'.length)+'-320.webp',
})).concat([
 // Keep the original IDs, prices and visual keys for already unlocked auras.
 Object.freeze({id:'lake_glow',name:'湖蓝光晕',price:30,kind:'aura',visualKey:'lake'}),
 Object.freeze({id:'sunset_glow',name:'落日光晕',price:70,kind:'aura',visualKey:'sunset'}),
]));

export function getWardrobeSkin(id){return WARDROBE_SKINS.find(skin=>skin.id===id)||null;}
