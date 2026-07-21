// 신고·이동 이력 등 표(table) 섹션을 만든다.
function buildTraceTable(sec) {
  const wrap = document.createElement('div');
  wrap.className = 'trace-table-wrap';
  const table = document.createElement('table');
  table.className = 'trace-table';
  const thead = document.createElement('thead');
  const htr = document.createElement('tr');
  (sec.columns || []).forEach((col) => {
    const th = document.createElement('th'); th.textContent = col; htr.appendChild(th);
  });
  thead.appendChild(htr);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  (sec.rows || []).forEach((row) => {
    const tr = document.createElement('tr');
    row.forEach((cell) => {
      const td = document.createElement('td'); td.textContent = cell; tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

// 축산물이력제 전체 이력(섹션별)을 펼치기/접기 아코디언으로 그린다.
function renderTrace(container, sections) {
  if (!container) return;
  container.innerHTML = '';
  (sections || []).forEach((sec, si) => {
    const det = document.createElement('details');
    det.className = 'trace-sec';
    if (si === 0 || sec.type === 'table') det.open = true;  // 첫 섹션 + 이력 표는 펼쳐서 시작
    const sum = document.createElement('summary');
    sum.className = 'trace-title';
    const tt = document.createElement('span'); tt.className = 'tt'; tt.textContent = sec.title;
    const cnt = (sec.type === 'table')
      ? (sec.rows || []).length
      : (sec.blocks || []).reduce((a, b) => a + b.length, 0);
    const tc = document.createElement('span'); tc.className = 'tc'; tc.textContent = sec.empty ? 0 : cnt;
    sum.append(tt, tc);
    det.appendChild(sum);
    if (sec.empty) {
      const note = document.createElement('div');
      note.className = 'trace-empty';
      note.textContent = '조회된 기록 없음';
      det.appendChild(note);
    } else if (sec.type === 'table') {
      det.appendChild(buildTraceTable(sec));
    } else {
      (sec.blocks || []).forEach((rows) => {
        const blk = document.createElement('div');
        blk.className = 'trace-block';
        rows.forEach((r) => {
          const row = document.createElement('div');
          row.className = 'trace-row';
          const l = document.createElement('span'); l.className = 'tl'; l.textContent = r.label;
          const v = document.createElement('span'); v.className = 'tv'; v.textContent = r.value;
          row.append(l, v);
          blk.appendChild(row);
        });
        det.appendChild(blk);
      });
    }
    container.appendChild(det);
  });
}

// 이표번호(개체식별번호)로 축산물이력제 전체 이력 조회 → 폼 자동입력 + 이력 표시
async function lookupCattle(input, msgEl, btn, onData, resultEl) {
  const raw = (input.value || '').replace(/[^0-9]/g, '');
  const setMsg = (t, cls) => { if (msgEl) { msgEl.textContent = t; msgEl.className = 'ear-msg' + (cls ? ' ' + cls : ''); } };
  if (raw.length < 10) { setMsg('이표번호(개체식별번호 12자리)를 입력하세요.', 'err'); return; }
  if (btn) btn.disabled = true;
  if (resultEl) resultEl.innerHTML = '';
  setMsg('이력 조회 중…');
  try {
    const res = await fetch('/api/cattle/' + encodeURIComponent(raw), { headers: { 'X-Requested-With': 'fetch' } });
    const d = await res.json();
    if (!d.ok) { setMsg(d.error || '조회에 실패했습니다.', 'err'); return; }
    if (onData) onData(d);
    if (resultEl) renderTrace(resultEl, d.sections);
    const n = (d.sections || []).length;
    setMsg('✓ 이력 ' + n + '개 항목을 불러왔습니다 — 출생일·성별 자동입력됨', 'ok');
  } catch (e) {
    setMsg('조회 중 오류가 발생했습니다(인터넷 연결 확인).', 'err');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// 소 이표·이름 검색 — 농축산 목록을 즉시 걸러낸다
(() => {
  const input = document.getElementById('animalSearch');
  const listEl = document.getElementById('animalList');
  if (!input || !listEl) return;
  const cards = Array.from(listEl.querySelectorAll('.animal'));
  const none = document.getElementById('animalNoResult');
  const clear = document.getElementById('animalSearchClear');
  const run = () => {
    const q = (input.value || '').trim().toLowerCase();
    const qDigits = q.replace(/[^0-9]/g, '');
    if (clear) clear.hidden = !q;
    let shown = 0;
    cards.forEach((c) => {
      let ok = true;
      if (q) {
        const text = c.dataset.search || '';
        const ear = c.dataset.ear || '';
        ok = text.indexOf(q) !== -1 || (qDigits && ear.indexOf(qDigits) !== -1);
      }
      c.style.display = ok ? '' : 'none';
      if (ok) shown++;
    });
    if (none) none.hidden = !(q && shown === 0);
  };
  input.addEventListener('input', run);
  if (clear) clear.addEventListener('click', () => { input.value = ''; run(); input.focus(); });
})();

// 이표 사진 촬영 → OCR(구글 Vision) → 개체식별번호 자동입력 + 이력 조회
(() => {
  // 업로드 전 사진을 줄인다(속도·비용·용량 절감). 실패하면 원본 사용.
  function shrink(file, maxDim, quality) {
    return new Promise((resolve) => {
      try {
        const img = new Image();
        img.onload = () => {
          const s = Math.min(1, maxDim / Math.max(img.width, img.height));
          const w = Math.round(img.width * s), h = Math.round(img.height * s);
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          c.toBlob((b) => resolve(b || file), 'image/jpeg', quality);
          URL.revokeObjectURL(img.src);
        };
        img.onerror = () => resolve(file);
        img.src = URL.createObjectURL(file);
      } catch (e) { resolve(file); }
    });
  }
  // 사진 → 서버 OCR → 결과(JSON) 반환
  async function ocrRaw(file, setMsg) {
    setMsg('📷 사진에서 이표 번호를 읽는 중…');
    const img = await shrink(file, 1600, 0.85);
    const fd = new FormData();
    fd.append('image', img, 'eartag.jpg');
    try {
      const res = await fetch('/api/ocr/eartag', { method: 'POST', body: fd });
      return await res.json();
    } catch (e) {
      return { ok: false, error: 'OCR 요청 실패(인터넷 연결 확인).' };
    }
  }
  // OCR → 이표칸에 채우고 이력 자동조회
  async function ocrToInput(file, input, msgEl, lookupBtn) {
    if (!file || !input) return;
    const setMsg = (t, cls) => {
      if (msgEl) { msgEl.textContent = t; msgEl.className = 'ear-msg' + (cls ? ' ' + cls : ''); }
    };
    const d = await ocrRaw(file, setMsg);
    if (!d.ok) { setMsg(d.error || '사진 인식에 실패했습니다.', 'err'); return; }
    input.value = d.ear_tag;
    setMsg('사진에서 읽은 번호: ' + d.ear_tag + ' — 다르면 고친 뒤 조회하세요.', 'ok');
    if (lookupBtn) lookupBtn.click();
  }
  // 품목 다이얼로그를 '가축 추가' 빈 모드로 연다
  function openItemFresh() {
    const dlg = document.getElementById('itemDialog');
    if (!dlg) return null;
    dlg.querySelectorAll('input, select, textarea').forEach((el) => {
      if (el.type === 'hidden') { if (el.name === 'id') el.value = ''; return; }
      if (el.type === 'checkbox' || el.type === 'radio') el.checked = el.defaultChecked;
      else if (el.type === 'date' || el.type === 'month') { /* 기본 유지 */ }
      else if (el.tagName === 'SELECT') el.selectedIndex = 0;
      else el.value = '';
    });
    const cat = dlg.querySelector('select[name="category"]');
    if (cat) { cat.value = '가축'; cat.dispatchEvent(new Event('change')); }
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    return dlg;
  }
  // 다이얼로그 이표칸 옆 📷
  function wireCam(camId, fileId, inputId, msgId, lookupBtnId) {
    const cam = document.getElementById(camId), file = document.getElementById(fileId);
    if (!cam || !file) return;
    cam.addEventListener('click', () => file.click());
    file.addEventListener('change', () => {
      ocrToInput(file.files[0], document.getElementById(inputId),
                 document.getElementById(msgId), document.getElementById(lookupBtnId));
      file.value = '';
    });
  }
  wireCam('itemEarCam', 'itemEarFile', 'itemEar', 'itemEarMsg', 'itemEarBtn');
  wireCam('cowEarCam', 'cowEarFile', 'cowEar', 'cowEarMsg', 'cowEarBtn');

  // 농축산: '이표 사진으로 소 등록' → 탭하면 바로 카메라/갤러리 → 사진 뒤 등록창 열려 자동입력
  (() => {
    const btn = document.getElementById('scanEarBtn');
    const file = document.getElementById('scanFile');
    if (!btn || !file) return;
    btn.addEventListener('click', () => file.click());
    file.addEventListener('change', () => {
      const f = file.files[0]; file.value = '';
      if (!f) return;
      openItemFresh();
      ocrToInput(f, document.getElementById('itemEar'),
                 document.getElementById('itemEarMsg'), document.getElementById('itemEarBtn'));
    });
  })();

  // 홈: '이표 사진으로 소 등록' → 카메라/갤러리 → OCR 후 농축산 등록창으로 이동
  (() => {
    const btn = document.getElementById('scanEarHomeBtn');
    const file = document.getElementById('scanFileHome');
    if (!btn || !file) return;
    btn.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const f = file.files[0]; file.value = '';
      if (!f) return;
      const label = btn.querySelector('b');
      const orig = label ? label.textContent : '';
      if (label) label.textContent = '사진 읽는 중…';
      btn.style.opacity = '.7'; btn.style.pointerEvents = 'none';
      const d = await ocrRaw(f, () => {});
      if (d.ok) {
        location.href = '/livestock?add_ear=' + encodeURIComponent(d.ear_tag);
      } else {
        alert(d.error || '사진에서 번호를 찾지 못했습니다. 다시 찍어주세요.');
        if (label) label.textContent = orig;
        btn.style.opacity = ''; btn.style.pointerEvents = '';
      }
    });
  })();

  // 홈에서 넘어옴(?add_ear=...): 등록창을 열고 번호 채워 이력 조회
  (() => {
    const ear = new URLSearchParams(location.search).get('add_ear');
    if (!ear) return;
    if (!openItemFresh()) return;
    const input = document.getElementById('itemEar');
    if (input) input.value = ear;
    const lb = document.getElementById('itemEarBtn');
    if (lb) setTimeout(() => lb.click(), 120);
  })();
})();

// 글자 크게/작게 — 헤더의 가–/가+ (기기에 저장)
(() => {
  const KEY = 'fscale';
  const clamp = (v) => Math.min(1.4, Math.max(0.9, v));
  const read = () => clamp(parseFloat(localStorage.getItem(KEY) || '1') || 1);
  const apply = (v) => document.documentElement.style.setProperty('--fscale', v);
  apply(read());
  const bump = (d) => { const v = clamp(read() + d); localStorage.setItem(KEY, v); apply(v); };
  const plus = document.getElementById('fsPlus');
  const minus = document.getElementById('fsMinus');
  if (plus) plus.addEventListener('click', () => bump(0.1));
  if (minus) minus.addEventListener('click', () => bump(-0.1));
})();

// 헤더 ⋮ 메뉴 팝업만: 바깥을 누르면 닫기
// (이력 아코디언 details.trace-sec 등 다른 details는 건드리지 않아 개별로 여닫힌다)
document.addEventListener('click', (e) => {
  document.querySelectorAll('.menu > details[open]').forEach((d) => {
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
  const cowOwnerSel = document.getElementById('cowOwnerSel');
  const cowTypeSel = document.getElementById('cowTypeSel');
  const cowBarnSel = document.getElementById('cowBarnSel');
  // 셀렉트 값 지정(목록에 없으면 옵션 추가 — 기존 소의 명의/축사 보존)
  const setSelect = (sel, val) => {
    if (!sel) return;
    if (val && !Array.from(sel.options).some((o) => o.value === val)) {
      sel.add(new Option(val, val));
    }
    sel.value = val || '';
  };
  const syncCowCast = () => {
    if (cowCastFld) cowCastFld.style.display =
      (cowSexSel && cowSexSel.value === '수') ? '' : 'none';
  };
  if (cowSexSel) cowSexSel.addEventListener('change', syncCowCast);

  // 정보 팝업: 이표번호 '조회' → 출생일·성별 자동입력 + 전체 이력 표시
  const cowEarBtn = document.getElementById('cowEarBtn');
  const cowEarInput = document.getElementById('cowEar');
  const cowEarMsg = document.getElementById('cowEarMsg');
  const cowBirthInput = document.getElementById('cowBirth');
  const cowTraceResult = document.getElementById('cowTraceResult');
  const cowFill = (d) => {
    if (d.birth_date && cowBirthInput) cowBirthInput.value = d.birth_date;
    if (d.sex && cowSexSel) {
      cowSexSel.value = (d.sex === '거세') ? '수' : d.sex;
      if (cowCastSel) cowCastSel.value = (d.sex === '거세') ? '1' : '';
      syncCowCast();
    }
  };
  const cowGo = () => lookupCattle(cowEarInput, cowEarMsg, cowEarBtn, cowFill, cowTraceResult);
  if (cowEarBtn) {
    cowEarBtn.addEventListener('click', cowGo);
    cowEarInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); cowGo(); } });
  }

  // 사료 급여 이력: (명의+구분)이 일치하는 사료 구매 내역을 소 정보에 표시
  const feedWrap = document.getElementById('cowFeedingWrap');
  const feedListEl = document.getElementById('cowFeeding');
  const feedTotalEl = document.getElementById('cowFeedTotal');
  const loadFeeding = async (owner, ctype) => {
    if (!feedWrap) return;
    feedWrap.hidden = true;
    if (feedListEl) feedListEl.innerHTML = '';
    if (!owner || !ctype) return;
    try {
      const res = await fetch('/api/feeding?owner=' + encodeURIComponent(owner)
        + '&cattle_type=' + encodeURIComponent(ctype));
      const d = await res.json();
      if (!d.ok || !d.items || !d.items.length) return;
      d.items.forEach((it) => {
        const row = document.createElement('div');
        row.className = 'cf-row';
        const l = document.createElement('span');
        l.className = 'cf-l';
        l.textContent = it.date + ' · ' + it.feed_name
          + (it.quantity ? ' (' + it.quantity + (it.unit || '') + ')' : '');
        const v = document.createElement('span');
        v.className = 'cf-v';
        v.textContent = won(it.amount) + '원';
        row.append(l, v);
        feedListEl.appendChild(row);
      });
      if (feedTotalEl) feedTotalEl.textContent = '합계 ' + won(d.total) + '원';
      feedWrap.hidden = false;
    } catch (e) { /* 무시 */ }
  };

  document.querySelectorAll('.cow-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const d = btn.dataset;
      form.action = d.action;
      document.getElementById('cowName').textContent = d.name || '소';

      // ── 요약(읽기 전용) ──
      setSelect(cowOwnerSel, d.owner);
      setSelect(cowTypeSel, d.type);
      setSelect(cowBarnSel, d.barn);
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

      // 이 소(명의+구분)의 사료 급여 이력 불러오기
      loadFeeding(d.owner, d.type);

      // ── 입력 폼(현재 저장된 값) ──
      document.getElementById('cowEar').value = d.ear || '';
      if (cowEarMsg) { cowEarMsg.textContent = ''; cowEarMsg.className = 'ear-msg'; }
      if (cowTraceResult) cowTraceResult.innerHTML = '';
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

      // 자동 갱신: 이표번호가 저장돼 있으면 열자마자 최신 이력을 다시 불러온다
      if (cowEarBtn && (d.ear || '').replace(/[^0-9]/g, '').length >= 10) cowGo();
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

// 등록/수정 폼: 이표번호 '조회' → 출생일·성별·품종 자동입력
(() => {
  const btn = document.getElementById('itemEarBtn');
  if (!btn) return;
  const ear = document.getElementById('itemEar');
  const msg = document.getElementById('itemEarMsg');
  const birth = document.getElementById('itemBirth');
  const sex = document.getElementById('itemSex');
  const cast = document.getElementById('itemCastrated');
  const castFld = document.getElementById('castrateFld');
  const nameInput = document.querySelector('#itemDialog [name="name"]');
  const qtyInput = document.querySelector('#itemDialog [name="quantity"]');
  const unitInput = document.querySelector('#itemDialog [name="unit"]');
  const ownerSel = document.querySelector('#itemDialog [name="owner"]');
  const result = document.getElementById('itemTraceResult');
  // 이표번호 = 소 한 마리 → 수량 1, 단위 '두' 자동(비어 있을 때만)
  const setOneHead = () => {
    if (qtyInput && !qtyInput.value.trim()) qtyInput.value = '1';
    if (unitInput && !unitInput.value.trim()) unitInput.value = '두';
  };
  const fill = (d) => {
    setOneHead();
    if (d.birth_date && birth) birth.value = d.birth_date;
    if (d.sex && sex) {
      sex.value = (d.sex === '거세') ? '수' : d.sex;
      if (cast) cast.value = (d.sex === '거세') ? '1' : '';
      if (castFld) castFld.style.display = (sex.value === '수') ? '' : 'none';
    }
    if (d.breed && nameInput && !nameInput.value.trim()) nameInput.value = d.breed;
    // 소유주 → 명의 드롭다운에 자동입력(목록에 없으면 새 항목으로 추가)
    if (d.farmer && ownerSel) {
      if (!Array.from(ownerSel.options).some((o) => o.value === d.farmer)) {
        ownerSel.add(new Option(d.farmer, d.farmer));
      }
      ownerSel.value = d.farmer;
    }
  };
  const go = () => lookupCattle(ear, msg, btn, fill, result);
  btn.addEventListener('click', go);
  ear.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  // 조회 전이라도 이표번호를 유효하게 입력하면 1두 자동
  ear.addEventListener('input', () => {
    if (ear.value.replace(/[^0-9]/g, '').length >= 10) setOneHead();
  });
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

// 사료 일괄 등록: 품목별 수량 × 단가 → 금액 자동 계산
(() => {
  const dlg = document.getElementById('bulkFeedDialog');
  if (!dlg) return;
  dlg.querySelectorAll('.bf-row').forEach((row) => {
    const qty = row.querySelector('[name^="qty_"]');
    const price = row.querySelector('[name^="price_"]');
    const amount = row.querySelector('[name^="amount_"]');
    if (!qty || !price || !amount) return;
    let touched = amount.value !== '';
    amount.addEventListener('input', () => { touched = true; });
    const sync = () => {
      if (touched) return;
      const q = parseFloat(qty.value) || 0, p = parseFloat(price.value) || 0;
      amount.value = (q && p) ? Math.round(q * p) : '';
    };
    qty.addEventListener('input', sync);
    price.addEventListener('input', sync);
  });
})();

// 사료 일괄 등록: 명의·축사 선택 → 보유 두수(임신우·육성·송아지)를 수량(두)에 자동입력
(() => {
  const dlg = document.getElementById('bulkFeedDialog');
  if (!dlg) return;
  const owner = document.getElementById('bulkOwner');
  const barn = document.getElementById('bulkBarn');
  const msg = document.getElementById('bulkCountMsg');
  if (!owner) return;
  const fillCounts = async () => {
    if (!owner.value) { if (msg) { msg.textContent = ''; msg.className = 'ear-msg'; } return; }
    if (msg) { msg.textContent = '두수 확인 중…'; msg.className = 'ear-msg'; }
    try {
      const res = await fetch('/api/cow_counts?owner=' + encodeURIComponent(owner.value)
        + '&barn=' + encodeURIComponent(barn ? barn.value : ''));
      const d = await res.json();
      const counts = (d && d.counts) || {};
      let total = 0;
      dlg.querySelectorAll('[data-type]').forEach((q) => {
        const n = counts[q.dataset.type] || 0;
        q.value = n ? n : '';
        total += n;
        q.dispatchEvent(new Event('input', { bubbles: true }));   // 금액 자동계산 트리거
      });
      if (msg) {
        const parts = Object.keys(counts).filter((k) => counts[k]).map((k) => k + ' ' + counts[k] + '두');
        msg.textContent = total ? ('보유 두수 자동입력 — ' + parts.join(' · ')) : '해당 명의/축사에 진행중인 소가 없습니다.';
        msg.className = 'ear-msg' + (total ? ' ok' : '');
      }
    } catch (e) {
      if (msg) { msg.textContent = '두수 조회 중 오류'; msg.className = 'ear-msg err'; }
    }
  };
  owner.addEventListener('change', fillCounts);
  if (barn) barn.addEventListener('change', fillCounts);
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
