# Smart City Sim — 3D UI (Traffic → PM2.5)

## แนวคิด
- รถ = ตัวกระตุ้น (agents) ที่ปล่อย PM2.5
- สิ่งที่ “ต้องดู” = สี + แท่งสูง (มลพิษสะสมในระบบเมือง)
- ปรับพารามิเตอร์เพื่อดู cause → effect แบบเข้าใจง่าย

## วิธีรัน
1) เปิดโฟลเดอร์ใน VS Code
2) ติดตั้ง/ใช้ Live Server
3) คลิกขวา index.html → Open with Live Server

> เปิดแบบดับเบิลคลิกก็ได้ แต่ Live Server จะนิ่งกว่า

## ควบคุม
- Start / Pause / Reset
- Export PNG: เซฟรูปใส่รายงาน
- คลิกบนถนน: incident spike (PM2.5 พุ่ง)
- Hover: Tooltip ดูค่า cell

## โหมดมุมมอง
- Both: รถ + มลพิษ
- Pollution: เน้นแท่ง/สี
- Traffic: เน้นรถ
