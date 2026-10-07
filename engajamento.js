// =====================================================================
// Mentóra — ENGAJAMENTO E PREVISÃO DE ABANDONO (v7 · 05/10/2026)
// Refeito com a mentora. O índice de risco usa SOMENTE estes sinais, medidos pela
// FREQUÊNCIA com que acontecem numa janela recente (não só o último evento):
//   1. Cancelamentos, remarcações e faltas das sessões AGENDADAS (Agenda do Mentor) .... peso 25
//   2. Dever de casa sem resposta ...................................................... peso 20
//   3. Respostas incompletas (parcial / não fez com justificativa / sem justificativa) ... peso 17
//   4. Percepção do mentor marcada no registro de cada sessão ........................... peso 12
//   5. Demora para responder (dever de casa + onboarding) ............................... peso 10
//   6. Onboarding sem resposta ......................................................... peso 8
//   7. Pontos de atenção das análises da IA já geradas (não gasta análises) ............. peso 8
// Ferramentas e telemetrias aplicadas NÃO contam como sessão. Dias sem sessão NÃO são sinal.
// A frequência combinada das sessões (semanal, quinzenal, mensal, bimestral) só define as
// janelas e os prazos de tolerância; nunca uma "sessão diária".
// Níveis: abaixo de 30 = sem alerta · 30–49 amarelo · 50–69 laranja · 70+ vermelho.
// Score de engajamento = 100 − índice de risco (é o que desenha a trajetória e a órbita).
// Não usa IA nem tokens: tudo é calculado no navegador a partir do banco.
// =====================================================================

const CPE_PESOS = { cancel: 25, dever: 20, incompletas: 17, percepcao: 12, demora: 10, onboarding: 8, ia: 8 };
const CPE_NIVEIS = [
 { min: 70, chave: 'vermelho', nome: 'Risco alto', cor: '#dc2626', fundo: '#fef2f2', borda: '#fecaca', texto: '#991b1b', ciclo: 14 },
 { min: 50, chave: 'laranja', nome: 'Risco', cor: '#ea580c', fundo: '#fff7ed', borda: '#fed7aa', texto: '#9a3412', ciclo: 21 },
 { min: 30, chave: 'amarelo', nome: 'Atenção', cor: '#ca8a04', fundo: '#fefce8', borda: '#fde68a', texto: '#854d0e', ciclo: 30 },
 { min: 0, chave: 'estavel', nome: 'Estável', cor: '#16a34a', fundo: '#f0fdf4', borda: '#bbf7d0', texto: '#166534', ciclo: 30 }
];
const CPE_FREQ_OPCOES = [7, 15, 30, 60];
const CPE_FREQ_NOME = { 7: 'semanal', 15: 'quinzenal', 30: 'mensal', 60: 'bimestral' };
const CPE_FREQ_PADRAO = 15;
const CPE_STATUS = {
 realizada: { nome: 'Realizada', cor: '#166534', fundo: '#dcfce7' },
 cancelada_mentorado: { nome: 'Mentorado cancelou', cor: '#991b1b', fundo: '#fee2e2' },
 remarcada_mentorado: { nome: 'Mentorado remarcou', cor: '#9a3412', fundo: '#ffedd5' },
 faltou: { nome: 'Não compareceu', cor: '#991b1b', fundo: '#fee2e2' },
 cancelada_mentor: { nome: 'Cancelada por mim', cor: '#475569', fundo: '#f1f5f9' }
};
// Percepção do mentor no registro da sessão (fica em observacao_manual.dados.percepcao)
const CPE_PERCEPCOES = [
 { chave: 'falou_parar', nome: 'Falou em parar ou pausar', peso: 1, neg: true },
 { chave: 'financeiro', nome: 'Dificuldade financeira para continuar', peso: 0.7, neg: true },
 { chave: 'desmotivado', nome: 'Desmotivado(a)', peso: 0.6, neg: true },
 { chave: 'sobrecarga', nome: 'Sem tempo / sobrecarregado(a)', peso: 0.5, neg: true },
 { chave: 'resistencia', nome: 'Resistência às tarefas', peso: 0.5, neg: true },
 { chave: 'distante', nome: 'Distante ou disperso(a) na sessão', peso: 0.4, neg: true },
 { chave: 'engajado', nome: 'Engajado(a)', peso: -0.4, neg: false },
 { chave: 'avancos', nome: 'Trouxe avanços concretos', peso: -0.3, neg: false }
];
// Pontos de atenção da IA que indicam risco de AFASTAMENTO DA MENTORIA. Traços de personalidade
// (resistência, evitação, sobrecarga etc.) não contam: são conteúdo do trabalho, não sinal de abandono.
const CPE_RE_IA = /(desmotivad[oa] com a mentoria|desmotiva[cç][aã]o com (a mentoria|o processo)|desist|abandon|interromper a mentoria|parar a mentoria|pausar a mentoria|baixa ades[aã]o|ades[aã]o baixa|baixo engajamento|engajamento baixo|descomprometi|n[aã]o saiu do papel|faltas? (nas|[aà]s) sess|aus[eê]ncia (nas|[aà]s) sess|cancelou|cancelament|remarca[cç][oõ]es|dificuldade financeira|restri[cç][aã]o financeira|custo da mentoria|d[uú]vida sobre (continuar|o processo|a mentoria))/i;
const CPE_RE_IA_NAO = /n[aã]o (executou|cumpriu|realizou|fez|respondeu|entregou|concluiu|praticou)[^.;]{0,60}(dever|tarefa|pdi|a[cç][aã]o|a[cç][oõ]es|plano|combinad|pr[aá]tica)/i;

function cpe_nivel(pontos) { return CPE_NIVEIS.find(n => pontos >= n.min) || CPE_NIVEIS[CPE_NIVEIS.length - 1]; }
function cpe_clamp(v) { return Math.max(0, Math.min(1, v)); }
function cpe_norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(); }
function cpe_dia(chave) { return new Date(chave + 'T12:00:00'); }
function cpe_diff(a, b) { return Math.round((cpe_dia(a) - cpe_dia(b)) / 86400000); }
function cpe_somaDias(chave, n) { const d = cpe_dia(chave); d.setDate(d.getDate() + n); return cp_chaveDia(d); }
function cpe_fmt(chave) { return chave ? chave.slice(8, 10) + '/' + chave.slice(5, 7) : ''; }
function cpe_corta(t, n) { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trim() + '…' : t; }
function cpe_plural(n, um, varios) { return n + ' ' + (n === 1 ? um : varios); }
function cpe_ultimas(n, um, varios) { return n === 1 ? 'na última ' + um : `nas últimas ${n} ${varios}`; }

function cp_engajTarefasDe(row) {
 if (!row) return [];
 let d = cp_parseDados(row.dados);
 if (d && !Array.isArray(d) && Array.isArray(d.tasks)) d = d.tasks;
 if (!Array.isArray(d)) return [];
 return d.map(t => typeof t === 'string' ? t : (t && (t.text || t.taskText)) || '').map(t => String(t).trim()).filter(Boolean);
}

// Preferências do engajamento por mentorado (várias linhas engajamento_pref somadas, a mais nova vence)
function cp_engajPrefs(menteeId) {
 return (cp_all_sessions || []).filter(s => s && String(s.mentorado_id) === String(menteeId) && s.tipo === 'engajamento_pref')
  .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  .reduce((acc, s) => Object.assign(acc, cp_parseDados(s.dados) || {}), {});
}
window.cp_engajPrefs = cp_engajPrefs;

// ── Agenda: compromissos deste mentorado (pelo mentorado escolhido ou pelo nome completo no título) ──
function cpe_menteeNome(menteeId) {
 const lista = (typeof cp_mentees !== 'undefined' && Array.isArray(cp_mentees)) ? cp_mentees : [];
 const atual = typeof cp_currentMentee !== 'undefined' ? cp_currentMentee : null;
 const m = lista.find(x => String(x.id) === String(menteeId)) || (atual && String(atual.id) === String(menteeId) ? atual : null);
 return m ? (m.nome || '') : '';
}
function cpe_agendaDoMentorado(menteeId) {
 const nome = cpe_norm(cpe_menteeNome(menteeId));
 return (window.vlAgenda || []).filter(e => e && e.data && ((e.mentorado_id && String(e.mentorado_id) === String(menteeId)) || (!e.mentorado_id && nome && nome.split(/\s+/).length > 1 && cpe_norm(e.titulo).includes(nome))))
  .map(e => ({ id: e.id, dia: e.data, hora: e.inicio || '', status: e.status || '', titulo: e.titulo || '' }))
  .sort((a, b) => (a.dia + a.hora).localeCompare(b.dia + b.hora));
}
let cpe_agendaPromessa = null;
function cp_engajGarantirAgenda() {
 if (Array.isArray(window.vlAgenda) && window.__cpeAgendaOk) return Promise.resolve(false);
 if (cpe_agendaPromessa) return cpe_agendaPromessa;
 cpe_agendaPromessa = (async () => {
  for (let i = 0; i < 12 && !window.mentorId; i++) await new Promise(r => setTimeout(r, 400));
  try {
   const doBanco = typeof mentoraCarregarCampo === 'function' ? await mentoraCarregarCampo('agenda_eventos') : null;
   if (Array.isArray(doBanco)) { window.vlAgenda = doBanco; window.__cpeAgendaOk = true; return true; }
  } catch (e) { console.warn('Agenda indisponível para o engajamento:', e); }
  cpe_agendaPromessa = null; return false;
 })();
 return cpe_agendaPromessa;
}
window.cp_engajGarantirAgenda = cp_engajGarantirAgenda;

// Frequência combinada: escolhida pelo mentor; senão, deduzida da Agenda (mínimo quinzenal); senão, quinzenal
function cp_engajFrequencia(menteeId) {
 const p = cp_engajPrefs(menteeId);
 const esc = parseInt(p.frequenciaDias, 10);
 if (CPE_FREQ_OPCOES.includes(esc)) return { dias: esc, fonte: 'combinada' };
 const dias = [...new Set(cpe_agendaDoMentorado(menteeId).filter(e => e.status !== 'cancelada_mentor').map(e => e.dia))].sort();
 const iv = dias.slice(1).map((d, i) => cpe_diff(d, dias[i])).filter(x => x > 0).sort((a, b) => a - b);
 if (iv.length >= 2) {
  const med = iv[Math.floor(iv.length / 2)];
  const alvo = [15, 30, 60].reduce((m, x) => Math.abs(x - med) < Math.abs(m - med) ? x : m, 15);
  return { dias: alvo, fonte: 'agenda' };
 }
 return { dias: CPE_FREQ_PADRAO, fonte: 'padrao' };
}
window.cp_engajFrequencia = cp_engajFrequencia;

// ── Classificação de uma tarefa respondida ──
function cpe_classificaTarefa(r) {
 if (!r) return 'semResp';
 if (r.completed || r.done) return 'feita';
 const sem = Array.isArray(r.semanas) ? r.semanas : [];
 const arqs = Array.isArray(r.arquivos) ? r.arquivos : [];
 if (sem.some(s => s && s.ok) || arqs.length) return 'parcial';
 if (String(r.justification || r.justificativa || '').trim()) return 'naoJust';
 return 'naoSem';
}

// Listas de dever de casa casadas com a resposta que veio depois de cada uma
function cpe_listasDever(rows, ateChave, carencia) {
 const cfgs = rows.filter(r => r.tipo === 'dever_de_casa_config' && cp_chaveDia(r.created_at) <= ateChave && cp_engajTarefasDe(r).length);
 const resps = rows.filter(r => r.tipo === 'dever_de_casa_resp' && cp_chaveDia(r.created_at) <= ateChave);
 return cfgs.map((cfg, i) => {
  const ini = new Date(cfg.created_at), fim = i + 1 < cfgs.length ? new Date(cfgs[i + 1].created_at) : null;
  const resp = resps.filter(r => new Date(r.created_at) >= ini && (!fim || new Date(r.created_at) < fim)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
  const enviado = cp_chaveDia(cfg.created_at);
  const idade = cpe_diff(ateChave, enviado);
  return { cfg, resp, enviado, idade, tarefas: cp_engajTarefasDe(cfg), emCarencia: !resp && idade < carencia };
 });
}

// ══════════════════════════════════════════════════════════════════════
// CÁLCULO DO RISCO NUM DIA (base de tudo: alerta, barras, trajetória e órbita)
// ══════════════════════════════════════════════════════════════════════
function cp_engajRiscoNoDia(menteeId, rows, ateChave, freq, agenda) {
 const janela = Math.max(60, freq * 4);
 const desde = cpe_somaDias(ateChave, -janela);
 const carencia = Math.max(7, Math.min(freq, 30));
 const r = rows.filter(x => cp_chaveDia(x.created_at) <= ateChave);
 const sinais = {};
 const temDado = { cancel: false, dever: false, incompletas: false, percepcao: false, demora: false, onboarding: false, ia: false };

 // 1) Cancelamentos, remarcações e faltas (últimas 6 sessões agendadas que já passaram e foram marcadas)
 const passadas = agenda.filter(e => e.dia <= ateChave && e.dia >= desde);
 const marcadas = passadas.filter(e => e.status && e.status !== 'cancelada_mentor').slice(-6);
 const aMarcar = agenda.filter(e => e.dia < ateChave && !e.status);
 if (marcadas.length) {
  temDado.cancel = true;
  const c = marcadas.filter(e => e.status === 'cancelada_mentorado').length;
  const f = marcadas.filter(e => e.status === 'faltou').length;
  const rm = marcadas.filter(e => e.status === 'remarcada_mentorado').length;
  const pesoProb = c + f * 1.2 + rm * 0.5;
  let sev = cpe_clamp((pesoProb / marcadas.length) / 0.5);
  const ult2 = marcadas.slice(-2);
  const duasSeguidas = ult2.length === 2 && ult2.every(e => e.status === 'cancelada_mentorado' || e.status === 'faltou');
  if (duasSeguidas) sev = Math.max(sev, 0.8);
  if (pesoProb > 0) {
   const partes = [c ? cpe_plural(c, 'cancelamento', 'cancelamentos') : '', f ? cpe_plural(f, 'falta', 'faltas') : '', rm ? cpe_plural(rm, 'remarcação', 'remarcações') : ''].filter(Boolean);
   sinais.cancel = { sev, texto: `${partes.join(', ')} ${cpe_ultimas(marcadas.length, 'sessão agendada', 'sessões agendadas')}${duasSeguidas ? ' (as duas últimas não aconteceram)' : ''}`, dados: { c, f, rm, n: marcadas.length, duasSeguidas, ultima: marcadas[marcadas.length - 1] } };
  }
 }

 // 2) Dever de casa sem resposta (últimas 4 listas fora da carência)
 const listas = cpe_listasDever(r, ateChave, carencia);
 const consideradas = listas.filter(l => !l.emCarencia && l.enviado >= desde).slice(-4);
 if (consideradas.length) {
  temDado.dever = true;
  const sem = consideradas.filter(l => !l.resp);
  let seguidas = 0; for (let i = consideradas.length - 1; i >= 0 && !consideradas[i].resp; i--) seguidas++;
  let sev = sem.length / consideradas.length;
  if (seguidas >= 2) sev = Math.max(sev, 0.85);
  if (sem.length) sinais.dever = { sev: cpe_clamp(sev), texto: `${sem.length} de ${consideradas.length} ${consideradas.length === 1 ? 'dever de casa enviado ficou' : 'deveres de casa enviados ficaram'} sem resposta${seguidas >= 2 ? ` (${seguidas} seguidos)` : ''}`, dados: { sem: sem.length, n: consideradas.length, seguidas, maisAntigo: sem[0] ? sem[0].enviado : null } };
 }

 // 3) Respostas incompletas (tarefas das últimas 4 respostas)
 const respondidas = listas.filter(l => l.resp && l.enviado >= desde).slice(-4);
 const cont = { feita: 0, parcial: 0, naoJust: 0, naoSem: 0 };
 const exemplos = { parcial: [], naoSem: [], naoJust: [] };
 let entregasIncompletas = 0;
 respondidas.forEach(l => {
  const lista = (cp_parseDados(l.resp.dados) || {}).tasks || [];
  let incompleta = false;
  l.tarefas.forEach((t, k) => {
   const resp = lista.find(x => x.taskText === t) || lista.find(x => x.taskIndex === k);
   const cl = cpe_classificaTarefa(resp);
   const chave = cl === 'semResp' ? 'naoSem' : cl;
   cont[chave]++;
   if (chave !== 'feita') { incompleta = true; if (exemplos[chave]) exemplos[chave].push({ tarefa: t, motivo: resp && (resp.justification || resp.justificativa) || '' }); }
  });
  if (incompleta) entregasIncompletas++;
 });
 const totT = cont.feita + cont.parcial + cont.naoJust + cont.naoSem;
 if (totT) {
  temDado.incompletas = true;
  const peso = (cont.naoSem + cont.parcial * 0.35 + cont.naoJust * 0.3) / totT;
  if (peso > 0) sinais.incompletas = { sev: cpe_clamp(peso / 0.6), texto: `${cpe_ultimas(respondidas.length, 'entrega', 'entregas')}, ${respondidas.length === 1 ? 'que veio incompleta' : `${entregasIncompletas} ${entregasIncompletas === 1 ? 'veio incompleta' : 'vieram incompletas'}`}: ${cont.feita} de ${totT} tarefas feitas, ${cont.parcial} pela metade, ${cont.naoJust} não ${cont.naoJust === 1 ? 'feita' : 'feitas'} com justificativa e ${cont.naoSem} sem justificativa`, dados: Object.assign({ tot: totT, entregas: respondidas.length, entregasIncompletas, exemplos }, cont) };
 }

 // 4) Percepção do mentor nos registros das sessões (últimos 4 registros com marcação)
 const registros = r.filter(x => x.tipo === 'observacao_manual' && cp_chaveDia(x.created_at) >= desde)
  .map(x => ({ dia: cp_chaveDia(x.created_at), marcas: Array.isArray((cp_parseDados(x.dados) || {}).percepcao) ? (cp_parseDados(x.dados) || {}).percepcao : [] }))
  .filter(x => x.marcas.length).sort((a, b) => a.dia.localeCompare(b.dia)).slice(-4);
 let falouParar = null;
 if (registros.length) {
  temDado.percepcao = true;
  const decai = [1, 0.6, 0.4, 0.3];
  let soma = 0; const contagem = {};
  registros.slice().reverse().forEach((reg, i) => {
   reg.marcas.forEach(m => {
    const p = CPE_PERCEPCOES.find(x => x.chave === m); if (!p) return;
    soma += p.peso * decai[i];
    if (p.neg) contagem[m] = (contagem[m] || 0) + 1;
    if (m === 'falou_parar' && cpe_diff(ateChave, reg.dia) <= 30 && !falouParar) falouParar = reg.dia;
   });
  });
  const neg = Object.keys(contagem);
  if (soma > 0 && neg.length) sinais.percepcao = { sev: cpe_clamp(soma / 1.5), texto: `${cpe_ultimas(registros.length, 'sessão registrada', 'sessões registradas')} você marcou: ${neg.map(k => `${CPE_PERCEPCOES.find(x => x.chave === k).nome.toLowerCase()}${contagem[k] > 1 ? ` (${contagem[k]}x)` : ''}`).join(', ')}`, dados: { contagem, falouParar } };
 }

 // 5) Demora para responder (dever de casa + onboarding, últimas 4 respostas)
 const pend = {}; const deltas = [];
 r.filter(x => ['dever_de_casa_config', 'dever_de_casa_resp', 'onboarding_config', 'onboarding'].includes(x.tipo))
  .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).forEach(x => {
   const tr = x.tipo.indexOf('dever_de_casa') === 0 ? 'dc' : 'ob';
   if (x.tipo === 'dever_de_casa_config' || x.tipo === 'onboarding_config') { if (!pend[tr]) pend[tr] = x.created_at; return; }
   if (pend[tr]) { const d = (new Date(x.created_at) - new Date(pend[tr])) / 86400000; if (d >= 0 && cp_chaveDia(x.created_at) >= desde) deltas.push(d); delete pend[tr]; }
  });
 let demoraMedia = null;
 const ult = deltas.slice(-4);
 if (ult.length) {
  temDado.demora = true;
  demoraMedia = ult.reduce((a, b) => a + b, 0) / ult.length;
  const ok = freq / 3;
  const sev = cpe_clamp((demoraMedia - ok) / Math.max(1, freq - ok));
  const subindo = ult.length >= 3 && ult[ult.length - 1] > 1.5 * (ult.slice(0, -1).reduce((a, b) => a + b, 0) / (ult.length - 1)) && ult[ult.length - 1] - ok > 0;
  const sevF = subindo ? Math.max(sev, 0.4) : sev;
  if (sevF > 0) sinais.demora = { sev: sevF, texto: `responde em média em ${demoraMedia.toFixed(1).replace('.', ',')} dias (com sessões a cada ${freq} dias, o esperado é até ${Math.round(ok)} dias)${subindo ? ' e a última resposta demorou mais que as anteriores' : ''}`, dados: { media: demoraMedia, ok: Math.round(ok), subindo } };
 }

 // 6) Onboarding sem resposta
 const obCfg = r.filter(x => x.tipo === 'onboarding_config').sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
 if (obCfg) {
  const enviado = cp_chaveDia(obCfg.created_at);
  const respondeu = r.some(x => x.tipo === 'onboarding' && new Date(x.created_at) >= new Date(obCfg.created_at));
  const idade = cpe_diff(ateChave, enviado);
  if (respondeu || idade >= 7) temDado.onboarding = true;
  if (!respondeu && idade >= 7) sinais.onboarding = { sev: cpe_clamp(0.6 + (idade - 7) / 35), texto: `o onboarding enviado em ${cpe_fmt(enviado)} está sem resposta há ${idade} dias`, dados: { enviado, idade } };
 }

 // 7) Pontos de atenção das análises da IA (últimas 3 análises da janela)
 const analises = r.filter(x => cp_chaveDia(x.created_at) >= desde && (x.tipo === 'analise_telemetria' || (x.tipo !== 'observacao_manual' && typeof (cp_parseDados(x.dados) || {}).aiAnalysis === 'string' && (cp_parseDados(x.dados) || {}).aiAnalysis.length > 80)))
  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 3);
 if (analises.length) {
  temDado.ia = true;
  const achados = [];
  analises.forEach(a => {
   const d = cp_parseDados(a.dados) || {};
   const texto = String(a.tipo === 'analise_telemetria' ? (d.texto || '') : d.aiAnalysis || '');
   let itens = [];
   const json = (() => { const m = texto.match(/\{[\s\S]*\}/); if (!m) return null; try { return JSON.parse(m[0]); } catch (e) { return null; } })();
   if (json) itens = [].concat(json.riscos || [], json.ponderacao || [], json.impacto_negativo ? json.impacto_negativo.map(x => x && (x.titulo + ': ' + x.texto)) : []).filter(x => typeof x === 'string');
   else if (window.MentoraCerebros) { const s = MentoraCerebros.secoes(texto); itens = [].concat(s.atencao || [], s.ponderacao || [], s.evolucao ? s.evolucao.split(/(?<=[.!?])\s+/) : []); }
   itens.forEach(t => { if (CPE_RE_IA.test(String(t)) || CPE_RE_IA_NAO.test(String(t))) achados.push({ texto: t, dia: cp_chaveDia(a.created_at), titulo: d.titulo || '' }); });
  });
  if (achados.length) sinais.ia = { sev: cpe_clamp(achados.length / 3), texto: `as análises da IA apontaram ${cpe_plural(achados.length, 'ponto de atenção ligado', 'pontos de atenção ligados')} a afastamento, como: "${cpe_corta(achados[0].texto, 110)}"`, dados: { achados } };
 }

 // Soma ponderada
 const lista = Object.keys(sinais).map(k => ({ chave: k, sev: sinais[k].sev, pts: Math.round(sinais[k].sev * CPE_PESOS[k]), texto: sinais[k].texto, dados: sinais[k].dados }))
  .filter(s => s.pts > 0).sort((a, b) => b.pts - a.pts);
 let pontos = Math.min(100, lista.reduce((s, x) => s + x.pts, 0));
 const algumDado = Object.values(temDado).some(Boolean) || marcadas.length || aMarcar.length;
 // Agravantes: sinais que, sozinhos, já pedem atenção forte
 const agravantes = [];
 if (falouParar) { agravantes.push(`você registrou em ${cpe_fmt(falouParar)} que o mentorado falou em parar ou pausar`); pontos = Math.max(pontos, 50); }
 if (sinais.cancel && sinais.cancel.dados.duasSeguidas) { agravantes.push('as duas últimas sessões agendadas não aconteceram'); pontos = Math.max(pontos, 50); }
 if (sinais.cancel && sinais.dever && sinais.dever.dados.seguidas >= 2) { agravantes.push('cancelamentos somados a deveres de casa seguidos sem resposta'); pontos = Math.max(pontos, 70); }
 return { pontos: algumDado ? pontos : null, sinais: lista, agravantes, temDado, aMarcar, demoraMedia, contagemTarefas: cont, freq, carencia };
}

// ══════════════════════════════════════════════════════════════════════
// TELEMETRIA (score = 100 − risco, trajetória, velocidade e órbita)
// opcoes.serie: true desenha a trajetória de 90 dias (aba Engajamento); a lista usa só 14 dias
// ══════════════════════════════════════════════════════════════════════
function cp_engajTelemetria(menteeId, opcoes) {
 opcoes = opcoes || {};
 const rows = (cp_all_sessions || []).filter(s => s && String(s.mentorado_id) === String(menteeId) && s.created_at)
  .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
 const hoje = cp_chaveDia(Date.now());
 const freq = cp_engajFrequencia(menteeId);
 const agenda = cpe_agendaDoMentorado(menteeId);
 // Pontos da órbita = sessões de verdade: compromisso da Agenda realizado (ou já passado e ainda não marcado)
 // e dias com Registro do Mentor. Ferramentas e telemetrias aplicadas não contam.
 const sessDias = [...new Set(agenda.filter(e => e.dia <= hoje && (e.status === 'realizada' || !e.status)).map(e => e.dia)
  .concat(rows.filter(r => r.tipo === 'observacao_manual').map(r => cp_chaveDia(r.created_at))))].sort();
 const atualR = cp_engajRiscoNoDia(menteeId, rows, hoje, freq.dias, agenda);
 if (atualR.pontos == null) return { serie: [], hoje: { score: null, risco: null, semDiasSessao: null }, risco: atualR, freq, velocidade: null, horizonte: null, status: 'sem_dado', motivo: '', sessDias, agenda, menteeId, nivel: null };
 const nDias = opcoes.serie ? 90 : 14;
 const primeiro = rows.length ? cp_chaveDia(rows[0].created_at) : hoje;
 const serie = [];
 for (let i = nDias - 1; i >= 0; i--) {
  const k = cpe_somaDias(hoje, -i);
  if (k < primeiro) continue;
  const rr = i === 0 ? atualR : cp_engajRiscoNoDia(menteeId, rows, k, freq.dias, agenda);
  serie.push({ dia: k, score: rr.pontos == null ? null : 100 - rr.pontos });
 }
 const janela = serie.slice(-14).map((p, i) => ({ x: i, y: p.score })).filter(p => p.y != null);
 let velocidade = null;
 if (janela.length >= 5) {
  const n = janela.length, mx = janela.reduce((s, p) => s + p.x, 0) / n, my = janela.reduce((s, p) => s + p.y, 0) / n;
  const den = janela.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  velocidade = den ? janela.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / den : 0;
 }
 const score = 100 - atualR.pontos;
 const nivel = cpe_nivel(atualR.pontos);
 let horizonte = null;
 if (nivel.chave !== 'vermelho' && velocidade != null && velocidade < 0) horizonte = Math.max(1, Math.ceil((score - 30) / -velocidade));
 const ultimaSessao = sessDias.length ? sessDias[sessDias.length - 1] : null;
 return {
  serie, risco: atualR, freq, velocidade, horizonte, sessDias, agenda, menteeId, nivel,
  hoje: { score, risco: atualR.pontos, semDiasSessao: ultimaSessao ? cpe_diff(hoje, ultimaSessao) : null },
  status: nivel.chave === 'vermelho' ? 'cruzou' : (nivel.chave === 'laranja' ? 'perto' : 'seguro'),
  motivo: atualR.sinais[0] ? atualR.sinais[0].texto : (atualR.agravantes[0] || '')
 };
}
window.cp_engajTelemetria = cp_engajTelemetria;

// Compatível com a lista de mentorados: { nivel, pontos, sinais }
function cp_engajRisco(menteeId, tele) {
 tele = tele || cp_engajTelemetria(menteeId);
 if (!tele.nivel) return { nivel: null, pontos: null, sinais: [], cor: null };
 return { nivel: tele.nivel.nome, chave: tele.nivel.chave, cor: tele.nivel, pontos: tele.risco.pontos, sinais: tele.risco.sinais, agravantes: tele.risco.agravantes };
}
window.cp_engajRisco = cp_engajRisco;

// Barras do dever de casa: últimos 30 dias, 4 estados + aguardando
function cp_engajDever30(menteeId) {
 const rows = (cp_all_sessions || []).filter(s => s && String(s.mentorado_id) === String(menteeId) && s.created_at)
  .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
 const hoje = cp_chaveDia(Date.now());
 const freq = cp_engajFrequencia(menteeId).dias;
 const carencia = Math.max(7, Math.min(freq, 30));
 const out = { feitas: 0, parciais: 0, naoJust: 0, semResp: 0, aguardando: 0, total: 0, carencia };
 cpe_listasDever(rows, hoje, carencia).forEach(l => {
  if (cpe_diff(hoje, l.enviado) > 30) return;
  if (!l.resp) { if (l.emCarencia) out.aguardando += l.tarefas.length; else { out.semResp += l.tarefas.length; out.total += l.tarefas.length; } return; }
  const lista = (cp_parseDados(l.resp.dados) || {}).tasks || [];
  l.tarefas.forEach((t, k) => {
   const cl = cpe_classificaTarefa(lista.find(x => x.taskText === t) || lista.find(x => x.taskIndex === k));
   if (cl === 'feita') out.feitas++; else if (cl === 'parcial') out.parciais++; else if (cl === 'naoJust') out.naoJust++; else out.semResp++;
   out.total++;
  });
 });
 return out;
}
window.cp_engajDever30 = cp_engajDever30;

// ══════════════════════════════════════════════════════════════════════
// ÓRBITA
// ══════════════════════════════════════════════════════════════════════
function cp_engajOrbita(tele) {
 const cab = st => `<div class="cpe-cab"><div class="cpe-rot" style="margin:0;">Trajetória orbital individual</div>${st ? `<span class="cpe-selo ${st[1]}">${st[0]}</span>` : ''}</div>`;
 const atual = tele.hoje.score;
 const leg = [['#16a34a', 'Ganhando impulso'], ['#2563eb', 'Órbita estável'], ['#ca8a04', 'Atenção'], ['#ea580c', 'Perdendo altitude'], ['#dc2626', 'Fora de órbita']]
  .map(l => `<span><i style="background:${l[0]}"></i>${l[1]}</span>`).join('');
 const comoLer = `<div class="cpe-como"><b>Como ler a órbita:</b> cada ponto (S1, S2…) é uma sessão realizada (Agenda ou Registro do Mentor), na altura do score de engajamento daquele dia; "agora" é hoje. O score é 100 menos o índice de risco, calculado só pelos sinais do mentorado: cancelamentos, dever de casa, respostas incompletas, demora, onboarding, sua percepção nas sessões e os pontos de atenção da IA. Linha descendo = os sinais aumentaram desde as últimas sessões. O selo mostra o nível (Atenção, Perdendo altitude, Fora de órbita) ou, sem alerta, a tendência das últimas 2 semanas.</div>`;
 const W = 920, H = 410, cx = 668, cy = 205, R1 = 65, R2 = 139, R3 = 212;
 const aneis = `<circle cx="${cx}" cy="${cy}" r="${R3}" fill="none" stroke="#eceef2" stroke-width="1.6"></circle>
  <circle cx="${cx}" cy="${cy}" r="${R2}" fill="none" stroke="#eceef2" stroke-width="1.6"></circle>
  <circle cx="${cx}" cy="${cy}" r="${R1}" fill="none" stroke="#eceef2" stroke-width="1.6"></circle>
  <text x="${cx}" y="${cy - R2 - 12}" text-anchor="middle" class="cpe-orb-t">órbita estável</text>
  <text x="${cx}" y="${cy - R1 - 12}" text-anchor="middle" class="cpe-orb-t">alinhado</text>
  <circle cx="${cx}" cy="${cy}" r="11" fill="#dde3f0"></circle>`;
 if (atual == null) {
  return cab(['Sem dados ainda', 'cpe-est']) + `<svg viewBox="0 0 ${W} ${H}" class="cpe-orb" role="img" aria-label="Trajetória orbital ainda sem dados">${aneis}
  <circle cx="${cx - 37}" cy="${cy}" r="9" fill="#cbd5e1"></circle><text x="${cx - 37}" y="${cy - 20}" text-anchor="middle" class="cpe-orb-l">agora</text>
  <text x="300" y="${cy + 5}" text-anchor="middle" class="cpe-orb-t">As sessões S1, S2, S3… aparecem aqui a partir da 1ª sessão realizada</text></svg><div class="cpe-leg">${leg}</div>` + comoLer;
 }
 const porDia = {}; (tele.serie || []).forEach(p => { porDia[p.dia] = p.score; });
 const todas = (tele.sessDias || []).map((d, i) => ({ n: i + 1, dia: d, score: porDia[d] })).filter(p => p.score != null);
 const pts = todas.slice(-5);
 const vel = tele.velocidade == null ? null : tele.velocidade * 7;
 const nv = tele.nivel.chave;
 let st;
 if (nv === 'vermelho') st = ['Fora de órbita', 'cpe-cr'];
 else if (nv === 'laranja') st = ['Perdendo altitude', 'cpe-lr'];
 else if (nv === 'amarelo') st = ['Atenção', 'cpe-am'];
 else if (vel != null && vel > 3) st = ['Ganhando impulso', 'cpe-ok'];
 else st = ['Órbita estável', 'cpe-est'];
 const cor = { 'cpe-ok': '#16a34a', 'cpe-est': '#2563eb', 'cpe-am': '#ca8a04', 'cpe-lr': '#ea580c', 'cpe-cr': '#dc2626' };
 const ax = cx - 37 - (100 - atual) * 1.2, ay = cy;
 const ys = sc => Math.max(40, Math.min(H - 40, cy - (sc - atual) * 2.2));
 const x0 = 97, x1 = Math.max(x0, ax - 83);
 const coords = pts.map((p, i) => ({ ...p, x: pts.length === 1 ? x0 : x0 + (x1 - x0) * i / (pts.length - 1), y: ys(p.score) }));
 const cinzas = ['#d5dbe6', '#c9d0dd', '#bcc4d3', '#aeb7c8'];
 const corDe = i => i === coords.length - 1 ? cor[st[1]] : cinzas[Math.max(0, cinzas.length - (coords.length - 1 - i))];
 const linha = coords.map(c => `${c.x.toFixed(0)},${c.y.toFixed(0)}`).concat([`${ax.toFixed(0)},${ay}`]).join(' ');
 const svg = `<svg viewBox="0 0 ${W} ${H}" class="cpe-orb" role="img" aria-label="Trajetória orbital do mentorado">${aneis}
  <polyline points="${linha}" fill="none" stroke="#cdd3de" stroke-width="2.5" stroke-dasharray="5 6" stroke-linecap="round"></polyline>
  ${coords.map((c, i) => `<circle cx="${c.x.toFixed(0)}" cy="${c.y.toFixed(0)}" r="7" fill="${corDe(i)}"><title>Sessão ${c.n} (${cpe_fmt(c.dia)}): score ${c.score}</title></circle>
  <text x="${c.x.toFixed(0)}" y="${(c.y - 18).toFixed(0)}" text-anchor="middle" class="cpe-orb-l">S${c.n}</text>`).join('')}
  <circle cx="${ax.toFixed(0)}" cy="${ay}" r="9" fill="${cor[st[1]]}"><title>Agora: score ${atual}</title></circle>
  <text x="${ax.toFixed(0)}" y="${ay - 20}" text-anchor="middle" class="cpe-orb-l">agora</text></svg>`;
 const nota = pts.length ? '' : '<div class="cpe-sub">Ainda sem sessão realizada: por enquanto aparece só a posição atual.</div>';
 return cab(st) + svg + `<div class="cpe-leg">${leg}</div>` + comoLer + nota;
}

// ══════════════════════════════════════════════════════════════════════
// ALERTA + PDCA (muda por nível e pelos sinais reais; não usa IA)
// ══════════════════════════════════════════════════════════════════════
function cpe_acoes(nivel, s, ctx) {
 const n = nivel.chave, out = [];
 const prazo = { estavel: ['nas próximas 2 sessões', 'até o fim do ciclo', 'até o fim do ciclo'], amarelo: ['na próxima sessão', 'até 14 dias', 'ao longo dos 30 dias'], laranja: ['em até 48 horas', 'até 7 dias', 'ao longo dos 21 dias'], vermelho: ['hoje ou amanhã', 'até 7 dias', 'ao longo dos 14 dias'] }[n];
 const add = (t) => { if (t && !out.includes(t)) out.push(t); };
 const por = {};
 s.forEach(x => { por[x.chave] = x; });
 if (n === 'vermelho') add(`Ligar para ${ctx.nome} (não só mensagem) e ter uma conversa franca sobre continuidade: retomar o objetivo que ele trouxe no início, mostrar o que já evoluiu e perguntar o que precisaria mudar para seguir`);
 s.forEach(x => {
  const d = x.dados || {};
  if (x.chave === 'cancel') {
   if (n === 'amarelo') add(`Na próxima sessão, perguntar o que tem dificultado manter os encontros (${x.texto}) e confirmar se o dia e o horário ainda funcionam`);
   else if (n === 'laranja') add(`Reconfirmar cada sessão 24 horas antes e combinar uma regra de remarcação: quem precisar remarcar já escolhe a nova data na mesma mensagem`);
   else add(`Propor um formato que caiba no momento dele (ex.: sessões ${ctx.freq >= 30 ? 'mais curtas' : 'mais espaçadas'}) antes que os cancelamentos virem desistência`);
  }
  if (x.chave === 'dever') {
   if (n === 'amarelo') add(`Abrir a próxima sessão pelo dever de casa pendente${d.maisAntigo ? ` (enviado em ${cpe_fmt(d.maisAntigo)})` : ''}, perguntando o que impediu, sem cobrança`);
   else if (n === 'laranja') add(`Trocar a próxima lista por 1 tarefa curta (até 15 minutos) escolhida junto com ${ctx.nome}, com resposta combinada para até ${Math.max(3, Math.round(ctx.freq / 3))} dias`);
   else add(`Suspender novas tarefas até a conversa de continuidade; depois, retomar com 1 tarefa combinada na própria sessão`);
  }
  if (x.chave === 'incompletas') {
   const ex = d.exemplos || {};
   if (d.naoSem && ex.naoSem && ex.naoSem[0]) add(`Pedir o retorno das tarefas que ficaram sem resposta nem justificativa, começando por "${cpe_corta(ex.naoSem[0].tarefa, 70)}"`);
   if (d.parcial && ex.parcial && ex.parcial[0]) add(`Dividir em etapas menores a tarefa feita pela metade ("${cpe_corta(ex.parcial[0].tarefa, 60)}") e reconhecer a parte que foi feita`);
   const motivos = (ex.naoJust || []).map(e => e.motivo).filter(Boolean);
   if (motivos.length) add(`Levar para a sessão o motivo que ${ctx.nome} deu ao não fazer: "${cpe_corta(motivos[0], 80)}"; se ele se repetir, ajustar a tarefa a essa realidade`);
  }
  if (x.chave === 'percepcao') {
   const c = d.contagem || {};
   if (c.falou_parar) add(`Retomar o que ${ctx.nome} disse sobre parar ou pausar: perguntar o que está pesando e oferecer alternativas (pausa com data de retorno, outra frequência), em vez de esperar a decisão`);
   if (c.financeiro) add(`Conversar sobre um formato financeiramente viável (ex.: sessões ${ctx.freq < 30 ? 'mensais' : 'mais espaçadas'} por um período) antes que vire desistência`);
   if (c.desmotivado) add(`Mostrar evidências concretas de evolução (telemetrias e tarefas concluídas) e definir uma meta curta, com resultado visível em até 2 semanas`);
   if (c.sobrecarga) add(`Reduzir a carga do dever de casa e ajustar a frequência ao momento de ${ctx.nome}`);
   if (c.resistencia) add(`Perguntar qual tarefa faz menos sentido para ${ctx.nome} e por quê, e construir a próxima junto com ele`);
   if (c.distante) add(`Começar as próximas sessões com um check-in curto: como chegou, o que está ocupando a cabeça hoje`);
  }
  if (x.chave === 'demora') add(n === 'amarelo' ? `Combinar um prazo de resposta (até ${d.ok} dias depois da sessão) e mandar um lembrete no meio desse prazo` : `Mandar lembrete ${Math.max(2, Math.round(d.ok / 2))} dias depois de cada envio; sem resposta, ligar`);
  if (x.chave === 'onboarding') add(n === 'amarelo' ? `Reenviar o onboarding com uma mensagem pessoal explicando para que ele serve` : `Preencher o onboarding junto com ${ctx.nome} nos primeiros 15 minutos da próxima sessão`);
  if (x.chave === 'ia' && d.achados && d.achados[0]) add(`Levar para a sessão o ponto de atenção da análise da IA de ${cpe_fmt(d.achados[0].dia)}: "${cpe_corta(d.achados[0].texto, 90)}"`);
 });
 if (n === 'estavel') {
  const dv = ctx.dv;
  if (dv.total && dv.feitas / dv.total >= 0.7) add(`Reconhecer na próxima sessão o que ${ctx.nome} entregou: ${dv.feitas} de ${dv.total} tarefas concluídas nos últimos 30 dias`);
  add(`Aumentar um pouco o desafio de uma tarefa do próximo dever de casa, ligada à meta principal do PDI`);
  add(`Revisar com ${ctx.nome} os marcos do PDI e definir o próximo resultado a buscar neste ciclo`);
 }
 // A próxima sessão marcada na Agenda é sempre uma das ações quando ainda não existe
 const cap = n === 'vermelho' ? 4 : 3;
 const res = out.slice(0, cap);
 if (!ctx.proxima) { const t = `Deixar a próxima sessão marcada na Agenda do Mentor (${n === 'estavel' || n === 'amarelo' ? 'no ritmo combinado' : 'o quanto antes'})`; if (res.length < cap) res.push(t); else res[cap - 1] = t; }
 return res.map((t, i) => ({ t, prazo: prazo[Math.min(i, 2)] }));
}

function cp_engajAlertaPlano(nome, tele, dv, proxima) {
 if (!tele.nivel) {
  return `<div class="cpe-alerta" style="background:#f8fafc;border-color:#e2e8f0;"><div class="cpe-rot" style="color:#475569;">Alerta do Controle de Missão</div>
   <div class="cpe-alerta-txt" style="color:#475569;">Ainda sem dados de ${cp_esc(nome)}. O alerta aparece sozinho quando houver sessões agendadas, dever de casa, onboarding ou registros de sessão para analisar.</div></div>`;
 }
 const R = tele.risco, nv = tele.nivel, s = R.sinais;
 const ctx = { nome, freq: tele.freq.dias, dv, proxima, aMarcar: R.aMarcar.length };
 const frasesSinais = s.slice(0, 3).map(x => x.texto.charAt(0).toUpperCase() + x.texto.slice(1) + '.');
 const titulo = { estavel: 'Sem alerta', amarelo: 'Alerta amarelo · atenção', laranja: 'Alerta laranja · risco de abandono', vermelho: 'Alerta vermelho · risco alto de abandono' }[nv.chave];
 const abertura = {
  estavel: `${nome} está em órbita estável: índice de risco ${R.pontos} de 100.${s.length ? ' Há sinais leves, abaixo do nível de alerta: ' + s.slice(0, 2).map(x => x.texto).join('; ') + '.' : ' Nenhum sinal de afastamento no momento.'}`,
  amarelo: `Sinais iniciais de afastamento (índice ${R.pontos} de 100). Vale entender a causa antes que vire padrão.`,
  laranja: `${nome} mostra um padrão de afastamento (índice ${R.pontos} de 100). É hora de agir de forma direta.`,
  vermelho: `Risco alto de abandono (índice ${R.pontos} de 100). Converse com ${nome} sobre a continuidade nos próximos dias.`
 }[nv.chave];
 const agr = R.agravantes.length ? `<div class="cpe-alerta-txt" style="margin-top:6px;"><b>Agravante:</b> ${cp_esc(R.agravantes.join('; '))}.</div>` : '';
 const aMarcar = R.aMarcar.length ? `<div class="cpe-alerta-nota" style="font-style:normal;">${cpe_plural(R.aMarcar.length, 'sessão agendada já passou e ainda não foi marcada', 'sessões agendadas já passaram e ainda não foram marcadas')} na Agenda (realizada, cancelada, remarcada ou falta). Marque no quadro "Sessões agendadas", em Indicadores, para o cálculo considerar.</div>` : '';
 const alertaHtml = `<div class="cpe-alerta" style="background:${nv.fundo};border-color:${nv.borda};border-left:6px solid ${nv.cor};">
  <div class="cpe-rot" style="color:${nv.texto};">${titulo}</div>
  <div class="cpe-alerta-txt" style="color:${nv.texto};">${cp_esc(abertura)}</div>
  ${nv.chave !== 'estavel' && frasesSinais.length ? `<ul class="cpe-alerta-lista" style="color:${nv.texto};">${frasesSinais.map(f => `<li>${cp_esc(f)}</li>`).join('')}</ul>` : ''}
  ${agr}${aMarcar}
  <div class="cpe-alerta-nota">Calculado a cada abertura a partir dos cancelamentos da Agenda, do dever de casa, das respostas incompletas, da demora, do onboarding, da sua percepção nas sessões e dos pontos de atenção da IA já gerados. Não usa análises da IA.</div></div>`;

 // PDCA
 const ciclo = nv.ciclo;
 const alvo = nv.chave === 'vermelho' ? 50 : 30;
 const P = {
  estavel: `Situação: sem sinais relevantes de afastamento (índice ${R.pontos}).<br>Foco do ciclo: aprofundar resultados e manter o vínculo.<br>Meta em ${ciclo} dias: manter o índice abaixo de 30 e concluir pelo menos 70% das tarefas.`,
  amarelo: `Problema principal: ${cp_esc(s[0] ? s[0].texto : R.agravantes[0] || '')}.<br>Objetivo: descobrir a causa e ajustar antes que vire padrão.<br>Meta em ${ciclo} dias: índice abaixo de 30 (hoje ${R.pontos}).`,
  laranja: `Problema principal: ${cp_esc(s[0] ? s[0].texto : R.agravantes[0] || '')}${s[1] ? `, somado a: ${cp_esc(s[1].texto)}` : ''}.<br>Objetivo: reverter o padrão e renovar o compromisso com a mentoria.<br>Meta em ${ciclo} dias: índice abaixo de 30 (hoje ${R.pontos}).`,
  vermelho: `Problema principal: ${cp_esc(s[0] ? s[0].texto : R.agravantes[0] || '')}.<br>Objetivo: decisão clara sobre a continuidade em até 7 dias, com um novo acordo se ${cp_esc(nome)} seguir.<br>Meta em ${ciclo} dias: índice abaixo de ${alvo} (hoje ${R.pontos}).`
 }[nv.chave];
 const acoes = cpe_acoes(nv, s, ctx);
 const D = '<ol class="cpe-plano">' + acoes.map(a => `<li>${cp_esc(a.t)} <span class="cpe-prazo">· ${a.prazo}</span></li>`).join('') + '</ol>';
 const chk = [];
 chk.push({ txt: `Índice de risco abaixo de ${alvo}`, atual: `hoje ${R.pontos}`, ok: R.pontos < alvo });
 s.forEach(x => {
  const d = x.dados || {};
  if (x.chave === 'cancel') chk.push({ txt: 'Próximas 2 sessões realizadas, sem cancelamento ou falta', atual: `hoje ${d.c + d.f} de ${d.n} não aconteceram`, ok: false });
  if (x.chave === 'dever') chk.push({ txt: `Próximo dever de casa respondido em até ${tele.risco.carencia} dias`, atual: `hoje ${d.sem} de ${d.n} sem resposta`, ok: false });
  if (x.chave === 'incompletas') chk.push({ txt: 'Próxima entrega sem tarefas sem justificativa e com no máximo 1 pela metade', atual: `hoje ${d.naoSem} sem justificativa e ${d.parcial} pela metade`, ok: false });
  if (x.chave === 'demora') chk.push({ txt: `Responder em até ${d.ok} dias, em média`, atual: `hoje ${d.media.toFixed(1).replace('.', ',')} dias`, ok: false });
  if (x.chave === 'onboarding') chk.push({ txt: 'Onboarding respondido', atual: `pendente há ${d.idade} dias`, ok: false });
  if (x.chave === 'percepcao') chk.push({ txt: 'Nas próximas 2 sessões, nenhuma marcação de risco na sua percepção', atual: `hoje: ${Object.keys(d.contagem || {}).length} tipo(s) marcado(s)`, ok: false });
  if (x.chave === 'ia') chk.push({ txt: 'Próxima análise da IA sem pontos de atenção sobre afastamento', atual: `hoje ${d.achados.length} ponto(s)`, ok: false });
 });
 if (nv.chave === 'estavel') chk.push({ txt: 'Pelo menos 70% das tarefas concluídas', atual: dv.total ? `hoje ${Math.round(dv.feitas / dv.total * 100)}%` : 'sem tarefas no período', ok: dv.total ? dv.feitas / dv.total >= 0.7 : false });
 if (nv.chave === 'vermelho') chk.push({ txt: 'Conversa de continuidade feita e acordo registrado no Registro do Mentor', atual: 'a fazer', ok: false });
 const C = chk.slice(0, 5).map(c => `<div class="cpe-chk"><span class="${c.ok ? 'cpe-chk-ok' : 'cpe-chk-no'}">${c.ok ? '✓' : '○'}</span><div>${cp_esc(c.txt)}<div class="cpe-sub" style="margin:0;">${cp_esc(c.atual)} · ${c.ok ? 'atingido' : 'a acompanhar'}</div></div></div>`).join('');
 const A = {
  estavel: `Se o índice seguir abaixo de 30 ao fim dos ${ciclo} dias: abrir um novo ciclo com um desafio maior no PDI.<br>Se algum sinal aparecer: tratar logo na sessão seguinte, antes que vire alerta.`,
  amarelo: `Se os sinais sumirem em ${ciclo} dias: manter o formato atual.<br>Se continuarem ou aparecer um novo: tratar como risco — conversa direta sobre o ritmo e ajuste de tarefas e frequência.`,
  laranja: `Se em ${ciclo} dias o índice cair abaixo de 30: voltar ao acompanhamento normal.<br>Se não cair: propor mudança de formato (frequência menor ou pausa programada com data de retorno) antes que ${cp_esc(nome)} decida parar sozinho.`,
  vermelho: `Se a conversa confirmar a continuidade: registrar o novo acordo (frequência e tarefas) no Registro do Mentor e acompanhar a cada sessão.<br>Se ${cp_esc(nome)} quiser parar ou pausar: combinar pausa com data de retorno ou uma sessão de encerramento, e arquivar com o motivo correto — isso calibra as próximas previsões.`
 }[nv.chave];
 const q = (letra, nomeQ, cor, corpo) => `<div class="cpe-q" style="border-top-color:${cor};"><div class="cpe-q-tit"><span class="cpe-q-l" style="background:${cor};">${letra}</span><span style="color:${cor};">${nomeQ}</span></div><div class="cpe-q-corpo">${corpo}</div></div>`;
 const tituloPlano = nv.chave === 'estavel' ? `Plano de evolução — PDCA de ${ciclo} dias` : `Plano de ação — PDCA de ${ciclo} dias · nível ${nv.nome.toLowerCase()}`;
 const planoHtml = `<div class="cpe-card cpe-bloco"><div class="cpe-rot">${tituloPlano}</div>
  <div class="cpe-pdca">${q('P', 'Planejar', '#5B2DA3', P)}${q('D', 'Executar', '#b45309', D)}${q('C', 'Verificar', '#16a34a', C)}${q('A', 'Agir', '#2563eb', A)}</div></div>`;
 return alertaHtml + planoHtml;
}

// Sessões agendadas (para marcar realizada / cancelada / remarcada / falta)
function cpe_htmlSessoes(tele, menteeId) {
 const hoje = cp_chaveDia(Date.now());
 const passadas = tele.agenda.filter(e => e.dia <= hoje).slice(-6).reverse();
 const futuras = tele.agenda.filter(e => e.dia > hoje).slice(0, 2);
 if (!passadas.length && !futuras.length) return `<div class="cpe-sub">Nenhuma sessão deste mentorado na Agenda do Mentor. Os cancelamentos só entram no cálculo quando as sessões estão na Agenda, com o mentorado escolhido no compromisso.</div>`;
 const linha = (e, futura) => {
  const st = CPE_STATUS[e.status];
  const botoes = futura ? '' : `<div class="cpe-ses-bt">${Object.keys(CPE_STATUS).map(k => `<button type="button" class="${e.status === k ? 'on' : ''}" onclick="cp_engajMarcarSessao('${cp_esc(e.id)}', '${k}', '${cp_esc(menteeId)}')">${CPE_STATUS[k].nome}</button>`).join('')}</div>`;
  return `<div class="cpe-ses"><div class="cpe-ses-top"><span><b>${cpe_fmt(e.dia)}</b>${e.hora ? ' · ' + cp_esc(e.hora) : ''}</span>
   ${futura ? '<span class="cpe-ses-st" style="background:#eef2ff;color:#3730a3;">Agendada</span>' : (st ? `<span class="cpe-ses-st" style="background:${st.fundo};color:${st.cor};">${st.nome}</span>` : '<span class="cpe-ses-st" style="background:#fef9c3;color:#854d0e;">A marcar</span>')}</div>${botoes}</div>`;
 };
 return futuras.map(e => linha(e, true)).join('') + passadas.map(e => linha(e, false)).join('');
}

window.cp_engajMarcarSessao = async function (eventoId, status, menteeId) {
 if (typeof vlAlterarLista !== 'function') { alert('A Agenda não está disponível nesta página.'); return; }
 const salva = await vlAlterarLista('agenda_eventos', l => l.map(e => String(e.id) === String(eventoId) ? Object.assign({}, e, { status, statusEm: new Date().toISOString() }) : e));
 if (!salva) return;
 window.vlAgenda = salva;
 cp_renderEngajamento(menteeId);
};
window.cp_engajSalvarFrequencia = async function (menteeId, valor) {
 if (!window.supabaseClient) return;
 const dias = valor === 'auto' ? null : parseInt(valor, 10);
 const dados = { frequenciaDias: dias };
 const { error } = await window.supabaseClient.from('Sessoes_Mentoria').insert([{ mentorado_id: menteeId, tipo: 'engajamento_pref', dados }]);
 if (error) { alert('Não foi possível salvar a frequência. Tente novamente.\n\nDetalhe: ' + (error.message || error)); return; }
 cp_all_sessions.push({ mentorado_id: menteeId, tipo: 'engajamento_pref', dados, created_at: new Date().toISOString() });
 cp_renderEngajamento(menteeId);
};

// ══════════════════════════════════════════════════════════════════════
// ABA ENGAJAMENTO
// ══════════════════════════════════════════════════════════════════════
window.cp_renderEngajamento = async function (menteeId) {
 const host = document.getElementById('cp-engajamento-content');
 if (!host) return;
 host.innerHTML = '<div style="padding:2rem; text-align:center; color:#94a3b8; font-size:13px;">Carregando…</div>';
 await cp_engajGarantirAgenda();
 if (!cp_currentMentee || String(cp_currentMentee.id) !== String(menteeId)) return;
 const mentee = cp_currentMentee;
 cp_engajInjetarEstilo(); cpe_estilos();
 const tele = cp_engajTelemetria(menteeId, { serie: true });
 const dv = cp_engajDever30(menteeId);
 const partes = mentee && mentee.nome ? String(mentee.nome).trim().split(/\s+/) : [];
 const primeiro = partes[0] || 'Este mentorado';
 const nomeCurto = partes.length ? partes[0] + (partes.length > 1 ? ' ' + partes[partes.length - 1].charAt(0).toUpperCase() + '.' : '') : '';
 const hoje = cp_chaveDia(Date.now());
 const prefs = cp_engajPrefs(menteeId);

 // Próxima sessão (Agenda)
 const prox = tele.agenda.filter(e => e.dia >= hoje && e.status !== 'cancelada_mentor' && e.status !== 'cancelada_mentorado')[0] || null;
 let proximaHtml;
 if (prox) {
  const d = cpe_dia(prox.dia);
  const mes = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();
  const semana = d.toLocaleDateString('pt-BR', { weekday: 'long' });
  proximaHtml = `<div class="cpe-prox"><div class="cpe-data"><b>${String(d.getDate()).padStart(2, '0')}</b><span>${mes}</span></div>
   <div><div class="cpe-prox-tit">${semana.charAt(0).toUpperCase() + semana.slice(1)}${prox.hora ? ' · ' + prox.hora.replace(':', 'h') : ''}</div>
   <div class="cpe-sub">${(tele.sessDias || []).length + 1}º encontro</div></div></div>`;
 } else if (prefs.lembreteProximaSessaoOculto) proximaHtml = '<div class="cpe-vazio">Sem sessão agendada.</div>';
 else proximaHtml = `<div class="cpe-lembrete"><div>Nenhuma sessão agendada para ${cp_esc(primeiro)}.<br>
   <a href="javascript:void(0)" onclick="mentoraAgendarPara('${cp_esc(menteeId)}', '${cp_esc(String((mentee && mentee.nome) || '').replace(/['\\]/g, ''))}')">Agendar na Agenda do Mentor</a></div>
   <button onclick="cp_ocultarLembreteSessao('${cp_esc(menteeId)}')" title="Dispensar">×</button></div>`;

 // Score e índice
 const nv = tele.nivel;
 const scoreHtml = tele.hoje.score == null
  ? `<div class="cpe-linha"><span class="cpe-num" style="color:#cbd5e1;">—</span><span class="cpe-selo cpe-est">Sem dados ainda</span></div><div class="cpe-sub">Começa a contar com sessões na Agenda, dever de casa, onboarding ou registros de sessão.</div>`
  : `<div class="cpe-linha"><span class="cpe-num">${tele.hoje.score}</span><span class="cpe-selo" style="background:${nv.fundo};color:${nv.texto};">${nv.nome}</span></div><div class="cpe-sub">100 menos o índice de risco</div>`;
 const demora = tele.risco.demoraMedia;
 const demoraHtml = demora != null ? `<div class="cpe-num">${demora.toFixed(1).replace('.', ',')} dias</div><div class="cpe-sub">esperado: até ${Math.round(tele.freq.dias / 3)} dias (sessões a cada ${tele.freq.dias} dias)</div>`
  : `<div class="cpe-num" style="color:#cbd5e1;">– dias</div><div class="cpe-sub">Aparece quando o mentorado responder o dever de casa ou o onboarding.</div>`;
 let previsHtml;
 if (!nv) previsHtml = `<div class="cpe-previs"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="38" fill="none" stroke="#eef0f4" stroke-width="14"></circle></svg><div class="cpe-previs-txt">Índice de risco de abandono<br><span class="cpe-sub">sem dados ainda</span></div></div>`;
 else {
  const C = 2 * Math.PI * 38, fr = Math.max(0.02, tele.risco.pontos / 100);
  previsHtml = `<div class="cpe-previs"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="38" fill="none" stroke="#eef0f4" stroke-width="14"></circle>
   <circle cx="50" cy="50" r="38" fill="none" stroke="${nv.cor}" stroke-width="14" stroke-dasharray="${(C * fr).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 50 50)"></circle>
   <text x="50" y="56" text-anchor="middle" font-size="20" font-weight="700" fill="#111827">${tele.risco.pontos}</text></svg>
   <div class="cpe-previs-txt">Índice de risco de abandono<br><b style="color:${nv.texto};">${nv.chave === 'estavel' ? 'Sem alerta' : 'Alerta ' + nv.chave}</b> · de 0 a 100</div></div>`;
 }

 // Barras do dever de casa (4 estados)
 const pctT = n => dv.total ? Math.round((n / dv.total) * 100) : 0;
 const barra = (cor, nome, n) => `<div class="cpe-barra"><span class="cpe-pt" style="background:${cor}"></span><span class="cpe-bn">${nome}</span>
  <div class="cpe-trilho"><div style="width:${pctT(n)}%; background:${cor};"></div></div><span class="cpe-bp">${pctT(n)}%</span></div>`;
 const deverHtml = barra('#16a34a', 'Concluídas', dv.feitas) + barra('#ca8a04', 'Feitas parcialmente', dv.parciais) + barra('#ea580c', 'Não feitas — com justificativa', dv.naoJust) + barra('#dc2626', 'Não feitas — sem justificativa ou sem resposta', dv.semResp)
  + (dv.aguardando ? `<div class="cpe-sub" style="margin-top:8px;">${cpe_plural(dv.aguardando, 'tarefa recém-enviada aguarda', 'tarefas recém-enviadas aguardam')} resposta (entra no cálculo quando o mentorado responder ou após ${dv.carencia} dias).</div>` : '')
  + `<div class="cpe-sub" style="margin-top:8px;"><b>Feita parcialmente</b> = não concluída, mas com parte entregue (algumas semanas feitas ou comprovação enviada).</div>`
  + (!dv.total && !dv.aguardando ? '<div class="cpe-sub" style="margin-top:4px;">Nenhuma tarefa de dever de casa nos últimos 30 dias.</div>' : '');

 const freqSel = `<select class="cpe-freq" onchange="cp_engajSalvarFrequencia('${cp_esc(menteeId)}', this.value)">
  <option value="auto" ${CPE_FREQ_OPCOES.includes(parseInt(prefs.frequenciaDias, 10)) ? '' : 'selected'}>Automática (pela Agenda)${tele.freq.fonte !== 'combinada' ? ' · hoje ' + CPE_FREQ_NOME[tele.freq.dias] : ''}</option>
  ${CPE_FREQ_OPCOES.map(d => `<option value="${d}" ${parseInt(prefs.frequenciaDias, 10) === d ? 'selected' : ''}>${CPE_FREQ_NOME[d].charAt(0).toUpperCase() + CPE_FREQ_NOME[d].slice(1)} (a cada ${d} dias)</option>`).join('')}</select>`;

 host.innerHTML = `<div class="cpe-fundo">
  <div class="cpe-topo cpe-topo-flex"><div><div class="cpe-topo-r">Prontuário individual</div><div class="cpe-topo-n">${cp_esc(nomeCurto)}</div></div>
   <label class="cpe-freq-l">Frequência combinada das sessões ${freqSel}</label></div>
  <div class="cpe-grid">
   <div class="cpe-card"><div class="cpe-rot">Score de engajamento</div>${scoreHtml}</div>
   <div class="cpe-card"><div class="cpe-rot">Demora média para responder</div>${demoraHtml}</div>
   <div class="cpe-card"><div class="cpe-rot">Próxima sessão</div>${proximaHtml}</div>
   <div class="cpe-card"><div class="cpe-rot">Previsibilidade de abandono</div>${previsHtml}</div>
  </div>
  <div class="cpe-secao">Indicadores</div>
  <div class="cpe-card cpe-bloco">${cp_engajOrbita(tele)}</div>
  <div class="cpe-duas">
   <div class="cpe-card"><div class="cpe-rot">Tarefas do dever de casa (últimos 30 dias · ${dv.total} no total)</div>${deverHtml}</div>
   <div class="cpe-card"><div class="cpe-rot">Sessões agendadas</div>${cpe_htmlSessoes(tele, menteeId)}</div>
  </div>
  <div class="cpe-secao">Diagnóstico e plano de ação</div>
  ${cp_engajAlertaPlano(primeiro, tele, dv, prox)}
  <div class="cpe-rodape">A previsibilidade de abandono cruza os cancelamentos das sessões, o dever de casa, as respostas incompletas, a demora, o onboarding, a sua percepção nas sessões e os pontos de atenção da IA. Nenhuma previsão é 100% certa: desistências por motivos externos (mudança de emprego, saúde, família) nem sempre deixam sinais antes. Ao arquivar um mentorado, informe o motivo correto: com casos reais, os pesos podem ser calibrados.</div>
 </div>`;
};

function cpe_estilos() {
 if (document.getElementById('cpe-estilo-v7')) return;
 const st = document.createElement('style'); st.id = 'cpe-estilo-v7';
 st.textContent = `
#cp-engajamento-content .cpe-am{background:#fef9c3;color:#854d0e}
#cp-engajamento-content .cpe-lr{background:#ffedd5;color:#9a3412}
#cp-engajamento-content .cpe-topo-flex{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap}
#cp-engajamento-content .cpe-freq-l{display:flex;flex-direction:column;gap:4px;font-size:12.5px;color:#475569;font-weight:600}
#cp-engajamento-content .cpe-freq{border:1px solid #cbd5e1;border-radius:8px;padding:7px 10px;font-size:13.5px;background:#fff;color:#111827;font-family:inherit}
#cp-engajamento-content .cpe-alerta-lista{margin:8px 0 0 18px;padding:0;font-size:14.5px;line-height:1.6}
#cp-engajamento-content .cpe-sinal{margin:0 0 14px}
#cp-engajamento-content .cpe-sinal-cab{display:flex;justify-content:space-between;font-size:14.5px;color:#374151;margin-bottom:5px}
#cp-engajamento-content .cpe-sinal-cab b{font-weight:600;color:#111827}
#cp-engajamento-content .cpe-ses{border:1px solid #e5e9f0;border-radius:10px;padding:10px 12px;margin-bottom:8px;background:#fbfcfe}
#cp-engajamento-content .cpe-ses-top{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:14px;color:#334155}
#cp-engajamento-content .cpe-ses-st{font-size:12px;font-weight:600;padding:3px 10px;border-radius:999px}
#cp-engajamento-content .cpe-ses-bt{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
#cp-engajamento-content .cpe-ses-bt button{border:1px solid #d6dbe4;background:#fff;color:#475569;border-radius:999px;padding:4px 10px;font-size:12px;cursor:pointer;font-family:inherit}
#cp-engajamento-content .cpe-ses-bt button.on{background:#5B2DA3;border-color:#5B2DA3;color:#fff}
#cp-engajamento-content .cpe-bn{width:220px}
#cp-engajamento-content .cpe-secao{font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#5B2DA3;margin:30px 0 12px;padding-bottom:8px;border-bottom:2px solid #E9E3F7}
#cp-engajamento-content .cpe-duas{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px;margin-top:0;align-items:start}
#cp-engajamento-content .cpe-duas>.cpe-card{margin:0}
@media (max-width:1100px){#cp-engajamento-content .cpe-duas{grid-template-columns:1fr}}
@media (max-width:640px){#cp-engajamento-content .cpe-bn{width:130px}}`;
 document.head.appendChild(st);
}

// ══════════════════════════════════════════════════════════════════════
// PERCEPÇÃO DA SESSÃO no bloco de notas (vai junto com o Registro do Mentor)
// ══════════════════════════════════════════════════════════════════════
window.cp_engajPercepcaoHtml = function () {
 return `<div class="cpc-percep"><div class="cpc-percep-t">Percepção desta sessão <span>(opcional · entra no Engajamento)</span></div>
  <div class="cpc-percep-g">${CPE_PERCEPCOES.map(p => `<label class="cpc-percep-i ${p.neg ? 'neg' : 'pos'}"><input type="checkbox" value="${p.chave}"> ${p.nome}</label>`).join('')}</div></div>`;
};
window.cp_engajPercepcaoLer = function () {
 return Array.from(document.querySelectorAll('#cp-caderno-wrap .cpc-percep input:checked')).map(i => i.value).filter(v => CPE_PERCEPCOES.some(p => p.chave === v));
};
(function () {
 if (document.getElementById('cpc-percep-estilo')) return;
 const st = document.createElement('style'); st.id = 'cpc-percep-estilo';
 st.textContent = `.cpc-percep{margin-top:14px;border-top:1px dashed #E2E8F0;padding-top:12px}
.cpc-percep-t{font-size:13px;font-weight:700;color:#1B2559;margin-bottom:8px}.cpc-percep-t span{font-weight:500;color:#94A3B8}
.cpc-percep-g{display:flex;flex-wrap:wrap;gap:8px}
.cpc-percep-i{display:inline-flex;align-items:center;gap:6px;font-size:13px;border:1px solid #E2E8F0;border-radius:999px;padding:5px 12px;cursor:pointer;background:#fff;color:#334155}
.cpc-percep-i input{accent-color:#5B2DA3}
.cpc-percep-i.neg:has(input:checked){background:#FEF2F2;border-color:#FECACA;color:#991B1B}
.cpc-percep-i.pos:has(input:checked){background:#F0FDF4;border-color:#BBF7D0;color:#166534}`;
 document.head.appendChild(st);
})();
