# 한우의 기준 — 농장 직거래 쇼핑몰 + 백오피스

농장 관리 프로그램(`web_app.py`)과 **분리된 별도 진입점**입니다.
기존 파일은 고치지 않았고, 이 폴더(`hanwoo_shop/`)만 추가됩니다.

| | 농장 관리 (기존) | 한우의 기준 (신규) |
|---|---|---|
| 진입점 | `web_app.py` | `hanwoo_shop/shop_app.py` |
| 포트 | 8000 | 8100 |
| 데이터 | `farm_data.db` | `shop_data.db` + `uploads/` |

## 실행

```bash
cd hanwoo_shop
python -m pip install -r requirements.txt   # 최초 1회
python shop_app.py
```

Windows는 `run_windows.bat` 더블클릭.

- 쇼핑몰: http://localhost:8100
- 백오피스: http://localhost:8100/admin — **처음 접속할 때 관리자 비밀번호를 직접 정합니다.**

## 처음 할 일 (백오피스)

1. **설정** — 입금 계좌, 배송비, 고객센터 전화, 사업자 정보, 첫 화면 약속 문구
2. **상품 · 재고** — `예시 상품 10개 넣어 보기`로 화면을 확인한 뒤 실제 부위·중량·가격·이력번호·사진으로 수정
3. **메인 배너** — 첫 화면 배너 문구와 사진
4. **공지 · 자주 묻는 질문**, **설정 > 약관과 안내문** — 기본 문구는 초안이므로 실제 운영 방식에 맞게 확인

## 쇼핑몰 화면

- **첫 화면**: 배너, 분류 바로가기, 많이 찾는 한우, 선물세트, 신상품, 후기, 공지
- **상품**: 분류(구이·스테이크·불고기/국거리·갈비/찜·사골/곰탕·선물세트), 검색, 정렬, 베스트·신상품, 할인가
- **상품 상세**: 사진 여러 장, 정육 라벨(부위·등급·중량·100g당 가격·이력번호), 후기, 문의, 배송·교환 안내
- **주문**: 장바구니 → 주문서(받는 날 선택, 무통장 입금) → 주문 상세. 비회원도 주문·조회 가능
- **회원**: 가입·로그인, 주문 내역, 찜한 상품, 내 후기·문의, 배송지·비밀번호 변경, 탈퇴
- **후기**: 배송이 끝난 주문에서만 작성 (별점·사진). 구매한 사람만 쓸 수 있습니다
- **고객센터**: 자주 묻는 질문, 공지사항, 이용약관, 개인정보처리방침, 배송·교환·환불 안내

상품 사진을 올리지 않으면 부위에 맞는 **기본 그림**이 대신 표시됩니다. 실제 판매 전에 사진으로 바꿔 주세요.

## 백오피스

- **대시보드**: 오늘 주문, 입금 확인 대기, 출고할 주문, 이번 달 매출, 답변할 문의, 재고 부족
- **주문 관리**: 상태별 보기, 검색, 버튼 하나로 다음 단계(입금 확인 → 준비 → 출고 → 배송 완료), 송장번호, CSV 받기
- **상품 · 재고**: 등록·수정·삭제, 사진, 정가/판매가, 베스트·신상품 표시, 목록에서 재고·판매 상태 바로 수정
- **상품 문의 / 후기**: 답변·답글 작성, 후기 숨기기
- **회원 · 고객**: 회원 목록, 연락처 기준 주문 고객 목록
- **메인 배너 / 공지 · 자주 묻는 질문 / 설정**

주문이 들어오면 재고가 자동으로 줄고, 주문이 취소되면 되돌아갑니다.

## 결제

지금은 **무통장 입금**만 됩니다. 입금을 확인한 뒤 백오피스에서 `입금 확인`을 눌러 주세요.
카드·간편결제는 PG사(토스페이먼츠, 포트원 등)와 계약한 뒤 연동해야 하며, 이 버전에는 들어 있지 않습니다.
주문 접수·출고 알림 문자도 자동으로 나가지 않습니다.

## 서버 배포 (기존 EC2 Docker 구성에 추가할 때)

이 폴더에 `Dockerfile`이 들어 있습니다. 기존 `docker-compose.yml`·`Caddyfile`은 건드리지 않았으니,
올릴 준비가 되면 아래 두 군데를 **직접 추가**하면 됩니다. (도메인은 예시)

`docker-compose.yml` 의 `services:` 아래:

```yaml
  shop:
    build: ./hanwoo_shop
    container_name: cow-shop
    restart: unless-stopped
    expose:
      - "8100"
    environment:
      SECRET_KEY: ${SHOP_SECRET_KEY}          # .env 에 임의의 긴 문자열
      ADMIN_PASSWORD: ${SHOP_ADMIN_PASSWORD}  # .env 에 관리자 비밀번호
      COOKIE_SECURE: "1"                      # HTTPS 에서만 로그인 쿠키 전송
      TRUST_PROXY: "1"                        # Caddy 뒤에서 실제 접속 IP 사용
    volumes:
      - shop-data:/shop/data
```

(`volumes:` 목록에 `shop-data:` 추가, `caddy` 의 `depends_on` 에 `shop` 추가)

`Caddyfile` 맨 아래:

```
shop.koreacow.kr {
	encode zstd gzip
	reverse_proxy shop:8100
}
```

> 공개 서버에 올릴 때는 `ADMIN_PASSWORD`를 꼭 환경변수로 지정하세요.
> 지정하지 않으면 `/admin`에 처음 접속한 사람이 비밀번호를 정하게 됩니다.

## 백업

`shop_data.db` 파일과 `uploads/` 폴더를 복사해 두면 됩니다. (둘 다 git에는 올라가지 않습니다)

## 파일 구조

```
hanwoo_shop/
├── shop_app.py        # 진입점 (Flask) — 쇼핑몰 + /admin 백오피스
├── shop_db.py         # SQLite 데이터 계층 (상품·주문·회원·후기·문의·배너·공지)
├── shop_art.py        # 사진이 없을 때 쓰는 부위별 기본 그림(SVG)
├── templates/shop/    # 쇼핑몰 화면
├── templates/admin/   # 백오피스 화면
├── static/            # shop.css, shop.js, admin.css, fonts/(Black Han Sans, OFL)
├── requirements.txt · run_windows.bat · Dockerfile
└── shop_data.db, uploads/   # 실행하면 자동 생성
```
