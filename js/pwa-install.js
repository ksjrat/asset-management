/** PWA · 홈 화면 추가 (Android 설치 프롬프트 + iOS 안내) */

let deferredInstallPrompt = null;

function isLocalDevHost() {
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1'
    || /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(h);
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isInAppBrowser() {
  return /KAKAOTALK|Instagram|FBAN|FBAV|Line\//i.test(navigator.userAgent);
}

export function canPromptInstall() {
  return !!deferredInstallPrompt;
}

export function initPwaInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    window.dispatchEvent(new Event('pwa-install-available'));
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
  });
}

export async function tryPwaInstall() {
  if (!deferredInstallPrompt) return { ok: false, reason: 'no-prompt' };
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  if (outcome === 'accepted') {
    deferredInstallPrompt = null;
    return { ok: true };
  }
  return { ok: false, reason: 'dismissed' };
}

export function getPwaInstallHint() {
  if (isInAppBrowser()) {
    return '카톡·인스타 등 앱 안 브라우저에서는 추가가 안 될 수 있어요. Safari·Chrome에서 주소를 직접 열어 주세요.';
  }
  if (isLocalDevHost()) {
    return 'Wi‑Fi 테스트 주소(192.168…)에서는 설치 메뉴가 안 나올 수 있어요. GitHub Pages 주소로 열면 추가하기가 쉽습니다.';
  }
  if (isIOS()) {
    return 'Safari 하단 공유(□↑) → 홈 화면에 추가';
  }
  if (canPromptInstall()) {
    return '아래 버튼으로 설치할 수 있어요';
  }
  return 'Chrome 메뉴(⋮) → 홈 화면에 추가 / 앱 설치';
}

export function pwaInstallInstructionsHtml() {
  const url = location.origin + location.pathname.replace(/\/index\.html$/, '').replace(/\/?$/, '/');
  if (isInAppBrowser()) {
    return `<p class="modal-text">카카오톡·인스타 등 <strong>앱 안에서 연 링크</strong>는 홈 화면 추가가 막혀 있는 경우가 많습니다.</p>
      <p class="muted">Safari 또는 Chrome을 연 뒤 주소창에 아래를 붙여 넣으세요.</p>
      <p class="invite-code" style="font-size:0.85rem;letter-spacing:0">${url}</p>`;
  }
  if (isIOS()) {
    return `<ol class="setup-flow-list compact">
      <li><strong>Safari</strong>로 이 사이트를 엽니다 (Chrome만 쓰면 메뉴가 다를 수 있음)</li>
      <li>하단 <strong>공유</strong> 버튼(□↑) 탭</li>
      <li><strong>홈 화면에 추가</strong> 선택 → 추가</li>
    </ol>
    <p class="muted">주소: ${url}</p>`;
  }
  if (canPromptInstall()) {
    return `<p class="modal-text">아래 <strong>지금 설치</strong>를 누르면 홈 화면·앱 목록에 추가할 수 있습니다.</p>`;
  }
  return `<ol class="setup-flow-list compact">
    <li><strong>Chrome</strong>으로 이 사이트를 엽니다</li>
    <li>주소창 옆 <strong>설치</strong> 안내가 있으면 탭 (없으면 ⋮ 메뉴)</li>
    <li><strong>홈 화면에 추가</strong> 또는 <strong>앱 설치</strong> 선택</li>
  </ol>
  <p class="muted">한두 번 방문한 뒤에 메뉴가 보이는 경우가 많습니다. 주소: ${url}</p>`;
}
