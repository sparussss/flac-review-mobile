FLAC Metadata Review Mobile v1.0 PWA
===================================

用途
----
專為 iPhone 搭車、出街、離開電腦時慢慢 Review 231 首 FLAC metadata。

這個 Mobile PWA 完全不讀／不寫 FLAC 音訊檔。
它只處理 Matcher CSV、Review Progress、MusicBrainz、LRCLIB 與 Write Plan。

資料來源
--------
Apple A1/A2/A3：
直接讀 Apple_Music_Match_v3_4_1_*.csv。
匯入 CSV 後，即使沒有網絡仍可以 Review Apple candidate（封面圖片除外）。

MusicBrainz M1/M2/M3：
按需要才搜尋。
不需要 Account / API Key。
程式限制約每 1.1 秒最多一次 request。
會以 Title / Artist / Album / Duration 排序 Release 候選。
M candidate 顯示 Time / Δ Time / Duration Review。

Cover Art Archive：
跟 MusicBrainz exact Release 使用 Front cover。
不另外成為候選來源。

LRCLIB：
Search Lyrics 先做 exact /api/get。
Exact 找不到才做 broad search，讓你人手選。
Synced Lyrics 優先；Plain Lyrics 由 Synced 移除 timestamp 並保持相同分行。

功能
----
- Import Apple Music Matcher v3.4.1 CSV
- Import Windows FLAC_Review_Decisions_v1.csv
- A1/A2/A3 Review
- M1/M2/M3 MusicBrainz Search
- Time / Δ Time / EXCELLENT-GOOD-CHECK-WARNING-MISMATCH
- Keep Original / Manual
- Final Metadata 編輯
- DATE 預設保留原 FLAC DATE
- 3000×3000 Apple Artwork URL 保留
- Synced Lyrics 第一頁
- Plain Lyrics 第二頁
- Import .lrc / .txt
- IndexedDB 自動保存
- 記住目前做到哪一首
- Search / Filter
- Export FLAC_Review_Decisions_v1.csv
- Export FLAC_Write_Plan_*.csv

iPhone 安裝方式
--------------
PWA 必須由 HTTPS 網站開啟，不能只在「檔案」App 直接打開 index.html 就安裝。

最簡單做法是把整個資料夾放到 GitHub Pages：
1. 建立一個 GitHub Repository。
2. 將本 ZIP 解壓後所有檔案放在 Repository 根目錄。
3. GitHub -> Settings -> Pages。
4. Deploy from a branch -> main / root。
5. 等待 GitHub Pages 網址出現。
6. iPhone 用 Safari 開該網址。
7. Safari 分享按鈕 -> 加入主畫面。

資料私隱
--------
Matcher CSV / Progress / Lyrics 會儲存在該 iPhone Safari/PWA 的 IndexedDB。
本 PWA 沒有 Firebase、登入、雲端資料庫或自動上傳功能。

請定期按 Export Progress 備份。
如果清除 Safari 網站資料、刪除 PWA 或系統清理 storage，本機進度有機會消失。

Windows 接力
-----------
iPhone Review 一段時間後：
1. Export Progress
2. 把 FLAC_Review_Decisions_v1.csv 傳回 Windows
3. Windows Review 程式 Import/沿用 Progress

或者全部完成後：
1. Export Write Plan
2. 把 FLAC_Write_Plan_*.csv 傳回 Windows
3. 之後 Writer 才負責 Backup + 寫 FLAC

安全規則
--------
Mobile v1.0 永遠不會：
- 修改 FLAC Tag
- 修改 FLAC Cover
- 改檔名
- 移動 FLAC
- 重新編碼音訊

已知限制
--------
1. Apple A candidate 搜尋不會在手機重新跑；使用 v3.4.1 CSV 已有結果。
2. MusicBrainz / LRCLIB / Cover 顯示需要網絡。
3. iPhone Safari 對第三方 API 的跨網域政策由對方服務決定；如 MusicBrainz 在 Safari 暫時拒絕 direct fetch，可在 Windows 搜尋 MusicBrainz 後 Export Progress，再 Import 到手機，M1/M2/M3 仍可離線 Review。
4. v1.0 未做 Firebase / iCloud 自動同步；目前用 Export / Import 在 iPhone 與 Windows 之間接力。
