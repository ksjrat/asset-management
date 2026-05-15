# 배포 · PC/모바일 사용 가이드

## 항상 켜 두기 (PC 꺼져도 접속)

이 앱은 **정적 웹앱**이라 **GitHub Pages** 등에 올리면 24시간 접속할 수 있습니다.

### GitHub Pages (권장)

1. GitHub에 이 저장소를 `main` 브랜치로 푸시합니다.
2. 저장소 **Settings → Pages → Build and deployment**
   - Source: **GitHub Actions**
3. `main`에 푸시하면 `.github/workflows/pages.yml`이 자동 배포합니다.
4. 배포 URL (예시):
   - `https://<사용자명>.github.io/<저장소이름>/`

### 폰·PC에서 쓰기

1. 배포된 **https 주소**를 브라우저에서 엽니다.
2. **홈 화면에 추가** (모바일) 또는 즐겨찾기 (PC).
3. 데이터는 **그 브라우저 기기**에만 저장됩니다 (localStorage).

> **데이터 연동**은 Firebase 설정이 필요합니다. [SYNC.md](./SYNC.md) 를 참고하세요.

---

## PC 버전

화면 너비 **900px 이상**이면 자동으로 PC 레이아웃이 적용됩니다.

- 왼쪽: 메뉴(홈·목표·예산·리포트·설정)
- 오른쪽: 본문
- 모달: 화면 가운데
- 좁은 화면: 기존 모바일(하단 탭) UI

별도 설치 없이 **Chrome / Edge / Safari**에서 URL만 열면 됩니다.

---

## 로컬에서만 테스트

| 용도 | 실행 파일 |
|------|-----------|
| PC만 | `start-server.bat` → http://localhost:8080 |
| 같은 Wi‑Fi 폰 | `start-server-mobile.bat` → 표시된 IP:8080 |

로컬 서버는 **PC가 켜져 있을 때만** 동작합니다.
