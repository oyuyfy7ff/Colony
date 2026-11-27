# Pixel Colony — art direction brief

Made with the `create-game-assets` skill. All art is drawn in code (`src/art/sprites.js`); there are no image files.

## Technical frame
| | |
|---|---|
| Engine | Phaser 4.2, WebGL, `pixelArt: true` (nearest filtering, no mipmaps, rounded camera) |
| View | Top-down 3/4, light from the upper left |
| Virtual screen | 270 px tall, width follows the phone's aspect (Scale.EXPAND); zoom 1–3 |
| Grid | 16×16 px tiles; units 10–12 px wide, standing on the tile's bottom centre (anchor bottom-centre) |
| Palette | Sweetie 16 plus 10 extra entries for skin, wood, purple slime, deep greens and the grass checker (`PAL`, 26 colours). No off-palette pixels |
| Outline | 1 px `#1a1c2c` on every sprite except particles, shadows, terrain |
| Alpha | Hard 0/255 only, except the drop shadow (28 % black) and the light glow |

## Visual system
- **Shape language:** round, chunky, friendly. Villagers and slimes have big heads and bodies; buildings have readable roofs.
- **Value structure:** characters are lighter or more saturated than the grass so they read at 1× zoom. Enemies use purple and dark green, colours the villagers never wear.
- **Palette roles:** red/orange = roofs and danger; yellow = light and warm windows; blue-grey = stone; browns = wood; purple = enemies.
- **Motion:** 2-frame walks, squash bounce for slimes, wing flaps for bats. No sub-pixel motion on sprites; the camera rounds pixels.

## Families
| Family | Members | Locks |
|---|---|---|
| Villagers | 4 shirt colours × 2 walk frames | the same rows; only the shirt colour changes |
| Enemies | slime, goblin ×2, bat ×2 | outline, size 12 px wide, purple/green roles |
| Buildings | hall 32×34, house, farm, wall 16×16, tower 16×28, construction site | stone `s/S/D`, wood `n/N`, roof `r/o` |
| Nature | tree, rock, bush (with and without berries) | ground shadow baked in the base row |
| HUD icons | wood, stone, food, pop (6×6, scaled ×2–4 in the HUD) | same palette roles as the world |

## Checks (run again after any art change)
```bash
npm run dev -- --port 5173 &
node tools/export-sprites.cjs out/sprites
python3 .claude/skills/create-game-assets/scripts/asset_report.py out/sprites/*.png --require-alpha --max-colors 16 --json
python3 .claude/skills/create-game-assets/scripts/build_preview_sheet.py out/sprites/*.png --out out/contact.png --columns 8 --cell-size 96
node tools/palette-check.mjs out/sprites
```
