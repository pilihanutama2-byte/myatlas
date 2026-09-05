/* =========================================================
   MAN ATLAS — Application Core
   ========================================================= */
(function(){

const STORAGE_KEY = 'manatlas_state_v1';
const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

/* ---------------------------------------------------------
   Image compression (avatar / hero / backdrop uploads)
   Raw phone-camera photos can be 3–8MB each. Stored as base64 and pushed to
   Supabase on every save, several of these together were almost certainly
   why uploads "worked" locally but silently failed to sync to other devices
   (oversized JSON payloads fail the cloud push, but push() only warns to
   the console — nothing told the user it didn't go through). Resizing to a
   sane max dimension + re-encoding as JPEG brings each image down to
   roughly 80–250KB, which syncs reliably.
   --------------------------------------------------------- */
function compressImage(file, maxDim = 1000, quality = 0.78){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onerror = ()=> reject(new Error('Gagal membaca file'));
    reader.onload = ()=>{
      const img = new Image();
      img.onerror = ()=> reject(new Error('Gagal memuat gambar'));
      img.onload = ()=>{
        let { width, height } = img;
        if(width > maxDim || height > maxDim){
          if(width >= height){ height = Math.round(height * (maxDim/width)); width = maxDim; }
          else{ width = Math.round(width * (maxDim/height)); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ---------------------------------------------------------
   Date helpers
   --------------------------------------------------------- */
function confirmImageUpload(dataUrl){
  return new Promise((resolve)=>{
    const overlay = $('#img-confirm-overlay');
    $('#img-confirm-preview').src = dataUrl;
    overlay.classList.add('active');
    const cleanup = (result)=>{
      overlay.classList.remove('active');
      saveBtn.removeEventListener('click', onSave);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    };
    const saveBtn = $('#img-confirm-save');
    const cancelBtn = $('#img-confirm-cancel');
    const onSave = ()=> cleanup(true);
    const onCancel = ()=> cleanup(false);
    saveBtn.addEventListener('click', onSave);
    cancelBtn.addEventListener('click', onCancel);
  });
}
function todayStr(d = new Date()){
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
// Parses a 'YYYY-MM-DD' string as a LOCAL calendar date (midnight local time),
// not UTC. `new Date('YYYY-MM-DD')` parses as UTC midnight, which shifts to the
// previous day once formatted back through todayStr() in any timezone behind
// UTC — this kept rollover/streak/calendar math correct only for UTC+ zones.
function parseLocalDate(dateStr){
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function fmtHuman(d = new Date()){
  return d.toLocaleDateString('id-ID', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}
// Returns the Monday (start of week) date-string for a given date — used so
// weekly quests reset automatically every Monday instead of a fixed 7-day window.
function weekKey(d = new Date()){
  const date = new Date(d);
  const day = date.getDay(); // 0=Sun..6=Sat
  const diffToMonday = (day === 0 ? -6 : 1 - day);
  date.setDate(date.getDate() + diffToMonday);
  return todayStr(date);
}

/* ---------------------------------------------------------
   Splash staircase (long receding steps, drawn perspective)
   --------------------------------------------------------- */
function renderStaircase(){
  const NS = 'http://www.w3.org/2000/svg';
  const g = document.getElementById('steps');
  if(!g) return;
  const stepCount = 22;
  const baseY = 470, topY = 40;
  const baseWidth = 480, topWidth = 60;
  const baseHeight = 20, topHeight = 4;
  for(let i=0;i<stepCount;i++){
    const t = i/(stepCount-1);
    const y = baseY - t*(baseY-topY);
    const w = baseWidth - t*(baseWidth-topWidth);
    const h = baseHeight - t*(baseHeight-topHeight);
    const x = 450 - w/2;
    const rect = document.createElementNS(NS,'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y - h);
    rect.setAttribute('width', w);
    rect.setAttribute('height', h);
    rect.setAttribute('fill', i % 2 === 0 ? 'url(#stepGrad)' : '#101115');
    rect.setAttribute('stroke', 'rgba(150,155,168,0.18)');
    rect.setAttribute('stroke-width', '0.5');
    rect.setAttribute('opacity', (0.35 + t*0.6).toFixed(2));
    g.appendChild(rect);
  }
}

/* ---------------------------------------------------------
   Per-page artistic backdrop (Stoic dark+silver+gold scenes)
   Built entirely with inline SVG data-URIs — no external assets.
   --------------------------------------------------------- */
const BACKDROP_SVG = {
  splash: `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><rect width='400' height='300' fill='%230a0b0d'/><rect width='400' height='300' fill='%23c6a355' fill-opacity='0.04'/></svg>`,
  workspace: `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'><rect width='800' height='600' fill='%23090a0c'/><g stroke='%23c6a355' stroke-opacity='0.14' stroke-width='1' fill='none'><rect x='80' y='360' width='260' height='150'/><line x1='80' y1='400' x2='340' y2='400'/><line x1='150' y1='360' x2='150' y2='510'/><rect x='420' y='300' width='80' height='210' fill='%23c6a355' fill-opacity='0.04'/><rect x='520' y='250' width='60' height='260' fill='%23c6a355' fill-opacity='0.03'/><rect x='600' y='330' width='100' height='180' fill='%23c6a355' fill-opacity='0.05'/></g><g stroke='%238a8f9c' stroke-opacity='0.12'><line x1='0' y1='500' x2='800' y2='500'/></g></svg>`,
  gym: `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'><rect width='800' height='600' fill='%230a0808'/><g stroke='%23a8493f' stroke-opacity='0.16' stroke-width='3' fill='none'><line x1='250' y1='300' x2='550' y2='300'/><circle cx='230' cy='300' r='26' fill='%230a0808' stroke='%23a8493f' stroke-opacity='0.22'/><circle cx='230' cy='300' r='14' fill='%230a0808' stroke='%23a8493f' stroke-opacity='0.22'/><circle cx='570' cy='300' r='26' fill='%230a0808' stroke='%23a8493f' stroke-opacity='0.22'/><circle cx='570' cy='300' r='14' fill='%230a0808' stroke='%23a8493f' stroke-opacity='0.22'/></g><g stroke='%238a8f9c' stroke-opacity='0.08'><line x1='0' y1='460' x2='800' y2='460'/></g></svg>`,
  study: `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'><rect width='800' height='600' fill='%23080a09'/><g stroke='%235c9a68' stroke-opacity='0.14' stroke-width='1' fill='none'><rect x='560' y='120' width='180' height='260'/><line x1='560' y1='180' x2='740' y2='180'/><line x1='560' y1='240' x2='740' y2='240'/><line x1='560' y1='300' x2='740' y2='300'/><line x1='620' y1='120' x2='620' y2='380'/><line x1='680' y1='120' x2='680' y2='380'/></g><g stroke='%23c6a355' stroke-opacity='0.1'><rect x='70' y='420' width='220' height='90'/><line x1='90' y1='440' x2='260' y2='440'/></g></svg>`,
  sanctuary: `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'><rect width='800' height='600' fill='%2309080a'/><g stroke='%23c6a355' stroke-opacity='0.16' stroke-width='1' fill='none'><path d='M400 500 L400 260 A90 90 0 0 1 580 260 L580 500'/><path d='M400 500 L400 260 A90 90 0 0 0 220 260 L220 500'/><line x1='150' y1='500' x2='650' y2='500'/></g><circle cx='400' cy='430' r='4' fill='%23e9c97c' fill-opacity='0.5'/></svg>`,
  dawn: `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'><rect width='800' height='600' fill='%230a0a0d'/><circle cx='400' cy='430' r='120' fill='%23e9c97c' fill-opacity='0.06'/><g stroke='%23e9c97c' stroke-opacity='0.1'><line x1='0' y1='430' x2='800' y2='430'/><line x1='0' y1='460' x2='800' y2='460'/><line x1='0' y1='490' x2='800' y2='490'/></g></svg>`,
  rain: `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'><rect width='800' height='600' fill='%23070810'/><g stroke='%238c96aa' stroke-opacity='0.10' stroke-width='1'><line x1='100' y1='0' x2='60' y2='600'/><line x1='260' y1='0' x2='220' y2='600'/><line x1='420' y1='0' x2='380' y2='600'/><line x1='580' y1='0' x2='540' y2='600'/><line x1='740' y1='0' x2='700' y2='600'/></g></svg>`,
};
function applyBackdrop(theme){
  const el = document.getElementById('page-backdrop');
  if(!el) return;
  const custom = state.customBackdrops && state.customBackdrops[theme];
  const pos = (state.customBackdropPos && state.customBackdropPos[theme]) || { x:50, y:50, zoom:100 };
  // 55 / 0 match the pre-existing baked-in CSS default exactly — untouched
  // themes look identical to before this feature existed.
  el.style.opacity = String((pos.opacity != null ? pos.opacity : 55) / 100);
  el.style.filter = pos.blur > 0 ? `blur(${pos.blur}px)` : '';
  if(custom){
    el.style.backgroundImage = `url("${custom}")`;
    el.style.backgroundSize = `${pos.zoom}%`;
    el.style.backgroundRepeat = 'no-repeat';
    el.style.backgroundPosition = `${pos.x}% ${pos.y}%`;
    return;
  }
  el.style.backgroundSize = 'cover';
  el.style.backgroundPosition = 'center';
  const svg = BACKDROP_SVG[theme] || BACKDROP_SVG.workspace;
  el.style.backgroundImage = `url("data:image/svg+xml,${svg}")`;
}

// Splash screen supports a user-uploaded image layered UNDER the built-in dark
// gradient, so a transparent PNG blends naturally instead of covering it flatly.
// Fit mode: 'cover' fills the screen (may crop), 'contain' shows the whole image.
function applySplashBackdrop(){
  const el = document.getElementById('splash');
  if(!el) return;
  const custom = state.customBackdrops && state.customBackdrops['splash'];
  const pos = (state.customBackdropPos && state.customBackdropPos['splash']) || { x:50, y:50, zoom:100 };
  const baseGradient = "radial-gradient(ellipse 70% 50% at 50% 100%, rgba(198,163,85,.10), transparent 60%), linear-gradient(180deg, #050506 0%, #0a0b0d 55%, #101115 100%)";
  if(custom){
    el.style.backgroundImage = `url("${custom}"), ${baseGradient}`;
    el.style.backgroundSize = `${pos.zoom}%, cover, cover`;
    el.style.backgroundPosition = `${pos.x}% ${pos.y}%, center, center`;
    el.style.backgroundRepeat = 'no-repeat, no-repeat, no-repeat';
  }else{
    el.style.backgroundImage = '';
    el.style.backgroundSize = '';
    el.style.backgroundPosition = '';
    el.style.backgroundRepeat = '';
  }
}

// Subtle 3D parallax — the uploaded image drifts slightly opposite the pointer,
// giving a premium sense of depth instead of a flat static image.
function initSplashParallax(){
  const el = document.getElementById('splash');
  if(!el || window.matchMedia('(pointer: coarse)').matches) return; // skip on touch devices
  let raf = null;
  el.addEventListener('mousemove', (e)=>{
    if(raf) return;
    raf = requestAnimationFrame(()=>{
      const dx = (e.clientX / window.innerWidth - 0.5) * 6;
      const dy = (e.clientY / window.innerHeight - 0.5) * 4;
      const custom = state.customBackdrops && state.customBackdrops['splash'];
      if(custom){
        const pos = (state.customBackdropPos && state.customBackdropPos['splash']) || { x:50, y:50, zoom:100 };
        el.style.backgroundPosition = `calc(${pos.x}% + ${dx}px) calc(${pos.y}% + ${dy}px), center, center`;
      }
      raf = null;
    });
  });
}

const BACKDROP_THEMES = [
  { key:'splash', en:'Opening Screen' },
  { key:'workspace', en:'Workspace' },
  { key:'gym', en:'Gym' },
  { key:'study', en:'Study Room' },
  { key:'sanctuary', en:'Sanctuary' },
  { key:'dawn', en:'Dawn' },
  { key:'rain', en:'Rain' },
];
function renderBgUploadGrid(){
  const grid = $('#bg-upload-grid');
  if(!grid) return;
  grid.innerHTML = '';
  BACKDROP_THEMES.forEach(t=>{
    const custom = state.customBackdrops[t.key];
    const fit = (state.customBackdropFit && state.customBackdropFit[t.key]) || 'cover';
    const pos = (state.customBackdropPos && state.customBackdropPos[t.key]) || { x:50, y:50, zoom:100, opacity:55, blur:0 };
    const opacity = pos.opacity != null ? pos.opacity : 55;
    const blur = pos.blur || 0;
    // Video is only offered for content themes — splash keeps its own
    // dedicated canvas animation (js/splash-fx.js) instead.
    const supportsVideo = t.key !== 'splash' && window.AtlasVideoStore && window.AtlasVideoStore.isVideoTheme(t.key);
    const videoMeta = supportsVideo && window.AtlasMedia ? window.AtlasMedia.getVideoMeta(t.key) : null;
    const hasVideo = !!(videoMeta && videoMeta.hasVideo);

    const item = document.createElement('div');
    item.className = 'bg-upload-item';
    const thumbBg = custom
      ? `background-image:url('${custom}');background-size:${pos.zoom}%;background-position:${pos.x}% ${pos.y}%`
      : `background-image:url('data:image/svg+xml,${BACKDROP_SVG[t.key]}')`;
    item.innerHTML = `
      ${hasVideo ? `<span class="bg-video-badge">Video</span>` : ''}
      <div class="bg-thumb" style="${thumbBg}"></div>
      <p>${t.en}</p>
      <div class="bg-btn-row">
        <label for="bgfile-${t.key}">Upload</label>
        <button type="button" data-remove="${t.key}">Reset</button>
      </div>
      ${custom ? `
      <div class="bg-fit-row">
        <button type="button" class="bg-fit-btn ${fit==='cover'?'active':''}" data-fit="cover" data-fitkey="${t.key}">Fill<small class="id-sub">Penuh</small></button>
        <button type="button" class="bg-fit-btn ${fit==='contain'?'active':''}" data-fit="contain" data-fitkey="${t.key}">Fit All<small class="id-sub">Utuh</small></button>
      </div>
      <div class="bg-zoom-controls">
        <label class="bg-slider-label">Zoom <span>${pos.zoom}%</span></label>
        <input type="range" class="bg-slider" data-adjust="zoom" data-key="${t.key}" min="50" max="250" value="${pos.zoom}">
        <label class="bg-slider-label">Move X <span>${pos.x}%</span></label>
        <input type="range" class="bg-slider" data-adjust="x" data-key="${t.key}" min="0" max="100" value="${pos.x}">
        <label class="bg-slider-label">Move Y <span>${pos.y}%</span></label>
        <input type="range" class="bg-slider" data-adjust="y" data-key="${t.key}" min="0" max="100" value="${pos.y}">
      </div>` : ''}
      ${t.key !== 'splash' ? `
      <div class="bg-zoom-controls">
        <label class="bg-slider-label">Opacity <span>${opacity}%</span></label>
        <input type="range" class="bg-slider" data-adjust="opacity" data-key="${t.key}" min="0" max="100" value="${opacity}">
        <label class="bg-slider-label">Blur <span>${blur}px</span></label>
        <input type="range" class="bg-slider" data-adjust="blur" data-key="${t.key}" min="0" max="12" value="${blur}">
      </div>` : ''}
      <input type="file" id="bgfile-${t.key}" accept="image/*" hidden>
      ${supportsVideo ? `
      <div class="bg-video-row">
        <div class="bg-btn-row">
          <label for="bgvideo-${t.key}">Upload Video</label>
          ${hasVideo ? `<button type="button" data-removevideo="${t.key}">Remove</button>` : ''}
        </div>
        ${hasVideo ? `
        <div class="bg-zoom-controls">
          <label class="bg-slider-label">Video Blur <span>${videoMeta.blur||0}px</span></label>
          <input type="range" class="bg-slider" data-videoadjust="blur" data-key="${t.key}" min="0" max="12" value="${videoMeta.blur||0}">
        </div>
        <p class="bg-video-hint">Video visibility is controlled by the ☀ slider that appears on this page itself.</p>
        ` : `<p class="bg-video-hint">MP4/WebM, ideally under ~15MB. Stays on this device only.</p>`}
        <input type="file" id="bgvideo-${t.key}" accept="video/mp4,video/webm" hidden>
      </div>` : ''}`;
    grid.appendChild(item);
    item.querySelector(`#bgfile-${t.key}`).addEventListener('change', async (e)=>{
      const file = e.target.files[0]; if(!file) return;
      try{
        const compressed = await compressImage(file, 1400, 0.75);
        const ok = await confirmImageUpload(compressed);
        if(ok){
          state.customBackdrops[t.key] = compressed;
          saveState(); renderBgUploadGrid();
          if(t.key === 'splash'){ applySplashBackdrop(); }
          else{
            const activePage = $('.page.active');
            if(activePage && activePage.dataset.bg === t.key) applyBackdrop(t.key);
          }
          showToast('Background updated / Background diperbarui');
        }
      }catch(err){
        showToast('Gagal upload background / Background upload failed');
      }
      e.target.value = '';
    });
    item.querySelector('[data-remove]').addEventListener('click', ()=>{
      delete state.customBackdrops[t.key];
      saveState(); renderBgUploadGrid();
      if(t.key === 'splash'){ applySplashBackdrop(); }
      else{
        const activePage = $('.page.active');
        if(activePage && activePage.dataset.bg === t.key) applyBackdrop(t.key);
      }
    });
    item.querySelectorAll('.bg-fit-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        if(!state.customBackdropFit) state.customBackdropFit = {};
        state.customBackdropFit[t.key] = btn.dataset.fit;
        saveState(); renderBgUploadGrid();
        if(t.key === 'splash'){ applySplashBackdrop(); }
        else{
          const activePage = $('.page.active');
          if(activePage && activePage.dataset.bg === t.key) applyBackdrop(t.key);
        }
      });
    });
    item.querySelectorAll('.bg-slider').forEach(slider=>{
      slider.addEventListener('input', ()=>{
        if(!state.customBackdropPos) state.customBackdropPos = {};
        if(!state.customBackdropPos[t.key]) state.customBackdropPos[t.key] = { x:50, y:50, zoom:100, opacity:55, blur:0 };
        state.customBackdropPos[t.key][slider.dataset.adjust] = Number(slider.value);
        const label = slider.previousElementSibling;
        const unit = slider.dataset.adjust === 'blur' ? 'px' : '%';
        if(label) label.querySelector('span').textContent = slider.value + unit;
        const p = state.customBackdropPos[t.key];
        const thumb = item.querySelector('.bg-thumb');
        if(slider.dataset.adjust === 'zoom' || slider.dataset.adjust === 'x' || slider.dataset.adjust === 'y'){
          thumb.style.backgroundSize = `${p.zoom}%`;
          thumb.style.backgroundPosition = `${p.x}% ${p.y}%`;
        }
        saveState();
        if(t.key === 'splash'){ applySplashBackdrop(); }
        else{
          const activePage = $('.page.active');
          if(activePage && activePage.dataset.bg === t.key) applyBackdrop(t.key);
        }
      });
    });
    /* ---- Video upload / remove / blur ---- */
    const videoInput = item.querySelector(`#bgvideo-${t.key}`);
    if(videoInput){
      videoInput.addEventListener('change', async (e)=>{
        const file = e.target.files[0]; if(!file) return;
        const MAX_MB = 40;
        if(file.size > MAX_MB * 1024 * 1024){
          showToast(`Video terlalu besar (maks ${MAX_MB}MB) / Video too large`);
          e.target.value = ''; return;
        }
        if(!window.AtlasVideoStore || !window.AtlasVideoStore.hasIndexedDB()){
          showToast('Browser ini tidak mendukung penyimpanan video lokal');
          e.target.value = ''; return;
        }
        const ok = await window.AtlasVideoStore.putVideo(t.key, file);
        if(ok){
          window.AtlasMedia.setVideoMeta(t.key, { hasVideo:true });
          window.AtlasVideoStore.refreshIfActive(t.key);
          renderBgUploadGrid();
          showToast('Video updated / Video diperbarui');
        }else{
          showToast('Gagal upload video / Video upload failed');
        }
        e.target.value = '';
      });
    }
    const removeVideoBtn = item.querySelector('[data-removevideo]');
    if(removeVideoBtn){
      removeVideoBtn.addEventListener('click', async ()=>{
        await window.AtlasVideoStore.deleteVideo(t.key);
        window.AtlasMedia.setVideoMeta(t.key, { hasVideo:false });
        window.AtlasVideoStore.refreshIfActive(t.key);
        renderBgUploadGrid();
      });
    }
    item.querySelectorAll('[data-videoadjust]').forEach(slider=>{
      slider.addEventListener('input', ()=>{
        const val = Number(slider.value);
        window.AtlasMedia.setVideoMeta(t.key, { [slider.dataset.videoadjust]: val });
        const label = slider.previousElementSibling;
        if(label) label.querySelector('span').textContent = val + 'px';
        window.AtlasVideoStore.refreshIfActive(t.key);
      });
    });
  });
}
function renderHeroImage(){
  const has = !!state.profile.heroImage;
  $('#hero-img').style.display = has ? 'block' : 'none';
  $('#hero-placeholder').style.display = has ? 'none' : 'flex';
  if(has) $('#hero-img').src = state.profile.heroImage;
  $('#hero-watermark-img').src = state.profile.heroImage || '';
  $('#hero-watermark').classList.toggle('show', has);
}

/* ---------------------------------------------------------
   Default state
   --------------------------------------------------------- */
function defaultState(){
  return {
    profile: { name: 'Sang Pendaki', avatar: '', heroImage: '', bio: '', social: { instagram:'', facebook:'', whatsapp:'', telegram:'' } },
    totalExp: 0,
    journeyProgress: 0,
    streak: 0,
    lastActiveDate: todayStr(),
    completions: {},      // { date: { taskId: true, water: 0 } }
    history: {},          // { date: { completed, total, ratio, status } }
    customBackdrops: {},   // { themeKey: dataURL }
    customBackdropFit: {},  // { themeKey: 'cover'|'contain' }
    customBackdropPos: {},   // { themeKey: { x, y, zoom, opacity, blur } }
    customBackdropVideo: {}, // { themeKey: { hasVideo, opacity, blur } } — video file itself lives in IndexedDB, not here
    customQuests: {
      daily: JSON.parse(JSON.stringify(window.DEFAULT_DAILY_QUESTS || [])).map((q,i)=>({ id:'cd_'+Date.now()+'_'+i, text_en:q.text_en, text_id:q.text_id, exp:q.exp, doneDates:[] })),
      weekly: JSON.parse(JSON.stringify(window.DEFAULT_WEEKLY_QUESTS || [])).map((q,i)=>({ id:'cw_'+Date.now()+'_'+i, text_en:q.text_en, text_id:q.text_id, exp:q.exp, doneDates:[] })),
    },
    boss: { title:'', tasks:[], completedMonths:[] },
    journals: {},          // { date: { mind, gratitude, trading } }
    finance: {},            // { date: { income, saving, expense } }
    reflections: {},        // { date: { well, fail, tomorrow, honest } }
    timeline: {},            // { "19": "text" }
    emotions: {},             // { date: 'calm'|'good'|'neutral'|'stressed'|'angry' }
    tradeLog: [],              // [{ id, date, pair, result, rr, notes }]
    financeLog: [],            // [{ id, date, type: 'income'|'saving'|'expense', currency: 'IDR'|'USD'|'KHR', amount, note }]
    achievementsUnlocked: [],
    nutrition: {
      profile: { heightCm: 169, weightKg: 55, age: 19, activity: 'moderate', setupDone: false },
      budgetMonthlyUSD: 250,
      mealChecklist: {},   // { date: { slotId: true } }
      budgetLog: [],        // [{ id, date, amountUSD, note }]
    },
    settings: { rainMode:'off', soundOn:true, pin:'', theme:'dark' },
    onboarded: false,
  };
}

const isFirstRun = !localStorage.getItem(STORAGE_KEY);
let state = loadState();

/* Small read/write bridge for js/video-bg.js — the actual video files live in
   IndexedDB (local-only, see video-bg.js), but whether a theme HAS a video
   and its opacity/blur are tiny and safe to keep in the normal synced state,
   same as every other setting here. */
window.AtlasMedia = {
  getVideoMeta(theme){
    return (state.customBackdropVideo && state.customBackdropVideo[theme]) || null;
  },
  setVideoMeta(theme, patch){
    if(!state.customBackdropVideo) state.customBackdropVideo = {};
    state.customBackdropVideo[theme] = Object.assign(
      { hasVideo:false, opacity:20, blur:0 },
      state.customBackdropVideo[theme] || {},
      patch
    );
    saveState();
    return state.customBackdropVideo[theme];
  },
  /** Brightness of the normal (non-video) page backdrop for a theme — used
   * by the floating brightness widget on pages that have no video layer. */
  getBackdropOpacity(theme){
    const pos = (state.customBackdropPos && state.customBackdropPos[theme]) || {};
    return pos.opacity != null ? pos.opacity : 55;
  },
  setBackdropOpacity(theme, val){
    if(!state.customBackdropPos) state.customBackdropPos = {};
    if(!state.customBackdropPos[theme]) state.customBackdropPos[theme] = { x:50, y:50, zoom:100, opacity:55, blur:0 };
    state.customBackdropPos[theme].opacity = val;
    saveState();
    applyBackdrop(theme);
  },
};

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return Object.assign(defaultState(), parsed);
  }catch(e){
    console.warn('MAN ATLAS: gagal memuat data, memakai default.', e);
    return defaultState();
  }
}
let _cloudPushTimer = null;
let cloudSyncPromise = Promise.resolve(); // reassigned in init(); resolves once first cloud sync round-trip settles
function saveState(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }catch(e){
    // Local save failed (quota exceeded, private-browsing restrictions, etc).
    // The in-memory `state` is untouched and the app keeps running — we just
    // let the user know this save didn't persist, the same way cloud sync
    // failures are surfaced below.
    console.warn('MAN ATLAS: gagal menyimpan data lokal.', e);
    showToast('Gagal menyimpan data / Save failed');
  }
  if(window.AtlasSync && window.AtlasSync.isOwner){
    // Debounced: typing in a textarea or dragging a zoom slider fires saveState()
    // many times a second — pushing the full state (incl. images) on every one
    // of those was hammering Supabase and made real failures easy to miss.
    _cloudPushPending = true;
    if(_cloudPushTimer) clearTimeout(_cloudPushTimer);
    _cloudPushTimer = setTimeout(flushCloudPush, 1200);
  }
}
let _cloudPushPending = false;
/** Push immediately, bypassing the debounce delay. Called by the timer above,
 * and also forced when the app is about to be closed/backgrounded — otherwise
 * a quest completed right before switching apps or locking the phone can be
 * lost forever (the setTimeout never gets to fire on a killed/paused tab). */
function flushCloudPush(){
  if(_cloudPushTimer){ clearTimeout(_cloudPushTimer); _cloudPushTimer = null; }
  if(!_cloudPushPending) return;
  if(!(window.AtlasSync && window.AtlasSync.isOwner)) return;
  _cloudPushPending = false;
  window.AtlasSync.push(state).then(res=>{
    if(res.conflict){
      // The other device (PC/HP) saved something after our last pull — merge
      // its version in instead of silently overwriting it, then let the user
      // decide whether to redo their edit.
      if(res.cloudData){
        state = Object.assign(defaultState(), res.cloudData);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        renderAll(); renderAnalytics(); renderHeroImage(); renderBgUploadGrid();
      }
      showToast('Ada perubahan baru dari device lain, data disegarkan / New changes from another device were loaded — please redo your last edit if needed');
    }else if(!res.ok){
      showToast('Gagal sync ke cloud: ' + (res.error || 'unknown') + ' / Cloud sync failed');
    }
  });
}
// Whenever the app/tab becomes visible again (switching back from another app,
// unlocking the phone, or alt-tabbing on PC), pull the latest cloud data first.
// This is the main defense against the "edited on PC, opened on HP, saw old
// data" confusion — the device always refreshes itself before the person
// starts editing again.
let _lastAutoPull = 0;
async function autoPullIfStale(){
  if(!(window.AtlasSync && window.AtlasSync.client)) return;
  if(_cloudPushPending) return; // don't clobber an edit that hasn't pushed yet
  const now = Date.now();
  if(now - _lastAutoPull < 8000) return; // throttle
  _lastAutoPull = now;
  try{
    const cloudData = await window.AtlasSync.pull();
    if(cloudData){
      state = Object.assign(defaultState(), cloudData);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      checkRollover(); refreshHistoryToday();
      renderAll(); renderAnalytics(); renderHeroImage(); renderBgUploadGrid();
      applySplashBackdrop();
      const activePage = $('.page.active');
      if(activePage && activePage.dataset.bg) applyBackdrop(activePage.dataset.bg);
    }
  }catch(e){ console.warn('MAN ATLAS: auto-refresh pull failed', e); }
}
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState === 'visible') autoPullIfStale();
});
window.addEventListener('focus', autoPullIfStale);
// Fires when the tab/app is backgrounded, the screen is locked, or the user
// switches apps — this happens BEFORE the tab is actually killed, unlike
// beforeunload (unreliable on mobile). This is the moment we must not miss.
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState === 'hidden') flushCloudPush();
});
// Extra safety net for desktop tab/window close.
window.addEventListener('pagehide', flushCloudPush);

function getAudioCtx(){
  if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
  // Mobile browsers often create/keep the context 'suspended' even when this
  // runs inside a tap handler — without this it fails completely silently.
  if(audioCtx.state === 'suspended'){ audioCtx.resume().catch(()=>{}); }
  return audioCtx;
}
function playTick(){
  if(!state.settings.soundOn) return;
  try{
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.type='sine'; osc.frequency.value = 720;
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime+0.13);
  }catch(e){}
}
function playLevelChime(){
  if(!state.settings.soundOn) return;
  try{
    const ctx = getAudioCtx();
    [523.3,659.3,784.0].forEach((freq,i)=>{
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type='triangle'; osc.frequency.value = freq;
      const start = ctx.currentTime + i*0.1;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.09, start+0.05);
      gain.gain.linearRampToValueAtTime(0, start+0.9);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start); osc.stop(start+1);
    });
  }catch(e){}
}

/* ---------------------------------------------------------
   EXP / Level / Rank
   --------------------------------------------------------- */
function expForLevel(level){ return 80 + (level-1)*40; } // exp needed to clear this level
function levelFromExp(totalExp){
  let level = 1, remaining = totalExp;
  while(remaining >= expForLevel(level)){
    remaining -= expForLevel(level);
    level++;
  }
  return { level, cur: remaining, max: expForLevel(level) };
}
function rankForLevel(level){
  return RANKS.find(r => level >= r.min && level <= r.max) || RANKS[RANKS.length-1];
}

function addExp(amount, opts={}){
  const before = levelFromExp(state.totalExp).level;
  state.totalExp = Math.max(0, state.totalExp + amount);
  const after = levelFromExp(state.totalExp).level;
  const d = todayStr();
  if(!state.expLog) state.expLog = {};
  state.expLog[d] = (state.expLog[d]||0) + amount;
  if(amount > 0) advanceJourney(0.6);
  else if(amount < 0) advanceJourney(-0.6);
  saveState();
  renderProfile();
  if(after > before && !opts.silent) showLevelUp(after);
  if(after < before && !opts.silent) showToast('Level down — discipline slipped. / Level turun — disiplin melemah.');
  checkAchievements();
}
function advanceJourney(delta){
  state.journeyProgress = Math.max(0, Math.min(100, (state.journeyProgress||0) + delta));
}

function showLevelUp(level){
  playLevelChime();
  const toast = $('#levelup-toast');
  $('#levelup-text').textContent = `LEVEL ${level} — ${rankForLevel(level).name}`;
  toast.classList.add('show');
  setTimeout(()=> toast.classList.remove('show'), 3200);
}
function showToast(msg){
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=> t.classList.remove('show'), 2600);
}

/* ---------------------------------------------------------
   Completions helpers
   --------------------------------------------------------- */
function getDayCompletions(date){
  if(!state.completions[date]) state.completions[date] = {};
  return state.completions[date];
}
function isTaskDone(date, taskId){
  return !!getDayCompletions(date)[taskId];
}
function toggleTask(taskId, expVal){
  const date = todayStr();
  const day = getDayCompletions(date);
  if(day[taskId]){
    delete day[taskId];
    addExp(-expVal, {silent:true});
  }else{
    day[taskId] = true;
    addExp(expVal);
  }
  saveState();
  refreshHistoryToday();
  renderAll();
}

const ALL_CATEGORY_TASKS = () => ([
  ...MORNING_TASKS.map(t=>({...t, cat:'morning'})),
  ...BODY_TASKS.map(t=>({...t, cat:'body'})),
  ...MIND_TASKS.map(t=>({...t, cat:'mind'})),
  ...FAITH_TASKS.map(t=>({...t, cat:'faith'})),
  ...KNOWLEDGE_TASKS.map(t=>({...t, cat:'knowledge'})),
]);

function dayStats(date){
  const defs = ALL_CATEGORY_TASKS();
  const day = state.completions[date] || {};
  let total = defs.length;
  let completed = defs.filter(t => day[t.id]).length;
  // include custom daily quests scheduled that day
  state.customQuests.daily.forEach(q=>{
    total += 1;
    if(q.doneDates.includes(date)) completed += 1;
  });
  const ratio = total ? completed/total : 0;
  let status = 'missed';
  if(completed > 0){ status = ratio >= 0.6 ? 'success' : 'fail'; }
  return { completed, total, ratio, status };
}

function refreshHistoryToday(){
  const date = todayStr();
  state.history[date] = dayStats(date);
  saveState();
}

/* ---------------------------------------------------------
   Day rollover / streak
   --------------------------------------------------------- */
function checkRollover(){
  const today = todayStr();
  if(state.lastActiveDate === today) return;
  // finalize all days between lastActiveDate and today (exclusive of today)
  let cursor = parseLocalDate(state.lastActiveDate);
  const todayDate = parseLocalDate(today);
  let penalty = 0, bonus = 0, missedDays = 0, successDays = 0;
  while(todayStr(cursor) !== today){
    const cd = todayStr(cursor);
    const stats = dayStats(cd);
    state.history[cd] = stats;
    if(stats.status === 'success'){
      state.streak += 1;
      successDays++;
      advanceJourney(1.2);
      if(state.streak > 0 && state.streak % 7 === 0) bonus += 25; // Reward: 7-day milestone bonus
    }else if(stats.status === 'fail'){
      state.streak = 0;
      penalty += 5; // Punishment: attempted but under 60% completion
      advanceJourney(-3);
    }else if(stats.status === 'missed'){
      state.streak = 0;
      penalty += 15; // Punishment: a full day abandoned
      missedDays++;
      advanceJourney(-6);
    }
    cursor.setDate(cursor.getDate()+1);
    if(cursor > todayDate) break;
  }
  state.lastActiveDate = today;
  if(penalty > 0){ state.totalExp = Math.max(0, state.totalExp - penalty); }
  if(bonus > 0){ state.totalExp += bonus; }
  saveState();
  if(missedDays > 0){
    showToast(`${missedDays} day(s) abandoned. -${penalty} EXP. / ${missedDays} hari terlewat. -${penalty} EXP.`);
  }
  if(bonus > 0){
    showToast(`Streak milestone reached! +${bonus} EXP bonus. / Pencapaian beruntun! Bonus +${bonus} EXP.`);
  }
}

/* ---------------------------------------------------------
   Rendering — Profile / Dashboard
   --------------------------------------------------------- */
function renderProfile(){
  $('#char-name').value = state.profile.name;
  $('#char-bio').value = state.profile.bio || '';
  renderSocialLinks();
  if(state.profile.avatar){
    $('#avatar-img').src = state.profile.avatar;
    $('#avatar-img').style.display = 'block';
    $('#avatar-placeholder').style.display = 'none';
  }else{
    $('#avatar-img').style.display = 'none';
    $('#avatar-placeholder').style.display = 'flex';
  }
  const { level, cur, max } = levelFromExp(state.totalExp);
  const rank = rankForLevel(level);
  $('#lvl-num').textContent = level;
  $('#char-rank').textContent = `${rank.name} · ${rank.id}`;
  $('#exp-fill').style.width = Math.min(100, (cur/max)*100) + '%';
  $('#exp-cur').textContent = cur;
  $('#exp-max').textContent = max;
  $('#streak-num').textContent = state.streak;
  const streakEl = $('#streak-num').closest('.stat-mini');
  streakEl.classList.remove('streak-warm','streak-hot','streak-blaze');
  if(state.streak >= 30) streakEl.classList.add('streak-blaze');
  else if(state.streak >= 14) streakEl.classList.add('streak-hot');
  else if(state.streak >= 7) streakEl.classList.add('streak-warm');
  $('#honor-num').textContent = honorScore();
  $('#honor-num-2').textContent = honorScore();
  const questsDone = Object.values(state.history).reduce((s,h)=>s + (h.completed||0), 0);
  $('#quests-done-num').textContent = questsDone;
  $('#today-date').textContent = fmtHuman();
}

function honorScore(){
  const entries = Object.values(state.reflections);
  if(!entries.length) return 100;
  const recent = entries.slice(-30);
  const honestCount = recent.filter(r=>r.honest).length;
  return Math.round((honestCount/recent.length)*100);
}

function renderTodayMission(){
  const date = todayStr();
  const list = $('#today-mission-list');
  list.innerHTML = '';
  let total = 0, done = 0;
  MORNING_TASKS.forEach(t=>{
    total++; const d = isTaskDone(date, t.id); if(d) done++;
    list.appendChild(missionItem(t.id, t.en, t.id_, t.exp, d, ()=>toggleTask(t.id, t.exp)));
  });
  state.customQuests.daily.forEach(q=>{
    total++; const d = q.doneDates.includes(date); if(d) done++;
    list.appendChild(missionItem(q.id, q.text_en, q.text_id, q.exp, d, ()=>toggleCustomQuest('daily', q.id)));
  });
  const pct = total ? Math.round((done/total)*100) : 0;
  $('#today-progress-fill').style.width = pct + '%';
  $('#today-progress-text').textContent = pct + '%';
}

/* ---------------------------------------------------------
   Next Meal widget — surfaces the nutrition schedule (already
   tuned to the 14:00–02:00 shift in NUTRITION_MEAL_SLOTS) right
   on the Today page instead of it being buried in Nutrition.
   --------------------------------------------------------- */
let _nextMealTimer = null;
function minutesNowLocal(){
  const d = new Date();
  return d.getHours()*60 + d.getMinutes();
}
function minutesFromHHMM(hhmm){
  const [h,m] = hhmm.split(':').map(Number);
  return h*60 + m;
}
function findNextMealSlot(){
  const nowMin = minutesNowLocal();
  const withMin = NUTRITION_MEAL_SLOTS.map(m => ({...m, min: minutesFromHHMM(m.time)}));
  // Slots strictly after now, today
  const upcoming = withMin.filter(m => m.min > nowMin).sort((a,b)=>a.min-b.min);
  if(upcoming.length) return { slot: upcoming[0], minsUntil: upcoming[0].min - nowMin, isTomorrow:false };
  // Everything today has passed (e.g. it's 5am) — roll over to the earliest slot tomorrow
  const earliest = [...withMin].sort((a,b)=>a.min-b.min)[0];
  return { slot: earliest, minsUntil: (1440 - nowMin) + earliest.min, isTomorrow:true };
}
function renderNextMeal(){
  const panel = $('#next-meal-panel');
  if(!panel) return;
  const { slot, minsUntil, isTomorrow } = findNextMealSlot();
  const date = todayStr();
  if(!state.nutrition.mealChecklist[date]) state.nutrition.mealChecklist[date] = {};
  const doneToday = !!state.nutrition.mealChecklist[date][slot.id];

  $('#next-meal-time').textContent = slot.time;
  $('#next-meal-name').textContent = `${slot.en} / ${slot.id_}`;
  $('#next-meal-desc').textContent = slot.desc_id;

  const countdownEl = $('#next-meal-countdown');
  if(isTomorrow){
    countdownEl.textContent = `Besok · ${Math.floor(minsUntil/60)}j ${minsUntil%60}m lagi`;
  }else if(minsUntil <= 20){
    countdownEl.textContent = minsUntil <= 0 ? 'Sekarang saatnya' : `${minsUntil} menit lagi`;
    countdownEl.classList.add('soon');
  }else{
    const h = Math.floor(minsUntil/60), m = minsUntil%60;
    countdownEl.textContent = h > 0 ? `${h}j ${m}m lagi` : `${m} menit lagi`;
    countdownEl.classList.remove('soon');
  }

  const btn = $('#next-meal-check-btn');
  btn.textContent = doneToday ? '✓' : '+' + slot.exp;
  btn.classList.toggle('done', doneToday);
  btn.onclick = () => { toggleMeal(slot.id, slot.exp); renderNextMeal(); };

  if(!_nextMealTimer){
    _nextMealTimer = setInterval(renderNextMeal, 60000); // refresh every minute
  }
}
function missionItem(id, en, idText, exp, done, onClick){
  const li = document.createElement('li');
  li.className = 'mission-item' + (done ? ' done' : '');
  li.innerHTML = `<span class="chk ${done?'done':''}">${done?'✓':''}</span>
    <span class="task-label">${en}<small class="id-sub">${idText}</small></span>
    <span class="task-exp">+${exp} EXP</span>`;
  li.querySelector('.chk').addEventListener('click', onClick);
  return li;
}

/* ---------------------------------------------------------
   Generic category task list renderer (morning/body/mind/faith/knowledge)
   --------------------------------------------------------- */
function renderTaskList(containerId, defs){
  const date = todayStr();
  const ul = $('#'+containerId);
  ul.innerHTML = '';
  defs.forEach(t=>{
    const done = isTaskDone(date, t.id);
    const li = document.createElement('li');
    li.className = 'task-item' + (done ? ' done' : '');
    li.innerHTML = `<span class="chk ${done?'done':''}">${done?'✓':''}</span>
      <span class="task-label">${t.en}<small class="id-sub">${t.id_}</small></span>
      <span class="task-exp">+${t.exp} EXP</span>`;
    li.querySelector('.chk').addEventListener('click', ()=> toggleTask(t.id, t.exp));
    ul.appendChild(li);
  });
}

/* ---------------------------------------------------------
   Water tracker
   --------------------------------------------------------- */
function renderWater(){
  const date = todayStr();
  const day = getDayCompletions(date);
  const count = day.water || 0;
  const wrap = $('#water-glasses');
  wrap.innerHTML = '';
  for(let i=0;i<8;i++){
    const g = document.createElement('div');
    g.className = 'glass' + (i < count ? ' filled' : '');
    g.addEventListener('click', ()=>{
      const newCount = (i+1 === count) ? i : i+1;
      const wasFull = count >= 8;
      day.water = newCount;
      if(newCount >= 8 && !wasFull) addExp(10);
      saveState(); renderWater(); refreshHistoryToday();
    });
    wrap.appendChild(g);
  }
  $('#water-count').textContent = count;
}

/* ---------------------------------------------------------
   Quests: custom daily / weekly / boss
   --------------------------------------------------------- */
function toggleCustomQuest(type, id){
  const key = type === 'weekly' ? weekKey() : todayStr();
  const q = state.customQuests[type].find(x=>x.id===id);
  if(!q) return;
  const idx = q.doneDates.indexOf(key);
  if(idx >= 0){ q.doneDates.splice(idx,1); addExp(-q.exp, {silent:true}); }
  else{ q.doneDates.push(key); addExp(q.exp); }
  saveState();
  refreshHistoryToday();
  renderQuestsPage();
  renderTodayMission();
}
function renderQuestList(type){
  const key = type === 'weekly' ? weekKey() : todayStr();
  const container = $(type === 'daily' ? '#daily-quest-list' : '#weekly-quest-list');
  container.innerHTML = '';
  state.customQuests[type].forEach(q=>{
    const done = q.doneDates.includes(key);
    const li = document.createElement('li');
    li.className = 'quest-item' + (done?' done':'');
    li.innerHTML = `<span class="chk ${done?'done':''}">${done?'✓':''}</span>
      <span class="task-label">${q.text_en}<small class="id-sub">${q.text_id}</small></span>
      <span class="task-exp">+${q.exp} EXP</span>
      <button class="quest-del" title="Hapus">✕</button>`;
    li.querySelector('.chk').addEventListener('click', ()=> toggleCustomQuest(type, q.id));
    li.querySelector('.quest-del').addEventListener('click', ()=>{
      state.customQuests[type] = state.customQuests[type].filter(x=>x.id!==q.id);
      saveState(); renderQuestList(type);
    });
    container.appendChild(li);
  });
}
function renderBoss(){
  $('#boss-title').value = state.boss.title || '';
  const ul = $('#boss-task-list');
  ul.innerHTML = '';
  state.boss.tasks.forEach(t=>{
    const li = document.createElement('li');
    li.className = 'quest-item' + (t.done?' done':'');
    li.innerHTML = `<span class="chk ${t.done?'done':''}">${t.done?'✓':''}</span>
      <span class="task-label">${t.text}</span>
      <button class="quest-del" title="Hapus">✕</button>`;
    li.querySelector('.chk').addEventListener('click', ()=>{
      t.done = !t.done;
      saveState(); renderBoss();
      if(state.boss.tasks.length && state.boss.tasks.every(x=>x.done)){
        showToast('Monthly Boss defeated! / Boss Bulanan berhasil ditumbangkan!');
        addExp(80);
        if(!state.achievementsUnlocked.includes('boss_slain')) unlockAchievement('boss_slain');
      }
    });
    li.querySelector('.quest-del').addEventListener('click', ()=>{
      state.boss.tasks = state.boss.tasks.filter(x=>x.id!==t.id);
      saveState(); renderBoss();
    });
    ul.appendChild(li);
  });
  const total = state.boss.tasks.length;
  const done = state.boss.tasks.filter(t=>t.done).length;
  const pct = total ? Math.round((done/total)*100) : 0;
  $('#boss-hp-fill').style.width = pct + '%';
  $('#boss-hp-text').textContent = pct + '%';
}
function renderQuestsPage(){
  renderQuestList('daily');
  renderQuestList('weekly');
  renderBoss();
}

/* ---------------------------------------------------------
   Journals / Faith / Finance / Reflection
   --------------------------------------------------------- */
function getJournal(date){
  if(!state.journals[date]) state.journals[date] = { mind:'', gratitude:'', trading:'' };
  return state.journals[date];
}
function renderJournals(){
  const date = todayStr();
  const j = getJournal(date);
  $('#mind-journal').value = j.mind;
  $('#gratitude-log').value = j.gratitude;
}
function renderStoicQuote(){
  const idx = new Date().getDate() % STOIC_QUOTES.length;
  const q = STOIC_QUOTES[idx];
  $('#stoic-quote').innerHTML = `“${q.en}”<span class="id-sub" style="margin-top:8px">“${q.id_}”</span>`;
}
function renderDashboardQuote(){
  const idx = new Date().getDate() % STOIC_QUOTES.length;
  const q = STOIC_QUOTES[idx];
  $('#dashboard-quote-en').textContent = `“${q.en}”`;
  $('#dashboard-quote-id').textContent = `“${q.id_}”`;
}

const CURRENCY_SYMBOL = { IDR:'Rp', USD:'$', KHR:'៛' };
function fmtCurrency(amount, currency){
  const symbol = CURRENCY_SYMBOL[currency] || currency;
  return `${symbol} ${Number(amount).toLocaleString('en-US')}`;
}
function renderFinanceSummary(){
  // Currencies are kept separate (not converted) since exchange rates fluctuate —
  // this shows the true balance you actually hold in each currency.
  const totals = { IDR:{income:0,saving:0,expense:0}, USD:{income:0,saving:0,expense:0}, KHR:{income:0,saving:0,expense:0} };
  state.financeLog.forEach(t=>{
    if(!totals[t.currency]) totals[t.currency] = {income:0,saving:0,expense:0};
    totals[t.currency][t.type] += Number(t.amount)||0;
  });
  const wrap = $('#fin-summary');
  wrap.innerHTML = '';
  Object.keys(totals).forEach(cur=>{
    const t = totals[cur];
    if(t.income===0 && t.saving===0 && t.expense===0) return;
    const net = t.income - t.expense;
    const block = document.createElement('div');
    block.style.cssText = 'grid-column:1/-1;margin-bottom:10px;';
    block.innerHTML = `
      <p class="id-sub" style="text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">${cur}</p>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
        <div class="fs-item"><b>${fmtCurrency(t.income, cur)}</b><span>Income</span></div>
        <div class="fs-item"><b>${fmtCurrency(t.saving, cur)}</b><span>Saving</span></div>
        <div class="fs-item"><b>${fmtCurrency(t.expense, cur)}</b><span>Expense</span></div>
        <div class="fs-item"><b style="color:${net>=0?'var(--success)':'var(--fail)'}">${fmtCurrency(net, cur)}</b><span>Net</span></div>
      </div>`;
    wrap.appendChild(block);
  });
  if(!state.financeLog.length){
    wrap.innerHTML = '<p class="id-sub" style="text-align:center;padding:12px 0;grid-column:1/-1">Belum ada transaksi. Tambahkan catatan pertamamu di atas.</p>';
  }
}
function renderFinanceLog(){
  const wrap = $('#finance-log');
  if(!wrap) return;
  wrap.innerHTML = '';
  [...state.financeLog].reverse().slice(0,30).forEach(t=>{
    const row = document.createElement('div');
    row.className = 'trade-log-item';
    const cls = t.type === 'income' ? 'tl-win' : t.type === 'expense' ? 'tl-loss' : '';
    const sign = t.type === 'expense' ? '-' : '+';
    row.innerHTML = `<span>${t.date} · ${t.note || t.type}</span>
      <span class="${cls}">${sign}${fmtCurrency(t.amount, t.currency)}</span>`;
    wrap.appendChild(row);
  });
  if(!state.financeLog.length){
    wrap.innerHTML = '<p class="id-sub" style="text-align:center;padding:12px 0">Belum ada riwayat transaksi.</p>';
  }
}

/* ---------------------------------------------------------
   Nutrition / Bulking module
   --------------------------------------------------------- */
function nutritionTargets(){
  const p = state.nutrition.profile;
  const bmr = 10*p.weightKg + 6.25*p.heightCm - 5*p.age + 5; // Mifflin-St Jeor, male
  const mult = (NUTRITION_ACTIVITY_LEVELS.find(a=>a.key===p.activity) || NUTRITION_ACTIVITY_LEVELS[2]).mult;
  const tdee = bmr * mult;
  const calories = Math.round(tdee + 350); // moderate bulk surplus
  const protein = Math.round(p.weightKg * 2);      // g/day — high end of bulk range
  const fat = Math.round((calories*0.25)/9);        // g/day
  const carbs = Math.max(0, Math.round((calories - protein*4 - fat*9)/4));
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), calories, protein, fat, carbs };
}
function renderNutritionProfileForm(){
  const p = state.nutrition.profile;
  $('#nut-height').value = p.heightCm;
  $('#nut-weight').value = p.weightKg;
  $('#nut-age').value = p.age;
  $('#nut-budget').value = state.nutrition.budgetMonthlyUSD;
  const sel = $('#nut-activity');
  sel.innerHTML = NUTRITION_ACTIVITY_LEVELS.map(a=>
    `<option value="${a.key}" ${a.key===p.activity?'selected':''}>${a.en} / ${a.id_}</option>`).join('');
}
function renderNutritionTargets(){
  const t = nutritionTargets();
  $('#nut-target-cal').textContent = t.calories.toLocaleString('id-ID');
  $('#nut-target-protein').textContent = t.protein + 'g';
  $('#nut-target-carbs').textContent = t.carbs + 'g';
  $('#nut-target-fat').textContent = t.fat + 'g';
  $('#nut-tdee').textContent = t.tdee.toLocaleString('id-ID');
}
function renderMealChecklist(){
  const date = todayStr();
  if(!state.nutrition.mealChecklist[date]) state.nutrition.mealChecklist[date] = {};
  const done = state.nutrition.mealChecklist[date];
  const ul = $('#nut-meal-list');
  ul.innerHTML = '';
  let doneCount = 0;
  NUTRITION_MEAL_SLOTS.forEach(m=>{
    const isDone = !!done[m.id];
    if(isDone) doneCount++;
    const li = document.createElement('li');
    li.className = 'task-item' + (isDone ? ' done' : '');
    li.innerHTML = `<span class="chk ${isDone?'done':''}">${isDone?'✓':''}</span>
      <span class="task-label"><b class="nut-meal-time">${m.time}</b> ${m.en}<small class="id-sub">${m.id_} — ${m.desc_id}</small></span>
      <span class="task-exp">+${m.exp} EXP</span>`;
    li.querySelector('.chk').addEventListener('click', ()=> toggleMeal(m.id, m.exp));
    ul.appendChild(li);
  });
  $('#nut-meal-progress-text').textContent = `${doneCount} / ${NUTRITION_MEAL_SLOTS.length}`;
  $('#nut-meal-progress-fill').style.width = Math.round((doneCount/NUTRITION_MEAL_SLOTS.length)*100) + '%';
}
function toggleMeal(slotId, exp){
  const date = todayStr();
  if(!state.nutrition.mealChecklist[date]) state.nutrition.mealChecklist[date] = {};
  const done = state.nutrition.mealChecklist[date];
  if(done[slotId]){ delete done[slotId]; addExp(-exp, {silent:true}); }
  else{ done[slotId] = true; addExp(exp); }
  saveState();
  renderMealChecklist();
  refreshHistoryToday();
}
function renderFoodSuggestions(){
  const wrap = $('#nut-food-suggestions');
  if(!wrap) return;
  const cats = [
    { key:'protein', label:'Protein', label_id:'Protein' },
    { key:'carbs', label:'Carbs', label_id:'Karbo' },
    { key:'veg_fat', label:'Veg & Fat', label_id:'Sayur & Lemak' },
  ];
  wrap.innerHTML = cats.map(c=>{
    const items = (NUTRITION_FOODS[c.key]||[]).map(f=>
      `<div class="fs-item"><b>${fmtCurrency(f.cost,'IDR')}</b><span>${f.en}<br><small class="id-sub">${f.id_}</small></span></div>`
    ).join('');
    return `<p class="id-sub" style="text-transform:uppercase;letter-spacing:.08em;margin:12px 0 8px">${c.label} <span style="text-transform:none">/ ${c.label_id}</span></p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;">${items}</div>`;
  }).join('');
}
function renderNutritionBudget(){
  const monthKey = todayStr().slice(0,7); // YYYY-MM
  const spent = state.nutrition.budgetLog
    .filter(e=>e.date.slice(0,7)===monthKey)
    .reduce((s,e)=> s + Number(e.amountUSD||0), 0);
  const budget = Number(state.nutrition.budgetMonthlyUSD)||0;
  const remaining = budget - spent;
  $('#nut-budget-spent').textContent = '$' + spent.toFixed(2);
  $('#nut-budget-remaining').textContent = '$' + remaining.toFixed(2);
  $('#nut-budget-remaining').style.color = remaining >= 0 ? 'var(--success)' : 'var(--fail)';
  const wrap = $('#nut-budget-log');
  wrap.innerHTML = '';
  [...state.nutrition.budgetLog].reverse().slice(0,20).forEach(e=>{
    const row = document.createElement('div');
    row.className = 'trade-log-item';
    row.innerHTML = `<span>${e.date} · ${e.note || 'Belanja makan'}</span><span class="tl-loss">-$${Number(e.amountUSD).toFixed(2)}</span>`;
    wrap.appendChild(row);
  });
  if(!state.nutrition.budgetLog.length){
    wrap.innerHTML = '<p class="id-sub" style="text-align:center;padding:12px 0">Belum ada catatan belanja bulan ini.</p>';
  }
}
function renderNutritionPage(){
  renderNutritionProfileForm();
  renderNutritionTargets();
  renderMealChecklist();
  renderFoodSuggestions();
  renderNutritionBudget();
}

/* ---------------------------------------------------------
   Calendar
   --------------------------------------------------------- */
let calMonthOffset = 0;
function buildMonthGrid(container, offset){
  container.innerHTML = '';
  const now = new Date();
  const view = new Date(now.getFullYear(), now.getMonth()+offset, 1);
  const year = view.getFullYear(), month = view.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const todayS = todayStr();

  for(let i=0;i<firstDay;i++){
    const empty = document.createElement('div');
    empty.className = 'cal-day empty';
    container.appendChild(empty);
  }
  for(let d=1; d<=daysInMonth; d++){
    const dateObj = new Date(year, month, d);
    const ds = todayStr(dateObj);
    const cell = document.createElement('div');
    let cls = 'cal-day';
    if(ds === todayS) cls += ' today';
    const stat = state.history[ds] ? state.history[ds].status : (dateObj < parseLocalDate(todayS) ? 'missed' : '');
    if(stat === 'success') cls += ' success';
    else if(stat === 'fail') cls += ' fail';
    else if(stat === 'missed' && dateObj < parseLocalDate(todayS)) cls += ' missed';
    cell.className = cls;
    cell.textContent = d;
    container.appendChild(cell);
  }
  return { year, month };
}
function renderMiniCalendar(){
  buildMonthGrid($('#mini-calendar'), 0);
}
function renderFullCalendar(){
  const { year, month } = buildMonthGrid($('#full-calendar'), calMonthOffset);
  const label = new Date(year, month, 1).toLocaleDateString('id-ID', { month:'long', year:'numeric' });
  $('#cal-month-label').textContent = label;
}

/* ---------------------------------------------------------
   Stats bars (7-day completion rate per category)
   --------------------------------------------------------- */
function renderStatsBars(){
  const cats = [
    { key:'morning', label:'Morning', defs: MORNING_TASKS },
    { key:'body', label:'Body', defs: BODY_TASKS },
    { key:'mind', label:'Mind', defs: MIND_TASKS },
    { key:'faith', label:'Faith', defs: FAITH_TASKS },
    { key:'knowledge', label:'Knowledge', defs: KNOWLEDGE_TASKS },
  ];
  const wrap = $('#stats-bars');
  wrap.innerHTML = '';
  const days = [...Array(7)].map((_,i)=>{
    const d = new Date(); d.setDate(d.getDate()-i); return todayStr(d);
  });
  cats.forEach(cat=>{
    let done=0, total=0;
    days.forEach(ds=>{
      const day = state.completions[ds] || {};
      cat.defs.forEach(t=>{ total++; if(day[t.id]) done++; });
    });
    const pct = total ? Math.round((done/total)*100) : 0;
    const row = document.createElement('div');
    row.className = 'stat-bar-row';
    row.innerHTML = `<span class="stat-bar-label">${cat.label}</span>
      <span class="stat-bar-track"><span class="stat-bar-fill" style="width:${pct}%"></span></span>
      <span class="stat-bar-val">${pct}%</span>`;
    wrap.appendChild(row);
  });
}

/* ---------------------------------------------------------
   Analytics charts (pure canvas, no external chart library)
   --------------------------------------------------------- */
function last30Dates(){
  return [...Array(30)].map((_,i)=>{
    const d = new Date(); d.setDate(d.getDate()-(29-i)); return todayStr(d);
  });
}
function renderExpChart(){
  const canvas = $('#exp-chart');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);
  const dates = last30Dates();
  let running = state.totalExp;
  // walk backward from current totalExp using expLog to reconstruct history
  const values = [];
  const log = state.expLog || {};
  let cum = state.totalExp;
  for(let i=dates.length-1;i>=0;i--){ values[i] = cum; cum -= (log[dates[i]]||0); }
  const max = Math.max(...values, 10);
  const min = Math.min(...values, 0);
  const range = Math.max(max-min, 1);
  ctx.strokeStyle = '#c6a355'; ctx.lineWidth = 1.6; ctx.beginPath();
  values.forEach((v,i)=>{
    const x = (i/(values.length-1)) * (W-8) + 4;
    const y = H - 6 - ((v-min)/range) * (H-16);
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();
  ctx.fillStyle = 'rgba(198,163,85,0.08)';
  ctx.lineTo(W-4, H); ctx.lineTo(4, H); ctx.closePath(); ctx.fill();
}
function renderRatioChart(){
  const canvas = $('#ratio-chart');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);
  const dates = last30Dates();
  const barW = (W-8)/dates.length;
  dates.forEach((ds,i)=>{
    const stat = state.history[ds];
    const ratio = stat ? stat.ratio : 0;
    const status = stat ? stat.status : 'missed';
    const h = Math.max(2, ratio * (H-10));
    const x = 4 + i*barW;
    const y = H - h - 4;
    ctx.fillStyle = status === 'success' ? 'rgba(92,154,104,0.75)' : status === 'fail' ? 'rgba(168,73,63,0.7)' : 'rgba(74,77,85,0.5)';
    ctx.fillRect(x, y, barW*0.7, h);
  });
}
function renderAnalytics(){ renderExpChart(); renderRatioChart(); }

function renderSocialLinks(){
  const s = state.profile.social || {};
  const row = $('#social-links-row');
  if(row){
    const links = [];
    if(s.instagram) links.push({ icon:'📷', url:`https://instagram.com/${s.instagram.replace('@','')}`, label:'Instagram' });
    if(s.facebook) links.push({ icon:'📘', url: s.facebook.startsWith('http') ? s.facebook : `https://${s.facebook}`, label:'Facebook' });
    if(s.whatsapp) links.push({ icon:'💬', url:`https://wa.me/${s.whatsapp.replace(/\D/g,'')}`, label:'WhatsApp' });
    if(s.telegram) links.push({ icon:'✈️', url:`https://t.me/${s.telegram.replace('@','')}`, label:'Telegram' });
    row.innerHTML = links.map(l=>`<a href="${l.url}" target="_blank" rel="noopener" class="social-link" title="${l.label}">${l.icon}</a>`).join('');
  }
  if($('#social-instagram')){
    $('#social-instagram').value = s.instagram || '';
    $('#social-facebook').value = s.facebook || '';
    $('#social-whatsapp').value = s.whatsapp || '';
    $('#social-telegram').value = s.telegram || '';
  }
}
function renderEmotionTracker(){
  const date = todayStr();
  const row = $('#emotion-row');
  row.innerHTML = '';
  EMOTIONS.forEach(e=>{
    const btn = document.createElement('button');
    btn.className = 'emotion-btn' + (state.emotions[date]===e.key ? ' active' : '');
    btn.innerHTML = e.icon;
    btn.title = `${e.en} / ${e.id_}`;
    btn.addEventListener('click', ()=>{
      state.emotions[date] = e.key;
      saveState(); renderEmotionTracker(); playTick();
    });
    row.appendChild(btn);
  });
  const trend = $('#emotion-trend');
  trend.innerHTML = '';
  const days = [...Array(7)].map((_,i)=>{ const d=new Date(); d.setDate(d.getDate()-(6-i)); return todayStr(d); });
  days.forEach(ds=>{
    const key = state.emotions[ds];
    const def = EMOTIONS.find(e=>e.key===key);
    const val = def ? def.val : 0;
    const bar = document.createElement('i');
    bar.style.height = (val ? val*18 : 3) + 'px';
    bar.style.opacity = val ? 1 : 0.3;
    trend.appendChild(bar);
  });
}

/* ---------------------------------------------------------
   Trading Journal Log
   --------------------------------------------------------- */
function renderTradeLog(){
  const wrap = $('#trade-log');
  wrap.innerHTML = '';
  [...state.tradeLog].reverse().slice(0,25).forEach(t=>{
    const row = document.createElement('div');
    row.className = 'trade-log-item';
    const resClass = t.result === 'win' ? 'tl-win' : t.result === 'loss' ? 'tl-loss' : '';
    row.innerHTML = `<span>${t.date} · <b>${t.pair||'-'}</b></span>
      <span class="${resClass}">${t.result.toUpperCase()}${t.rr?(' · '+t.rr):''}</span>`;
    row.title = t.notes || '';
    wrap.appendChild(row);
  });
  if(!state.tradeLog.length){
    wrap.innerHTML = '<p class="id-sub" style="text-align:center;padding:12px 0">Belum ada catatan trading. Tambahkan entri pertamamu.</p>';
  }
}

function renderJourney(){
  const pct = state.journeyProgress || 0;
  $('#journey-progress-fill').style.width = pct + '%';
  $('#journey-progress-text').textContent = Math.round(pct) + '%';
  const pathEl = document.getElementById('journey-path');
  const marker = document.getElementById('journey-marker');
  if(!pathEl || !marker) return;
  const total = pathEl.getTotalLength();
  const point = pathEl.getPointAtLength((pct/100) * total);
  marker.setAttribute('transform', `translate(${point.x},${point.y})`);
  if(pct >= 100){
    marker.querySelector('text').textContent = '👑';
  }
}

/* ---------------------------------------------------------
   Public Comment Wall (via Supabase — works for any visitor)
   --------------------------------------------------------- */
async function loadComments(){
  if(!window.AtlasSync || !window.AtlasSync.client) return;
  const comments = await window.AtlasSync.fetchComments();
  renderComments(comments);
}
function renderComments(comments){
  const wrap = $('#comment-list');
  if(!wrap) return;
  if(!comments.length){
    wrap.innerHTML = '<p class="id-sub" style="text-align:center;padding:12px 0">Belum ada dukungan. Jadilah yang pertama.</p>';
    return;
  }
  wrap.innerHTML = comments.map(c=>{
    const when = new Date(c.created_at).toLocaleDateString('id-ID', { day:'numeric', month:'short' });
    return `<div class="trade-log-item" style="flex-direction:column;align-items:flex-start;gap:4px;">
      <span style="color:var(--gold-bright);font-size:.72rem">${escapeHtml(c.name || 'Anonymous')} <span class="id-sub" style="display:inline">· ${when}</span></span>
      <span style="color:var(--silver)">${escapeHtml(c.message)}</span>
    </div>`;
  }).join('');
}
function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

/* ---------------------------------------------------------
   Achievements
   --------------------------------------------------------- */
function unlockAchievement(id){
  if(state.achievementsUnlocked.includes(id)) return;
  state.achievementsUnlocked.push(id);
  saveState();
  const def = ACHIEVEMENTS.find(a=>a.id===id);
  if(def) showAchievementPopup(def);
  renderAchievements();
}
function showAchievementPopup(def){
  playLevelChime();
  $('#ach-popup-icon').textContent = def.icon;
  $('#ach-popup-name').textContent = def.en;
  $('#ach-popup-name-id').textContent = def.id_;
  $('#ach-popup-desc').textContent = `${def.desc_en} / ${def.desc_id}`;
  $('#achievement-popup-overlay').classList.add('active');
}
function checkAchievements(){
  const { level } = levelFromExp(state.totalExp);
  const questsDone = Object.values(state.history).reduce((s,h)=>s + (h.completed||0), 0);
  if(questsDone >= 1) unlockAchievement('first_step');
  if(state.streak >= 7) unlockAchievement('streak_7');
  if(state.streak >= 30) unlockAchievement('streak_30');
  if(level >= 10) unlockAchievement('lvl_10');
  if(level >= 20) unlockAchievement('lvl_20');
  if(level >= 29) unlockAchievement('shadow_king');
  const honestCount = Object.values(state.reflections).filter(r=>r.honest).length;
  if(honestCount >= 10) unlockAchievement('honest_soul');
  const financeDays = new Set(state.financeLog.map(t=>t.date)).size;
  if(financeDays >= 14) unlockAchievement('financier');
  const date = todayStr();
  const day = state.completions[date] || {};
  if(MORNING_TASKS.every(t=>day[t.id])) unlockAchievement('full_morning');
}
function renderAchievements(){
  const grid = $('#achievement-grid');
  grid.innerHTML = '';
  ACHIEVEMENTS.forEach(a=>{
    const unlocked = state.achievementsUnlocked.includes(a.id);
    const card = document.createElement('div');
    card.className = 'ach-card' + (unlocked ? ' unlocked' : '');
    card.innerHTML = `<div class="ach-icon">${a.icon}</div>
      <p class="ach-name">${a.en}<small class="id-sub">${a.id_}</small></p>
      <p class="ach-desc">${unlocked ? a.desc_en : '???'}<span class="id-sub">${unlocked ? a.desc_id : ''}</span></p>`;
    grid.appendChild(card);
  });
}

/* ---------------------------------------------------------
   Journal History — every past Night Reflection, dated, newest first.
   The status dot reuses each day's quest-completion status (success/fail/
   missed) so good days visibly "light up" and bad days go dark, right in
   the journal timeline instead of only on the separate Calendar page.
   --------------------------------------------------------- */
function renderJournalHistory(){
  const wrap = $('#journal-history-list');
  if(!wrap) return;
  const dates = Object.keys(state.reflections).sort((a,b)=> b.localeCompare(a));
  if(!dates.length){
    wrap.innerHTML = '<p class="id-sub" style="text-align:center;padding:16px 0">Belum ada jurnal tersimpan. Selesaikan harimu untuk mulai mencatat.</p>';
    return;
  }
  wrap.innerHTML = dates.map(date=>{
    const r = state.reflections[date] || {};
    const status = (state.history[date] && state.history[date].status) || 'missed';
    // success = lit (gold), fail = dim red, missed/no quest data = dark grey
    const dotClass = status === 'success' ? 'lit' : (status === 'fail' ? 'dim' : 'dark');
    const dateObj = parseLocalDate(date);
    const dateLabel = dateObj.toLocaleDateString('id-ID', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
    const rows = [
      r.well ? `<p><span class="jh-label">Baik</span>${escapeHtml(r.well)}</p>` : '',
      r.fail ? `<p><span class="jh-label">Gagal</span>${escapeHtml(r.fail)}</p>` : '',
      r.tomorrow ? `<p><span class="jh-label">Besok</span>${escapeHtml(r.tomorrow)}</p>` : '',
    ].join('');
    return `<div class="journal-entry">
      <div class="jh-head">
        <span class="jh-dot ${dotClass}"></span>
        <span class="jh-date">${dateLabel}</span>
        ${r.honest ? '<span class="jh-honest" title="Dijawab dengan jujur">✓ jujur</span>' : ''}
      </div>
      ${rows || '<p class="id-sub">Tidak ada catatan teks hari itu.</p>'}
    </div>`;
  }).join('');
}

/* ---------------------------------------------------------
   Timeline
   --------------------------------------------------------- */
function renderTimeline(){
  const track = $('#timeline-track');
  track.innerHTML = '';
  TIMELINE_AGES.forEach(age=>{
    const box = document.createElement('div');
    box.className = 'timeline-age';
    box.innerHTML = `<h4>AGE ${age}</h4><textarea placeholder="Visi dan target di usia ${age}...">${state.timeline[age]||''}</textarea>`;
    box.querySelector('textarea').addEventListener('input', (e)=>{
      state.timeline[age] = e.target.value;
      saveState();
    });
    track.appendChild(box);
  });
}

/* ---------------------------------------------------------
   Navigation
   --------------------------------------------------------- */
function goToPage(page){
  $$('.page').forEach(p => p.classList.remove('active'));
  const target = $('#page-'+page);
  target?.classList.add('active');
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  $$('.mnav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  if(page === 'calendar'){ calMonthOffset = 0; renderFullCalendar(); }
  if(page === 'dashboard'){ renderAnalytics(); }
  if(page === 'journey'){ renderJourney(); }
  if(target && target.dataset.bg) applyBackdrop(target.dataset.bg);
  window.scrollTo(0,0);
}

/* ---------------------------------------------------------
   PIN Lock
   --------------------------------------------------------- */
async function proceedAfterSplash(){
  // Wait for the first cloud sync round-trip before deciding whether to show
  // onboarding. Without this, tapping "Enter" quickly on a brand-new device
  // could show onboarding again even though the cloud already has
  // state.onboarded=true from another device — cloudSyncPromise resolves
  // instantly if already done, or if running offline.
  try{ await cloudSyncPromise; }catch(e){}
  if(state.settings.pin){
    $('#pin-overlay').classList.add('active');
    $('#pin-input').value = '';
    $('#pin-error').textContent = '';
    setTimeout(()=> $('#pin-input').focus(), 100);
  }else{
    proceedIntoApp();
  }
}
function proceedIntoApp(){
  if(isFirstRun && !state.onboarded){
    $('#onboarding-overlay').classList.add('active');
  }else{
    $('#app').classList.add('active');
    goToPage('dashboard');
    checkAchievements();
  }
}
function tryUnlockPin(){
  const val = $('#pin-input').value.trim();
  if(val === state.settings.pin){
    $('#pin-overlay').classList.remove('active');
    playTick();
    proceedIntoApp();
  }else{
    const err = $('#pin-error');
    err.textContent = 'PIN salah. Coba lagi. / Wrong PIN. Try again.';
    err.classList.remove('shake'); void err.offsetWidth; err.classList.add('shake');
    $('#pin-input').value = '';
  }
}
function renderPinStatus(){
  const text = $('#pin-status-text');
  if(!text) return;
  text.textContent = state.settings.pin
    ? 'App Lock aktif. PIN diperlukan setiap kali membuka aplikasi.'
    : 'Belum ada PIN. Siapa saja bisa membuka app ini.';
}

/* ---------------------------------------------------------
   Reset Mode
   --------------------------------------------------------- */
function openResetMode(){
  $('#reset-overlay').classList.add('active');
  $$('#reset-steps li').forEach(li => li.classList.remove('done'));
}
function closeResetMode(){
  $('#reset-overlay').classList.remove('active');
}

/* ---------------------------------------------------------
   Rain / Settings
   --------------------------------------------------------- */
let audioCtx = null, noiseNode = null, pianoTimer = null;
function stopAudio(){
  if(noiseNode){
    if(noiseNode._rumble){ try{noiseNode._rumble.stop();}catch(e){} }
    try{noiseNode.stop();}catch(e){}
    noiseNode = null;
  }
  if(pianoTimer){ clearInterval(pianoTimer); pianoTimer = null; }
}
let rainGainNode = null;
function startRainSound(volume){
  const ctx = getAudioCtx();
  const bufferSize = 2*ctx.sampleRate;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for(let i=0;i<bufferSize;i++) data[i] = (Math.random()*2-1)*0.2;
  noiseNode = ctx.createBufferSource();
  noiseNode.buffer = buffer; noiseNode.loop = true;
  const gain = ctx.createGain(); gain.gain.value = (typeof volume === 'number') ? volume : 0.65;
  rainGainNode = gain;
  // Wider lowpass than before (900 -> 1400) so the hiss of heavy rain reads
  // as full/dense rather than a dull rumble; a second, deeper layer adds body.
  const filter = ctx.createBiquadFilter(); filter.type='lowpass'; filter.frequency.value=1400;
  noiseNode.connect(filter).connect(gain).connect(ctx.destination);
  noiseNode.start();

  const rumbleBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const rumbleData = rumbleBuffer.getChannelData(0);
  for(let i=0;i<bufferSize;i++) rumbleData[i] = (Math.random()*2-1)*0.12;
  const rumbleNode = ctx.createBufferSource();
  rumbleNode.buffer = rumbleBuffer; rumbleNode.loop = true;
  const rumbleGain = ctx.createGain(); rumbleGain.gain.value = gain.gain.value * 0.5;
  const rumbleFilter = ctx.createBiquadFilter(); rumbleFilter.type='lowpass'; rumbleFilter.frequency.value=350;
  rumbleNode.connect(rumbleFilter).connect(rumbleGain).connect(ctx.destination);
  rumbleNode.start();
  noiseNode._rumble = rumbleNode; // stopped alongside the main noise node
}
// Simple feedback-delay "reverb" so piano notes have a soft tail instead of
// sounding thin/dry next to the rain bed — makes them audible without being loud.
let pianoDelayNode = null, pianoDelayFeedback = null, pianoDelayGain = null;
function ensurePianoReverb(){
  if(pianoDelayNode) return;
  const ctx = getAudioCtx();
  pianoDelayNode = ctx.createDelay(1.2);
  pianoDelayNode.delayTime.value = 0.32;
  pianoDelayFeedback = ctx.createGain();
  pianoDelayFeedback.gain.value = 0.34;
  pianoDelayGain = ctx.createGain();
  pianoDelayGain.gain.value = 0.5;
  pianoDelayNode.connect(pianoDelayFeedback).connect(pianoDelayNode);
  pianoDelayNode.connect(pianoDelayGain).connect(ctx.destination);
}
function startPianoNotes(){
  const notes = [261.6,293.7,329.6,392.0,440.0,523.3];
  ensurePianoReverb();
  const playNote = ()=>{
    if(!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type='sine';
    osc.frequency.value = notes[Math.floor(Math.random()*notes.length)];
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.32, audioCtx.currentTime+0.05);
    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime+2.8);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    if(pianoDelayNode) gain.connect(pianoDelayNode);
    osc.start(); osc.stop(audioCtx.currentTime+2.9);
  };
  playNote(); // audible immediately instead of waiting 3.2s for the first note
  pianoTimer = setInterval(playNote, 3200);
}
function applyRainMode(mode){
  state.settings.rainMode = mode;
  saveState();
  $$('.rain-opt').forEach(b => b.classList.toggle('active', b.dataset.rain === mode));
  stopAudio();
  if(mode === 'off'){ RainEngine.stop(); return; }
  RainEngine.start(mode);
  try{
    getAudioCtx(); // ensure context exists + resumed before wiring up nodes
    if(mode === 'rain' || mode === 'thunder'){ startRainSound(0.72); }
    // Rain sits quieter under piano mode so the notes actually cut through.
    if(mode === 'piano'){ startRainSound(0.32); startPianoNotes(); }
  }catch(e){
    console.warn('MAN ATLAS audio failed to start:', e);
    showToast('Suara gak bisa jalan di browser ini / Audio failed to start here');
  }
}

function applyTheme(theme){
  state.settings.theme = theme;
  saveState();
  document.body.classList.toggle('theme-light', theme === 'light');
  $$('.theme-opt').forEach(b => b.classList.toggle('active', b.dataset.theme === theme));
}

/* ---------------------------------------------------------
   Export / Import / Wipe
   --------------------------------------------------------- */
function exportBackup(){
  const blob = new Blob([JSON.stringify(state,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `manatlas-backup-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
function importBackup(file){
  const reader = new FileReader();
  reader.onload = (e)=>{
    try{
      const parsed = JSON.parse(e.target.result);
      state = Object.assign(defaultState(), parsed);
      saveState();
      renderAll();
      showToast('Backup imported / Backup berhasil dimuat');
    }catch(err){ showToast('Gagal membaca file backup'); }
  };
  reader.readAsText(file);
}
function wipeAll(){
  if(!confirm('Yakin ingin menghapus semua data? Tindakan ini tidak bisa dibatalkan.\n(Are you sure you want to erase all data? This cannot be undone.)')) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

/* ---------------------------------------------------------
   Master render
   --------------------------------------------------------- */
function renderAll(){
  renderProfile();
  renderTodayMission();
  renderNextMeal();
  renderMiniCalendar();
  renderStatsBars();
  renderTaskList('morning-list', MORNING_TASKS);
  renderTaskList('body-list', BODY_TASKS);
  renderTaskList('mind-list', MIND_TASKS);
  renderTaskList('faith-list', FAITH_TASKS);
  renderTaskList('knowledge-list', KNOWLEDGE_TASKS);
  renderWater();
  renderQuestsPage();
  renderJournals();
  renderStoicQuote();
  renderDashboardQuote();
  renderEmotionTracker();
  renderTradeLog();
  renderFinanceSummary();
  renderFinanceLog();
  renderNutritionPage();
  renderAchievements();
  renderTimeline();
  renderJourney();
  renderAnalytics();
  renderHeroImage();
  renderBgUploadGrid();
  renderPinStatus();
  $$('.rain-opt').forEach(b => b.classList.toggle('active', b.dataset.rain === state.settings.rainMode));
  const r = state.reflections[todayStr()];
  if(r){
    $$('#reflection-form textarea').forEach(t=> t.value = r[t.dataset.q] || '');
    $('#honor-checkbox').checked = !!r.honest;
  }
  renderJournalHistory();
}

/* ---------------------------------------------------------
   Cloud Sync (Supabase) — pull owner data for everyone,
   gate editing to the logged-in owner only.
   --------------------------------------------------------- */
async function initCloudSync(){
  // Lock by default the instant the app loads — isOwner starts false, so
  // even if the cloud check below fails or is blocked (e.g. testing via a
  // local file:// path instead of a real hosted URL), the app stays locked
  // rather than silently falling back to fully editable.
  applyReadOnlyMode();
  renderOwnerLoginUI();

  if(!window.AtlasSync || !window.AtlasSync.client) return; // offline mode, local-only
  loadComments();

  try{
    await window.AtlasSync.checkSession();
  }catch(e){
    console.warn('MAN ATLAS: session check failed (likely opened via file:// instead of a hosted URL).', e);
  }
  applyReadOnlyMode();
  renderOwnerLoginUI();

  try{
    const cloudData = await window.AtlasSync.pull();
    if(cloudData){
      // A shared Atlas already exists in the cloud — everyone (owner included) should see it.
      state = Object.assign(defaultState(), cloudData);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      // Re-run rollover/history now that state reflects the real cloud data —
      // running it earlier (in init(), before this pull resolves) risked
      // computing streak loss off a stale local snapshot and then pushing
      // that stale, wrongly-penalized version back over newer cloud data.
      checkRollover();
      refreshHistoryToday();
      renderAll(); renderAnalytics(); renderHeroImage(); renderBgUploadGrid();
      applySplashBackdrop();
      const activePage = $('.page.active');
      if(activePage && activePage.dataset.bg) applyBackdrop(activePage.dataset.bg);
    }else if(window.AtlasSync.isOwner){
      // First time the owner connects — push current local state up as the seed.
      window.AtlasSync.push(state);
    }
  }catch(e){
    console.warn('MAN ATLAS: cloud pull failed (likely opened via file:// instead of a hosted URL).', e);
  }
}
function applyReadOnlyMode(){
  document.body.classList.toggle('readonly', !(window.AtlasSync && window.AtlasSync.isOwner));
}
function renderOwnerLoginUI(){
  const isOwner = window.AtlasSync && window.AtlasSync.isOwner;
  const wrap = $('#owner-login-panel');
  if(!wrap) return;
  wrap.innerHTML = isOwner ? `
    <p class="settings-desc" style="color:var(--success)">Logged in as Owner. Your changes are live for everyone. <span class="id-sub" style="display:block">Kamu login sebagai Pemilik. Perubahanmu langsung tampil untuk semua orang.</span></p>
    <button id="owner-logout-btn" class="btn-secondary">Logout</button>
  ` : `
    <p class="settings-desc">Login sebagai pemilik untuk bisa mengedit Atlas ini. Pengunjung lain hanya bisa melihat.</p>
    <input type="email" id="owner-email" placeholder="Email" style="width:100%;background:var(--surface-2);border:1px solid var(--border);color:var(--silver);padding:9px 12px;border-radius:2px;margin-bottom:8px;">
    <input type="password" id="owner-password" placeholder="Password" style="width:100%;background:var(--surface-2);border:1px solid var(--border);color:var(--silver);padding:9px 12px;border-radius:2px;margin-bottom:8px;">
    <button id="owner-login-btn" class="btn-secondary">Login</button>
    <p id="owner-login-error" class="pin-error"></p>
  `;
  if(isOwner){
    $('#owner-logout-btn').addEventListener('click', async ()=>{
      await window.AtlasSync.logout();
      showToast('Logged out / Berhasil keluar');
      applyReadOnlyMode(); renderOwnerLoginUI();
    });
  }else{
    $('#owner-login-btn').addEventListener('click', async ()=>{
      const email = $('#owner-email').value.trim();
      const password = $('#owner-password').value;
      const res = await window.AtlasSync.login(email, password);
      if(res.error){
        $('#owner-login-error').textContent = res.error;
      }else{
        showToast('Welcome back, Owner / Selamat datang kembali');
        applyReadOnlyMode(); renderOwnerLoginUI();
        // Pull the cloud copy rather than pushing this device's local state —
        // logging in on a second device must never overwrite what was
        // already uploaded from another device.
        try{
          const cloudData = await window.AtlasSync.pull();
          if(cloudData){
            state = Object.assign(defaultState(), cloudData);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
          }
        }catch(e){ console.warn('MAN ATLAS: post-login pull failed', e); }
        checkRollover();
        refreshHistoryToday();
        renderAll(); renderAnalytics(); renderHeroImage(); renderBgUploadGrid();
        applySplashBackdrop();
        const activePage = $('.page.active');
        if(activePage && activePage.dataset.bg) applyBackdrop(activePage.dataset.bg);
      }
    });
  }
}

/* ---------------------------------------------------------
   Init & Event Bindings
   --------------------------------------------------------- */
function init(){
  applyTheme(state.settings.theme || 'dark');
  renderStaircase();
  applySplashBackdrop();
  initSplashParallax();
  checkRollover();
  refreshHistoryToday();
  renderAll();
  renderAnalytics();
  applyBackdrop('workspace');
  cloudSyncPromise = initCloudSync();
  if(state.settings.rainMode && state.settings.rainMode !== 'off'){
    $$('.rain-opt').forEach(b => b.classList.toggle('active', b.dataset.rain === state.settings.rainMode));
  }

  // Splash

  // Loading screen → splash
  setTimeout(()=>{ $('#loading-screen').classList.add('hidden'); }, 1700);

  // Splash → onboarding (first run) or straight into app
  $('#enter-btn').addEventListener('click', ()=>{
    playTick();
    $('#splash').classList.add('hidden');
    setTimeout(()=> $('#splash').style.display='none', 1200);
    proceedAfterSplash();
  });

  // Onboarding flow
  let obStep = 1;
  $('#onboarding-next').addEventListener('click', ()=>{
    playTick();
    if(obStep < 3){
      obStep++;
      $$('.onboarding-step').forEach(s=> s.classList.toggle('active', Number(s.dataset.step)===obStep));
      $$('.onboarding-dots span').forEach(d=> d.classList.toggle('active', Number(d.dataset.dot)===obStep));
      if(obStep === 3) $('#onboarding-next').innerHTML = 'BEGIN <small class="id-sub" style="display:block">Mulai</small>';
    }else{
      state.onboarded = true; saveState();
      $('#onboarding-overlay').classList.remove('active');
      $('#app').classList.add('active');
      goToPage('dashboard');
      checkAchievements();
    }
  });

  // Achievement popup close
  $('#ach-popup-close').addEventListener('click', ()=>{
    $('#achievement-popup-overlay').classList.remove('active');
  });

  // Sound toggle
  $('#sound-toggle').checked = state.settings.soundOn;
  $('#sound-toggle').addEventListener('change', (e)=>{
    state.settings.soundOn = e.target.checked; saveState();
  });

  // Trade entry form
  $('#trade-entry-form').addEventListener('submit', (e)=>{
    e.preventDefault();
    const pair = $('#trade-pair').value.trim();
    const result = $('#trade-result').value;
    const rr = $('#trade-rr').value.trim();
    const notes = $('#trade-notes').value.trim();
    if(!pair && !notes) return;
    state.tradeLog.push({ id:'t_'+Date.now(), date:todayStr(), pair, result, rr, notes });
    saveState(); renderTradeLog();
    $('#trade-pair').value=''; $('#trade-rr').value=''; $('#trade-notes').value='';
    showToast('Trade logged / Catatan trading tersimpan');
  });

  $('#nav-search').addEventListener('input', (e)=>{
    const q = e.target.value.trim().toLowerCase();
    $$('.nav-item').forEach(item=>{
      const text = (item.textContent + ' ' + (item.dataset.keywords||'')).toLowerCase();
      item.classList.toggle('search-hidden', q.length > 0 && !text.includes(q));
    });
  });

  // Mobile hamburger drawer
  $('#mobile-menu-btn').addEventListener('click', ()=>{
    $('#main-nav').classList.add('open');
    $('#mobile-nav-backdrop').classList.add('show');
  });
  $('#mobile-nav-backdrop').addEventListener('click', ()=>{
    $('#main-nav').classList.remove('open');
    $('#mobile-nav-backdrop').classList.remove('show');
  });

  // Nav
  $$('.nav-item').forEach(item=>{
    item.addEventListener('click', ()=>{
      goToPage(item.dataset.page);
      $('#main-nav').classList.remove('open');
      $('#mobile-nav-backdrop').classList.remove('show');
      $('#nav-search').value = '';
      $$('.nav-item').forEach(n => n.classList.remove('search-hidden'));
    });
  });
  $$('.mnav-item').forEach(item=>{
    item.addEventListener('click', ()=> goToPage(item.dataset.page));
  });

  // Reset mode
  $('#reset-mode-btn').addEventListener('click', openResetMode);
  $('#reset-close-btn').addEventListener('click', closeResetMode);
  $$('#reset-steps li').forEach(li=>{
    li.addEventListener('click', ()=> li.classList.toggle('done'));
  });

  // PIN Lock
  $('#pin-submit').addEventListener('click', tryUnlockPin);
  $('#pin-input').addEventListener('keydown', (e)=>{ if(e.key === 'Enter') tryUnlockPin(); });
  $('#pin-save-btn').addEventListener('click', ()=>{
    const val = $('#pin-set-input').value.trim();
    if(val.length < 4 || val.length > 6 || !/^\d+$/.test(val)){
      showToast('PIN harus 4-6 digit angka / PIN must be 4-6 digits');
      return;
    }
    state.settings.pin = val;
    saveState(); renderPinStatus();
    $('#pin-set-input').value = '';
    showToast('PIN saved / PIN tersimpan');
  });
  $('#pin-clear-btn').addEventListener('click', ()=>{
    state.settings.pin = '';
    saveState(); renderPinStatus();
    showToast('PIN removed / PIN dihapus');
  });

  // Avatar upload
  $('#avatar-input').addEventListener('change', async (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    try{
      const compressed = await compressImage(file, 500, 0.8);
      const ok = await confirmImageUpload(compressed);
      if(ok){
        state.profile.avatar = compressed;
        saveState(); renderProfile();
        showToast('Avatar updated / Avatar diperbarui');
      }
    }catch(err){
      showToast('Gagal upload avatar / Avatar upload failed');
    }
    e.target.value = '';
  });
  $('#char-name').addEventListener('input', (e)=>{
    state.profile.name = e.target.value;
    saveState();
  });
  $('#char-bio').addEventListener('input', (e)=>{
    state.profile.bio = e.target.value;
    saveState();
  });
  $('#social-save-btn').addEventListener('click', ()=>{
    state.profile.social = {
      instagram: $('#social-instagram').value.trim(),
      facebook: $('#social-facebook').value.trim(),
      whatsapp: $('#social-whatsapp').value.trim(),
      telegram: $('#social-telegram').value.trim(),
    };
    saveState(); renderSocialLinks();
    showToast('Social links saved / Tautan tersimpan');
  });

  // Hero character image (persistent watermark across pages)
  $('#hero-input').addEventListener('change', async (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    try{
      const compressed = await compressImage(file, 700, 0.8);
      const ok = await confirmImageUpload(compressed);
      if(ok){
        state.profile.heroImage = compressed;
        saveState(); renderHeroImage();
        showToast('Character image saved / Gambar karakter tersimpan');
      }
    }catch(err){
      showToast('Gagal upload gambar / Image upload failed');
    }
    e.target.value = '';
  });
  $('#hero-remove-btn').addEventListener('click', ()=>{
    state.profile.heroImage = '';
    saveState(); renderHeroImage();
  });

  // Quest tabs
  $$('.qtab').forEach(tab=>{
    tab.addEventListener('click', ()=>{
      $$('.qtab').forEach(t=>t.classList.remove('active'));
      $$('.quest-panel').forEach(p=>p.classList.remove('active'));
      tab.classList.add('active');
      $('#quest-'+tab.dataset.qtab).classList.add('active');
    });
  });

  // Add custom quests
  $('#add-daily-form').addEventListener('submit', (e)=>{
    e.preventDefault();
    const input = $('#add-daily-input');
    if(!input.value.trim()) return;
    state.customQuests.daily.push({ id:'cd_'+Date.now(), text_en:input.value.trim(), text_id:input.value.trim(), exp:10, doneDates:[] });
    input.value=''; saveState(); renderQuestsPage(); renderTodayMission();
  });
  $('#add-weekly-form').addEventListener('submit', (e)=>{
    e.preventDefault();
    const input = $('#add-weekly-input');
    if(!input.value.trim()) return;
    state.customQuests.weekly.push({ id:'cw_'+Date.now(), text_en:input.value.trim(), text_id:input.value.trim(), exp:20, doneDates:[] });
    input.value=''; saveState(); renderQuestsPage();
  });
  $('#add-boss-form').addEventListener('submit', (e)=>{
    e.preventDefault();
    const input = $('#add-boss-input');
    if(!input.value.trim()) return;
    state.boss.tasks.push({ id:'bt_'+Date.now(), text:input.value.trim(), done:false });
    input.value=''; saveState(); renderBoss();
  });
  $('#boss-title').addEventListener('input', (e)=>{
    state.boss.title = e.target.value; saveState();
  });

  // Journals
  $('#mind-journal').addEventListener('input', (e)=>{ getJournal(todayStr()).mind = e.target.value; saveState(); });
  $('#gratitude-log').addEventListener('input', (e)=>{ getJournal(todayStr()).gratitude = e.target.value; saveState(); });

  // Finance
  $('#finance-form').addEventListener('submit', (e)=>{
    e.preventDefault();
    const amount = Number($('#fin-amount').value||0);
    if(!amount){ showToast('Isi jumlahnya dulu / Enter an amount first'); return; }
    const entry = {
      id: 'fx_'+Date.now(),
      date: todayStr(),
      type: $('#fin-type').value,
      currency: $('#fin-currency').value,
      amount,
      note: $('#fin-note').value.trim(),
    };
    state.financeLog.push(entry);
    saveState(); renderFinanceSummary(); renderFinanceLog(); checkAchievements();
    showToast('Transaction logged / Transaksi tercatat');
    $('#fin-amount').value=''; $('#fin-note').value='';
  });

  // Nutrition profile form
  $('#nut-profile-form').addEventListener('submit', (e)=>{
    e.preventDefault();
    state.nutrition.profile.heightCm = Number($('#nut-height').value) || state.nutrition.profile.heightCm;
    state.nutrition.profile.weightKg = Number($('#nut-weight').value) || state.nutrition.profile.weightKg;
    state.nutrition.profile.age = Number($('#nut-age').value) || state.nutrition.profile.age;
    state.nutrition.profile.activity = $('#nut-activity').value;
    state.nutrition.budgetMonthlyUSD = Number($('#nut-budget').value) || state.nutrition.budgetMonthlyUSD;
    state.nutrition.profile.setupDone = true;
    saveState();
    renderNutritionTargets();
    renderNutritionBudget();
    showToast('Target nutrisi diperbarui / Nutrition target updated');
  });

  // Nutrition food budget log
  $('#nut-budget-form').addEventListener('submit', (e)=>{
    e.preventDefault();
    const amount = Number($('#nut-spend-amount').value || 0);
    if(!amount){ showToast('Isi jumlahnya dulu / Enter an amount first'); return; }
    state.nutrition.budgetLog.push({
      id: 'nb_'+Date.now(),
      date: todayStr(),
      amountUSD: amount,
      note: $('#nut-spend-note').value.trim(),
    });
    saveState();
    renderNutritionBudget();
    $('#nut-spend-amount').value = ''; $('#nut-spend-note').value = '';
    showToast('Belanja tercatat / Spend logged');
  });

  // Reflection
  $('#reflection-form').addEventListener('submit', (e)=>{
    e.preventDefault();
    const date = todayStr();
    const r = { well:'', fail:'', tomorrow:'', honest: $('#honor-checkbox').checked };
    $$('#reflection-form textarea').forEach(t=> r[t.dataset.q] = t.value);
    state.reflections[date] = r;
    saveState();
    addExp(15);
    checkAchievements();
    renderJournalHistory();
    showToast('Day completed / Hari ini selesai dicatat');
  });

  // Comment wall
  $('#comment-form').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const name = $('#comment-name').value.trim();
    const message = $('#comment-message').value.trim();
    if(!message) return;
    const res = await (window.AtlasSync ? window.AtlasSync.postComment(name, message) : { error:'Offline' });
    if(res.error){
      showToast('Gagal mengirim / Failed to send: ' + res.error);
    }else{
      $('#comment-message').value = '';
      showToast('Sent / Terkirim 🙏');
      loadComments();
    }
  });

  // Calendar nav
  $('#cal-prev').addEventListener('click', ()=>{ calMonthOffset--; renderFullCalendar(); });
  $('#cal-next').addEventListener('click', ()=>{ calMonthOffset++; renderFullCalendar(); });

  // Settings
  $$('.theme-opt').forEach(btn=>{
    btn.addEventListener('click', ()=> applyTheme(btn.dataset.theme));
  });
  $$('.rain-opt').forEach(btn=>{
    btn.addEventListener('click', ()=> applyRainMode(btn.dataset.rain));
  });
  $('#export-btn').addEventListener('click', exportBackup);
  $('#import-btn').addEventListener('click', ()=> $('#import-input').click());
  $('#import-input').addEventListener('change', (e)=>{
    const f = e.target.files[0]; if(f) importBackup(f);
  });
  $('#wipe-btn').addEventListener('click', wipeAll);

  // periodic rollover check (every 60s) in case app stays open past midnight
  setInterval(()=>{ checkRollover(); refreshHistoryToday(); renderAll(); }, 60000);
}

document.addEventListener('DOMContentLoaded', init);
})();
