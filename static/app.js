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

// 품목 폼: '가축'일 때만 입식 체중(kg) 입력칸 표시
(() => {
  const fld = document.getElementById('weightFld');
  if (!fld) return;
  const sel = document.querySelector('select[name="category"]');
  if (!sel) return;
  const sync = () => { fld.style.display = (sel.value === fld.dataset.catOnly) ? '' : 'none'; };
  sel.addEventListener('change', sync);
  sync();
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

// 서비스워커 등록 (휴대폰 홈 화면 설치 + 오프라인 캐시)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  });
}
