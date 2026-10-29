# 喂养场景素材

使用内置 image_gen 工具生成，未使用 CLI fallback。保留原始生成文件；网页通过 data URI 使用以下项目内副本，以保持现有 CSP 和沙盒边界。

- 房间背景：[room-background.png](room-background.png)
- 透明角色：[bird-transparent.png](bird-transparent.png)
- 角色参考：`/Users/beluga/Documents/ChatGPT/星辰/xcwc-reference/bird.png`

## 房间背景最终提示词

Use case: stylized-concept. Asset type: background plate for mobile virtual pet room. Create a portrait 2:3 softly rendered 3D miniature cozy Jiangnan-inspired bird companion room, with NO animal, NO character, NO text, NO UI. Fixed front camera, low viewpoint facing back wall; warm ivory plaster walls, sage-green wainscot, rounded wood furniture, an arched window on upper left with sheer linen curtain, blurred green trees and soft daylight, tiny shelf on right with books and pottery, a little woven nest bed at far right wall. Warm matte light oak floor occupies lower 45% of image. Keep central floor EMPTY for a blue bird to be composited around 68% vertical height. A soft circular woven pale straw rug on center floor, fully visible, minimal quiet decor at sides. Premium cozy game render, high quality soft shadows, miniature tactile clay and fabric materials, inviting sunny morning, warm cream and muted sage palette, straight-on perspective. No logos, no people, no lettering, no pet, no interface elements.

## 透明角色最终提示词

Use case: background-extraction. Edit target: the referenced blue plush bird. Remove ONLY the white background and create genuine transparent background alpha. Preserve the entire blue plush bird, exact straw hat, red face patch, white chest, green bag, black feet, lifted wings, original front view, exact feather textures and proportions. Keep the character centered with a small transparent margin, no background, no ground, no drop shadow, no frame, no words. This is a production sprite for a virtual pet web page, preserve identity and clean soft feather edges.

角色为预制单帧透明素材，网页使用位移、旋转和缩放演示待机、进食和触摸反馈；不是实时 3D 或骨骼动画。
