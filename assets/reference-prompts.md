# 参考图改版素材与生成说明

使用内置 image_gen 生成。图片用于独立背景、城市卡片风景和透明图标；界面文字、状态和操作由页面实现。

## treehouse-background.png

文件：`assets/treehouse-background.png`。

最终提示词：

Use case: stylized-concept. Asset type: empty background plate for a mobile virtual pet webpage. Input image is ONLY a style/composition reference. Create a portrait 9:16 magical cozy Jiangnan treehouse balcony matching the lush handmade Chinese fantasy miniature aesthetic of the reference, exceptionally detailed tactile wood, woven fibers, leaves, warm golden sunlight and soft cinematic 3D storybook shading. Absolutely NO text, UI, interface panels, buttons, characters, animals, birds, logos or borders. Massive living tree trunk and foliage arch around upper right, vines and cream blossoms framing top and sides, distant tranquil West Lake and small pagoda visible through middle-left opening, a small hanging wind chime left, glowing lantern right, wooden railing across midground. A little wooden reading chair with open book at lower left, woven nest bed at lower right. Center floor from 55% to 82% height must be clear, with a round straw rug centered at 71% height to stand a character on later. Lower 18% is simple warm wooden floor with clear visual space for buttons. Top 25% greenery with calm low contrast spaces behind overlays. Keep architecture coherent and plausible perspective. Do NOT reproduce any interface elements from reference. No pet baked into background.

## city-landscapes.png

文件：`assets/city-landscapes.png`。

最终提示词：

Use case: illustration-story. Asset type: one seamless sprite atlas containing SIX city landscape illustrations for six cards in a Chinese cozy travel game. Input image is ONLY a style reference, NOT to reproduce its UI. Make exactly a 3 COLUMN by 2 ROW equal grid with NO GUTTERS, NO BORDERS, NO WORDS, NO ICONS, NO PETS, NO UI. Whole image landscape 3:2 aspect ratio, each of six cells square and filled edge-to-edge. Reading order: top left Hangzhou West Lake with curved stone bridge, willow trees, small pagoda and blue water; top middle Suzhou classical garden with white walls, black tiled roofs, pink blossoms, rock garden and pond; top right Nanjing Ming city wall gate among golden ginkgo leaves; bottom left Shanghai waterfront with Oriental Pearl Tower and warm historic Bund buildings; bottom middle Xian ancient city wall and terracotta warrior statue, warm earthy palette; bottom right Wuhan Yellow Crane Tower with pink cherry blossoms and distant river. Consistent richly detailed handcrafted storybook 3D illustration, watercolor-like luminous foliage, cozy greens, cream gold sunlight, gentle blue skies. Each scene composed around a prominent landmark in its middle, upper 15% of each scene mostly sky, fill whole atlas. No printed labels whatsoever.

## painted-props.png

文件：`assets/painted-props.png`。

最终提示词：

Use case: stylized-concept. Asset type: one TRANSPARENT PNG icon sprite atlas for a cozy Chinese treehouse bird pet game. Exactly 3 columns by 3 rows of equal square cells, no gutters, each icon centered within its own cell with 15% transparent padding. Overall square atlas. Actual alpha transparency, NO background, NO colored squares, NO words, NO frames. Row 1: a little straw cleaning broom; a wrapped yellow gift with red ribbon; a scenic postcard with miniature pagoda and willow. Row 2: a miniature blue robe on a wood hanger with straw hat; a cute wooden shop stall with terracotta striped awning; a rustic ceramic bowl filled with millet seeds and tiny wooden spoon. Row 3: a pale turquoise ceramic water bowl with water and lotus blossom; a small blue and white plush bird being gently stroked on head by a human hand; a single golden feather. Each object is a tactile richly rendered handcrafted 3D storybook game icon with warm shadows, cream gold and moss green accents, clean readable silhouette. No other subjects and no text. Stay strictly inside equal cell regions.

依赖图标与浮层辅助库也已保存到 vendor 并内联，页面首屏不再依赖外部 CDN。

