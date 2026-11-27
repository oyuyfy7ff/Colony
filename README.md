# Games

repo นี้เก็บหลายเกมแยกโฟลเดอร์กัน ใช้ npm workspaces (ติดตั้ง `node_modules` ครั้งเดียวที่ราก)

| เกม | โฟลเดอร์ | รายละเอียด |
|---|---|---|
| Pixel Colony | `games/colony/` | เกมสร้างหมู่บ้าน กลางคืนป้องกันมอนสเตอร์ — ดู [README](games/colony/README.md) |
| เกมที่ 2 | `games/game2/` | โครงเริ่มต้น (Phaser 4 + Vite) รอเขียนต่อ |

```bash
npm install            # ครั้งเดียว ที่รากของ repo
npm run dev:colony     # เล่น/พัฒนา Pixel Colony
npm run dev:game2      # เล่น/พัฒนาเกมที่ 2
npm test               # เทสต์ทุกเกม
npm run build:colony   # ได้ games/colony/dist/
```

หรือ `cd games/<เกม>` แล้วใช้ `npm run dev` / `npm test` / `npm run build` ได้ตามเดิม
แต่ละเกมมีโค้ด เซฟ (คีย์ localStorage) และ `dist/` ของตัวเอง ไม่ปนกัน

เพิ่มเกมใหม่: คัดลอก `games/game2/` เป็นโฟลเดอร์ใหม่ เปลี่ยน `name` ใน `package.json` และ `SAVE_KEY`

Agent skills อยู่ใน `.claude/skills/` (ใช้ร่วมกันทุกเกม)
