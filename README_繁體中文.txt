FLAC Metadata Review Mobile v1.0.9 PWA
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


v1.0.3：MusicBrainz 改為「列出各版本」
---------------------------------------
v1.0.2 的 M1/M2/M3 仍然只顯示 Top 3，
所以同一 Album 有 ZA / GB / JP / US 等多個 Release 時，
日本版可能根本不在頭三個。

v1.0.3 改成兩層流程：

Step 1
------
MusicBrainz 先用：
Title + Artist + 原 FLAC Album + Duration
確認最吻合的 Recording / Album / Release Group。

Step 2
------
再直接搜尋該 Album 的實際 Releases，
把相符 Release 全部列出，不再只顯示 M1/M2/M3 三個。

每個 version 先顯示：
- Country
- Release Date
- Format
- Status
- Label
- Catalog Number
- Barcode

上方 Country filter 會自動由本次真正找到的版本產生：
All / JP / GB / ZA / XE / US ...

因此如果 MusicBrainz 有日本版，
可以直接把 Country filter 改成 JP 查看。

減少 API request
----------------
搜尋版本時不會立即對每一個 Release 逐個下載完整 track list。

只有當你按：
Use this version

程式才會：
1. 讀取該 exact Release detail
2. 確認該 Release 有目前歌曲
3. 取得 Track / Disc
4. 取得 exact Release Track Duration
5. 與 FLAC 計 Δ Time
6. 取得 Cover Art Archive front cover（如有）
7. 套用為 Final Metadata

這樣避免一次列 10 個版本就連續打 10+ 次 MusicBrainz API，
減少 503 / rate limit。

Windows Progress 相容
---------------------
手機選定某個 MusicBrainz version 後，
該「已選版本」會寫入 Progress 的 M1 欄位，
Decision = M1。

所以目前 Windows Review 程式仍可讀取手機選定的 MusicBrainz version。
M2/M3 會留空；所有未選版本只保存在 Mobile 的 MusicBrainzVersionsJson。

DATE 安全
---------
即使選 MusicBrainz Release，
Final DATE 仍保留原 FLAC DATE。
Release date 只放 CandidateDateReference，
除非你在 Metadata 頁手動修改 Final DATE。

Cover
-----
選定 exact Release 後：
有 Cover Art Archive front → 使用該 exact Release cover URL
沒有 front cover → ArtworkSource = ORIGINAL

真正 Writer 之後仍按既定規則處理到 3000×3000 artwork target。


v1.0.4：完整有封面 Version 卡片
--------------------------------
本版依照手機 Review 操作改動 MusicBrainz Versions：

1. 沒有 Cover Art Archive Front Cover 的 Release：直接不要，不顯示。
2. 有 Front Cover 但找不到目前歌曲 Track 的 Release：直接不要，不顯示。
3. 保留下來的 Version 會自動載入完整 Release detail，不需要再按 Load。
4. 每張 Version 卡直接顯示：
   - Cover（左邊）
   - Country / Release Date（右邊）
   - Format
   - Catalog Number
   - Barcode
   - Track / Disc
   - Duration
   - Δ Time
   - EXCELLENT / GOOD / CHECK / WARNING / MISMATCH
5. Use this version 只負責「選定」，不再發送 MusicBrainz request。

版面
----
手機 Version 卡固定橫向：
- 左：正方形 Cover
- 右：所有版本資料 + Use this version

API / 503
---------
因為現在要直接顯示 Track / Disc / Duration / Δ Time，程式必須逐個讀 exact Release detail。
本版沿用 MusicBrainz request queue、約 1.2 秒最小間隔、HTTP 429/5xx retry/backoff。
搜尋時畫面會顯示：
Step 3/3 · 檢查完整版本 x/y · 已保留 n

每找到一個完整有封面的 Version，就會立即出現在畫面，不必等所有版本完成。
如果中途某一個 Release 讀取失敗，會略過該 Release 並繼續下一個。

DATE 安全規則保持不變
---------------------
選 Version 不會自動改 Final DATE。Release Date 仍只作 CandidateDateReference。


v1.0.5：自動 MusicBrainz + 自動 Lyrics
---------------------------------------
1. 進入 MusicBrainz 頁面時：
   - 如果本曲未搜尋過 versions，會自動 Find Versions。
   - 已有完整 versions cache 時直接顯示，不重複打 API。
   - NO_COMPLETE_COVER_VERSIONS 不會每次重搜。
   - 自動搜尋失敗時設 60 秒 cooldown；Find Versions / Retry 仍可手動重試。
   - 如果一直停在 MusicBrainz 頁，再按 Save & Next 到下一首，也會自動 Find Versions。

2. 選 Apple A1/A2/A3 後：
   - 自動以已選 Apple Title / Artist / Album / candidate Duration 搜 LRCLIB。

3. 選 MusicBrainz Version 後：
   - 自動以 exact Release 的 Track Title / Artist / Album / Track Duration 搜 LRCLIB。

4. Lyrics 安全規則：
   - Exact result 必須通過 Title、Artist、Album、Duration 與版本字眼檢查才自動採用。
   - Duration 差 > 2.5 秒不會自動採用。
   - Live / Remix / Remaster / Acoustic / Instrumental / Karaoke / Demo / 重生版等版本標記不一致時不會自動採用。
   - Exact 不夠可靠時，自動轉 broad search 並顯示候選，由使用者決定。
   - Manual file lyrics 不會被自動搜尋覆蓋。
   - Search LRCLIB / Retry 按鈕仍保留供手動重試。

5. 自動 exact lyrics 成功後不會強制跳去 Lyrics 頁，避免打斷 Apple / MusicBrainz Review；Lyrics 已在背景儲存。


v1.0.6：Unreviewed / Reviewed 即時同步
---------------------------------------
今版修正歌曲清單 Filter 未即時更新的問題。

之前：
- 選了 Apple / MusicBrainz version 後，Decision 已經變成 Reviewed
- 頂部 Reviewed 數字會更新
- 但 Drawer 的 Unreviewed 清單可能仍然保留該歌曲，直到重新 Filter / 重開頁面

v1.0.6：
- Decision 一改變，Drawer 清單立即依目前 Filter 重新計算
- Filter = Unreviewed：
  已選好的歌曲會立即從清單消失
- Filter = Reviewed：
  已 Review 的歌曲會立即出現在 Reviewed 清單
- Search 關鍵字保持不變
- HIGH / MEDIUM / LOW / NONE Filter 保持不變
- 目前正在看的歌曲不會因為從 Unreviewed 清單消失而突然跳走
- 按 Save & Next 後，才會前往「目前 Filter 中的下一首」

例：
1. Filter = Unreviewed
2. 打開 Kim Wilde - If I Can't Have You
3. Use MusicBrainz version
4. Drawer 再打開時，該歌曲已不在 Unreviewed
5. 主畫面仍停留在該歌曲，可繼續檢查 Lyrics / Metadata
6. Save & Next -> 前往下一首 Unreviewed

這樣可以避免正在 Review 時因清單更新而突然跳去下一首。


v1.0.7：iPhone Review 畫面空間優化
----------------------------------
依照實際 iPhone 操作畫面重新整理上半部：

1. 原 FLAC 卡片縮短
- Cover 由 88px 縮至 66px
- Title / Artist 字體及 padding 收緊
- Album / Album Artist 保留完整
- Date / Track / Disc / Genre / FLAC Time 改為同一個 compact metadata row
- 所有原 FLAC 資料仍然保留，沒有刪除欄位

2. 原 FLAC 卡片 + 四個分頁按鍵固定
- Review 時向下捲動 Apple / MusicBrainz / Metadata / Lyrics 內容
- 原 FLAC 卡片及 Apple / MusicBrainz / Metadata / Lyrics 四個按鍵會保持在上方
- Header / Progress / Review 卡片的 sticky offset 由 JavaScript 依實際 iPhone 高度自動計算
- 旋轉畫面或 Safari / PWA safe area 改變時亦會重新計算

3. 增加四按鍵以下可用空間
- App Header、Progress bar、FLAC card、Section heading 全部收緊
- Apple / MusicBrainz 版本清單可以在畫面中顯示更多內容
- Bottom Previous / Save & Next 仍保持固定

4. 最頂部顯示版本
- Header 最上方直接顯示：
  PWA v1.0.7
- Drawer / Onboarding 亦同步顯示 v1.0.7

這一版只改 UI / layout，不改 Apple、MusicBrainz、LRCLIB、Review decision
及 Export Progress / Write Plan 邏輯。


v1.0.8：Save & Next 自動返回 Apple
----------------------------------
按 Save & Next 後：

1. 儲存目前 Review
2. 即時更新 Unreviewed / Reviewed 清單
3. 自動切回 Apple 頁面
4. 再前往目前 Filter 的下一首歌曲

這樣如果上一首停留在 MusicBrainz / Metadata / Lyrics，
下一首都會先從 Apple A1 / A2 / A3 開始 Review。

另外，如果上一首停留在 MusicBrainz，
下一首不會因為仍在 MusicBrainz 頁而立即自動 Find Versions，
可減少不必要的 MusicBrainz request。

Previous 按鍵不受影響；只有 Save & Next 會自動返回 Apple。


v1.0.9：換歌回 Apple + Reviewed 顯示已選版本
--------------------------------------------

1. Previous / Drawer 換歌都回 Apple
-----------------------------------
現在任何「切換到另一首歌曲」的操作都會先切回 Apple：

- Previous
- Save & Next
- Unreviewed 清單選另一首
- Reviewed 清單選另一首
- All / HIGH / MEDIUM / LOW / NONE 清單選另一首

所以重新打開另一首歌時，一律由 Apple A1 / A2 / A3 開始看。

2. Reviewed 顯示已選版本 + Duration Review
-----------------------------------------
當 Filter = Reviewed，歌曲清單除原來：
Confidence / Decision / Title / Artist

再顯示：
- 已選版本，例如：
  A2 · Apple · GB
  M1 · MusicBrainz · JP
- 已選 Album
- 已選 Version Time
- Δ Time
- Duration Review 彩色標籤

顏色沿用主 Review 畫面：
- EXCELLENT / GOOD = 綠色
- CHECK / WARNING = 黃色
- MISMATCH = 紅色

這樣重新審視 Reviewed 歌曲時，可以先從 Drawer 看出：
哪一些歌曲選的是 CHECK / WARNING / MISMATCH，
優先重新檢查。

KEEP / MANUAL 沒有 candidate duration 時不會硬加 Duration Review。
