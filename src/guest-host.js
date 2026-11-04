// Phase one intentionally uses a separate browser cache, never a cloud account.
(()=>{
 __GUEST_MODEL__
 const store=createGuestStore(localStorage);
 window.xcwcGuest=store;
 window.xcwcGuestOperation=async(op,a,publicBird)=>{
  switch(op){
   case 'bootstrap':return {...store.snapshot(),currentId:store.read().currentId||null};
   case 'identity':return {account:'本机体验',localMode:true};
   case 'adoptionMine':return store.snapshot().birds;
   case 'adoptionConfirm':{const bird=await publicBird();return store.adopt(bird,a.name)}
   case 'wallet':return store.snapshot().wallet;
   case 'ledger':return store.ledger(a.beforeId);
   case 'wardrobe':return store.wardrobe();
   case 'pet':return store.pet(a.birdId,a.requestId);
   case 'care':return store.care(a.birdId,a.action,a.name);
   case 'selectBird':return store.select(a.birdId);
   case 'redeem':
   case 'equip':throw Object.assign(new Error('换装功能本期暂未开放'),{code:'WARDROBE_NOT_AVAILABLE'});
  }
 };
})();
