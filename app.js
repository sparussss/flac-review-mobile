const DB_NAME='flac-review-mobile-v1';
const DB_VERSION=1;
const VALID_GENRES=['Pop','Cantopop','J-Pop','K-Pop','Mandopop'];
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const state={tracks:[],decisions:new Map(),currentKey:null,filtered:[],db:null,saveTimer:null,mbLast:0,releaseCache:new Map(),mbJsonCache:new Map(),mbSearchingKeys:new Set(),mbAutoAttempt:new Map(),lyricsSearchingKeys:new Set()};

function toast(msg,ms=2200){const el=$('#toast');el.textContent=msg;el.classList.remove('hidden');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.add('hidden'),ms)}
function safe(v){return v==null?'':String(v)}
function now(){const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`}
function num(v){const n=Number.parseFloat(v);return Number.isFinite(n)?n:0}
function esc(s){return safe(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function fmtTime(sec){sec=num(sec);if(sec<=0)return'';let ms=Math.round(sec*1000),h=Math.floor(ms/3600000);ms-=h*3600000;let m=Math.floor(ms/60000);ms-=m*60000;let s=Math.floor(ms/1000),r=ms-s*1000;return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(r).padStart(3,'0')}`:`${m}:${String(s).padStart(2,'0')}.${String(r).padStart(3,'0')}`}
function fmtDelta(d){d=num(d);return `${d>0?'+':''}${d.toFixed(3)}s`}
function durationReview(diff){diff=Math.abs(num(diff));if(diff<=1)return'EXCELLENT';if(diff<=2)return'GOOD';if(diff<=5)return'CHECK';if(diff<=10)return'WARNING';return'MISMATCH'}
function durationInfo(flac,cand){flac=num(flac);cand=num(cand);if(cand<=0)return{sec:'',time:'',deltaSec:'',delta:'',diff:'',review:'UNKNOWN'};if(flac<=0)return{sec:cand.toFixed(3),time:fmtTime(cand),deltaSec:'',delta:'',diff:'',review:'UNKNOWN'};const d=cand-flac,di=Math.abs(d);return{sec:cand.toFixed(3),time:fmtTime(cand),deltaSec:d.toFixed(3),delta:fmtDelta(d),diff:di.toFixed(3),review:durationReview(di)}}

function parseCSV(text){
  const rows=[];let row=[],field='',q=false;
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){field+='"';i++}else q=false}else field+=c}
    else if(c==='"')q=true;
    else if(c===','){row.push(field);field=''}
    else if(c==='\n'){row.push(field);field='';if(row.some(x=>x!==''))rows.push(row);row=[]}
    else if(c==='\r'){}
    else field+=c;
  }
  if(field!==''||row.length){row.push(field);rows.push(row)}
  if(!rows.length)return[];
  const h=rows.shift().map(x=>x.trim());
  return rows.map(r=>{const o={};h.forEach((k,i)=>o[k]=r[i]??'');return o});
}
function csvCell(v){v=safe(v);return /[",\r\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v}
function makeCSV(rows,headers){return '\uFEFF'+headers.join(',')+'\r\n'+rows.map(r=>headers.map(h=>csvCell(r[h])).join(',')).join('\r\n')}
function download(name,text,type='text/csv;charset=utf-8'){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),5000)}

function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains('tracks'))d.createObjectStore('tracks',{keyPath:'RelativePath'});if(!d.objectStoreNames.contains('decisions'))d.createObjectStore('decisions',{keyPath:'RelativePath'});if(!d.objectStoreNames.contains('meta'))d.createObjectStore('meta',{keyPath:'key'})};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function idbAll(store){return new Promise((res,rej)=>{const r=state.db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function idbPut(store,val){return new Promise((res,rej)=>{const r=state.db.transaction(store,'readwrite').objectStore(store).put(val);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function idbClear(store){return new Promise((res,rej)=>{const r=state.db.transaction(store,'readwrite').objectStore(store).clear();r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
async function idbBulkPut(store,vals){const tx=state.db.transaction(store,'readwrite'),s=tx.objectStore(store);vals.forEach(v=>s.put(v));return new Promise((res,rej)=>{tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
async function metaGet(key){return new Promise((res,rej)=>{const r=state.db.transaction('meta').objectStore('meta').get(key);r.onsuccess=()=>res(r.result?.value);r.onerror=()=>rej(r.error)})}
async function metaSet(key,value){return idbPut('meta',{key,value})}

const decisionFields=['FileName','RelativePath','FullPath','Confidence','Decision','CandidateRank','FinalTitle','FinalArtist','FinalAlbum','FinalAlbumArtist','FinalDate','FinalTrackNumber','FinalDiscNumber','FinalGenre','FinalArtworkUrl','MetadataSource','ArtworkSource','SelectedAppleUrl','SelectedAppleTrackId','SelectedMusicBrainzUrl','SelectedMusicBrainzRecordingId','SelectedMusicBrainzReleaseId','SelectedMusicBrainzReleaseGroupId','SelectedMusicBrainzISRC','CandidateDateReference','CandidateDateReferenceType','MusicBrainzSearchStatus','MusicBrainzSearchQuery','MusicBrainzSearchAt','MusicBrainzFoundCountries','MusicBrainzCountryPreference','MusicBrainzMatchedAlbum','MusicBrainzMatchedArtist','MusicBrainzMatchedRecordingId','MusicBrainzMatchedReleaseGroupId','MusicBrainzVersionsJson','MusicBrainzVersionCount',...Array.from({length:3},(_,i)=>i+1).flatMap(r=>['SCORE','COUNTRY','RECORDING_ID','RELEASE_ID','RELEASE_GROUP_ID','TITLE','ARTIST','ALBUM','ALBUMARTIST','DATE','TRACKNUMBER','DISCNUMBER','URL','ARTWORK','ARTWORK_PREVIEW','CAA_STATUS','ISRC','DURATION_MS','DURATION_SEC','TIME','TIME_DELTA_SEC','TIME_DELTA','TIME_DIFF_SEC','DURATION_REVIEW','STATUS','FORMAT','BARCODE','CATALOG'].map(f=>`M${r}_${f}`)),'LyricsEncodingStatus','LyricsSource','LyricsId','LyricsChoice','LyricsPlain','LyricsSynced','LyricsMatchedTitle','LyricsMatchedArtist','LyricsMatchedAlbum','LyricsMatchedDuration','LyricsInstrumental','LyricsAutoSignature','LyricsSearchStatus','LyricsSearchAt','Notes','UpdatedAt'];
function newDecision(t){const d={};decisionFields.forEach(k=>d[k]='');Object.assign(d,{FileName:t.FileName,RelativePath:t.RelativePath,Confidence:t.Confidence,FinalTitle:t.OLD_TITLE,FinalArtist:t.OLD_ARTIST,FinalAlbum:t.OLD_ALBUM,FinalAlbumArtist:t.OLD_ALBUMARTIST,FinalDate:t.OLD_DATE,FinalTrackNumber:t.OLD_TRACKNUMBER,FinalDiscNumber:t.OLD_DISCNUMBER,FinalGenre:VALID_GENRES.includes(t.TARGET_GENRE)?t.TARGET_GENRE:t.OLD_GENRE});return d}
function ensureDecision(t){let d=state.decisions.get(t.RelativePath);if(!d){d=newDecision(t);state.decisions.set(t.RelativePath,d)}else{const base=newDecision(t);decisionFields.forEach(k=>{if(!(k in d))d[k]=base[k]??''});d.FileName=t.FileName;d.Confidence=t.Confidence}return d}
async function saveDecision(d,silent=true){d.UpdatedAt=now();state.decisions.set(d.RelativePath,d);await idbPut('decisions',d);$('#saveState').textContent='已儲存';if(!silent)toast('已儲存')}
function scheduleSave(){clearTimeout(state.saveTimer);$('#saveState').textContent='儲存中…';state.saveTimer=setTimeout(async()=>{const t=currentTrack();if(!t)return;const d=ensureDecision(t);readFormIntoDecision(d);await saveDecision(d)},350)}

async function importMatcher(file){
  const rows=parseCSV(await file.text());
  const req=['RelativePath','FileName','OLD_TITLE','OLD_ARTIST','OLD_ALBUM','Confidence','FLAC_TIME','A1_TITLE','A1_DURATION_SEC'];
  if(!rows.length||req.some(k=>!(k in rows[0]))){alert('呢份唔似 Apple Music Matcher v3.4.1 CSV。');return}
  const keep=state.tracks.length?confirm('保留現有 Review Progress？\n\nOK = 保留；Cancel = 清除重新開始'):true;
  await idbClear('tracks');await idbBulkPut('tracks',rows);
  if(!keep){await idbClear('decisions');state.decisions.clear()}
  state.tracks=rows;await metaSet('matcherFileName',file.name);
  let key=await metaGet('currentKey');if(!rows.some(r=>r.RelativePath===key))key=rows[0].RelativePath;state.currentKey=key;await metaSet('currentKey',key);
  $('#emptyState').classList.add('hidden');$('#main').classList.remove('hidden');$('#bottomNav').classList.remove('hidden');applyFilter();renderAll();toast(`已載入 ${rows.length} 首`)
}
async function importProgress(file){const rows=parseCSV(await file.text());if(!rows.length||!('RelativePath'in rows[0])){alert('Progress CSV 格式不正確');return}let n=0;for(const r of rows){const t=state.tracks.find(x=>x.RelativePath===r.RelativePath);if(!t)continue;const d=ensureDecision(t);Object.keys(r).forEach(k=>{if(decisionFields.includes(k))d[k]=r[k]});state.decisions.set(t.RelativePath,d);n++}await idbBulkPut('decisions',[...state.decisions.values()]);renderAll();toast(`已匯入 ${n} 首進度`)}

function currentTrack(){return state.tracks.find(t=>t.RelativePath===state.currentKey)||null}
function currentIndex(){return state.filtered.findIndex(t=>t.RelativePath===state.currentKey)}
function normalized(s){return safe(s).normalize('NFKC').toLowerCase().replace(/feat\.?|featuring|ft\.?/g,' ').replace(/[\p{P}\p{S}\s]+/gu,' ').trim()}
function primaryArtist(s){return safe(s).split(/\s+(?:feat\.?|featuring|ft\.?)\s+/i)[0].trim()}
function levenshtein(a,b){a=normalized(a);b=normalized(b);if(a===b)return 0;if(!a.length)return b.length;if(!b.length)return a.length;let p=Array.from({length:b.length+1},(_,i)=>i),c=new Array(b.length+1);for(let i=1;i<=a.length;i++){c[0]=i;for(let j=1;j<=b.length;j++)c[j]=Math.min(c[j-1]+1,p[j]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));[p,c]=[c,p]}return p[b.length]}
function similarity(a,b){a=normalized(a);b=normalized(b);if(!a&&!b)return 1;if(!a||!b)return 0;return Math.max(0,1-levenshtein(a,b)/Math.max(a.length,b.length))}
function artistCredit(ac){return Array.isArray(ac)?ac.map(x=>safe(x.name||x.artist?.name)+(x.joinphrase||'')).join(''):''}
function mbEscape(s){return safe(s).replace(/([\\+\-!(){}\[\]^"~*?:/&|])/g,'\\$1')}

function trackMatchesActiveFilter(t){
  const q=normalized($('#searchInput')?.value||''),f=$('#filterSelect')?.value||'ALL';
  const d=ensureDecision(t),reviewed=!!d.Decision;
  if(f==='UNREVIEWED'&&reviewed)return false;
  if(f==='REVIEWED'&&!reviewed)return false;
  if(['HIGH','MEDIUM','LOW','NONE'].includes(f)&&t.Confidence!==f)return false;
  if(q&&!normalized(`${t.OLD_ARTIST} ${t.OLD_TITLE} ${t.OLD_ALBUM} ${t.FileName}`).includes(q))return false;
  return true
}
function rebuildFiltered(){state.filtered=state.tracks.filter(trackMatchesActiveFilter)}
function updateNavButtons(){
  const gi=state.tracks.findIndex(t=>t.RelativePath===state.currentKey);
  const hasPrev=gi>0&&state.tracks.slice(0,gi).some(trackMatchesActiveFilter);
  const hasNext=gi>=0&&state.tracks.slice(gi+1).some(trackMatchesActiveFilter);
  $('#prevBtn').disabled=!hasPrev;
  $('#nextBtn').disabled=!hasNext;
  $('#saveNextBtn').disabled=!hasNext
}
function refreshFilteredListKeepCurrent(){
  rebuildFiltered();
  renderTrackList();
  updateProgress();
  updateNavButtons()
}
function applyFilter(){
  rebuildFiltered();
  if(state.filtered.length&&!state.filtered.some(t=>t.RelativePath===state.currentKey)){
    state.currentKey=state.filtered[0].RelativePath;
    metaSet('currentKey',state.currentKey)
  }
  renderTrackList();
  updateProgress();
  updateNavButtons()
}
function updateProgress(){const total=state.tracks.length,done=state.tracks.filter(t=>!!ensureDecision(t).Decision).length;$('#progressText').textContent=total?`${done} / ${total} · ${Math.round(done/total*100)}% Reviewed`:'未載入資料';$('#progressFill').style.width=total?`${done/total*100}%`:'0%'}
function selectedReviewInfo(t,d){
  const decision=safe(d.Decision).toUpperCase();
  let source='',country='',album='',review='',time='',delta='';

  if(/^A[123]$/.test(decision)){
    const c=appleCandidate(t,Number(decision[1]));
    if(c){
      source='Apple';
      country=safe(c.country);
      album=safe(c.album);
      review=safe(c.durationReview).toUpperCase();
      time=safe(c.time);
      delta=safe(c.delta)
    }
  }else if(/^M[123]$/.test(decision)){
    const c=mbCandidate(d,Number(decision[1]));
    if(c){
      source='MusicBrainz';
      country=safe(c.country);
      album=safe(c.album);
      review=safe(c.durationReview).toUpperCase();
      time=safe(c.time);
      delta=safe(c.delta)
    }
  }else if(decision==='KEEP'){
    source='Keep Original';
    album=safe(t.OLD_ALBUM)
  }else if(decision==='MANUAL'){
    source='Manual';
    album=safe(d.FinalAlbum||t.OLD_ALBUM)
  }

  return {decision,source,country,album,review,time,delta}
}
function reviewedChoiceHTML(t,d){
  const x=selectedReviewInfo(t,d);
  if(!x.decision)return '';

  const sourceLine=[
    x.decision,
    x.source,
    x.country
  ].filter(Boolean).join(' · ');

  const validReview=['EXCELLENT','GOOD','CHECK','WARNING','MISMATCH'].includes(x.review);
  const durationBits=[
    x.time ? x.time : '',
    x.delta ? `Δ ${x.delta}` : ''
  ].filter(Boolean).join(' · ');

  return `<div class="reviewed-choice">
    <div class="reviewed-choice-top">
      <span class="reviewed-version">${esc(sourceLine||x.decision)}</span>
      ${validReview?`<span class="reviewed-duration-badge ${esc(x.review)}">${esc(x.review)}</span>`:''}
    </div>
    ${x.album?`<div class="reviewed-album">${esc(x.album)}</div>`:''}
    ${durationBits?`<div class="reviewed-duration-detail">${esc(durationBits)}</div>`:''}
  </div>`
}

function renderTrackList(){
  const box=$('#trackList');
  if(!box)return;
  const showReviewedInfo=($('#filterSelect')?.value||'ALL')==='REVIEWED';

  box.innerHTML=state.filtered.map(t=>{
    const d=ensureDecision(t),s=d.Decision||'—';
    const extra=showReviewedInfo&&d.Decision?reviewedChoiceHTML(t,d):'';
    return `<div class="track-item ${t.RelativePath===state.currentKey?'current':''}" data-key="${esc(t.RelativePath)}">
      <div class="track-status">${esc(t.Confidence)}<br>${esc(s)}</div>
      <div class="track-copy">
        <b>${esc(t.OLD_TITLE)}</b>
        <span class="track-artist">${esc(t.OLD_ARTIST)}</span>
        ${extra}
      </div>
    </div>`
  }).join('');

  box.querySelectorAll('.track-item').forEach(el=>el.onclick=async()=>{
    await selectTrack(el.dataset.key);
    closeDrawer()
  })
}
function summaryItem(k,v){return `<div><b>${esc(k)}</b>${esc(v||'—')}</div>`}
function compactFlacSummary(t){
  const time=t.FLAC_TIME||fmtTime(t.DurationSeconds);
  return `
    <div class="flac-summary-line">
      <span class="flac-summary-label">Album</span>
      <span class="flac-summary-value">${esc(t.OLD_ALBUM||'—')}</span>
    </div>
    <div class="flac-summary-line">
      <span class="flac-summary-label">Album Artist</span>
      <span class="flac-summary-value">${esc(t.OLD_ALBUMARTIST||'—')}</span>
    </div>
    <div class="flac-summary-meta">
      <span><b>Date</b>${esc(t.OLD_DATE||'—')}</span>
      <span><b>Track / Disc</b>${esc(t.OLD_TRACKNUMBER||'—')} / ${esc(t.OLD_DISCNUMBER||'—')}</span>
      <span><b>Genre</b>${esc(t.OLD_GENRE||'—')}</span>
      <span><b>FLAC</b>${esc(time||'—')}</span>
    </div>`
}
function candidateImage(url){if(!url)return'';let p=url.replace('/3000x3000bb.jpg','/300x300bb.jpg');p=p.replace(/\/front(?:-500|-250)?$/, '/front-250');return `<img src="${esc(p)}" loading="lazy" alt="cover" onerror="this.style.visibility='hidden'">`}
function appleCandidate(t,r){const p=`A${r}_`,title=t[p+'TITLE'];if(!title)return null;return{rank:`A${r}`,source:'Apple',score:t[p+'SCORE'],country:t[p+'COUNTRY'],title,artist:t[p+'ARTIST'],album:t[p+'ALBUM'],date:t[p+'DATE'],track:t[p+'TRACKNUMBER'],disc:t[p+'DISCNUMBER'],url:t[p+'URL'],art:t[p+'ARTWORK_3000'],time:t[p+'TIME'],delta:t[p+'TIME_DELTA'],durationReview:t[p+'DURATION_REVIEW'],durationSec:t[p+'DURATION_SEC'],trackId:t[p+'TRACK_ID']}}
function mbCandidate(d,r){const p=`M${r}_`,title=d[p+'TITLE'];if(!title)return null;return{rank:`M${r}`,source:'MusicBrainz',score:d[p+'SCORE'],country:d[p+'COUNTRY'],title,artist:d[p+'ARTIST'],album:d[p+'ALBUM'],albumArtist:d[p+'ALBUMARTIST'],date:d[p+'DATE'],track:d[p+'TRACKNUMBER'],disc:d[p+'DISCNUMBER'],url:d[p+'URL'],art:d[p+'ARTWORK_PREVIEW']||d[p+'ARTWORK'],artFinal:d[p+'ARTWORK'],time:d[p+'TIME'],delta:d[p+'TIME_DELTA'],durationReview:d[p+'DURATION_REVIEW'],durationSec:d[p+'DURATION_SEC'],recordingId:d[p+'RECORDING_ID'],releaseId:d[p+'RELEASE_ID'],releaseGroupId:d[p+'RELEASE_GROUP_ID'],isrc:d[p+'ISRC']}}
function candidateHTML(c,selected){const cls=c.durationReview||'UNKNOWN',art=c.art?candidateImage(c.art):'';return `<article class="candidate ${selected===c.rank?'selected':''} ${art?'':'no-cover'}">${art}<div><div class="candidate-top"><span class="candidate-rank">${esc(c.rank)} · ${esc(c.source)}</span><span class="candidate-score">Score ${esc(c.score)} · ${esc(c.country)}</span></div><div class="candidate-title">${esc(c.title)}</div><div class="candidate-meta">${esc(c.artist)}<br>${esc(c.album)}<br>${esc(c.date)} · Track ${esc(c.track||'—')} / Disc ${esc(c.disc||'—')}</div><div class="duration-row"><span class="pill">${esc(c.time||'Time —')}</span><span class="pill">Δ ${esc(c.delta||'—')}</span><span class="pill ${esc(cls)}">${esc(cls)}</span></div><div class="candidate-actions"><button data-use="${esc(c.rank)}">Use ${esc(c.rank)}</button>${c.url?`<button class="secondary" data-open="${esc(c.url)}">Open</button>`:'<button class="secondary" disabled>No Link</button>'}</div></div></article>`}

function renderAll(){if(!state.tracks.length)return;const t=currentTrack();if(!t)return;const d=ensureDecision(t);$('#confidenceBadge').textContent=t.Confidence||'—';$('#confidenceBadge').className=`badge ${t.Confidence||''}`;$('#trackTitle').textContent=t.OLD_TITLE;$('#trackArtist').textContent=t.OLD_ARTIST;$('#flacSummary').innerHTML=compactFlacSummary(t);
  const selected=d.Decision;const ac=[1,2,3].map(r=>appleCandidate(t,r)).filter(Boolean);$('#appleCandidates').innerHTML=ac.length?ac.map(c=>candidateHTML(c,selected)).join(''):'<div class="status-box">Apple candidate 없음 / NONE</div>';
  renderMusicBrainzVersions(t,d);
  fillForm(d);renderDecisionInfo(d);renderLyrics(d);setCurrentCover(d,t);bindCandidateButtons();
  // v1.0.9.2: Review status changes are reflected in the drawer immediately.
  // Keep the current song on screen even if it has just left the Unreviewed filter.
  refreshFilteredListKeepCurrent();
}
function fillForm(d){$('#finalTitle').value=d.FinalTitle||'';$('#finalArtist').value=d.FinalArtist||'';$('#finalAlbum').value=d.FinalAlbum||'';$('#finalAlbumArtist').value=d.FinalAlbumArtist||'';$('#finalDate').value=d.FinalDate||'';$('#finalTrack').value=d.FinalTrackNumber||'';$('#finalDisc').value=d.FinalDiscNumber||'';$('#finalGenre').value=VALID_GENRES.includes(d.FinalGenre)?d.FinalGenre:'Pop';$('#finalArtwork').value=d.FinalArtworkUrl||''}
function readFormIntoDecision(d){d.FinalTitle=$('#finalTitle').value;d.FinalArtist=$('#finalArtist').value;d.FinalAlbum=$('#finalAlbum').value;d.FinalAlbumArtist=$('#finalAlbumArtist').value;d.FinalDate=$('#finalDate').value;d.FinalTrackNumber=$('#finalTrack').value;d.FinalDiscNumber=$('#finalDisc').value;d.FinalGenre=$('#finalGenre').value;d.FinalArtworkUrl=$('#finalArtwork').value;d.LyricsSynced=normalizeSynced($('#lyricsSynced').value);d.LyricsPlain=d.LyricsSynced?plainFromSynced(d.LyricsSynced):$('#lyricsPlain').value;if(!d.Decision&&[d.FinalTitle,d.FinalArtist,d.FinalAlbum].some(Boolean)){} }
function renderDecisionInfo(d){$('#decisionInfo').textContent=`Decision: ${d.Decision||'UNREVIEWED'}\nMetadata Source: ${d.MetadataSource||'—'} · Artwork: ${d.ArtworkSource||'—'}\nCandidate DATE ref: ${d.CandidateDateReference||'—'}`}
function renderLyrics(d){$('#lyricsSynced').value=d.LyricsSynced||'';$('#lyricsPlain').value=d.LyricsPlain||'';$('#lyricsStatus').textContent=d.LyricsSource?`Source: ${d.LyricsSource} · ID: ${d.LyricsId||'—'} · Mode: ${d.LyricsChoice||'—'}\nMatched: ${d.LyricsMatchedTitle||'—'} / ${d.LyricsMatchedArtist||'—'} / ${d.LyricsMatchedAlbum||'—'} / ${d.LyricsMatchedDuration||'—'}s`:'未搜尋'}
function setCurrentCover(d,t){let u=d.FinalArtworkUrl||t.A1_ARTWORK_3000||'';$('#currentCover').src=u?u.replace('/3000x3000bb.jpg','/300x300bb.jpg').replace('/front','/front-250'):'';$('#currentCover').style.visibility=u?'visible':'hidden'}
function bindCandidateButtons(){$$('[data-use]').forEach(b=>b.onclick=()=>applyCandidate(b.dataset.use));$$('[data-open]').forEach(b=>b.onclick=()=>window.open(b.dataset.open,'_blank'))}
async function selectTrack(key){
  const old=currentTrack();
  if(old){
    const od=ensureDecision(old);
    readFormIntoDecision(od);
    await saveDecision(od)
  }
  state.currentKey=key;
  await metaSet('currentKey',key);

  // v1.0.9.2: every explicit song change starts from Apple.
  // Covers Previous, drawer selection, Reviewed/Unreviewed selection,
  // and Save & Next via nav().
  switchSection('apple');
  renderAll();
  window.scrollTo({top:0,behavior:'smooth'})
}

async function applyCandidate(rank){const t=currentTrack(),d=ensureDecision(t);if(rank.startsWith('A')){const c=appleCandidate(t,Number(rank[1]));if(!c)return;Object.assign(d,{Decision:rank,CandidateRank:rank,MetadataSource:'APPLE',ArtworkSource:'APPLE',FinalTitle:c.title,FinalArtist:c.artist,FinalAlbum:c.album,CandidateDateReference:c.date,CandidateDateReferenceType:'Apple track releaseDate reference',FinalArtworkUrl:c.art,SelectedAppleUrl:c.url,SelectedAppleTrackId:c.trackId,SelectedMusicBrainzUrl:'',SelectedMusicBrainzRecordingId:'',SelectedMusicBrainzReleaseId:'',SelectedMusicBrainzReleaseGroupId:'',SelectedMusicBrainzISRC:''});if(!d.FinalAlbumArtist)d.FinalAlbumArtist=d.FinalArtist;if(c.track)d.FinalTrackNumber=c.track;if(c.disc)d.FinalDiscNumber=c.disc}
  else{const c=mbCandidate(d,Number(rank[1]));if(!c)return;Object.assign(d,{Decision:rank,CandidateRank:rank,MetadataSource:'MUSICBRAINZ',FinalTitle:c.title,FinalArtist:c.artist,FinalAlbum:c.album,CandidateDateReference:c.date,CandidateDateReferenceType:'MusicBrainz release date reference',SelectedMusicBrainzUrl:c.url,SelectedMusicBrainzRecordingId:c.recordingId,SelectedMusicBrainzReleaseId:c.releaseId,SelectedMusicBrainzReleaseGroupId:c.releaseGroupId,SelectedMusicBrainzISRC:c.isrc,SelectedAppleUrl:'',SelectedAppleTrackId:''});if(c.albumArtist)d.FinalAlbumArtist=c.albumArtist;else if(!d.FinalAlbumArtist)d.FinalAlbumArtist=d.FinalArtist;if(c.track)d.FinalTrackNumber=c.track;if(c.disc)d.FinalDiscNumber=c.disc;if(c.artFinal){d.FinalArtworkUrl=c.artFinal;d.ArtworkSource='COVER_ART_ARCHIVE'}else{d.FinalArtworkUrl='';d.ArtworkSource='ORIGINAL'}}
  d.FinalGenre=VALID_GENRES.includes(t.TARGET_GENRE)?t.TARGET_GENRE:t.OLD_GENRE;if(!d.FinalDate)d.FinalDate=t.OLD_DATE;await saveDecision(d);renderAll();toast(`已選 ${rank} · 自動搜尋 Lyrics`);void autoSearchLyricsAfterSelection(t.RelativePath)}
async function keepOriginal(){const t=currentTrack(),d=ensureDecision(t);Object.assign(d,{Decision:'KEEP',CandidateRank:'',FinalTitle:t.OLD_TITLE,FinalArtist:t.OLD_ARTIST,FinalAlbum:t.OLD_ALBUM,FinalAlbumArtist:t.OLD_ALBUMARTIST,FinalDate:t.OLD_DATE,FinalTrackNumber:t.OLD_TRACKNUMBER,FinalDiscNumber:t.OLD_DISCNUMBER,FinalGenre:VALID_GENRES.includes(t.TARGET_GENRE)?t.TARGET_GENRE:t.OLD_GENRE,FinalArtworkUrl:'',MetadataSource:'ORIGINAL',ArtworkSource:'ORIGINAL',SelectedAppleUrl:'',SelectedAppleTrackId:'',SelectedMusicBrainzUrl:'',SelectedMusicBrainzRecordingId:'',SelectedMusicBrainzReleaseId:'',SelectedMusicBrainzReleaseGroupId:'',SelectedMusicBrainzISRC:'',CandidateDateReference:'',CandidateDateReferenceType:''});await saveDecision(d);renderAll();toast('Keep Original')}
async function manual(){const t=currentTrack(),d=ensureDecision(t);readFormIntoDecision(d);d.Decision='MANUAL';d.CandidateRank='';d.MetadataSource='MANUAL';if(!d.ArtworkSource)d.ArtworkSource=d.FinalArtworkUrl?'MANUAL':'ORIGINAL';await saveDecision(d);renderAll();switchSection('metadata');toast('Manual mode')}

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function retryAfterMs(res){
  const v=res.headers.get('Retry-After');
  if(!v)return 0;
  const sec=Number(v);
  if(Number.isFinite(sec)&&sec>=0)return Math.round(sec*1000);
  const when=Date.parse(v);
  return Number.isFinite(when)?Math.max(0,when-Date.now()):0
}
function mbBusyMessage(status,attempt,maxRetries,waitMs){
  const sec=Math.max(1,Math.ceil(waitMs/1000));
  const el=$('#mbStatus');
  if(el)el.textContent=`MusicBrainz 暫時繁忙 (HTTP ${status}) · ${sec}s 後自動重試 ${attempt}/${maxRetries}`;
}
let mbQueue=Promise.resolve();
async function mbFetch(url,{maxRetries=3,useCache=true}={}){
  if(useCache&&state.mbJsonCache.has(url))return state.mbJsonCache.get(url);

  mbQueue=mbQueue.catch(()=>{}).then(async()=>{
    let lastError=null;

    for(let attempt=0;attempt<=maxRetries;attempt++){
      const throttleWait=Math.max(0,1200-(Date.now()-state.mbLast));
      if(throttleWait)await sleep(throttleWait);

      state.mbLast=Date.now();

      let res;
      try{
        res=await fetch(url,{
          headers:{'Accept':'application/json'},
          cache:'no-store'
        });
      }catch(err){
        lastError=err;
        if(attempt>=maxRetries)throw err;

        const waitMs=[2500,5000,10000][Math.min(attempt,2)]+Math.floor(Math.random()*500);
        const el=$('#mbStatus');
        if(el)el.textContent=`MusicBrainz 網絡暫時不穩定 · ${Math.ceil(waitMs/1000)}s 後自動重試 ${attempt+1}/${maxRetries}`;
        await sleep(waitMs);
        continue;
      }

      if(res.ok){
        const data=await res.json();
        if(useCache)state.mbJsonCache.set(url,data);
        return data;
      }

      const body=await res.text();
      const retryable=[429,500,502,503,504].includes(res.status);

      if(retryable&&attempt<maxRetries){
        let waitMs=retryAfterMs(res);
        if(!waitMs)waitMs=[3000,6000,12000][Math.min(attempt,2)];
        waitMs+=Math.floor(Math.random()*700);
        mbBusyMessage(res.status,attempt+1,maxRetries,waitMs);
        await sleep(waitMs);
        continue;
      }

      const compact=body.replace(/\s+/g,' ').trim().slice(0,400);
      throw new Error(`MusicBrainz HTTP ${res.status}${compact?`: ${compact}`:''}`);
    }

    throw lastError||new Error('MusicBrainz request failed');
  });

  return mbQueue;
}
async function mbSearchSafe(q,plain){const base='https://musicbrainz.org/ws/2/recording/';let u=`${base}?query=${encodeURIComponent(q)}&limit=25&fmt=json`;try{return await mbFetch(u)}catch(e){if(String(e.message).includes('HTTP 400'))return mbFetch(`${base}?query=${encodeURIComponent(plain)}&limit=25&fmt=json&dismax=true`);throw e}}

async function mbReleaseSearchSafe(q,plain){
  const base='https://musicbrainz.org/ws/2/release/';
  let u=`${base}?query=${encodeURIComponent(q)}&limit=100&fmt=json`;
  try{return await mbFetch(u)}
  catch(e){
    if(String(e.message).includes('HTTP 400')){
      return mbFetch(`${base}?query=${encodeURIComponent(plain)}&limit=100&fmt=json&dismax=true`);
    }
    throw e
  }
}
function releaseFormats(rel){
  return [...new Set((rel.media||[]).map(m=>safe(m.format)).filter(Boolean))].join(' / ')
}
function releaseCatalog(rel){
  return [...new Set((rel['label-info']||[]).map(x=>safe(x['catalog-number'])).filter(Boolean))].join(';')
}
function releaseLabel(rel){
  return [...new Set((rel['label-info']||[]).map(x=>safe(x.label?.name)).filter(Boolean))].join(';')
}
function releaseSummary(rel,matchedRgid,album,artist){
  const relArtist=artistCredit(rel['artist-credit']);
  const rgid=safe(rel['release-group']?.id);
  const albumSim=similarity(album,rel.title);
  const artistSim=similarity(primaryArtist(artist),primaryArtist(relArtist));
  return {
    id:safe(rel.id),
    title:safe(rel.title),
    artist:relArtist,
    country:safe(rel.country)||'—',
    date:safe(rel.date)||'—',
    status:safe(rel.status),
    format:releaseFormats(rel),
    catalog:releaseCatalog(rel),
    label:releaseLabel(rel),
    barcode:safe(rel.barcode),
    releaseGroupId:rgid,
    exactGroup:!!matchedRgid&&rgid===matchedRgid,
    albumSim,
    artistSim
  }
}
function parseMbVersions(d){
  try{
    const a=JSON.parse(d.MusicBrainzVersionsJson||'[]');
    return Array.isArray(a)?a:[]
  }catch{return[]}
}
function versionSort(a,b){
  if(a.exactGroup!==b.exactGroup)return a.exactGroup?-1:1;
  if(b.albumSim!==a.albumSim)return b.albumSim-a.albumSim;
  if(b.artistSim!==a.artistSim)return b.artistSim-a.artistSim;
  const ca=safe(a.country),cb=safe(b.country);
  if(ca!==cb)return ca.localeCompare(cb);
  return safe(a.date).localeCompare(safe(b.date))
}
function populateVersionCountries(versions){
  const sel=$('#mbVersionCountryFilter');
  if(!sel)return;
  const current=sel.value||'ALL';
  const countries=[...new Set(versions.map(v=>v.country).filter(x=>x&&x!=='—'))].sort();
  sel.innerHTML='<option value="ALL">All versions</option>'+countries.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
  sel.value=countries.includes(current)?current:'ALL'
}
function versionFromDetail(base,detail,ti,t,d){
  if(!detail?.['cover-art-archive']?.front || !ti?.track)return null;
  const tr=ti.track,med=ti.medium;
  const rec=tr.recording||{};
  const durMs=num(tr.length)||num(rec.length)||0;
  const inf=durationInfo(t.DurationSeconds,durMs/1000);
  const releaseId=safe(detail.id)||base.id;
  const isrcs=[...(rec.isrcs||[])].filter(Boolean);
  const catalog=[...new Set((detail['label-info']||[]).map(x=>safe(x['catalog-number'])).filter(Boolean))].join(';');
  const label=[...new Set((detail['label-info']||[]).map(x=>safe(x.label?.name)).filter(Boolean))].join(';');
  return {
    ...base,
    id:releaseId,
    title:safe(detail.title)||base.title,
    artist:artistCredit(detail['artist-credit'])||base.artist,
    country:safe(detail.country)||base.country||'—',
    date:safe(detail.date)||base.date||'—',
    status:safe(detail.status)||base.status,
    releaseGroupId:safe(detail['release-group']?.id)||base.releaseGroupId,
    format:safe(med?.format)||releaseFormats(detail)||base.format,
    catalog:catalog||base.catalog,
    label:label||base.label,
    barcode:safe(detail.barcode)||base.barcode,
    artwork:`https://coverartarchive.org/release/${releaseId}/front`,
    artworkPreview:`https://coverartarchive.org/release/${releaseId}/front-500`,
    recordingId:safe(rec.id)||d.MusicBrainzMatchedRecordingId||'',
    trackTitle:safe(tr.title)||safe(rec.title)||t.OLD_TITLE,
    trackArtist:artistCredit(tr['artist-credit'])||artistCredit(rec['artist-credit'])||d.MusicBrainzMatchedArtist||t.OLD_ARTIST,
    albumArtist:artistCredit(detail['artist-credit'])||'',
    track:safe(tr.number)||safe(tr.position)||'—',
    disc:safe(med?.position)||'—',
    durationMs:durMs||'',
    durationSec:inf.sec,
    time:inf.time,
    deltaSec:inf.deltaSec,
    delta:inf.delta,
    diff:inf.diff,
    durationReview:inf.review,
    isrc:[...new Set(isrcs)].join(';')
  }
}
function versionCardHTML(v,d){
  const selected=d.SelectedMusicBrainzReleaseId===v.id&&d.MetadataSource==='MUSICBRAINZ';
  const review=v.durationReview||'UNKNOWN';
  const cover=`<div class="version-cover-wrap"><img class="version-cover" src="${esc(v.artworkPreview||v.artwork)}" loading="lazy" alt="cover"></div>`;
  return `<article class="version-card ${selected?'selected':''}" data-version-id="${esc(v.id)}">
    ${cover}
    <div class="version-info">
      <div class="version-head">
        <div class="version-country">${esc(v.country||'—')}</div>
        <div class="version-date">${esc(v.date||'—')}</div>
      </div>
      <div class="version-title">${esc(v.title)}</div>
      <div class="version-meta">${esc(v.artist||d.MusicBrainzMatchedArtist||'')}${v.label?`<br>${esc(v.label)}`:''}</div>
      <div class="version-facts">
        <div class="version-fact"><span class="k">Format</span><span class="v">${esc(v.format||'—')}</span></div>
        <div class="version-fact"><span class="k">Catalog</span><span class="v">${esc(v.catalog||'—')}</span></div>
        <div class="version-fact"><span class="k">Track / Disc</span><span class="v">${esc(v.track||'—')} / ${esc(v.disc||'—')}</span></div>
        <div class="version-fact"><span class="k">Barcode</span><span class="v">${esc(v.barcode||'—')}</span></div>
      </div>
      <div class="version-duration">
        <span class="pill">Duration ${esc(v.time||'—')}</span>
        <span class="pill">Δ ${esc(v.delta||'—')}</span>
        <span class="pill ${esc(review)}">${esc(review)}</span>
      </div>
      <div class="version-actions">
        <button data-use-version="${esc(v.id)}">${selected?'Selected':'Use this version'}</button>
        <button class="secondary" data-open-version="${esc(v.id)}">Open</button>
      </div>
    </div>
  </article>`
}
function renderMusicBrainzVersions(t,d){
  const versions=parseMbVersions(d);
  const albumBox=$('#mbAlbumSummary'),tools=$('#mbVersionTools'),list=$('#mbVersions');

  if(d.MusicBrainzMatchedAlbum){
    albumBox.classList.remove('hidden');
    albumBox.innerHTML=`<b>Matched Album</b>${esc(d.MusicBrainzMatchedAlbum)}<br><span class="subtle">${esc(d.MusicBrainzMatchedArtist||'')} · Recording: ${esc(t.OLD_TITLE)}</span>`
  }else{
    albumBox.classList.add('hidden');
    albumBox.innerHTML=''
  }

  if(versions.length){
    tools.classList.remove('hidden');
    populateVersionCountries(versions);
    const f=$('#mbVersionCountryFilter').value||'ALL';
    const shown=f==='ALL'?versions:versions.filter(v=>v.country===f);
    $('#mbVersionCount').textContent=`${shown.length} / ${versions.length} versions with cover`;
    list.innerHTML=shown.map(v=>versionCardHTML(v,d)).join('')
  }else{
    tools.classList.add('hidden');
    $('#mbVersionCount').textContent='';
    list.innerHTML=d.MusicBrainzSearchStatus&&d.MusicBrainzSearchStatus!=='NOT_SEARCHED'
      ? '<div class="status-box">沒有找到同時具備 Front Cover 與相符 Track 的版本。</div>'
      : '<div class="status-box">尚未搜尋版本。</div>'
  }

  const countries=d.MusicBrainzFoundCountries?` · Countries: ${d.MusicBrainzFoundCountries}`:'';
  $('#mbStatus').textContent=d.MusicBrainzSearchStatus
    ? `${d.MusicBrainzSearchStatus} · ${d.MusicBrainzSearchAt}${countries}`
    : '未搜尋';

  $$('[data-use-version]').forEach(b=>b.onclick=()=>useMusicBrainzVersion(b.dataset.useVersion));
  $$('[data-open-version]').forEach(b=>b.onclick=()=>window.open(`https://musicbrainz.org/release/${b.dataset.openVersion}`,'_blank'))
}

function mbLocalScore(t,rec,rel){const titleSim=similarity(t.OLD_TITLE,rec.title),artist=artistCredit(rec['artist-credit']),artist0=primaryArtist(t.OLD_ARTIST),artistSim=Math.max(similarity(artist0,artist),(normalized(artist0).includes(normalized(artist))||normalized(artist).includes(normalized(artist0)))?.95:0),albumSim=t.OLD_ALBUM?similarity(t.OLD_ALBUM,rel.title):.5;let ds=0;if(num(t.DurationSeconds)&&num(rec.length)){const diff=Math.abs(num(t.DurationSeconds)-num(rec.length)/1000);ds=diff<=2?1:diff<=5?.8:diff<=10?.5:0}const mbs=Math.min(100,Math.max(0,num(rec.score)))/100;let score=35*titleSim+22*artistSim+28*albumSim+10*ds+5*mbs;if(rel.status==='Official')score+=1.5;return{score:Math.min(100,score),albumSim}}
function addMbResults(t,json,map){for(const rec of json.recordings||[]){for(const rel of rec.releases||[]){if(!rel.id)continue;const s=mbLocalScore(t,rec,rel),key=rel.id;if(!map.has(key)||map.get(key).score<s.score)map.set(key,{recording:rec,release:rel,score:s.score,albumSim:s.albumSim})}}}
async function mbReleaseDetail(id){if(state.releaseCache.has(id))return state.releaseCache.get(id);const sets=['recordings+artist-credits+release-groups+labels+isrcs','recordings+artist-credits+release-groups+labels','recordings+artist-credits'];let last;for(const inc of sets){try{const j=await mbFetch(`https://musicbrainz.org/ws/2/release/${id}?inc=${inc}&fmt=json`);state.releaseCache.set(id,j);return j}catch(e){last=e;if(!String(e.message).includes('HTTP 400'))throw e}}throw last}
function mbTrack(detail,recordingId,wanted){let best=null,bestS=-1;for(const medium of detail?.media||[]){for(const tr of medium.tracks||[]){const rid=tr.recording?.id||'',title=tr.title||tr.recording?.title||'';if(recordingId&&rid===recordingId)return{track:tr,medium};const s=similarity(wanted,title);if(s>bestS){bestS=s;best={track:tr,medium}}}}return bestS>=.72?best:null}
function saveMbCandidate(d,t,rank,e,detail,ti){const p=`M${rank}_`,rec=e.recording,rel=e.release,tr=ti?.track,med=ti?.medium;const title=tr?.title||rec.title||'',artist=artistCredit(tr?.['artist-credit'])||artistCredit(rec['artist-credit']),albumArtist=artistCredit(detail?.['artist-credit'])||artistCredit(rel['artist-credit']),date=detail?.date||rel.date||'',durMs=num(tr?.length)||num(tr?.recording?.length)||num(rec.length),inf=durationInfo(t.DurationSeconds,durMs/1000),front=!!detail?.['cover-art-archive']?.front,releaseId=rel.id,rg=detail?.['release-group']?.id||rel['release-group']?.id||'',isrcs=[...(tr?.recording?.isrcs||[]),...(rec.isrcs||[])].filter(Boolean),catalog=[...new Set((detail?.['label-info']||[]).map(x=>x['catalog-number']).filter(Boolean))].join(';'),format=med?.format||'',trackNo=tr?.number||tr?.position||'',disc=med?.position||'';
  const vals={SCORE:e.score.toFixed(1),COUNTRY:detail?.country||rel.country||'',RECORDING_ID:rec.id||'',RELEASE_ID:releaseId,RELEASE_GROUP_ID:rg,TITLE:title,ARTIST:artist,ALBUM:detail?.title||rel.title||'',ALBUMARTIST:albumArtist,DATE:date,TRACKNUMBER:trackNo,DISCNUMBER:disc,URL:`https://musicbrainz.org/release/${releaseId}`,ARTWORK:front?`https://coverartarchive.org/release/${releaseId}/front`:'',ARTWORK_PREVIEW:front?`https://coverartarchive.org/release/${releaseId}/front-500`:'',CAA_STATUS:front?'FRONT':'NO_FRONT',ISRC:[...new Set(isrcs)].join(';'),DURATION_MS:durMs||'',DURATION_SEC:inf.sec,TIME:inf.time,TIME_DELTA_SEC:inf.deltaSec,TIME_DELTA:inf.delta,TIME_DIFF_SEC:inf.diff,DURATION_REVIEW:inf.review,STATUS:detail?.status||rel.status||'',FORMAT:format,BARCODE:detail?.barcode||rel.barcode||'',CATALOG:catalog};Object.entries(vals).forEach(([k,v])=>d[p+k]=v)}
async function searchMusicBrainz(options={}){
  const t=currentTrack();if(!t)return;const d=ensureDecision(t),key=t.RelativePath,auto=!!options.auto;
  if(state.mbSearchingKeys.has(key))return;
  state.mbSearchingKeys.add(key);state.mbAutoAttempt.set(key,Date.now());
  if(!auto)readFormIntoDecision(d);
  $('#mbSearchBtn').disabled=true;
  $('#mbStatus').textContent='Step 1/3 · 確認最吻合 Album…';

  try{
    const title=t.OLD_TITLE,
          artist=primaryArtist(t.OLD_ARTIST),
          album=t.OLD_ALBUM,
          qt=mbEscape(title),
          qa=mbEscape(artist),
          qal=mbEscape(album);

    const queryPlan=[];
    if(album&&artist)queryPlan.push({q:`recording:"${qt}" AND artist:"${qa}" AND release:"${qal}"`,plain:`${title} ${artist} ${album}`});
    if(artist)queryPlan.push({q:`recording:"${qt}" AND artist:"${qa}"`,plain:`${title} ${artist}`});
    if(album)queryPlan.push({q:`recording:"${qt}" AND release:"${qal}"`,plain:`${title} ${album}`});

    const map=new Map(),used=[];
    for(const step of queryPlan){
      used.push(step.q);
      addMbResults(t,await mbSearchSafe(step.q,step.plain),map);
      const vals=[...map.values()];
      const strong=vals.filter(x=>x.score>=78&&x.albumSim>=.70);
      if(strong.length>=3)break
    }
    if(map.size===0){
      const q=`recording:"${qt}"`;
      used.push(q);
      addMbResults(t,await mbSearchSafe(q,title),map)
    }
    if(map.size===0)throw new Error('MusicBrainz 找不到相符 Recording / Album');

    const best=[...map.values()].sort((a,b)=>b.score-a.score)[0];
    const matchedAlbum=safe(best.release?.title)||album;
    const matchedArtist=artistCredit(best.release?.['artist-credit'])||artist;
    const matchedRecordingId=safe(best.recording?.id);
    const matchedRgid=safe(best.release?.['release-group']?.id);

    Object.assign(d,{
      MusicBrainzMatchedAlbum:matchedAlbum,
      MusicBrainzMatchedArtist:matchedArtist,
      MusicBrainzMatchedRecordingId:matchedRecordingId,
      MusicBrainzMatchedReleaseGroupId:matchedRgid,
      MusicBrainzVersionsJson:'[]',
      MusicBrainzVersionCount:'0',
      MusicBrainzFoundCountries:''
    });

    $('#mbStatus').textContent=`Step 2/3 · 尋找 ${matchedAlbum} Releases…`;
    const rq=`release:"${mbEscape(matchedAlbum)}" AND artist:"${mbEscape(primaryArtist(matchedArtist)||artist)}"`;
    const rp=`${matchedAlbum} ${primaryArtist(matchedArtist)||artist}`;
    const rj=await mbReleaseSearchSafe(rq,rp);

    let baseVersions=(rj.releases||[])
      .map(rel=>releaseSummary(rel,matchedRgid,matchedAlbum,matchedArtist))
      .filter(v=>v.id);

    const groupMatches=matchedRgid?baseVersions.filter(v=>v.releaseGroupId===matchedRgid):[];
    if(groupMatches.length)baseVersions=groupMatches;
    else baseVersions=baseVersions.filter(v=>v.albumSim>=.82&&v.artistSim>=.55);

    const byId=new Map();
    for(const v of baseVersions)if(!byId.has(v.id))byId.set(v.id,v);
    baseVersions=[...byId.values()].sort(versionSort);

    const complete=[];
    const failures=[];
    for(let i=0;i<baseVersions.length;i++){
      const base=baseVersions[i];
      $('#mbStatus').textContent=`Step 3/3 · 檢查完整版本 ${i+1}/${baseVersions.length} · 已保留 ${complete.length}`;
      try{
        const detail=await mbReleaseDetail(base.id);
        // No front cover = do not keep this version at all.
        if(!detail?.['cover-art-archive']?.front)continue;
        const ti=mbTrack(detail,matchedRecordingId,t.OLD_TITLE);
        if(!ti?.track)continue;
        const full=versionFromDetail(base,detail,ti,t,d);
        if(!full)continue;
        complete.push(full);
        complete.sort(versionSort);

        // Progressive display: as soon as one complete cover version is ready,
        // show it with Track / Disc / Duration / Δ Time immediately.
        d.MusicBrainzVersionsJson=JSON.stringify(complete);
        d.MusicBrainzVersionCount=String(complete.length);
        d.MusicBrainzFoundCountries=[...new Set(complete.map(v=>v.country).filter(x=>x&&x!=='—'))].sort().join(',');
        d.MusicBrainzSearchStatus=`LOADING_${i+1}_OF_${baseVersions.length}`;
        d.MusicBrainzSearchQuery=used.join(' || ')+' || RELEASE: '+rq;
        d.MusicBrainzSearchAt=now();
        await saveDecision(d);
        renderMusicBrainzVersions(t,d)
      }catch(err){
        failures.push(`${base.id}: ${String(err.message||err)}`);
        // Continue to the next release when one detail call fails.
        console.warn('MusicBrainz version detail skipped',base.id,err)
      }
    }

    complete.sort(versionSort);
    d.MusicBrainzVersionsJson=JSON.stringify(complete);
    d.MusicBrainzVersionCount=String(complete.length);
    d.MusicBrainzFoundCountries=[...new Set(complete.map(v=>v.country).filter(x=>x&&x!=='—'))].sort().join(',');
    d.MusicBrainzSearchStatus=complete.length?`FOUND_${complete.length}_COMPLETE_COVER_VERSIONS`:'NO_COMPLETE_COVER_VERSIONS';
    d.MusicBrainzSearchQuery=used.join(' || ')+' || RELEASE: '+rq;
    d.MusicBrainzSearchAt=now();
    await saveDecision(d);
    renderAll();
    toast(complete.length?`找到 ${complete.length} 個完整有封面版本`:'沒有完整有封面的版本');

    if(!complete.length&&failures.length){
      console.warn('MusicBrainz detail failures',failures)
    }
  }catch(e){
    console.error(e);
    const msg=String(e.message||e),partial=parseMbVersions(d).length;
    d.MusicBrainzSearchStatus=partial?`PARTIAL_${partial}_VERSIONS_ERROR`:'ERROR_RETRYABLE';
    d.MusicBrainzSearchAt=now();
    await saveDecision(d);
    if(currentTrack()?.RelativePath===key)renderMusicBrainzVersions(t,d);
    $('#mbStatus').textContent=`MusicBrainz error: ${msg}`;
    if(auto){
      toast(msg.includes('HTTP 503')?'MusicBrainz 暫時繁忙；稍後進入此頁會再試':'MusicBrainz 自動搜尋失敗；可按 Retry',3200)
    }else if(msg.includes('HTTP 503')){
      alert(`MusicBrainz 暫時繁忙（HTTP 503）。

v1.0.9.2 會逐個版本排隊載入；已經成功載入的完整版本會保留。稍後可以再按 Find Versions / Retry。`)
    }else{
      alert(`MusicBrainz 搜尋失敗：
${msg}`)
    }
  }finally{
    state.mbSearchingKeys.delete(key);
    if(currentTrack()?.RelativePath===key)$('#mbSearchBtn').disabled=false
  }
}

async function maybeAutoFindMusicBrainz(){
  const t=currentTrack();if(!t)return;
  const d=ensureDecision(t),key=t.RelativePath,versions=parseMbVersions(d),status=safe(d.MusicBrainzSearchStatus);
  if(versions.length)return;
  if(status.startsWith('FOUND_')||status==='NO_COMPLETE_COVER_VERSIONS')return;
  if(state.mbSearchingKeys.has(key))return;
  const last=state.mbAutoAttempt.get(key)||0;
  if(Date.now()-last<60000)return;
  await searchMusicBrainz({auto:true})
}

function writeVersionToM1(d,t,v){
  for(let r=1;r<=3;r++){
    for(const f of ['SCORE','COUNTRY','RECORDING_ID','RELEASE_ID','RELEASE_GROUP_ID','TITLE','ARTIST','ALBUM','ALBUMARTIST','DATE','TRACKNUMBER','DISCNUMBER','URL','ARTWORK','ARTWORK_PREVIEW','CAA_STATUS','ISRC','DURATION_MS','DURATION_SEC','TIME','TIME_DELTA_SEC','TIME_DELTA','TIME_DIFF_SEC','DURATION_REVIEW','STATUS','FORMAT','BARCODE','CATALOG']){
      d[`M${r}_${f}`]=''
    }
  }
  const vals={
    SCORE:'100.0',
    COUNTRY:v.country||'',
    RECORDING_ID:v.recordingId||d.MusicBrainzMatchedRecordingId||'',
    RELEASE_ID:v.id||'',
    RELEASE_GROUP_ID:v.releaseGroupId||d.MusicBrainzMatchedReleaseGroupId||'',
    TITLE:v.trackTitle||t.OLD_TITLE||'',
    ARTIST:v.trackArtist||v.artist||t.OLD_ARTIST||'',
    ALBUM:v.title||t.OLD_ALBUM||'',
    ALBUMARTIST:v.albumArtist||v.artist||'',
    DATE:v.date==='—'?'':v.date||'',
    TRACKNUMBER:v.track==='—'?'':v.track||'',
    DISCNUMBER:v.disc==='—'?'':v.disc||'',
    URL:`https://musicbrainz.org/release/${v.id}`,
    ARTWORK:v.artwork||'',
    ARTWORK_PREVIEW:v.artworkPreview||'',
    CAA_STATUS:'FRONT',
    ISRC:v.isrc||'',
    DURATION_MS:v.durationMs||'',
    DURATION_SEC:v.durationSec||'',
    TIME:v.time||'',
    TIME_DELTA_SEC:v.deltaSec||'',
    TIME_DELTA:v.delta||'',
    TIME_DIFF_SEC:v.diff||'',
    DURATION_REVIEW:v.durationReview||'',
    STATUS:v.status||'',
    FORMAT:v.format||'',
    BARCODE:v.barcode||'',
    CATALOG:v.catalog||''
  };
  Object.entries(vals).forEach(([k,val])=>d[`M1_${k}`]=val)
}

async function useMusicBrainzVersion(releaseId){
  const t=currentTrack(),d=ensureDecision(t);
  const versions=parseMbVersions(d);
  const v=versions.find(x=>x.id===releaseId);
  if(!v)return;

  try{
    // v1.0.9.2 hotfix:
    // Write the selected MusicBrainz Version directly into M1 here.
    // Do not depend on a separate writeVersionToM1() symbol, because an
    // older cached app.js could otherwise produce Safari's
    // "Can't find variable: writeVersionToM1" error.
    for(let r=1;r<=3;r++){
      for(const f of ['SCORE','COUNTRY','RECORDING_ID','RELEASE_ID','RELEASE_GROUP_ID','TITLE','ARTIST','ALBUM','ALBUMARTIST','DATE','TRACKNUMBER','DISCNUMBER','URL','ARTWORK','ARTWORK_PREVIEW','CAA_STATUS','ISRC','DURATION_MS','DURATION_SEC','TIME','TIME_DELTA_SEC','TIME_DELTA','TIME_DIFF_SEC','DURATION_REVIEW','STATUS','FORMAT','BARCODE','CATALOG']){
        d[`M${r}_${f}`]=''
      }
    }
    const selectedVersionValues={
      SCORE:'100.0',
      COUNTRY:v.country||'',
      RECORDING_ID:v.recordingId||d.MusicBrainzMatchedRecordingId||'',
      RELEASE_ID:v.id||'',
      RELEASE_GROUP_ID:v.releaseGroupId||d.MusicBrainzMatchedReleaseGroupId||'',
      TITLE:v.trackTitle||t.OLD_TITLE||'',
      ARTIST:v.trackArtist||v.artist||t.OLD_ARTIST||'',
      ALBUM:v.title||t.OLD_ALBUM||'',
      ALBUMARTIST:v.albumArtist||v.artist||'',
      DATE:v.date==='—'?'':v.date||'',
      TRACKNUMBER:v.track==='—'?'':v.track||'',
      DISCNUMBER:v.disc==='—'?'':v.disc||'',
      URL:`https://musicbrainz.org/release/${v.id}`,
      ARTWORK:v.artwork||'',
      ARTWORK_PREVIEW:v.artworkPreview||'',
      CAA_STATUS:'FRONT',
      ISRC:v.isrc||'',
      DURATION_MS:v.durationMs||'',
      DURATION_SEC:v.durationSec||'',
      TIME:v.time||'',
      TIME_DELTA_SEC:v.deltaSec||'',
      TIME_DELTA:v.delta||'',
      TIME_DIFF_SEC:v.diff||'',
      DURATION_REVIEW:v.durationReview||'',
      STATUS:v.status||'',
      FORMAT:v.format||'',
      BARCODE:v.barcode||'',
      CATALOG:v.catalog||''
    };
    Object.entries(selectedVersionValues).forEach(([k,val])=>d[`M1_${k}`]=val);

    Object.assign(d,{
      Decision:'M1',
      CandidateRank:'M1',
      MetadataSource:'MUSICBRAINZ',
      FinalTitle:v.trackTitle||t.OLD_TITLE,
      FinalArtist:v.trackArtist||v.artist||t.OLD_ARTIST,
      FinalAlbum:v.title||t.OLD_ALBUM,
      CandidateDateReference:v.date==='—'?'':v.date||'',
      CandidateDateReferenceType:'MusicBrainz selected release date reference',
      SelectedMusicBrainzUrl:`https://musicbrainz.org/release/${v.id}`,
      SelectedMusicBrainzRecordingId:v.recordingId||d.MusicBrainzMatchedRecordingId||'',
      SelectedMusicBrainzReleaseId:v.id,
      SelectedMusicBrainzReleaseGroupId:v.releaseGroupId||d.MusicBrainzMatchedReleaseGroupId||'',
      SelectedMusicBrainzISRC:v.isrc||'',
      SelectedAppleUrl:'',
      SelectedAppleTrackId:''
    });
    if(v.albumArtist)d.FinalAlbumArtist=v.albumArtist;
    else if(!d.FinalAlbumArtist)d.FinalAlbumArtist=d.FinalArtist;
    if(v.track&&v.track!=='—')d.FinalTrackNumber=v.track;
    if(v.disc&&v.disc!=='—')d.FinalDiscNumber=v.disc;
    // DATE remains original FLAC DATE unless user edits it manually.
    d.FinalArtworkUrl=v.artwork||'';
    d.ArtworkSource=v.artwork?'COVER_ART_ARCHIVE':'ORIGINAL';

    await saveDecision(d);
    renderAll();
    toast(`已選 ${v.country||'—'} version · 自動搜尋 Lyrics`);
    void autoSearchLyricsAfterSelection(t.RelativePath)
  }catch(e){
    console.error(e);
    alert(`選擇 MusicBrainz version 失敗：\n${e.message}`)
  }
}

function normalizeSynced(text){if(!text.trim())return'';const out=[];for(const raw of text.replace(/\r/g,'').split('\n')){const line=raw.replace(/\s+$/,'');if(/^\[(ar|ti|al|by|offset|length|re|ve):/i.test(line))continue;const ms=[...line.matchAll(/\[(\d{1,3}:\d{2}(?:[.:]\d{1,3})?)\]/g)];if(ms.length){const last=ms[ms.length-1],body=line.slice(last.index+last[0].length);ms.forEach(m=>out.push(`[${m[1]}]${body}`))}else if(line.trim())out.push(line)}return out.join('\r\n')}
function plainFromSynced(text){return safe(text).split(/\r?\n/).map(x=>x.replace(/^(?:\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\])+/,'')).join('\r\n')}
function lyricsTargetTrack(key){return state.tracks.find(x=>x.RelativePath===key)||null}
function selectedLyricsDuration(t,d){
  if(d.MetadataSource==='APPLE'&&/^A[123]$/.test(d.Decision))return num(t[`${d.Decision}_DURATION_SEC`])||num(t.DurationSeconds);
  if(d.MetadataSource==='MUSICBRAINZ'&&d.M1_DURATION_SEC)return num(d.M1_DURATION_SEC)||num(t.DurationSeconds);
  return num(t.DurationSeconds)
}
function lyricsVersionTokens(s){
  const x=safe(s).normalize('NFKC').toLowerCase();
  const defs=[['live',/\blive\b|現場|演唱會/],['remix',/\bremix\b|混音/],['remaster',/remaster(?:ed)?|リマスタ|重製版/],['acoustic',/\bacoustic\b|不插電/],['instrumental',/\binstrumental\b|伴奏/],['karaoke',/\bkaraoke\b|卡拉ok|カラオケ/],['demo',/\bdemo\b/],['rerecord',/re[- ]?record(?:ed|ing)?|重新錄製|重錄/],['reborn',/重生版/]];
  return defs.filter(([,r])=>r.test(x)).map(([k])=>k).sort().join('|')
}
function strictLyricsMatch(r,title,artist,album,dur){
  const rt=safe(r.trackName||r.name),ra=safe(r.artistName),ral=safe(r.albumName),rd=num(r.duration);
  const titleSim=similarity(title,rt),artistSim=similarity(primaryArtist(artist),primaryArtist(ra)),albumSim=album&&ral?similarity(album,ral):1;
  const diff=dur&&rd?Math.abs(rd-dur):999;
  const versionOK=lyricsVersionTokens(title)===lyricsVersionTokens(rt);
  return {ok:titleSim>=.94&&artistSim>=.85&&albumSim>=.75&&diff<=2.5&&versionOK,titleSim,artistSim,albumSim,diff,versionOK}
}
function lyricsSearchSignature(t,d){return [d.MetadataSource,d.Decision,normalized(d.FinalTitle||t.OLD_TITLE),normalized(d.FinalArtist||t.OLD_ARTIST),normalized(d.FinalAlbum||t.OLD_ALBUM),selectedLyricsDuration(t,d).toFixed(2)].join('|')}
function clearAutoLyrics(d){
  if(d.LyricsSource&& !safe(d.LyricsSource).startsWith('LRCLIB'))return false;
  ['LyricsEncodingStatus','LyricsSource','LyricsId','LyricsChoice','LyricsPlain','LyricsSynced','LyricsMatchedTitle','LyricsMatchedArtist','LyricsMatchedAlbum','LyricsMatchedDuration','LyricsInstrumental'].forEach(k=>d[k]='');
  return true
}
async function useLyricsResult(r,label,options={}){
  const key=options.targetKey||state.currentKey,t=lyricsTargetTrack(key);if(!t)return;
  const d=ensureDecision(t),syn=normalizeSynced(r.syncedLyrics||''),plain=syn?plainFromSynced(syn):safe(r.plainLyrics).replace(/\r?\n/g,'\r\n').trim();
  Object.assign(d,{LyricsSource:label,LyricsEncodingStatus:'UTF8_OK',LyricsId:safe(r.id),LyricsSynced:syn,LyricsPlain:plain,LyricsMatchedTitle:safe(r.trackName||r.name),LyricsMatchedArtist:safe(r.artistName),LyricsMatchedAlbum:safe(r.albumName),LyricsMatchedDuration:safe(r.duration),LyricsInstrumental:safe(r.instrumental),LyricsChoice:syn&&plain?'BOTH':syn?'SYNCED':plain?'PLAIN':r.instrumental?'INSTRUMENTAL':'',LyricsAutoSignature:options.signature||d.LyricsAutoSignature,LyricsSearchStatus:'MATCHED',LyricsSearchAt:now()});
  await saveDecision(d);
  if(currentTrack()?.RelativePath===key){renderAll();if(options.switchToLyrics!==false)switchSection('lyrics')}
}
async function autoSearchLyricsAfterSelection(key){
  const t=lyricsTargetTrack(key);if(!t)return;const d=ensureDecision(t);
  if(d.LyricsSource&&!safe(d.LyricsSource).startsWith('LRCLIB')){toast('保留 Manual Lyrics；不自動覆蓋',2600);return}
  const sig=lyricsSearchSignature(t,d);
  if(d.LyricsAutoSignature===sig&&['MATCHED','CHOICES','NOT_FOUND'].includes(d.LyricsSearchStatus))return;
  await searchLyrics({auto:true,targetKey:key})
}
async function searchLyrics(options={}){
  const key=options.targetKey||state.currentKey,t=lyricsTargetTrack(key);if(!t)return;
  if(state.lyricsSearchingKeys.has(key))return;
  const d=ensureDecision(t),auto=!!options.auto;
  if(auto&&d.LyricsSource&&!safe(d.LyricsSource).startsWith('LRCLIB'))return;
  if(!auto&&currentTrack()?.RelativePath===key)readFormIntoDecision(d);
  const signature=lyricsSearchSignature(t,d);
  state.lyricsSearchingKeys.add(key);
  if(auto)clearAutoLyrics(d);
  d.LyricsSearchStatus='SEARCHING';d.LyricsSearchAt=now();
  await saveDecision(d);
  if(currentTrack()?.RelativePath===key){$('#lyricsSearchBtn').disabled=true;$('#lyricsStatus').textContent='自動搜尋 LRCLIB…'}
  try{
    const title=d.FinalTitle||t.OLD_TITLE,artist=d.FinalArtist||t.OLD_ARTIST,album=d.FinalAlbum||t.OLD_ALBUM,dur=selectedLyricsDuration(t,d);
    let u=`https://lrclib.net/api/get?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`;
    if(album)u+=`&album_name=${encodeURIComponent(album)}`;
    if(dur>=1&&dur<=3600)u+=`&duration=${encodeURIComponent(dur.toFixed(2))}`;
    let res=await fetch(u),exact=null;
    if(res.ok){
      exact=await res.json();
      const chk=strictLyricsMatch(exact,title,artist,album,dur);
      if(chk.ok){
        await useLyricsResult(exact,'LRCLIB exact',{targetKey:key,signature,switchToLyrics:!auto});
        toast(auto?'Lyrics 已自動配對':'LRCLIB exact match');
        return
      }
      console.warn('LRCLIB exact rejected by strict validation',chk,exact)
    }
    u=`https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`;
    res=await fetch(u);
    if(!res.ok)throw new Error(`LRCLIB HTTP ${res.status}`);
    let results=await res.json();
    if(exact&&exact.id&&!results.some(x=>safe(x.id)===safe(exact.id)))results=[exact,...results];
    if(!results.length){
      d.LyricsAutoSignature=signature;d.LyricsSearchStatus='NOT_FOUND';d.LyricsSearchAt=now();await saveDecision(d);
      if(currentTrack()?.RelativePath===key)$('#lyricsStatus').textContent='No lyrics found';
      toast('LRCLIB 沒有結果');return
    }
    d.LyricsAutoSignature=signature;d.LyricsSearchStatus='CHOICES';d.LyricsSearchAt=now();await saveDecision(d);
    showLyricsChoices(results,{targetKey:key,signature})
  }catch(e){
    console.error(e);d.LyricsSearchStatus='ERROR';d.LyricsSearchAt=now();await saveDecision(d);
    if(currentTrack()?.RelativePath===key)$('#lyricsStatus').textContent='Lyrics request error';
    if(auto)toast(`Lyrics 自動搜尋失敗：${e.message}`,3000);else alert(`LRCLIB request failed:\n${e.message}`)
  }finally{
    state.lyricsSearchingKeys.delete(key);
    if(currentTrack()?.RelativePath===key)$('#lyricsSearchBtn').disabled=false
  }
}
function showLyricsChoices(results,options={}){
  const key=options.targetKey||state.currentKey,t=lyricsTargetTrack(key);if(!t)return;
  const d=ensureDecision(t),flac=selectedLyricsDuration(t,d),wantedTitle=d.FinalTitle||t.OLD_TITLE,wantedArtist=d.FinalArtist||t.OLD_ARTIST,wantedAlbum=d.FinalAlbum||t.OLD_ALBUM;
  results=[...results].sort((a,b)=>{const score=r=>{const dur=num(r.duration),diff=flac&&dur?Math.abs(dur-flac):20,versionOK=lyricsVersionTokens(wantedTitle)===lyricsVersionTokens(r.trackName||r.name);return similarity(wantedTitle,r.trackName||r.name)*45+similarity(wantedArtist,r.artistName)*25+similarity(wantedAlbum,r.albumName)*15+Math.max(0,15-Math.min(15,diff*3))+(versionOK?8:-20)};return score(b)-score(a)});
  $('#choiceTitle').textContent='選擇 LRCLIB 結果';
  $('#choiceList').innerHTML=results.slice(0,20).map((r,i)=>{const dur=num(r.duration),diff=flac&&dur?Math.abs(dur-flac):0,chk=strictLyricsMatch(r,wantedTitle,wantedArtist,wantedAlbum,flac);return `<div class="choice-item"><b>${esc(r.trackName||r.name)}</b><br>${esc(r.artistName)}<br><span class="subtle">${esc(r.albumName)} · ${dur?fmtTime(dur):'—'} ${flac&&dur?`· Δ ${fmtDelta(dur-flac)} · ${durationReview(diff)}`:''}${chk.ok?' · STRICT':''}</span><button type="button" data-lyrics-index="${i}">Use this lyrics</button></div>`}).join('');
  $('#choiceDialog').showModal();
  $$('[data-lyrics-index]').forEach(b=>b.onclick=async()=>{await useLyricsResult(results[Number(b.dataset.lyricsIndex)],'LRCLIB search',{targetKey:key,signature:options.signature,switchToLyrics:true});$('#choiceDialog').close()})
}

function selectedDuration(t,d){if(/^A[123]$/.test(d.Decision)){const p=d.Decision+'_';return{DurationSec:t[p+'DURATION_SEC'],Time:t[p+'TIME'],DeltaSec:t[p+'TIME_DELTA_SEC'],Delta:t[p+'TIME_DELTA'],DiffSec:t[p+'TIME_DIFF_SEC'],Review:t[p+'DURATION_REVIEW']}}if(/^M[123]$/.test(d.Decision)){const p=d.Decision+'_';return{DurationSec:d[p+'DURATION_SEC'],Time:d[p+'TIME'],DeltaSec:d[p+'TIME_DELTA_SEC'],Delta:d[p+'TIME_DELTA'],DiffSec:d[p+'TIME_DIFF_SEC'],Review:d[p+'DURATION_REVIEW']}}return{DurationSec:'',Time:'',DeltaSec:'',Delta:'',DiffSec:'',Review:''}}
async function exportProgress(){for(const t of state.tracks)ensureDecision(t);const rows=state.tracks.map(t=>state.decisions.get(t.RelativePath));download('FLAC_Review_Decisions_v1.csv',makeCSV(rows,decisionFields));toast('Progress 已匯出')}
async function exportWritePlan(){const rows=state.tracks.map(t=>{const d=ensureDecision(t),sd=selectedDuration(t,d);return{ReviewStatus:d.Decision?'REVIEWED':'UNREVIEWED',Decision:d.Decision,CandidateRank:d.CandidateRank,Confidence:t.Confidence,FileName:t.FileName,RelativePath:t.RelativePath,FullPath:d.FullPath,OLD_TITLE:t.OLD_TITLE,OLD_ARTIST:t.OLD_ARTIST,OLD_ALBUM:t.OLD_ALBUM,OLD_ALBUMARTIST:t.OLD_ALBUMARTIST,OLD_DATE:t.OLD_DATE,OLD_TRACKNUMBER:t.OLD_TRACKNUMBER,OLD_DISCNUMBER:t.OLD_DISCNUMBER,OLD_GENRE:t.OLD_GENRE,FINAL_TITLE:d.FinalTitle,FINAL_ARTIST:d.FinalArtist,FINAL_ALBUM:d.FinalAlbum,FINAL_ALBUMARTIST:d.FinalAlbumArtist,FINAL_DATE:d.FinalDate,FINAL_TRACKNUMBER:d.FinalTrackNumber,FINAL_DISCNUMBER:d.FinalDiscNumber,FINAL_GENRE:d.FinalGenre,FINAL_ARTWORK_URL:d.FinalArtworkUrl,MetadataSource:d.MetadataSource,ArtworkSource:d.ArtworkSource,SelectedAppleUrl:d.SelectedAppleUrl,SelectedAppleTrackId:d.SelectedAppleTrackId,SelectedMusicBrainzUrl:d.SelectedMusicBrainzUrl,SelectedMusicBrainzRecordingId:d.SelectedMusicBrainzRecordingId,SelectedMusicBrainzReleaseId:d.SelectedMusicBrainzReleaseId,SelectedMusicBrainzReleaseGroupId:d.SelectedMusicBrainzReleaseGroupId,SelectedMusicBrainzISRC:d.SelectedMusicBrainzISRC,CandidateDateReference:d.CandidateDateReference,CandidateDateReferenceType:d.CandidateDateReferenceType,LyricsSource:d.LyricsSource,LyricsEncodingStatus:d.LyricsEncodingStatus,LyricsId:d.LyricsId,LyricsChoice:d.LyricsChoice,LYRICS:d.LyricsPlain,SYNCEDLYRICS:d.LyricsSynced,LyricsMatchedTitle:d.LyricsMatchedTitle,LyricsMatchedArtist:d.LyricsMatchedArtist,LyricsMatchedAlbum:d.LyricsMatchedAlbum,LyricsMatchedDuration:d.LyricsMatchedDuration,LyricsInstrumental:d.LyricsInstrumental,DurationSeconds:t.DurationSeconds,FLAC_DURATION_SEC:t.FLAC_DURATION_SEC,FLAC_TIME:t.FLAC_TIME,SelectedCandidateDurationSec:sd.DurationSec,SelectedCandidateTime:sd.Time,SelectedCandidateDeltaSec:sd.DeltaSec,SelectedCandidateDelta:sd.Delta,SelectedCandidateTimeDiffSec:sd.DiffSec,SelectedCandidateDurationReview:sd.Review,Notes:d.Notes,UpdatedAt:d.UpdatedAt}});const headers=Object.keys(rows[0]||{}),stamp=new Date().toISOString().replace(/[-:T]/g,'').slice(0,14);download(`FLAC_Write_Plan_${stamp}.csv`,makeCSV(rows,headers));toast('Write Plan 已匯出')}

function switchSection(name){$$('.section-tab').forEach(b=>b.classList.toggle('active',b.dataset.section===name));$$('.section').forEach(s=>s.classList.toggle('active',s.id===`section-${name}`));if(name==='musicbrainz')void maybeAutoFindMusicBrainz()}
function openDrawer(){$('#drawer').classList.add('open');$('#drawer').setAttribute('aria-hidden','false');$('#scrim').classList.remove('hidden');renderTrackList()}
function closeDrawer(){$('#drawer').classList.remove('open');$('#drawer').setAttribute('aria-hidden','true');$('#scrim').classList.add('hidden')}
async function nav(delta){
  const gi=state.tracks.findIndex(t=>t.RelativePath===state.currentKey);
  if(gi<0)return;
  const step=delta<0?-1:1;
  for(let i=gi+step;i>=0&&i<state.tracks.length;i+=step){
    if(trackMatchesActiveFilter(state.tracks[i])){
      await selectTrack(state.tracks[i].RelativePath);
      return
    }
  }
  toast(delta>0?'已經係目前 Filter 最後一首':'已經係目前 Filter 第一首')
}

function updateStickyMetrics(){
  const header=document.querySelector('.app-header');
  const progress=document.querySelector('.progress-wrap');
  const hh=header?.offsetHeight||0;
  const ph=progress?.offsetHeight||0;
  if(hh>0)document.documentElement.style.setProperty('--app-header-height',`${hh}px`);
  if(hh+ph>0)document.documentElement.style.setProperty('--review-sticky-top',`${hh+ph}px`)
}
function setupStickyMetrics(){
  updateStickyMetrics();
  requestAnimationFrame(updateStickyMetrics);
  window.addEventListener('resize',updateStickyMetrics,{passive:true});
  window.addEventListener('orientationchange',()=>setTimeout(updateStickyMetrics,120),{passive:true});
  if('ResizeObserver'in window){
    const ro=new ResizeObserver(()=>updateStickyMetrics());
    const header=document.querySelector('.app-header');
    const progress=document.querySelector('.progress-wrap');
    if(header)ro.observe(header);
    if(progress)ro.observe(progress)
  }
}

function wire(){
  $('#menuBtn').onclick=openDrawer;$('#closeDrawerBtn').onclick=closeDrawer;$('#scrim').onclick=closeDrawer;
  $$('.section-tab').forEach(b=>b.onclick=()=>switchSection(b.dataset.section));$$('.lyrics-tab').forEach(b=>b.onclick=()=>{$$('.lyrics-tab').forEach(x=>x.classList.toggle('active',x===b));$('#lyricsSynced').classList.toggle('hidden',b.dataset.lyrics!=='synced');$('#lyricsPlain').classList.toggle('hidden',b.dataset.lyrics!=='plain')});
  ['matchFileInput','matchFileInputDrawer'].forEach(id=>$('#'+id).onchange=e=>{const f=e.target.files[0];if(f)importMatcher(f);e.target.value='' });['progressFileInput','progressFileInputWelcome'].forEach(id=>$('#'+id).onchange=e=>{const f=e.target.files[0];if(f)importProgress(f);e.target.value='' });
  $('#exportProgressBtn').onclick=exportProgress;$('#exportWritePlanBtn').onclick=exportWritePlan;$('#searchInput').oninput=()=>applyFilter();$('#filterSelect').onchange=()=>applyFilter();$('#keepBtn').onclick=keepOriginal;$('#manualBtn').onclick=manual;$('#openAppleBtn').onclick=()=>{const t=currentTrack(),d=ensureDecision(t);const u=d.SelectedAppleUrl||t.A1_URL;if(u)window.open(u,'_blank');else toast('沒有 Apple URL')};$('#mbSearchBtn').onclick=()=>searchMusicBrainz({auto:false});
  $('#mbVersionCountryFilter').onchange=()=>{const t=currentTrack();if(t)renderMusicBrainzVersions(t,ensureDecision(t))};
  $('#lyricsSearchBtn').onclick=()=>searchLyrics({auto:false});$('#clearLyricsBtn').onclick=async()=>{if(!confirm('清除這首歌已儲存歌詞？'))return;const t=currentTrack(),d=ensureDecision(t);['LyricsEncodingStatus','LyricsSource','LyricsId','LyricsChoice','LyricsPlain','LyricsSynced','LyricsMatchedTitle','LyricsMatchedArtist','LyricsMatchedAlbum','LyricsMatchedDuration','LyricsInstrumental','LyricsAutoSignature','LyricsSearchStatus','LyricsSearchAt'].forEach(k=>d[k]='');await saveDecision(d);renderAll()};
  $('#lyricsFileInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;const content=await f.text(),t=currentTrack(),d=ensureDecision(t),isLrc=f.name.toLowerCase().endsWith('.lrc')||/^\[\d{1,3}:\d{2}/m.test(content);if(isLrc){d.LyricsSynced=normalizeSynced(content);d.LyricsPlain=plainFromSynced(d.LyricsSynced);d.LyricsChoice='BOTH'}else{d.LyricsSynced='';d.LyricsPlain=content.replace(/\r?\n/g,'\r\n').trim();d.LyricsChoice='PLAIN'}d.LyricsSource='Manual file';d.LyricsEncodingStatus='MANUAL';d.LyricsId='';await saveDecision(d);renderAll();e.target.value=''};
  ['finalTitle','finalArtist','finalAlbum','finalAlbumArtist','finalDate','finalTrack','finalDisc','finalGenre','finalArtwork','lyricsSynced','lyricsPlain'].forEach(id=>$('#'+id).addEventListener('input',()=>{if(id==='lyricsSynced'){const s=normalizeSynced($('#lyricsSynced').value);$('#lyricsPlain').value=s?plainFromSynced(s):$('#lyricsPlain').value}scheduleSave()}));
  $('#prevBtn').onclick=()=>nav(-1);
  $('#nextBtn').onclick=()=>nav(1);
  $('#saveNextBtn').onclick=async()=>{
    const t=currentTrack(),d=ensureDecision(t);
    readFormIntoDecision(d);
    await saveDecision(d);

    // v1.0.9.2:
    // Refresh the active filter immediately, then return to Apple
    // before moving to the next matching song.
    refreshFilteredListKeepCurrent();
    switchSection('apple');
    await nav(1)
  };
}

async function init(){state.db=await openDB();
  state.tracks=await idbAll('tracks');const ds=await idbAll('decisions');ds.forEach(d=>state.decisions.set(d.RelativePath,d));state.currentKey=await metaGet('currentKey');wire();setupStickyMetrics();if(state.tracks.length){if(!state.tracks.some(t=>t.RelativePath===state.currentKey))state.currentKey=state.tracks[0].RelativePath;$('#emptyState').classList.add('hidden');$('#main').classList.remove('hidden');$('#bottomNav').classList.remove('hidden');applyFilter();renderAll()}else{$('#emptyState').classList.remove('hidden')}if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(console.warn)}
init().catch(e=>{console.error(e);alert('PWA 啟動失敗：'+e.message)});
