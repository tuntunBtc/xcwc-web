'use strict';

const { birdAvatar } = require('../../utils/bird-preview-art');

module.exports = function diaryAccount(snapshot) {
    const accountId = snapshot?.status?.signedIn ? snapshot.userId : '';
    const pets = accountId ? snapshot.pets : [];
    return {
        accountId: accountId || '',
        selectedBirdId: accountId ? snapshot.petId : '',
        birds: (pets || []).map(pet => ({
            id: pet.petId,
            label: pet.nickname || '小鸟',
            avatar: birdAvatar(pet.birdCode),
        })),
    };
};
