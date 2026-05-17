# 배포 · PC/모바일 사용 가이드

## 항상 켜 두기 (PC 꺼져도 접속)

이 앱은 **정적 웹앱**(HTML·JS만)이라 무료 호스팅에 올리면 24시간 접속할 수 있습니다.

---

## 무료 호스팅 비교

| 서비스 | 비용 | 비고 |
|--------|------|------|
| **GitHub Pages** | **무료** (공개 저장소) | 저장소를 Public으로 두면 Pages 무료. Private만 유료 플랜 필요 |
| **Cloudflare Pages** | 무료 | GitHub 연동, 속도 좋음, **추천 대안** |
| **Netlify** | 무료 한도 넉넉 | 드래그 앤 드롭 또는 Git 연동 |
| **Vercel** | 무료 한도 넉넉 | Git 연동 |
| **Firebase Hosting** | 무료 한도 | [SYNC.md](./SYNC.md) Firebase 쓸 때 같이 쓰기 좋음 |

> GitHub **저장소 자체**는 Private도 무료입니다. **Pages를 Private 저장소에** 쓰려면 유료 플랜이 필요할 수 있습니다.  
> → **저장소를 Public**으로 두거나, **Cloudflare Pages**를 쓰면 됩니다.

---

## 방법 A — GitHub Pages (공개 저장소, 무료)

1. GitHub에 저장소 생성 → **Public** 선택
2. 코드를 `main` 브랜치로 푸시
3. **Settings → Pages → Build and deployment → Source: `GitHub Actions`** (Branch / Deploy from a branch 아님)
4. **Actions** 탭에서 실패한 워크플로 **Re-run** 또는 `main`에 다시 push
5. 배포 완료 후 접속:  
   `https://<사용자명>.github.io/<저장소이름>/`

저장소에 `.github/workflows/pages.yml` 이 있으면 푸시 시 자동 배포됩니다.

**`Get Pages site failed` 오류가 나면:** Pages Source가 **GitHub Actions**인지 확인한 뒤 워크플로를 다시 실행하세요. (워크플로에 `enablement: true`가 있어도, 저장소 **Settings → Pages**에서 한 번 맞춰 두는 것이 가장 확실합니다.)

---

## 방법 B — Cloudflare Pages (무료, Private 저장소도 OK)

1. [Cloudflare](https://dash.cloudflare.com/) 가입 → **Workers & Pages** → **Create**
2. **Pages** → **Connect to Git** → GitHub 저장소 선택
3. 빌드 설정:
   - **Build command:** (비움)
   - **Build output directory:** `/` (루트)
4. Deploy 후 `https://<이름>.pages.dev` 주소 사용

Private GitHub 저장소도 연동 가능합니다.

---

## 방법 C — Netlify (드래그만, Git 없이)

1. [Netlify](https://www.netlify.com/) 가입
2. **Sites → Add site → Deploy manually**
3. 프로젝트 폴더 전체를 zip으로 올리거나 폴더 드래그
4. 발급된 `https://xxxx.netlify.app` 주소 사용

---

## 폰·PC에서 쓰기

1. 배포된 **https 주소**를 브라우저에서 엽니다.
2. **홈 화면에 추가** (모바일) 또는 즐겐찾기 (PC).
3. **데이터 연동**: 앱 **설정 → 연동 도우미**. Firebase는 [SYNC.md](./SYNC.md)의 `FIREBASE_CONFIG` 시크릿으로 배포 시 자동 설정.

---

## PC 버전

화면 너비 **900px 이상**이면 왼쪽 메뉴 + 넓은 본문(PC 레이아웃)이 자동 적용됩니다.

---

## 로컬에서만 테스트

| 용도 | 실행 파일 |
|------|-----------|
| PC만 | `start-server.bat` → http://localhost:8080 |
| 같은 Wi‑Fi 폰 | `start-server-mobile.bat` → 표시된 IP:8080 |

로컬 서버는 **PC가 켜져 있을 때만** 동작합니다.
