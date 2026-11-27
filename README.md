# Pixel Colony

เกมสร้างหมู่บ้านสบายๆ บนมือถือ (แนวนอน) กราฟิกพิกเซล — กลางวันสร้าง กลางคืนป้องกันมอนสเตอร์

## วิธีเล่น
- ชาวบ้านตัดไม้ ขุดหิน เก็บผลไม้เองอัตโนมัติ (เลือก "งานหลัก" เพื่อเน้นทรัพยากร)
- **บ้าน** (ไม้ 20) +2 ประชากร · **ฟาร์ม** (ไม้ 15) ผลิตอาหาร · คนใหม่เกิดเมื่อมีอาหาร 8 และมีที่ว่าง
- **หอธนู** (ไม้ 15 หิน 15) ยิงศัตรู · **กำแพง** (หิน 4) กันทาง
- กลางคืนสไลม์บุกมาจากขอบแผนที่ (ก็อบลินตั้งแต่วันที่ 4, ค้างคาวบินข้ามกำแพงตั้งแต่วันที่ 6) ป้าย "คืนนี้จะมา" บอกจำนวนและทิศล่วงหน้า ทุกคืนที่ 5 เป็นคืนเดือนแดง ตามด้วยคืนสงบ — ศาลากลางพัง = จบเกม
- มื้อเช้า: ถ้ามีอาหารพอ ชาวบ้านอิ่มและทำงานเร็วขึ้น 25% (ไม่มีใครอดตาย)
- ลากเพื่อเลื่อนแผนที่ · ถ่างสองนิ้ว/ล้อเมาส์เพื่อซูม · แตะอาคารเพื่อดู/รื้อ · บันทึกอัตโนมัติ

## พัฒนา
```bash
npm install
npm run dev      # เปิดบนมือถือผ่าน IP ในวง LAN เดียวกัน
npm test         # เทสต์กติกาเกม (node --test)
npm run build    # ได้โฟลเดอร์ dist/ เอาไปโฮสต์ได้เลย
```
Phaser 4 + Vite. กติกาเกมอยู่ใน `src/rules/` (ไม่มี Phaser, เทสต์ได้), กราฟิกพิกเซลวาดจากโค้ดใน `src/art/sprites.js` (ไม่มีไฟล์รูป), HUD เป็น HTML ใน `src/ui/`.

## ตรวจสอบ (จากสกิล gamedev)
```bash
npm test                                        # กติกา, AI, เซฟ, game feel (24 เทสต์)
node tools/bot.mjs 20 1                         # ผู้เล่นบอทเล่นแบบ headless
node tools/curve-spec.mjs && python3 .claude/skills/tower-defense/scripts/td_curve_check.py tools/waves.json
npm run build && npx vite preview --port 4173 & node tools/perf.cjs 8   # p95 ต่อเฟรม
npm run dev -- --port 5173 & node tools/measure-audio.cjs                # ความดังเพลง
node tools/export-sprites.cjs out/sprites && node tools/palette-check.mjs out/sprites
```
รายละเอียดงานภาพ: `docs/art/art-direction.md`, `docs/art/asset-manifest.json`

## Agent skills
ติดตั้ง skills จาก [gamedev-skills/awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills)
(Apache-2.0) ไว้ใน `.claude/skills/` — router (`gamedev-router`) + 79 skills
