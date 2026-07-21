# 📱 안드로이드 APK 만들기 (koreacow.kr → PWABuilder)

이 앱은 서버가 화면을 그려주는 웹앱이라, APK는 **배포된 주소(koreacow.kr)를
전체화면으로 여는 안드로이드 앱(TWA)** 으로 만듭니다. 안드로이드 개발도구 설치는
필요 없고, PWABuilder(웹사이트)가 클라우드에서 APK를 만들어 줍니다.

```
이미 완료: HTTPS 배포(https://koreacow.kr) + PWA(manifest·아이콘·서비스워커)
남은 일:  PWABuilder에서 그 주소 → APK/AAB 다운로드  →  assetlinks 등록(전체화면)
```

준비값(메모):
- **웹앱 주소**: `https://koreacow.kr`
- **패키지명(Package ID)**: `kr.koreacow.app`  ← 한 번 정하면 업데이트 때 계속 사용
- **앱 이름**: 영농형 태양광 관리

---

## 1단계 — PWABuilder로 APK 생성 (설치 불필요, 몇 클릭)

1. https://www.pwabuilder.com 접속
2. `https://koreacow.kr` 입력 → **Start** (분석 점수가 뜸)
3. **Package For Stores → Android** 선택
4. 옵션 확인:
   - **Package ID**: `kr.koreacow.app`
   - **App name**: 영농형 태양광 관리 / **Launcher name**: 태양광관리
   - 나머지는 기본값으로 충분
5. **Download** → zip 안에:
   - `app-release-signed.apk`  ← 폰에 바로 설치하는 파일
   - `<프로젝트>.aab`           ← (선택) 구글 플레이 등록용
   - `assetlinks.json`         ← 전체화면 검증용 (2단계에서 사용)
   - **서명 키(keystore) + 비밀번호** ← ⚠️ **꼭 안전하게 백업**. 잃어버리면 같은 앱으로 업데이트 못 함.

---

## 2단계 — 전체화면 검증(assetlinks) 등록  ★권장

PWABuilder가 준 **`assetlinks.json` 내용**을 아래 파일에 그대로 붙여넣고 배포하면,
앱 실행 시 **상단 주소막대 없이 전체화면**으로 뜹니다. (이미 서버 라우트는 준비됨)

- 저장 위치: `static/.well-known/assetlinks.json`
  - 형식 예시는 `static/.well-known/assetlinks.example.json` 참고
  - `package_name` = `kr.koreacow.app`, `sha256_cert_fingerprints` = PWABuilder가 준 지문
- 커밋 후 `git push` → 자동 배포되면 `https://koreacow.kr/.well-known/assetlinks.json` 로 열립니다.

> 이 `assetlinks.json`(지문 포함)만 주시면 제가 위치에 넣고 배포까지 해드립니다.
> 건너뛰면 앱은 동작하지만 상단에 얇은 주소막대가 보일 수 있습니다.

---

## 3단계 — 설치 / 배포

- **내 폰에 바로**: `app-release-signed.apk` 를 폰으로 보내 설치
  (설정에서 "출처를 알 수 없는 앱 설치 허용"이 필요할 수 있음)
- **구글 플레이 등록**: `.aab` 업로드 + Play Console 개발자 등록(1회 $25).
  원하시면 등록 절차를 따로 안내해 드립니다.

---

## 참고
- 앱 아이콘은 `static/icon-192.png / icon-512.png` 를 사용합니다. 더 예쁜 아이콘을
  원하면 교체 후 다시 PWABuilder로 만들면 됩니다.
- 로그인·이표 사진(카메라/갤러리)·OCR 등 모든 기능은 TWA(크롬 엔진)에서 그대로 동작합니다.
- 앱 내용 업데이트는 웹앱(koreacow.kr)만 배포하면 **자동 최신화**됩니다.
  APK 자체(아이콘·이름·패키지)를 바꿀 때만 PWABuilder로 다시 만들면 됩니다.
