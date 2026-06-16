# 📱 안드로이드 APK 만들기 (PWABuilder)

이 앱은 서버에서 화면을 만들어 주는 웹앱이라, APK는 **배포된 웹앱 주소를
여는 안드로이드 앱(TWA)** 형태로 만듭니다. 순서는 두 단계입니다.

```
① 웹앱을 HTTPS 주소로 배포  →  ② PWABuilder로 그 주소를 APK로 변환
```

---

## 1단계 — 웹앱 배포 (HTTPS 주소 만들기)

`DEPLOY.md` 의 **PythonAnywhere(무료)** 안내를 따르면
`https://아이디.pythonanywhere.com` 주소가 생깁니다.
APK는 반드시 **https** 주소가 있어야 만들 수 있습니다. (이미 배포했다면 건너뜀)

> 휴대폰 브라우저로 그 주소에 접속 → 메뉴 → "📲 앱 설치"가 잘 뜨면
> PWA가 정상이고, APK 변환도 문제없이 됩니다.

---

## 2단계 — PWABuilder로 APK 생성 (설치 불필요)

1. https://www.pwabuilder.com 접속
2. 배포한 주소(`https://아이디.pythonanywhere.com`) 입력 → **Start / Analyze**
3. 점수 화면에서 **Package For Stores** → **Android** 선택
4. 옵션 확인:
   - **Package ID**: 예) `com.kozyma.farmsolar.twa` (메모해 두세요)
   - 나머지는 기본값으로 충분
5. **Download** → zip 안에 다음이 들어 있습니다:
   - `app-release-signed.apk`  ← 폰에 바로 설치하는 파일
   - `assetlinks.json`         ← 주소창 숨김(전체화면) 검증용
   - 서명 키(`signing.keystore`) — **꼭 백업**(업데이트 때 동일 키 필요)

---

## 3단계 — 전체화면 검증 파일 등록 (선택이지만 권장)

PWABuilder가 준 `assetlinks.json` 내용을 서버의 아래 위치에 저장하세요:

```
static/.well-known/assetlinks.json
```

- 이 파일이 있으면 앱이 `https://<도메인>/.well-known/assetlinks.json` 으로
  제공되어(코드에 이미 라우트 있음), 앱 실행 시 **상단 주소창 없이 전체화면**으로 뜹니다.
- 예시 형식은 `static/.well-known/assetlinks.example.json` 참고.
- 저장 후 서버 **Reload**.

> 이 단계를 건너뛰면 앱은 동작하지만 상단에 작은 주소 막대가 보일 수 있습니다.

---

## 4단계 — 설치 / 배포

- **내 폰에 바로**: `app-release-signed.apk` 를 폰으로 보내 설치
  (설정에서 "출처를 알 수 없는 앱 설치 허용" 필요할 수 있음)
- **구글 플레이 등록**: PWABuilder는 `.aab`(App Bundle)도 제공합니다.
  Play Console 등록(개발자 등록비 1회 $25)이 필요하면 따로 안내해 드릴게요.

---

## 참고

- **데이터 저장 위치**: APK는 껍데기일 뿐, 데이터는 1단계에서 배포한 **서버**에
  저장됩니다. 폰·PC·APK 어디서 접속해도 같은 데이터를 봅니다.
- **인터넷 필요**: TWA APK는 서버 주소를 여는 방식이라 접속이 필요합니다.
  완전 오프라인 단독 사용은 macOS 데스크톱 앱(`build_desktop_macos.sh`)을 쓰세요.
- **앱 업데이트**: 웹앱(서버) 코드를 고치면 APK는 그대로 둬도 내용이 자동 갱신됩니다.
  (아이콘·이름 등 앱 자체 정보를 바꿀 때만 APK 재생성)
