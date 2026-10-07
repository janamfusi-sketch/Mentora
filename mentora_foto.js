/* =====================================================================
   Mentóra — AJUSTE DA FOTO DE PERFIL (03/10/2026)
   Antes de enviar, o mentor enquadra a foto: arrasta para posicionar,
   usa o zoom (barra, roda do mouse ou pinça no celular) e vê como ela fica
   no círculo da comunidade ou no quadrado. A foto é salva quadrada (512 px),
   já recortada, então nunca aparece cortada pela metade.
   Uso: const arquivo = await MentoraFoto.ajustar(file);  // null = cancelou
   ===================================================================== */
(function () {
  'use strict';
  var LADO_SAIDA = 512;

  function carregar(file) {
    return new Promise(function (ok, erro) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { ok({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); erro(new Error('Não foi possível abrir esta imagem. Escolha um arquivo JPG, PNG ou WebP.')); };
      img.src = url;
    });
  }

  function ajustar(file, op) {
    op = op || {};
    return carregar(file).then(function (r) {
      return new Promise(function (resolve) {
        var img = r.img;
        var forma = op.forma === 'quadrado' ? 'quadrado' : 'redondo';
        var fundo = document.createElement('div');
        fundo.className = 'mfa-fundo';
        fundo.innerHTML =
          '<div class="mfa-caixa" role="dialog" aria-modal="true" aria-labelledby="mfa-tit">' +
            '<div class="mfa-tit" id="mfa-tit">Ajustar foto de perfil</div>' +
            '<div class="mfa-sub">Arraste a foto para enquadrar e use o zoom. Deixe o rosto no centro.</div>' +
            '<div class="mfa-palco"><canvas class="mfa-canvas"></canvas><div class="mfa-mascara"></div></div>' +
            '<div class="mfa-zoom"><span>Zoom</span><input type="range" class="mfa-range" min="1" max="4" step="0.01" value="1" aria-label="Zoom"></div>' +
            '<div class="mfa-formas" role="group" aria-label="Formato da prévia">' +
              '<button type="button" data-forma="redondo">Redondo</button><button type="button" data-forma="quadrado">Quadrado</button>' +
            '</div>' +
            '<div class="mfa-nota">A comunidade mostra a foto em círculo. Ela é salva quadrada, já enquadrada.</div>' +
            '<div class="mfa-botoes"><button type="button" class="mfa-b2" data-acao="cancelar">Cancelar</button><button type="button" class="mfa-b1" data-acao="usar">Usar esta foto</button></div>' +
          '</div>';
        document.body.appendChild(fundo);
        var palco = fundo.querySelector('.mfa-palco'), cv = fundo.querySelector('.mfa-canvas'), ctx = cv.getContext('2d');
        var range = fundo.querySelector('.mfa-range'), mascara = fundo.querySelector('.mfa-mascara');
        var S = 280, dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
        var est = { z: 1, x: 0, y: 0 }; // x, y = deslocamento do centro da foto em relação ao centro do quadro (px da tela)

        function base() { return Math.max(S / img.naturalWidth, S / img.naturalHeight); }
        function limitar() {
          var e = base() * est.z, w = img.naturalWidth * e, h = img.naturalHeight * e;
          var mx = Math.max(0, (w - S) / 2), my = Math.max(0, (h - S) / 2);
          est.x = Math.max(-mx, Math.min(mx, est.x)); est.y = Math.max(-my, Math.min(my, est.y));
        }
        function desenhar(c, lado, escalaTela) {
          var k = lado / S, e = base() * est.z * k, w = img.naturalWidth * e, h = img.naturalHeight * e;
          c.fillStyle = '#ffffff'; c.fillRect(0, 0, lado * (escalaTela || 1), lado * (escalaTela || 1));
          c.save(); if (escalaTela) c.scale(escalaTela, escalaTela);
          c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
          c.drawImage(img, lado / 2 - w / 2 + est.x * k, lado / 2 - h / 2 + est.y * k, w, h);
          c.restore();
        }
        function medir() {
          S = Math.round(palco.getBoundingClientRect().width) || 280;
          cv.width = S * dpr; cv.height = S * dpr; cv.style.width = S + 'px'; cv.style.height = S + 'px';
          limitar(); desenhar(ctx, S, dpr);
        }
        function trocarForma(f) {
          forma = f; mascara.classList.toggle('quadrado', f === 'quadrado');
          fundo.querySelectorAll('.mfa-formas button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-forma') === f); b.setAttribute('aria-pressed', b.getAttribute('data-forma') === f ? 'true' : 'false'); });
        }
        function zoomPara(z, cx, cy) {
          z = Math.max(1, Math.min(4, z));
          // mantém o ponto sob o dedo/mouse no mesmo lugar
          if (cx != null) { var f = z / est.z; est.x = cx - (cx - est.x) * f; est.y = cy - (cy - est.y) * f; }
          est.z = z; range.value = String(z); limitar(); desenhar(ctx, S, dpr);
        }

        // arrastar e pinça (mouse, caneta e toque)
        var ponteiros = {}, inicio = null;
        function pos(ev) { var b = palco.getBoundingClientRect(); return { x: ev.clientX - b.left - S / 2, y: ev.clientY - b.top - S / 2 }; }
        palco.addEventListener('pointerdown', function (ev) {
          ev.preventDefault(); try { palco.setPointerCapture(ev.pointerId); } catch (e) {}
          ponteiros[ev.pointerId] = pos(ev); inicio = null;
        });
        palco.addEventListener('pointermove', function (ev) {
          if (!ponteiros[ev.pointerId]) return;
          var p = pos(ev), ids = Object.keys(ponteiros);
          if (ids.length === 1) {
            est.x += p.x - ponteiros[ev.pointerId].x; est.y += p.y - ponteiros[ev.pointerId].y;
            ponteiros[ev.pointerId] = p; limitar(); desenhar(ctx, S, dpr);
          } else if (ids.length >= 2) {
            ponteiros[ev.pointerId] = p;
            var a = ponteiros[ids[0]], b = ponteiros[ids[1]];
            var d = Math.hypot(a.x - b.x, a.y - b.y), meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            if (!inicio) inicio = { d: d, z: est.z };
            else zoomPara(inicio.z * d / Math.max(1, inicio.d), meio.x, meio.y);
          }
        });
        function soltar(ev) { delete ponteiros[ev.pointerId]; inicio = null; }
        palco.addEventListener('pointerup', soltar); palco.addEventListener('pointercancel', soltar); palco.addEventListener('lostpointercapture', soltar);
        palco.addEventListener('wheel', function (ev) { ev.preventDefault(); var p = pos(ev); zoomPara(est.z * (ev.deltaY < 0 ? 1.08 : 1 / 1.08), p.x, p.y); }, { passive: false });
        range.addEventListener('input', function () { zoomPara(parseFloat(range.value) || 1, 0, 0); });
        fundo.querySelectorAll('.mfa-formas button').forEach(function (b) { b.addEventListener('click', function () { trocarForma(b.getAttribute('data-forma')); }); });

        function fechar(res) {
          window.removeEventListener('resize', medir); document.removeEventListener('keydown', tecla);
          fundo.remove(); URL.revokeObjectURL(r.url); resolve(res);
        }
        function tecla(ev) { if (ev.key === 'Escape') fechar(null); }
        document.addEventListener('keydown', tecla);
        window.addEventListener('resize', medir);
        fundo.addEventListener('click', function (ev) {
          var b = ev.target.closest('[data-acao]'); if (!b) return;
          if (b.getAttribute('data-acao') === 'cancelar') return fechar(null);
          var out = document.createElement('canvas'); out.width = LADO_SAIDA; out.height = LADO_SAIDA;
          desenhar(out.getContext('2d'), LADO_SAIDA);
          b.disabled = true; b.textContent = 'Preparando...';
          out.toBlob(function (blob) {
            if (!blob) { alert('Não foi possível preparar a foto. Tente outra imagem.'); b.disabled = false; b.textContent = 'Usar esta foto'; return; }
            var arq = blob;
            try { arq = new File([blob], 'foto-perfil.jpg', { type: 'image/jpeg' }); } catch (e) {}
            fechar(arq);
          }, 'image/jpeg', 0.92);
        });

        trocarForma(forma);
        requestAnimationFrame(medir);
        var usar = fundo.querySelector('.mfa-b1'); if (usar) usar.focus();
      });
    });
  }

  window.MentoraFoto = { ajustar: ajustar };
})();
