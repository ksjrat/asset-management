# 우리 자산

신혼부부를 위한 **공동 자산·예산·목표 관리** PWA(Progressive Web App)입니다.  
별도 앱 설치 없이 브라우저에서 사용하고, 홈 화면에 추가하면 앱처럼 쓸 수 있습니다.

## 주요 기능

| 영역 | 설명 |
|------|------|
| **홈 대시보드** | 순자산·총자산·총부채 요약, 월별 추이, 재정 인사이트 |
| **자산·수익** | 자산/부채 등록, 소유 구분, 수익·저축 이력, 부동산 평가 |
| **지출·예산** | 월별 카테고리 예산, 거래·반복 지출, 실적 입력 |
| **목표** | 공동 재정 목표, 기여 방식, 달성률·가이드 카드 |
| **메모** | 가계 관련 메모 |
| **설정** | 연동 도우미, 앱 잠금, 패치 내역 |

## 기술 스택

- **Vanilla JavaScript** (ES modules) — 프레임워크 없음
- **HTML / CSS** — 반응형 UI, PC(900px+)·모바일 레이아웃
- **PWA** — Service Worker, `manifest.json`, 오프라인 캐시
- **localStorage** — 기본 데이터 저장
- **Firebase Firestore** (선택) — 가족 간 클라우드 동기화, AES-GCM 암호화

## 빠른 시작 (로컬)

> `index.html`을 파일로 직접 열면 동작하지 않습니다. 반드시 HTTP 서버로 실행하세요.

### 요구 사항

- [Python 3](https://www.python.org/) (로컬 서버용)

### 실행

```text
start-server.bat
```

브라우저에서 **http://localhost:8080** 으로 접속합니다.

### PC만 쓸 때 vs 같은 Wi‑Fi 폰까지

| 상황 | 실행 파일 | 접속 주소 |
|------|-----------|-----------|
| **PC 브라우저만** | `start-server.bat` | `http://localhost:8080` |
| **같은 Wi‑Fi의 휴대폰·태블릿** | `start-server-mobile.bat` | `http://<PC IP>:8080` |

`start-server.bat`은 PC 안에서만 접속되도록(`127.0.0.1`) 서버를 띄웁니다.  
휴대폰에서 열려면 반드시 **`start-server-mobile.bat`** 을 사용하세요.

### 같은 Wi‑Fi에서 휴대폰으로 쓰기

1. **PC와 휴대폰을 같은 Wi‑Fi에 연결**  
   - 휴대폰 **LTE/5G만** 켜져 있으면 PC IP로 접속되지 않습니다.  
   - PC가 **유선(LAN)**, 폰이 **Wi‑Fi**여도 같은 공유기면 보통 됩니다.

2. **`start-server-mobile.bat` 실행**  
   - 검은 창(터미널)에 `http://192.168.x.x:8080` 형태의 주소가 여러 줄 나올 수 있습니다.  
   - **`192.168.` / `10.` / `172.`** 로 시작하는 **사설 IP**를 고르세요.  
   - VPN·가상 어댑터(Hyper‑V, Docker 등) IP는 휴대폰에서 안 열릴 수 있습니다.

3. **휴대폰 브라우저(Safari, Chrome 등)에서 그 주소 입력**  
   - `https`가 아니라 **`http://`** 입니다.  
   - PC에서 localhost로 먼저 열어 두면, 같은 주소가 맞는지 확인하기 쉽습니다.

4. **(선택) 홈 화면에 추가**  
   - iPhone: 공유 → **홈 화면에 추가**  
   - Android: 메뉴 → **홈 화면에 추가** / **앱 설치**  
   - 로컬 `http://` 주소는 브라우저·기종에 따라 PWA 설치가 제한될 수 있습니다. 항상 쓰려면 [배포](#배포) 후 `https` 주소를 쓰는 편이 낫습니다.

5. **종료**  
   - 서버 창에서 **Ctrl+C** 또는 창을 닫으면 휴대폰에서도 접속이 끊깁니다.  
   - **PC가 켜져 있고 배치 파일이 실행 중일 때만** 동작합니다.

#### Windows 방화벽

처음 실행 시 **「Python 허용」** 팝업이 뜨면 **개인 네트워크(Private)** 에서 허용하세요.  
접속이 안 되면:

- **Windows 보안 → 방화벽 → 앱 허용** 에서 Python(또는 `python.exe`)이 **개인 네트워크**에서 허용됐는지 확인
- PC와 폰이 **게스트 Wi‑Fi·AP 격리** 네트워크가 아닌지 확인 (같은 SSID여도 기기끼리 차단하는 공유기가 있습니다)

#### 자주 막히는 경우

| 증상 | 확인 |
|------|------|
| 휴대폰에서 «연결할 수 없음» | `start-server-mobile.bat` 실행 중인지, 주소·`:8080` 오타, PC·폰 같은 Wi‑Fi인지 |
| PC에서는 되는데 폰만 안 됨 | `start-server.bat` 대신 **mobile** 배치 파일 사용 여부, 방화벽 |
| 주소가 여러 개 | VPN 끄기, `192.168.x.x` 같은 LAN IP 선택 |
| PC에서 입력한 데이터가 폰에 없음 | **기기마다 localStorage**에 저장됨. 폰·PC 데이터 맞추려면 [클라우드 동기화](#클라우드-동기화-선택) 필요 |

> **집 밖·PC 꺼진 뒤에도** 폰에서 쓰려면 GitHub Pages 등에 [배포](#배포)한 **https 주소**를 쓰세요. Wi‑Fi 로컬 서버는 개발·집 안 테스트용입니다.

## 클라우드 동기화 (선택)

PC·폰·배우자 기기 간 데이터를 맞추려면 Firebase를 설정합니다.

1. 앱 **설정 → 연동 도우미**에서 가족 코드 발급/입력
2. 모든 기기에서 **같은 가족 암호**(6자 이상) 사용

관리자용 Firebase·GitHub 시크릿 설정은 [docs/SYNC.md](docs/SYNC.md)를 참고하세요.  
로컬 개발 시에는 `setup-sync-local.bat`으로 `js/sync-config.js`를 준비합니다.

## 배포

GitHub Pages, Cloudflare Pages, Netlify 등 정적 호스팅에 그대로 올릴 수 있습니다.

- 자동 배포: `main` 브랜치 push 시 GitHub Actions (`.github/workflows/pages.yml`)
- 상세 가이드: [docs/DEPLOY.md](docs/DEPLOY.md)

## 프로젝트 구조

```text
asset-management/
├── index.html          # 진입점
├── manifest.json       # PWA 매니페스트
├── sw.js               # Service Worker
├── css/                # 스타일
├── js/
│   ├── app.js          # 부트스트랩
│   ├── store.js        # localStorage
│   ├── sync-*.js       # 클라우드 동기화·암호화
│   └── views/          # 화면별 UI (홈, 자산, 지출, 설정 등)
├── docs/               # 배포·동기화·보안 문서
├── scripts/            # 빌드·패치 노트 유틸
├── start-server.bat    # 로컬 서버 (PC만)
└── start-server-mobile.bat  # 같은 Wi‑Fi 휴대폰 접속용
```

## 보안

- 가족 암호는 **저장하지 않으며**, 클라우드 데이터는 암호화 후 업로드됩니다.
- 「배우자에게 비공개」 자산은 클라우드에 올라가지 않습니다.
- 자세한 내용: [docs/SECURITY.md](docs/SECURITY.md)

## 문서

| 문서 | 내용 |
|------|------|
| [docs/DEPLOY.md](docs/DEPLOY.md) | 호스팅·PC/모바일 사용 |
| [docs/SYNC.md](docs/SYNC.md) | Firebase·가족 연동 |
| [docs/SECURITY.md](docs/SECURITY.md) | 암호화·개인정보 |
| [docs/SPEC_CHECKLIST.md](docs/SPEC_CHECKLIST.md) | 기능 구현 현황 |
| [AGENTS.md](AGENTS.md) | Agent·커밋 메시지 규칙 |

## 라이선스

이 저장소에 별도 LICENSE 파일이 없으면, 사용·배포 전 저장소 소유자의 허가를 확인하세요.
