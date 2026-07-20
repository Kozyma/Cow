# 🚀 EC2 배포 가이드 (GitHub Actions + Docker)

`main` 브랜치에 push하면 GitHub Actions가 EC2에 SSH로 접속해 자동 배포합니다.
(SSH → 코드 갱신 → `.env` 생성 → `docker compose up -d --build`)

## 아키텍처
- **EC2**: t4g.nano (Amazon Linux 2023 ARM64), Docker + docker compose 설치됨
- **실행**: `docker compose`로 2개 컨테이너 구동
  - `web`: `gunicorn web_app:app` (내부 `8000`)
  - `caddy`: 리버스 프록시. 호스트 `80`/`443` → `web:8000`. **HTTPS(Let's Encrypt) 자동 발급·갱신**
- **DB**: SQLite(`farm_data.db`)를 named volume `cow-data`(`/app/data`)에 저장 → 재배포에도 유지
- **도메인**: `koreacow.kr` → EC2 고정 IP(EIP). Caddy가 이 도메인으로 인증서 발급

## 필수: GitHub Secrets 등록
레포 **Settings → Secrets and variables → Actions → New repository secret** 에서 아래 4개 등록:

| Secret 이름 | 값 | 비고 |
|---|---|---|
| `EC2_HOST` | EC2 공인 IP (EIP) | 예: `3.35.40.35` |
| `EC2_SSH_KEY` | SSH 개인키(.pem) **전체 내용** | `-----BEGIN ...` 부터 끝까지 |
| `SECRET_KEY` | Flask 세션 서명 키 | `python3 -c "import secrets; print(secrets.token_hex(24))"` |
| `APP_PASSWORD` | 앱 접속 비밀번호 | 이 값을 아는 사람만 로그인 가능 |

## 배포 실행
- `main`에 push → 자동 배포
- 또는 **Actions 탭 → Deploy to EC2 → Run workflow** (수동 실행)

## 확인
- 브라우저에서 `https://koreacow.kr` 접속 (http는 https로 자동 리다이렉트)
- 서버에서 상태 확인: `docker compose ps`, 로그: `docker compose logs -f`
- 인증서 발급 로그: `docker compose logs caddy`

## 참고
- t4g.nano는 RAM 0.5GB라 Docker 빌드 중 메모리가 빠듯할 수 있습니다.
  빌드 실패(OOM) 시 EC2에 swap 2GB를 추가하세요:
  ```bash
  sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
  sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  ```
- HTTPS는 Caddy가 Let's Encrypt로 자동 처리합니다. 인증서 발급 조건: 도메인이 이 서버 IP로 연결되어 있고(가비아 A레코드), 보안그룹에서 80·443이 열려 있어야 합니다(구성됨).
