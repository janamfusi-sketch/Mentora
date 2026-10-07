// =====================================================================
// Mentóra — ESTRUTURA DO DEVER DE CASA (v7 · 05/10/2026)
// Lê o texto de cada tarefa (escrito pelo mentor ou pelo PDI do Agente Mentóra)
// e decide como ela aparece para o mentorado:
//   • pede comprovação (print, foto, planilha, PDF...) → botão para enviar arquivo
//   • frequência semanal ou várias vezes por semana  → lista 1ª semana, 2ª semana...
//   • tarefa sensível (dinheiro, percentual do salário, peso...) → o valor NÃO fica fixo:
//     o mentorado informa o valor combinado, e a tarefa ganha prazos curto/médio/longo
// O mentor pode corrigir a leitura automática em "Ajustar" (fica salvo em dados.ajustes).
// Usado por deverdecasa.html (mentorado) e clean_prontuario.js (mentor).
// =====================================================================
(function () {
  'use strict';

  var BUCKET = 'dever-evidencias';
  var PRAZOS = [
    { dias: 30, chave: 'p30', rotulo: 'Curto prazo' },
    { dias: 60, chave: 'p60', rotulo: 'Médio prazo' },
    { dias: 90, chave: 'p90', rotulo: 'Longo prazo' }
  ];

  function semAcento(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  // Valores que não podem ficar fixos (dinheiro, percentual, peso)
  var RE_VALORES = [
    /R\$\s?\d[\d.,]*(\s?(mil|reais))?/gi,
    /\d[\d.,]*\s?(%|por\s?cento)/gi,
    /\d[\d.,]*\s?(mil\s)?reais/gi,
    /\d[\d.,]*\s?(kg|quilos)\b/gi
  ];
  var RE_SENSIVEL_ACAO = /(guardar|poupar|economizar|investir|aplicar dinheiro|transferi|depositar|quitar|pagar (a |as |uma |sua )?divida|reserva de emergencia|reserva financeira|emagrecer|perder peso)/;

  function prazoEmDias(txt) {
    var t = semAcento(txt);
    var m = t.match(/(\d+)\s*dias?/); if (m) return Math.min(365, Math.max(1, parseInt(m[1], 10)));
    m = t.match(/(\d+)\s*semanas?/); if (m) return Math.min(365, parseInt(m[1], 10) * 7);
    m = t.match(/(\d+)\s*m[eê]s(es)?/); if (m) return Math.min(365, parseInt(m[1], 10) * 30);
    if (/um mes|1 mes/.test(t)) return 30;
    return 0;
  }

  // Separa "Ação — Como Evidência: X. (prazo: 30 dias)" em partes legíveis
  function separar(texto) {
    var t = String(texto || '').trim();
    var prazo = '';
    var mp = t.match(/\(\s*prazo\s*:\s*([^)]*)\)\s*$/i);
    if (mp) { prazo = mp[1].trim(); t = t.slice(0, mp.index).trim(); }
    var evid = '';
    var me = t.match(/\s*Evid[eê]ncia\s*:\s*/i);
    if (me) { evid = t.slice(me.index + me[0].length).trim().replace(/[.;]\s*$/, ''); t = t.slice(0, me.index).trim(); }
    var acao = t, como = '';
    var sep = t.search(/\s[—–]\s/);
    if (sep > 0) { acao = t.slice(0, sep).trim(); como = t.slice(sep + 3).trim(); }
    return { acao: acao.replace(/[.;]\s*$/, ''), como: como.replace(/[.;]\s*$/, ''), evidencia: evid, prazo: prazo };
  }

  function neutralizar(txt) {
    var s = String(txt || '');
    RE_VALORES.forEach(function (re) { s = s.replace(re, '[valor combinado]'); });
    return s.replace(/\bde \[valor combinado\]/g, 'do [valor combinado]').replace(/\bem \[valor combinado\]/g, 'no [valor combinado]');
  }

  // ajuste (opcional, vindo do mentor): { semanal, semanas, evidencia, sensivel }
  function analisar(texto, ajuste) {
    ajuste = ajuste || {};
    var p = separar(texto);
    var full = semAcento(texto);
    var prazoDias = prazoEmDias(p.prazo) || prazoEmDias(texto) || 30;

    var temValor = RE_VALORES.some(function (re) { re.lastIndex = 0; return re.test(texto); });
    RE_VALORES.forEach(function (re) { re.lastIndex = 0; });
    var sensivelAuto = (temValor && /(salario|renda|dinheiro|poupanca|investimento|divida|reserva|gasto|despesa|economi|transfer|deposit|peso|kg|quilos|emagrec)/.test(full)) || RE_SENSIVEL_ACAO.test(full);

    var semanalAuto = /(\d+)\s*(x|vezes)\s*(por|na|\/|a cada)\s*semana|semanal|semanalmente|toda(s)? (as )?semanas?|cada semana|por semana|diari|todos os dias|todo dia|cada dia|uma vez por dia|domingo|segunda-feira|terca-feira|quarta-feira|quinta-feira|sexta-feira|sabado/.test(full);

    var evidAuto = !!p.evidencia || /(print|captura de tela|screenshot|foto|comprovante|planilha|relatorio|extrato|pdf|registro escrito|diario com|arquivo|anexar|enviar imagem)/.test(full);

    var semanal = typeof ajuste.semanal === 'boolean' ? ajuste.semanal : semanalAuto;
    var sensivel = typeof ajuste.sensivel === 'boolean' ? ajuste.sensivel : sensivelAuto;
    var evidencia = typeof ajuste.evidencia === 'boolean' ? ajuste.evidencia : evidAuto;
    var semanasAuto = Math.max(1, Math.round(prazoDias / 7));
    var semanas = semanal ? Math.min(13, Math.max(1, parseInt(ajuste.semanas, 10) || semanasAuto)) : 0;

    return {
      texto: String(texto || ''),
      acao: sensivel ? neutralizar(p.acao) : p.acao,
      como: sensivel ? neutralizar(p.como) : p.como,
      evidenciaTexto: sensivel ? neutralizar(p.evidencia) : p.evidencia,
      prazoTexto: p.prazo,
      prazoDias: prazoDias,
      evidencia: evidencia || semanal, // na lista semanal sempre há onde enviar a comprovação
      semanal: semanal,
      semanas: semanas,
      sensivel: sensivel,
      auto: { semanal: semanalAuto, sensivel: sensivelAuto, evidencia: evidAuto, semanas: semanasAuto }
    };
  }

  function addDias(base, dias) { var d = new Date(base); d.setDate(d.getDate() + dias); return d; }
  function fmt(d) { return d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : ''; }
  function fmtAno(d) { return d ? new Date(d).toLocaleDateString('pt-BR') : ''; }
  function semanaPeriodo(base, n) { var ini = addDias(base, (n - 1) * 7); var fim = addDias(base, n * 7 - 1); return { ini: ini, fim: fim }; }

  // Resumo de uma resposta (usado na tela do mentor e nos números de engajamento)
  function resumoResposta(r) {
    r = r || {};
    var sem = Array.isArray(r.semanas) ? r.semanas : [];
    var pz = Array.isArray(r.prazos) ? r.prazos : [];
    var feitasSem = sem.filter(function (s) { return s && s.ok; }).length;
    var prazoOk = pz.find(function (x) { return x && x.ok; });
    return { semanas: sem.length, semanasFeitas: feitasSem, prazoConcluido: prazoOk ? prazoOk.chave : '' };
  }

  // ── HTML da resposta para o mentor (lista do dever de casa e linha do tempo) ──
  function htmlRespostaMentor(r, info) {
    r = r || {};
    var arqs = Array.isArray(r.arquivos) ? r.arquivos : [];
    var arqDe = function (slot) {
      return arqs.filter(function (a) { return a && a.slot === slot && a.path; }).map(function (a) {
        return '<button type="button" class="dvm-arq" onclick="DeverEstrutura.abrirArquivo(\'' + esc(a.path) + '\')">📎 ' + esc(a.nome || 'arquivo') + '</button>';
      }).join('');
    };
    var html = '';
    if (r.valor) html += '<div class="dvm-linha"><b>Valor combinado informado:</b> ' + esc(r.valor) + '</div>';
    var sem = Array.isArray(r.semanas) ? r.semanas : [];
    if (sem.length) {
      html += '<div class="dvm-grade">' + sem.map(function (s) {
        var est = s.ok ? 'dvm-ok' : (s.txt ? 'dvm-just' : 'dvm-pend');
        var rot = s.ok ? 'Concluída' : (s.txt ? 'Justificada' : 'Pendente');
        return '<div class="dvm-item ' + est + '"><div class="dvm-cab"><span>' + esc(s.n) + 'ª semana' + (s.periodo ? ' · ' + esc(s.periodo) : '') + '</span><em>' + rot + '</em></div>'
          + (s.txt ? '<div class="dvm-txt">' + esc(s.txt) + '</div>' : '') + arqDe('s' + s.n) + '</div>';
      }).join('') + '</div>';
    }
    var pz = Array.isArray(r.prazos) ? r.prazos : [];
    if (pz.length) {
      var concl = pz.find(function (x) { return x && x.ok; });
      var idxConcl = concl ? PRAZOS.findIndex(function (P) { return P.chave === concl.chave; }) : -1;
      html += '<div class="dvm-grade">' + PRAZOS.map(function (P, i) {
        var x = pz.find(function (y) { return y && y.chave === P.chave; }) || {};
        var anulado = idxConcl >= 0 && i > idxConcl;
        var est = x.ok ? 'dvm-ok' : anulado ? 'dvm-anul' : (x.txt ? 'dvm-just' : 'dvm-pend');
        var rot = x.ok ? 'Concluído' : anulado ? 'Anulado' : (x.txt ? 'Justificado' : 'Em aberto');
        return '<div class="dvm-item ' + est + '"><div class="dvm-cab"><span>' + P.rotulo + ' · ' + P.dias + ' dias' + (x.ate ? ' (até ' + esc(x.ate) + ')' : '') + '</span><em>' + rot + '</em></div>'
          + (x.txt ? '<div class="dvm-txt">' + esc(x.txt) + '</div>' : '') + arqDe(P.chave) + '</div>';
      }).join('') + '</div>';
    }
    var soltos = arqDe('t');
    if (soltos) html += '<div class="dvm-linha"><b>Comprovação enviada:</b> ' + soltos + '</div>';
    return html;
  }

  async function abrirArquivo(path) {
    var c = window.supabaseClient;
    if (!c) { alert('Banco de dados não conectado.'); return; }
    var janela = window.open('', '_blank');
    try {
      var r = await c.storage.from(BUCKET).createSignedUrl(path, 600);
      if (r.error || !r.data) throw r.error || new Error('sem link');
      if (janela) janela.location.href = r.data.signedUrl; else window.location.href = r.data.signedUrl;
    } catch (e) {
      if (janela) janela.close();
      alert('Não foi possível abrir o arquivo agora: ' + ((e && e.message) || e));
    }
  }

  (function estilos() {
    if (typeof document === 'undefined' || document.getElementById('dvm-estilos')) return;
    var st = document.createElement('style'); st.id = 'dvm-estilos';
    st.textContent = '.dvm-linha{margin-top:6px;font-size:12.5px;color:#334155;display:flex;flex-wrap:wrap;gap:6px;align-items:center}'
      + '.dvm-grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:6px;margin-top:8px}'
      + '.dvm-item{border:1px solid #E2E8F0;border-radius:8px;padding:7px 9px;background:#fff;font-size:12px}'
      + '.dvm-cab{display:flex;justify-content:space-between;gap:6px;font-weight:600;color:#1E293B}.dvm-cab em{font-style:normal;font-size:11px}'
      + '.dvm-ok{border-color:#A7F3D0;background:#F0FDF4}.dvm-ok em{color:#047857}'
      + '.dvm-just{border-color:#FDE68A;background:#FFFBEB}.dvm-just em{color:#B45309}'
      + '.dvm-pend em{color:#64748B}.dvm-anul{opacity:.6}.dvm-anul em{color:#64748B}'
      + '.dvm-txt{margin-top:4px;color:#475569;line-height:1.4;white-space:pre-wrap}'
      + '.dvm-arq{margin-top:5px;margin-right:4px;background:#EEF2FF;color:#4338CA;border:1px solid #C7D2FE;border-radius:100px;padding:2px 9px;font-size:11.5px;font-weight:600;cursor:pointer;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
      + '.dvm-chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}.dvm-chip{font-size:11px;font-weight:600;padding:2px 8px;border-radius:100px;background:#F1F5F9;color:#475569;border:1px solid #E2E8F0}'
      + '.dvm-chip.s{background:#FFF7ED;color:#9A3412;border-color:#FED7AA}.dvm-chip.w{background:#EEF2FF;color:#4338CA;border-color:#C7D2FE}.dvm-chip.e{background:#ECFEFF;color:#0E7490;border-color:#A5F3FC}'
      + '.dvm-ajuste{margin-top:8px;padding:10px;border:1px dashed #C7D2FE;border-radius:8px;background:#F8FAFF;font-size:12.5px;color:#334155;display:flex;flex-direction:column;gap:7px}'
      + '.dvm-ajuste label{display:flex;gap:7px;align-items:center;cursor:pointer}.dvm-ajuste input[type=number]{width:64px;border:1px solid #CBD5E1;border-radius:6px;padding:3px 6px}'
      + '.dvm-nota{font-size:11.5px;color:#64748B;line-height:1.45}';
    document.head.appendChild(st);
  })();

  window.DeverEstrutura = {
    BUCKET: BUCKET, PRAZOS: PRAZOS,
    analisar: analisar, separar: separar, neutralizar: neutralizar,
    addDias: addDias, fmt: fmt, fmtAno: fmtAno, semanaPeriodo: semanaPeriodo,
    resumoResposta: resumoResposta, htmlRespostaMentor: htmlRespostaMentor, abrirArquivo: abrirArquivo, esc: esc
  };
})();
