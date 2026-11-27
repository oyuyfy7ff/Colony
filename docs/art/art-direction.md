# Pixel Colony — art direction brief

Made with the `create-game-assets` skill. All art is drawn in code; there are no image files and
no image generation. Updated for the cozy village look (warm greens, sandy paths, detailed
cottages, branching trees, joystick player).

## Technical frame
| | |
|---|---|
| Engine | Phaser 4.2, WebGL, `pixelArt: true` (nearest filtering, no mipmaps, rounded camera) |
| View | Top-down 3/4, light from the upper left |
| Scaling | The canvas holds the art 1:1; each art pixel is shown as a whole number of device pixels (about 200 art pixels from top to bottom of the screen). Camera zoom is 1 or 2, never fractional |
| Grid | 16x16 px tiles. Units 12 px wide and 17-19 px tall; houses, farms and the hall cover 2x2 tiles (32 px wide, 34-44 px tall); trees 32x40 (small 22x28). Anchor bottom-centre |
| Atlas | Every sprite is packed into one 256 px wide atlas texture `A` at boot (`src/art/sprites.js`) |
| Palette | Sweetie 16 roles plus warm grass, leaf, blossom, autumn, wood, sand and wall ramps (`COZY` in `src/art/cozy-art.js`). `tools/palette-check.mjs` fails on any off-palette pixel |
| Outline | 1 px dark outline on characters, buildings, trees and props (darker hue of the object for foliage) |
| Alpha | Hard 0/255. Soft alpha only for shadows and the light glow |

## Visual system
- **Shape language:** round and friendly. Trees: tapering trunk forking into branches, leaf clusters at the tips with gaps between them; never a single solid blob.
- **Value structure:** characters are brighter than the grass. Enemies are purple or dark green, colours villagers never wear. The player alone wears a gold tunic and teal hat.
- **Palette roles:** red, green and blue roofs; cream, rose and sky walls; yellow for light; warm grey stone; browns for wood; sand for paths.
- **Detail density:** grass stays calm (few blades, soft zones, small lush clumps) so characters and buildings read first.
- **Motion:** 2-frame walks, 1 px canopy sway, squash bounce for slimes, wing flaps for bats.

## Families and variety
| Family | Members | Locks |
|---|---|---|
| Player | hero, 2 walk frames | unique outfit |
| Villagers | 24 looks (3 skin tones, 5 hair colours, 4 hair styles incl. bun and hat, 6 shirts, 3 trousers) x walk/sit | same body rows |
| Houses | 9 looks: cottage, log cabin, townhouse x roof and wall colours | 2x2, door at the front |
| Trees | round, deep, small, pine, blossom, apple, autumn, golden; 10 crown shapes and a random flip per tree | trunk + branches + clusters |
| Fields | tomato/carrot, wheat, cabbage/pumpkin | fenced, gate at the front |
| Props | well, sign, bench, lamp, barrel, crate, logs, stump, mailbox, hay, fence, flower bed, shrub, 3 rock shapes | 1 px outline |

## Checks (run again after any art change)
```bash
npm run dev -- --port 5173 &
node tools/export-sprites.cjs out/sprites
S=.claude/skills/create-game-assets/scripts
# buildings: alpha + at most 32 colours; solid shapes (digits, dust, firefly, ripples, crate) have no
# transparent pixel by design; everything else: alpha + at most 24 colours
python3 $S/asset_report.py out/sprites/<family>.png --require-alpha --max-colors 24 --json
python3 $S/build_preview_sheet.py out/sprites/*.png --out out/contact.png --columns 10 --cell-size 96
node tools/palette-check.mjs out/sprites
```
Last run 2026-11-27: 393 sprites, all checks pass, palette check ok.
