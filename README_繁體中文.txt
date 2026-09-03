FLAC Metadata Review Mobile v1.0.2 PWA
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


v1.0.1：MusicBrainz HTTP 503 修正
--------------------------------
MusicBrainz 的 HTTP 503 代表 request 已經到達 MusicBrainz，
但服務當時因 rate limit 或全站繁忙而拒絕 request。
這不是 iPhone Safari CORS 阻擋。

v1.0.1 加入：
- HTTP 429 / 500 / 502 / 503 / 504 自動重試
- 支援 Retry-After
- 退避約 3 秒 → 6 秒 → 12 秒
- 每次 MusicBrainz request 最少約 1.2 秒間隔
- 減少不必要的 broad search
- 同一 session MusicBrainz JSON cache
- Release detail cache 繼續保留
- 503 最終仍失敗時，會清楚提示「MusicBrainz 暫時繁忙」
- Service Worker 改為 network-first，GitHub Pages 更新較容易生效

GitHub Pages 更新
----------------
把 v1.0.1 ZIP 內所有檔案覆蓋 repository 根目錄舊版後 Commit。

如果 iPhone 仍然顯示 v1.0：
1. Safari 重新整理 GitHub Pages。
2. 完全關閉已加入主畫面的 PWA。
3. 再開一次。
4. 頁面應顯示 Mobile v1.0.1。


v1.0.2：MusicBrainz 同分 Release Country
---------------------------------------
MusicBrainz 同一張專輯通常會有多個實際 Release：
JP / GB / US / ZA / XE 等。

以前 Mobile 只按 local score 排前 3。
如果多個 Release 的 Title / Artist / Album / Duration 幾乎完全一樣，
它們會得到相同分數，MusicBrainz API 返回順序就可能令 ZA / GB
排在 JP 前面。

這不代表 ZA 比 JP 更正確，只代表：
現有 FLAC metadata 沒有足夠資料去判斷原檔究竟來自哪一個國家版。

v1.0.2 改動：
- MusicBrainz 頁新增 Release Country：
  Auto / JP / HK / GB / US / TW / KR / CN / XE / AU / ZA
- Country 只用作同分／接近分 Release 的排序優先。
- 不會修改 Title / Artist / Album / Duration matching score。
- Search Status 會列出本次搜尋實際找到的 Release countries。
- MusicBrainz candidate 以 Release ID dedupe，與 Windows 邏輯一致。
- Broad search early-stop 條件改回與 Windows 較一致。
- Country preference 會記住在 iPhone 本機。

例：
Kim Wilde - If I Can't Have You
The Singles Collection 1981-1993

MusicBrainz 這個 Release Group 本身有多個 1993 版本。
如果想檢查日本版：
1. MusicBrainz → Release Country → JP
2. 再按 Search MusicBrainz
3. JP Release 會優先排入 M1/M2/M3（只要 MusicBrainz 搜尋結果包含 JP）

如果 Auto：
程式不會假裝知道原 FLAC 的國家版。
