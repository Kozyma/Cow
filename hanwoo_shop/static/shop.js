/* 한우의 기준 — 쇼핑몰 화면 동작 */
(function () {
  var won = function (n) { return n.toLocaleString('ko-KR') + '원'; };

  /* 메인 배너 */
  document.querySelectorAll('[data-slider]').forEach(function (root) {
    var slides = root.querySelectorAll('.slide');
    if (slides.length < 2) return;
    var cur = 0, timer = null, label = root.querySelector('[data-cur]');
    var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function go(n) {
      slides[cur].classList.remove('on');
      cur = (n + slides.length) % slides.length;
      slides[cur].classList.add('on');
      if (label) label.textContent = cur + 1;
    }
    function play() { if (!still) timer = setInterval(function () { go(cur + 1); }, 6000); }
    function stop() { clearInterval(timer); }
    root.querySelector('[data-prev]').addEventListener('click', function () { stop(); go(cur - 1); });
    root.querySelector('[data-next]').addEventListener('click', function () { stop(); go(cur + 1); });
    root.addEventListener('mouseenter', stop);
    root.addEventListener('mouseleave', function () { stop(); play(); });
    root.addEventListener('focusin', stop);
    play();
  });

  /* 수량과 합계 */
  document.querySelectorAll('[data-qty]').forEach(function (form) {
    var input = form.querySelector('input[name=qty]');
    var total = form.querySelector('[data-total]');
    var price = +form.dataset.price, max = +form.dataset.max || 99;
    function set(v) {
      v = Math.max(1, Math.min(max, v || 1));
      input.value = v;
      if (total) total.textContent = won(price * v);
    }
    form.querySelectorAll('[data-step]').forEach(function (b) {
      b.addEventListener('click', function () { set(+input.value + +b.dataset.step); });
    });
    input.addEventListener('change', function () { set(+input.value); });
  });

  /* 상품 사진 바꿔 보기 */
  var main = document.getElementById('pd-main');
  document.querySelectorAll('[data-thumb]').forEach(function (b) {
    b.addEventListener('click', function () {
      main.src = b.dataset.thumb;
      document.querySelectorAll('[data-thumb]').forEach(function (x) { x.classList.toggle('on', x === b); });
    });
  });

  /* 주소 찾기 (다음 우편번호 서비스) */
  document.querySelectorAll('[data-addr]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var form = btn.closest('form');
      function open() {
        new daum.Postcode({ oncomplete: function (d) {
          form.querySelector('[data-zip]').value = d.zonecode;
          form.querySelector('[data-addr1]').value = d.roadAddress || d.jibunAddress;
          form.querySelector('[data-addr2]').focus();
        } }).open();
      }
      if (window.daum && daum.Postcode) return open();
      var s = document.createElement('script');
      s.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
      s.onload = open;
      s.onerror = function () { btn.textContent = '주소를 직접 입력해 주세요'; btn.disabled = true; };
      document.head.appendChild(s);
    });
  });
})();
