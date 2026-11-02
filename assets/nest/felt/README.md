# 毛绒小窝素材

本轮按用户提供的参考图，用内置 image_gen 生成场景、独立角色、无字毛绒控件、三列互动卡片和四格工具图标。网页只引用压缩 WebP；文字、数值、点击区域继续由 HTML/CSS/JS 渲染。原图保留在 Codex generated_images，不打入网页。

素材尺寸与字节见 report.json，压缩脚本为 scripts/prepare-felt-nest.py。只在小窝使用，不覆盖其他页面素材。

## 最终生成提示词

### felt-scene

Edit this reference into a CLEAN BACKGROUND PLATE for a mobile game. REMOVE EVERY UI panel, text, icon, navigation bar, speech bubble, button, food/water cards, all interface decorations, and REMOVE THE CENTRAL BIRD. Fill removed areas naturally with the world behind them. Preserve exactly the reference's soft tactile wool/felt miniature world, pastel spring green tree arch overhead, pink-orange glowing fuzzy hanging lantern on the left, dreamy turquoise Jiangnan lake and distant pagoda, soft pastel pink blossoming trees, luminous green moss/grass foreground with tiny cream/pink flowers, two pink felt mushrooms on lower right. Central grassy area around 68% height remains empty to place actual character later. Upper 20% softly textured green wool tree canopy behind future HUD; lower 25% continuous green felt grass behind future interaction cards/nav. No wood deck, no cream UI shapes, no bird, no words, no symbols, no screenshots. Premium pastel felt art, warm soft sunlight, same camera/composition. Tall portrait 2:3 or close to reference aspect.

### felt-idle

Extract ONLY the central yellow oriole bird from this reference, with genuine transparent background. Preserve its exact calm friendly pose and appearance: tiny fluffy warm yellow head, very large glossy round black eyes, tiny brown beak, soft rosy cheeks, creamy white fluffy rounded body, gently lowered green wings, little feet, green leaf crown. This is the same official small yellow oriole character. Keep all fur and crown, no clipping, whole body centered with narrow transparent margins. No UI, no grass, no lantern, no mushroom, no shadow blob, no text. Do not redesign, no blue bird, no hands. Output transparent production sprite.

### felt-panel

Using the attached UI as style reference, create ONE EMPTY cream/blush pink furry felt rounded rectangle panel for a mobile game, no contents. Match the pale peach/ivory shaggy fine fur texture and soft fuzzy rounded edges of its top identity pill and speech bubble. Straight on, softly 3D padded wool cushion. Landscape 3:1 composition, whole rounded rectangle centered with small transparent margin, no perspective. Entire outside is truly transparent. Center pale cream lightly textured so dark brown live HTML labels will be readable. No icons, no flowers, no bird, no text, no symbol, no tail, no background. A reusable production UI panel sprite.

### felt-cards

From this reference recreate ONLY its three bottom interaction cards as a 3-column equal-cell sprite sheet, no surrounding background. Each card same size and scale, centered in its equal-width cell, no overlap, matching plush pale cream/pink furry rounded frames, soft pastel tactile wool look. FIRST card food bowl with yellow grains/beans, small cream flower. SECOND card fuzzy turquoise shallow water bowl and pink lotus flower. THIRD card sleepy yellow oriole face with green leaf crown being gently petted by soft hand, same yellow/cream/green character as reference. In each card reserve lower 28 percent as BLANK cream felt area for real web labels. NO TEXT, NO CHEVRONS, NO SYMBOLS, no labels. Transparent outside frames. Exactly 3 equal cells in one wide horizontal row. Preserve palette/material of reference, no hard wood frames.

### felt-tools

Create a production 2x2 square sprite atlas of FOUR small isolated felt miniatures from the reference's right toolbar. Equal square cells, objects same scale centered with 14 percent transparent safe padding. Top-left: soft lime green leaf cluster for cleaning. Top-right: pink peach wrapped present with pink ribbon. Bottom-left: tilted cream felt photo frame holding a tiny green rolling landscape and yellow sun. Bottom-right: powder blue wool jacket on a little pink flower hanger. Match the plush pale pastel wool/craft style of this reference, visible fine fibers, gentle soft shadows. Objects only, no UI panel behind, genuine transparency outside objects, NO text, no labels, no red notification dot, no other objects, no birds.

