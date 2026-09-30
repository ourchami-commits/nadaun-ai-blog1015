import { isConfigured, createSync } from './firebase-sync.js';

const params = new URLSearchParams(location.search);
const wantAdmin = params.has('admin');
const isScreen = params.has('screen');
const isView = params.has('view') && !wantAdmin && !isScreen;
const stage = document.getElementById('stage');
const slides = [...stage.querySelectorAll(':scope > section.slide')];
const total = slides.length;
const byId = (id) => document.getElementById(id);

if (isScreen) document.documentElement.classList.add('is-screen');

function activeIndex() {
  const n = slides.findIndex((slide) => slide.classList.contains('active'));
  return n < 0 ? 0 : n;
}

function applySlide(n) {
  const idx = Math.max(0, Math.min(total - 1, n | 0));
  slides.forEach((slide, i) => {
    slide.classList.toggle('active', i === idx);
    slide.setAttribute('aria-hidden', i === idx ? 'false' : 'true');
  });
  byId('progress').style.width = ((idx + 1) / total * 100) + '%';
  byId('counter').textContent = (idx + 1) + ' / ' + total;
  document.querySelectorAll('#gridList .mini').forEach((mini, i) => mini.classList.toggle('current', i === idx));
  try { localStorage.setItem('mykit_slide', String(idx)); } catch (e) { /* 저장 불가 환경 */ }
}

function initSync() {
  const modeBadge = byId('modeBadge');
  const connBadge = byId('connBadge');
  const lockBtn = byId('lockBtn');
  const pdfBtn = byId('pdfBtn');
  const printBtn = byId('printBtn');
  const hint = document.querySelector('#nav .hint');

  if (!isConfigured(window.FIREBASE_CONFIG)) {
    byId('fbBanner').hidden = false;
    return;
  }
  if (isView) {
    modeBadge.textContent = '자유 열람';
    modeBadge.hidden = false;
    return;
  }

  const sync = createSync(window.FIREBASE_CONFIG, window.DECK_ID || 'ai-blog-1015');
  let locked = true;
  let pdfAllowed = true;
  let isAdmin = false;
  let online = false;
  let viewers = null;
  let lastState = null;
  let remoteSlide = null;
  let serverOffset = 0;

  if (!isView) document.documentElement.classList.add('timer-readonly');

  function blocked() { return locked && !isAdmin; }

  function renderConnection() {
    if (!(isAdmin || isScreen)) {
      connBadge.hidden = online;
      connBadge.textContent = '연결 끊김 · 재연결 중';
      return;
    }
    connBadge.hidden = false;
    connBadge.textContent = (online ? '● 연결' : '○ 끊김') + (viewers == null ? '' : ' · 접속 ' + viewers + '명');
  }

  function renderControls() {
    const idx = activeIndex();
    const cannotMove = blocked();
    byId('navPrev').disabled = cannotMove || idx === 0;
    byId('navNext').disabled = cannotMove || idx === total - 1;
    modeBadge.hidden = false;
    modeBadge.textContent = isAdmin ? '관리자' : (locked ? '발표자를 따라가는 중' : '자유 이동');
    modeBadge.classList.toggle('follow', !isAdmin && locked);
    lockBtn.hidden = pdfBtn.hidden = !isAdmin;
    lockBtn.textContent = locked ? '🔒 잠금 중' : '🔓 자유 이동';
    lockBtn.setAttribute('aria-pressed', String(locked));
    pdfBtn.textContent = pdfAllowed ? 'PDF 허용 중' : 'PDF 막힘';
    pdfBtn.setAttribute('aria-pressed', String(pdfAllowed));
    printBtn.hidden = !pdfAllowed;
    document.documentElement.classList.toggle('no-pdf', !pdfAllowed);
    hint.textContent = pdfAllowed ? '← → 이동 · G 전체보기 · P PDF' : '← → 이동 · G 전체보기';
  }

  function flash(message) {
    connBadge.hidden = false;
    connBadge.textContent = message;
  }

  sync.onState((state) => {
    if (!state) { flash('상태 읽기 실패 · 규칙 확인'); return; }
    const firstState = remoteSlide === null;
    lastState = state;
    remoteSlide = state.slide | 0;
    locked = !!state.locked;
    pdfAllowed = !!state.pdf;
    if (state.timer) document.dispatchEvent(new CustomEvent('slide-timer-sync', { detail: { ...state.timer, offset: serverOffset } }));
    if ((isAdmin && firstState) || (!isAdmin && (isScreen || locked))) applySlide(remoteSlide);
    renderControls();
  });
  sync.onConnection((connected) => { online = connected; renderConnection(); });
  if (!isScreen && !wantAdmin) sync.joinViewers();
  sync.onAdmin((admin, user) => {
    isAdmin = admin && !isScreen;
    document.documentElement.classList.toggle('timer-readonly', !isAdmin);
    if (isAdmin) {
      byId('login').hidden = true;
      if (lastState) applySlide(lastState.slide | 0);
      if (!sync._viewersOn) {
        sync._viewersOn = true;
        sync.onViewers((count) => { viewers = count; renderConnection(); });
      }
    } else if (wantAdmin && user) {
      byId('lgErr').textContent = '강사 목록에 없는 Google 계정';
      byId('login').hidden = false;
    }
    renderConnection();
    renderControls();
  });

  if (wantAdmin) setTimeout(() => { if (!isAdmin) byId('login').hidden = false; }, 700);
  byId('lgGoogle').addEventListener('click', async () => {
    byId('lgErr').textContent = '';
    try { await sync.loginGoogle(); }
    catch (e) { byId('lgErr').textContent = 'Google 로그인 실패 · 팝업 허용 확인'; }
  });
  byId('lgClose').addEventListener('click', () => { byId('login').hidden = true; });
  lockBtn.addEventListener('click', () => sync.setLock(!locked).catch(() => flash('잠금 저장 실패')));
  pdfBtn.addEventListener('click', () => sync.setPdf(!pdfAllowed).catch(() => flash('PDF 설정 실패')));
  sync.onServerOffset((offset) => {
    serverOffset = Number(offset) || 0;
    if (lastState && lastState.timer) document.dispatchEvent(new CustomEvent('slide-timer-sync', { detail: { ...lastState.timer, offset: serverOffset } }));
  });
  document.addEventListener('slide-timer-change', (event) => {
    if (!isAdmin) return;
    const timer = event.detail || {};
    sync.setTimer({
      id: String(timer.id || ''), running: !!timer.running,
      remaining: Number(timer.remaining) || 0,
      endAt: timer.running ? Number(timer.endAt) + serverOffset : 0
    }).catch(() => flash('타이머 저장 실패'));
  });

  new MutationObserver(() => {
    const idx = activeIndex();
    renderControls();
    if (isAdmin && remoteSlide !== null && idx !== remoteSlide) {
      remoteSlide = idx;
      sync.setSlide(idx).catch(() => flash('슬라이드 저장 실패'));
    }
  }).observe(stage, { subtree: true, attributes: true, attributeFilter: ['class'] });

  function stopLocked(event) {
    if (!blocked()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  byId('navPrev').addEventListener('click', stopLocked, true);
  byId('navNext').addEventListener('click', stopLocked, true);
  byId('gridList').addEventListener('click', (event) => { if (event.target.closest('.mini')) stopLocked(event); }, true);
  byId('gridList').addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.closest('.mini')) stopLocked(event);
  }, true);
  stage.addEventListener('click', (event) => {
    if (!event.target.closest('button, a, .prompt-card')) stopLocked(event);
  }, true);
  document.addEventListener('keydown', (event) => {
    const target = event.target;
    if (target && target.closest && target.closest('input, button, a, textarea, select')) return;
    const navKeys = ['ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp', 'Home', 'End', ' '];
    if (blocked() && navKeys.includes(event.key)) stopLocked(event);
    if (!pdfAllowed && ['p', 'P', 'ㅔ'].includes(event.key)) stopLocked(event);
  }, true);
  renderControls();
}

initSync();
