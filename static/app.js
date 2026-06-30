// 메뉴 팝업: 바깥을 누르면 닫기
document.addEventListener('click', (e) => {
  document.querySelectorAll('details[open]').forEach((d) => {
    if (!d.contains(e.target)) d.removeAttribute('open');
  });
});

// 판매 입력 팝업 (농축산 화면)
(() => {
  const dlg = document.getElementById('sellDialog');
  if (!dlg) return;
  const form = document.getElementById('sellForm');

  document.querySelectorAll('.sell-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const d = btn.dataset;
      form.action = '/livestock/' + d.id + '/sell';
      document.getElementById('sellName').textContent = d.name;
      document.getElementById('sellAmount').value = d.amount || '';
      document.getElementById('sellWeight').value = d.weight || '';
      document.getElementById('sellGrade').value = d.grade || '';
      if (d.date) document.getElementById('sellDate').value = d.date;
      document.getElementById('sellNote').value = '';
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');
    });
  });

  dlg.querySelectorAll('[data-close]').forEach((b) =>
    b.addEventListener('click', () => dlg.close()));
  // 바깥(backdrop) 클릭 시 닫기
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
})();

// 소 개체 정보 팝업 (농축산 화면) — 각 소마다 정보를 보고 입력한다.
(() => {
  const dlg = document.getElementById('cowDialog');
  if (!dlg) return;
  const form = document.getElementById('cowForm');

  const num = (v) => Number(String(v).replace(/,/g, '')) || 0;
  const won = (v) => num(v).toLocaleString('ko-KR');
  // 두 날짜(YYYY-MM-DD) 사이의 일수
  const daysBetween = (from, to) => {
    const a = new Date(from), b = to ? new Date(to) : new Date();
    if (isNaN(a)) return null;
    return Math.floor((b - a) / 86400000);
  };
  // 요약 한 줄: 값이 있으면 채우고, 없으면 행을 숨긴다.
  const setRow = (key, text) => {
    const row = dlg.querySelector(`.r[data-row="${key}"]`);
    if (!row) return;
    if (text) { row.querySelector('.v').textContent = text; row.hidden = false; }
    else { row.hidden = true; }
  };

  // ── 건강·진료·방역 메모: 일정처럼 하나씩 추가되는 목록 ──
  const todayStr = () => {
    const t = new Date(), z = (n) => String(n).padStart(2, '0');
    return `${t.getFullYear()}-${z(t.getMonth() + 1)}-${z(t.getDate())}`;
  };
  const memoList = document.getElementById('cowMemoList');
  const memoHidden = document.getElementById('cowHealth');
  const memoDate = document.getElementById('cowMemoDate');
  const memoText = document.getElementById('cowMemoText');
  const memoAddBtn = document.getElementById('cowMemoAdd');
  let memos = [];                          // [{date, text}]
  // 저장은 줄 단위 "YYYY-MM-DD 내용"(날짜 없으면 내용만) → health_note 컬럼.
  const memoSerialize = () =>
    memos.map((m) => (m.date ? m.date + ' ' : '') + m.text).join('\n');
  const memoParse = (raw) => (raw || '').split('\n')
    .map((s) => s.trim()).filter(Boolean)
    .map((line) => {
      const m = line.match(/^(\d{4}-\d{2}-\d{2})\s+(.*)$/);
      return m ? { date: m[1], text: m[2] } : { date: '', text: line };
    });
  const memoRender = () => {
    if (!memoList) return;
    memoList.innerHTML = '';
    memos.forEach((m, i) => {
      const li = document.createElement('li');
      const info = document.createElement('span');
      info.className = 'mi';
      info.textContent = (m.date ? m.date + ' · ' : '') + m.text;
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'mx';
      del.textContent = '✕';
      del.setAttribute('aria-label', '메모 삭제');
      del.addEventListener('click', () => { memos.splice(i, 1); memoRender(); });
      li.append(info, del);
      memoList.appendChild(li);
    });
    if (memoHidden) memoHidden.value = memoSerialize();
  };
  const memoAddNow = () => {
    const text = (memoText.value || '').trim();
    if (!text) { memoText.focus(); return; }
    memos.push({ date: memoDate.value || '', text });
    memoText.value = '';
    memoRender();
    memoText.focus();
  };
  if (memoAddBtn) memoAddBtn.addEventListener('click', memoAddNow);
  [memoText, memoDate].forEach((el) => el && el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); memoAddNow(); }   // Enter로 폼 제출 방지
  }));

  // ── 성별/거세여부: 수컷일 때만 거세여부 드롭다운 표시 ──
  const cowSexSel = document.getElementById('cowSex');
  const cowCastSel = document.getElementById('cowCastrated');
  const cowCastFld = document.getElementById('cowCastrateFld');
  const syncCowCast = () => {
    if (cowCastFld) cowCastFld.style.display =
      (cowSexSel && cowSexSel.value === '수') ? '' : 'none';
  };
  if (cowSexSel) cowSexSel.addEventListener('change', syncCowCast);

  document.querySelectorAll('.cow-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const d = btn.dataset;
      form.action = d.action;
      document.getElementById('cowName').textContent = d.name || '소';

      // ── 요약(읽기 전용) ──
      setRow('type', d.type);
      setRow('owner', d.owner);
      setRow('qty', d.qty ? d.qty + (d.unit || '') : '');
      setRow('weight', d.weight ? d.weight + 'kg' : '');
      const days = daysBetween(d.start, d.soldDate);
      setRow('raise', d.start
        ? d.start + (days != null ? ` · ${days}일째` : '')
        : '');
      setRow('status', d.status);
      if (d.soldDate) {
        const parts = [d.soldDate];
        if (d.soldGrade) parts.push(d.soldGrade + '등급');
        if (num(d.soldAmount)) parts.push(won(d.soldAmount) + '원');
        if (d.soldWeight) {
          let w = '출하 ' + d.soldWeight + 'kg';
          if (d.weight) w += ` (성장 +${(num(d.soldWeight) - num(d.weight))}kg)`;
          parts.push(w);
        }
        setRow('sold', parts.join(' · '));
      } else { setRow('sold', ''); }

      // ── 입력 폼(현재 저장된 값) ──
      document.getElementById('cowEar').value = d.ear || '';
      document.getElementById('cowBirth').value = d.birth || '';
      // 성별: 저장값 '거세'면 성별=수 + 거세여부=거세 로 펼친다
      const sx = d.sex || '';
      if (cowSexSel) cowSexSel.value = (sx === '거세') ? '수' : sx;
      if (cowCastSel) cowCastSel.value = (sx === '거세') ? '1' : '';
      syncCowCast();
      document.getElementById('cowDam').value = d.dam || '';
      // 건강·진료·방역 메모: 저장된 값을 항목 목록으로 펼치고, 새 입력칸은 오늘 날짜로
      memos = memoParse(d.health);
      if (memoDate) memoDate.value = todayStr();
      if (memoText) memoText.value = '';
      memoRender();

      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');
    });
  });

  dlg.querySelectorAll('[data-close]').forEach((b) =>
    b.addEventListener('click', () => dlg.close()));
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
})();

// 공통 팝업(모달): 추가/수정 폼을 다이얼로그로 띄운다.
//  - [data-open="dlgId"]            : 클릭 시 해당 다이얼로그 열기
//  - [data-open=..][data-fresh]     : 열기 전에 폼을 비워서 '추가' 모드로
//  - dialog[data-autoopen]          : 페이지 로드시 자동으로 열기(서버가 수정모드일 때)
//  - dialog 안의 [data-close]·바깥클릭 : 닫기
(() => {
  const open = (dlg) => { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); };
  const freshen = (dlg) => {
    dlg.querySelectorAll('input, select, textarea').forEach((el) => {
      if (el.type === 'hidden') { if (el.name === 'id') el.value = ''; return; }
      if (el.type === 'checkbox' || el.type === 'radio') el.checked = el.defaultChecked;
      else if (el.type === 'date' || el.type === 'month') { /* 기본 날짜 유지 */ }
      else if (el.tagName === 'SELECT') el.selectedIndex = 0;
      else el.value = '';
    });
  };
  document.querySelectorAll('[data-open]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dlg = document.getElementById(btn.dataset.open);
      if (!dlg) return;
      if (btn.hasAttribute('data-fresh')) freshen(dlg);
      open(dlg);
    });
  });
  document.querySelectorAll('dialog.modal').forEach((dlg) => {
    dlg.querySelectorAll('[data-close]').forEach((b) =>
      b.addEventListener('click', () => dlg.close()));
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  });
  // 서버가 수정모드로 내려준 다이얼로그는 자동으로 연다.
  // (하위탭 표시 스크립트가 먼저 패널을 보이게 한 뒤 열리도록 다음 프레임에 실행)
  requestAnimationFrame(() =>
    document.querySelectorAll('dialog[data-autoopen]').forEach(open));
})();

// 품목 폼: '가축'일 때만 입식 체중(kg) 입력칸 표시
(() => {
  const flds = document.querySelectorAll('[data-cat-only]');
  if (!flds.length) return;
  const sel = document.querySelector('select[name="category"]');
  if (!sel) return;
  const sync = () => flds.forEach((f) => {
    f.style.display = (sel.value === f.dataset.catOnly) ? '' : 'none';
  });
  sel.addEventListener('change', sync);
  sync();
})();

// 품목 폼: 성별 '수'이고 '가축'일 때만 거세여부 드롭다운 표시
(() => {
  const cat = document.querySelector('select[name="category"]');
  const sex = document.getElementById('itemSex');
  const cast = document.getElementById('castrateFld');
  if (!cat || !sex || !cast) return;
  const sync = () => {
    cast.style.display = (cat.value === '가축' && sex.value === '수') ? '' : 'none';
  };
  cat.addEventListener('change', sync);
  sex.addEventListener('change', sync);
  sync();
})();

// 사료 구매: 품목 → 단가 자동입력, 수량 × 단가 → 사료값 자동 계산
(() => {
  const qty = document.getElementById('feedQty');
  const price = document.getElementById('feedPrice');
  const amount = document.getElementById('feedAmount');
  const type = document.getElementById('feedType');
  if (!qty || !price || !amount) return;
  let touched = amount.value !== '';   // 기존값(수정)·직접입력이면 자동계산 끔
  amount.addEventListener('input', () => { touched = true; });
  const sync = () => {
    if (touched) return;
    const q = parseFloat(qty.value) || 0;
    const p = parseFloat(price.value) || 0;
    amount.value = q && p ? Math.round(q * p) : '';
  };
  // 품목 선택 시 설정된 품목별 단가를 단가 칸에 채운다(단가가 비어있을 때만).
  if (type) {
    let prices = {};
    try { prices = JSON.parse(type.dataset.prices || '{}'); } catch (e) { prices = {}; }
    type.addEventListener('change', () => {
      const p = prices[type.value];
      if (p && !price.value) { price.value = p; sync(); }
      else if (p) { price.value = p; sync(); }
    });
  }
  qty.addEventListener('input', sync);
  price.addEventListener('input', sync);
})();

// 비밀번호 변경 — 헤더 메뉴
(() => {
  const btn = document.getElementById('pwBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const cur = window.prompt('현재 비밀번호를 입력하세요.');
    if (cur === null) return;
    const nw = window.prompt('새 비밀번호를 입력하세요. (4자 이상)');
    if (nw === null) return;
    document.getElementById('pwCur').value = cur;
    document.getElementById('pwNew').value = nw;
    document.getElementById('pwForm').submit();
  });
})();

// 관리자: 작업 완료 알림 — 주기적으로 확인해 브라우저 푸시 알림을 띄운다.
(() => {
  const el = document.getElementById('notifApi');
  if (!el || !document.body.dataset.admin) return;
  const url = el.dataset.url;
  // 알림 권한 요청(가능하면)
  if ('Notification' in window && Notification.permission === 'default') {
    try { Notification.requestPermission(); } catch (e) { /* ignore */ }
  }
  const seenKey = 'workNotifSeen';
  const seen = new Set(JSON.parse(sessionStorage.getItem(seenKey) || '[]'));
  let first = true;
  const poll = async () => {
    try {
      const res = await fetch(url, { headers: { 'X-Requested-With': 'fetch' } });
      if (!res.ok) return;
      const data = await res.json();
      (data.items || []).forEach((it) => {
        if (seen.has(it.id)) return;
        seen.add(it.id);
        if (!first && 'Notification' in window && Notification.permission === 'granted') {
          new Notification('작업 완료', { body: `${it.who} — ${it.title}` });
        }
      });
      sessionStorage.setItem(seenKey, JSON.stringify([...seen]));
      first = false;
    } catch (e) { /* offline 등 무시 */ }
  };
  poll();
  setInterval(poll, 20000);
})();

// 농장(앱) 이름 변경 — 헤더 메뉴
(() => {
  const btn = document.getElementById('renameBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const cur = btn.dataset.current || '';
    const name = window.prompt('새 이름을 입력하세요.', cur);
    if (name === null) return;            // 취소
    const v = name.trim();
    if (!v) return;
    document.getElementById('renameInput').value = v;
    document.getElementById('renameForm').submit();
  });
})();

// 하위 탭(세그먼트) — 재무·농축산 등에서 공용
(() => {
  const tabs = document.querySelector('.subtabs');
  if (!tabs) return;
  const panes = document.querySelectorAll('.tabpane');
  const buttons = tabs.querySelectorAll('[data-tab]');
  const keys = Array.from(buttons).map((b) => b.dataset.tab);
  const show = (key) => {
    buttons.forEach((b) => b.classList.toggle('on', b.dataset.tab === key));
    panes.forEach((p) => { p.hidden = (p.dataset.pane !== key); });
  };
  buttons.forEach((b) =>
    b.addEventListener('click', () => {
      show(b.dataset.tab);
      history.replaceState(null, '', '#' + b.dataset.tab);
    }));
  const fromHash = (location.hash || '').replace('#', '');
  show(keys.includes(fromHash) ? fromHash : (tabs.dataset.default || keys[0]));
})();

// 앱 설치(홈 화면에 추가) — 헤더 메뉴
(() => {
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
  });
  const btn = document.getElementById('installBtn');
  if (!btn) return;
  const standalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  if (standalone) { btn.textContent = '앱으로 실행 중 ✓'; btn.disabled = true; return; }
  btn.addEventListener('click', async () => {
    if (deferred) {
      deferred.prompt();
      await deferred.userChoice.catch(() => {});
      deferred = null;
    } else {
      window.alert(
        '앱(홈 화면)으로 추가하는 방법:\n\n' +
        '• 아이폰(Safari): 아래 공유 버튼 ⤴ → "홈 화면에 추가"\n' +
        '• 안드로이드(Chrome): 메뉴 ⋮ → "앱 설치" 또는 "홈 화면에 추가"\n' +
        '• PC(Chrome/Edge): 주소창 오른쪽 설치 아이콘 ⊕'
      );
    }
  });
})();

// 홈 날씨 위젯 (Open-Meteo, 키 불필요 · 브라우저에서 직접 호출)
(() => {
  const wx = document.getElementById('wx');
  if (!wx) return;
  const lat = wx.dataset.lat, lon = wx.dataset.lon;
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${lat}&longitude=${lon}`
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min'
    + '&timezone=Asia%2FSeoul&forecast_days=2';
  const icon = (c) => {
    if (c === 0) return ['☀', '맑음'];
    if (c <= 2) return ['⛅', '구름조금'];
    if (c === 3) return ['☁', '흐림'];
    if (c <= 48) return ['🌫', '안개'];
    if (c <= 57) return ['🌦', '이슬비'];
    if (c <= 67) return ['🌧', '비'];
    if (c <= 77) return ['🌨', '눈'];
    if (c <= 82) return ['🌦', '소나기'];
    if (c <= 86) return ['🌨', '눈'];
    return ['⛈', '뇌우'];
  };
  const rows = wx.querySelectorAll('.wx-row');
  fetch(url)
    .then((r) => r.json())
    .then((d) => {
      const dd = d.daily;
      [0, 1].forEach((i) => {
        if (!rows[i] || dd.temperature_2m_max[i] == null) return;
        const [ic, label] = icon(dd.weather_code[i]);
        const hi = Math.round(dd.temperature_2m_max[i]);
        const lo = Math.round(dd.temperature_2m_min[i]);
        rows[i].querySelector('.wx-ic').textContent = ic;
        rows[i].querySelector('.wx-ic').title = label;
        rows[i].querySelector('.wx-t').textContent = `${hi}° / ${lo}°`;
      });
    })
    .catch(() => {
      wx.querySelectorAll('.wx-t').forEach((e) => { e.textContent = '—'; });
      wx.title = '날씨 정보를 불러올 수 없습니다(오프라인)';
    });
})();

// 서비스워커 등록 (휴대폰 홈 화면 설치 + 오프라인 캐시)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  });
}
