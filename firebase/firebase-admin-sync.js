import { isConfigured, createSync } from './firebase-sync.js';

const TITLES = ['AI 블로그 실전 글쓰기', '오늘의 순서', '오늘의 완성물', '액티브시니어의 콘텐츠 자산', '네이버 블로그의 역할', 'AI 글쓰기의 역할', '사람과 AI의 업무 분담', 'AI 직원 시스템', 'AI 직원의 직무', '좋은 지시문의 구조', '역할 설정', '독자 설정', '블로그 주제 설정', '말투 설정', '금지 기준 설정', 'AI 직원 설정문', '설정문 실습', '휴식', '글쓰기 업무 흐름', '소재 발굴', '독자 질문', '검색 의도', '제목 설계', '제목 생성 실습', '목차 설계', '경험 정보화', '초안 생성', '도입부 구성', '본문 구성', '마무리 구성', '초안 작성 실습', '인간다운 수정', 'AI 편집 요청', '발행 전 점검', '반복 생산 시스템', '나만의 AI 직원 출근'];
const BREAKS = [17];
const byId = (id) => document.getElementById(id);
const gate = byId('gate');
const panel = byId('panel');
const statusEl = byId('status');
const jump = byId('jump');

let sync;
let online = false;
let isAdmin = false;
let serverOffset = 0;
let tickId = null;
let sessionStatus = '대기';
let state = {
  slide: 0,
  locked: true,
  pdf: true,
  timer: { id: '', running: false, remaining: 600, endAt: 0 }
};
let selectedMinutes = 10;

function say(message) {
  statusEl.textContent = message;
  statusEl.classList.add('show');
  clearTimeout(say.timer);
  say.timer = setTimeout(() => statusEl.classList.remove('show'), 1800);
}

function showGate(message = '') {
  panel.hidden = true;
  gate.hidden = false;
  byId('gateErr').textContent = message;
}

function showPanel() {
  gate.hidden = true;
  panel.hidden = false;
  render();
}

function connectionLabel() {
  return online ? 'Firebase 연결 정상' : '연결 끊김 · 재연결 중';
}

function remainingSeconds() {
  const timer = state.timer || {};
  if (!timer.running) return Number(timer.remaining) || 0;
  return Math.round((Number(timer.endAt) - (Date.now() + serverOffset)) / 1000);
}

function formatTime(seconds) {
  const negative = seconds < 0;
  const absolute = Math.abs(seconds);
  const minutes = Math.floor(absolute / 60);
  const secs = absolute % 60;
  return (negative ? '+' : '') + minutes + ':' + String(secs).padStart(2, '0');
}

function renderTimer() {
  const seconds = remainingSeconds();
  byId('tDisp').textContent = formatTime(seconds);
  byId('tDisp').classList.toggle('warn', seconds <= 60);
  byId('tState').textContent = state.timer.running ? '진행 중' : (seconds <= 0 ? '종료' : '정지');
}

function startTick() {
  clearInterval(tickId);
  tickId = setInterval(renderTimer, 250);
}

function renderSwitch(id, on) {
  byId(id).setAttribute('aria-checked', String(on));
  byId(id + 'State').textContent = on ? 'ON' : 'OFF';
}

function render() {
  const slide = Math.max(0, Math.min(TITLES.length - 1, Number(state.slide) || 0));
  byId('sessionTag').textContent = sessionStatus;
  byId('sessionTag').classList.toggle('on', sessionStatus === '진행 중');
  byId('connectionText').textContent = connectionLabel();
  byId('curNum').textContent = slide + 1;
  byId('curTotal').textContent = '/ ' + TITLES.length;
  byId('curTitle').textContent = TITLES[slide];
  byId('prevBtn').disabled = slide === 0;
  byId('nextBtn').disabled = slide === TITLES.length - 1;
  [...jump.children].forEach((button, index) => button.setAttribute('aria-current', String(index === slide)));
  renderSwitch('swLock', !!state.locked);
  renderSwitch('swPdf', !!state.pdf);
  byId('pdfPreview').disabled = !state.pdf;
  document.querySelectorAll('.preset').forEach((button) => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.min) === selectedMinutes));
  });
  renderTimer();
}

function write(promise, successMessage) {
  return promise.then(() => {
    if (successMessage) say(successMessage);
  }).catch((error) => {
    console.error(error);
    say(error && error.message === 'not-admin' ? '관리자 로그인 필요' : 'Firebase 저장 실패 · 규칙 확인');
  });
}

function setSlide(index) {
  const next = Math.max(0, Math.min(TITLES.length - 1, index));
  write(sync.setSlide(next), (next + 1) + '장 · ' + TITLES[next]);
}

function bindSwitch(id, readValue, saveValue, label) {
  const control = byId(id);
  const toggle = () => write(saveValue(!readValue()), label + ' ' + (!readValue() ? 'ON' : 'OFF'));
  control.addEventListener('click', toggle);
  control.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    toggle();
  });
}

TITLES.forEach((title, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = index + 1;
  button.title = (index + 1) + '. ' + title;
  button.setAttribute('aria-label', button.title);
  if (BREAKS.includes(index)) button.classList.add('brk');
  button.addEventListener('click', () => setSlide(index));
  jump.appendChild(button);
});

document.querySelectorAll('.card:not([hidden])').forEach((card) => {
  const heading = card.querySelector('h2');
  const body = document.createElement('div');
  const toggle = document.createElement('button');
  body.className = 'card-body';
  body.id = card.id + 'Body';
  while (heading.nextSibling) body.appendChild(heading.nextSibling);
  toggle.type = 'button';
  toggle.className = 'card-toggle';
  toggle.textContent = '접기';
  toggle.setAttribute('aria-expanded', 'true');
  toggle.setAttribute('aria-controls', body.id);
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    toggle.textContent = open ? '펼치기' : '접기';
    body.hidden = open;
  });
  heading.appendChild(toggle);
  card.appendChild(body);
});

if (!isConfigured(window.FIREBASE_CONFIG)) {
  showGate('Firebase 설정이 없습니다. firebase-config.js를 확인해 주세요.');
} else {
  sync = createSync(window.FIREBASE_CONFIG, window.DECK_ID || 'ai-blog-1015');

  sync.onConnection((connected) => {
    online = connected;
    render();
  });
  sync.onServerOffset((offset) => {
    serverOffset = Number(offset) || 0;
    renderTimer();
  });
  sync.onState((remoteState) => {
    if (!remoteState) {
      say('상태 읽기 실패 · Firebase 규칙 확인');
      return;
    }
    state = { ...state, ...remoteState, timer: remoteState.timer || state.timer };
    if (!state.timer.running && state.timer.remaining > 0) selectedMinutes = Math.max(1, Math.round(state.timer.remaining / 60));
    if (state.timer.running) startTick();
    render();
  });
  sync.onViewers((count) => {
    byId('viewerCount').textContent = count == null ? '-' : count + '명';
  });
  sync.onAdmin((admin, user) => {
    isAdmin = admin;
    if (admin) {
      showPanel();
    } else if (user) {
      showGate('관리자 목록에 없는 Google 계정입니다.');
    } else {
      showGate();
    }
  });

  byId('googleLogin').addEventListener('click', async () => {
    byId('gateErr').textContent = '';
    try {
      await sync.loginGoogle();
    } catch (error) {
      console.error(error);
      byId('gateErr').textContent = 'Google 로그인 실패 · 팝업 허용 여부를 확인해 주세요.';
    }
  });
  byId('logout').addEventListener('click', () => sync.logout());
  byId('checkConnection').addEventListener('click', () => say(connectionLabel()));
  byId('startSession').addEventListener('click', () => {
    sessionStatus = '진행 중';
    setSlide(0);
    render();
  });
  byId('endSession').addEventListener('click', () => {
    sessionStatus = '종료';
    const remaining = remainingSeconds();
    write(sync.setTimer({ id: String(state.timer.id || ''), running: false, remaining, endAt: 0 }), '수업 종료 · 타이머 정지');
    render();
  });
  byId('prevBtn').addEventListener('click', () => setSlide(Number(state.slide) - 1));
  byId('nextBtn').addEventListener('click', () => setSlide(Number(state.slide) + 1));
  byId('pdfPreview').addEventListener('click', () => window.open('slides.html?admin', '_blank', 'noopener'));
  bindSwitch('swLock', () => !!state.locked, (on) => sync.setLock(on), '발표자 따라가기');
  bindSwitch('swPdf', () => !!state.pdf, (on) => sync.setPdf(on), 'PDF 저장 허용');

  document.querySelectorAll('.preset').forEach((button) => {
    button.addEventListener('click', () => {
      selectedMinutes = Number(button.dataset.min);
      write(sync.setTimer({ id: String(Number(state.slide) + 1), running: false, remaining: selectedMinutes * 60, endAt: 0 }), selectedMinutes + '분 설정');
    });
  });
  byId('tStart').addEventListener('click', () => {
    if (state.timer.running) return;
    const remaining = remainingSeconds();
    write(sync.setTimer({ id: String(Number(state.slide) + 1), running: true, remaining, endAt: Date.now() + serverOffset + remaining * 1000 }), '타이머 시작');
  });
  byId('tPause').addEventListener('click', () => {
    if (!state.timer.running) return;
    write(sync.setTimer({ id: String(state.timer.id || Number(state.slide) + 1), running: false, remaining: remainingSeconds(), endAt: 0 }), '타이머 일시정지');
  });
  byId('tReset').addEventListener('click', () => {
    write(sync.setTimer({ id: String(Number(state.slide) + 1), running: false, remaining: selectedMinutes * 60, endAt: 0 }), '타이머 리셋');
  });
}

const adminTop = byId('adminTop');
window.addEventListener('scroll', () => adminTop.classList.toggle('show', window.scrollY > 500), { passive: true });
adminTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

render();
