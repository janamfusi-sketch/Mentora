/* =====================================================================
   Mentóra — COMUNIDADE SOCIAL
   Mural (7 reações, comentários, repostar), perfil público (seguir e
   mensagem), chat flutuante em tempo real e a aba "Nos Avalie".
   Depende de: supabase-js, e das funções do HTML principal
   initSupabaseComunidade, escMural, imagemSeguraMural, nomeExibicaoMural,
   obterIdentidadeComunidade, checkIsAdmin, restringirMentora, excluirPostForum.
   Precisa do SQL comunidade_social.sql aplicado no Supabase.
   ===================================================================== */
(function () {
  'use strict';

  var REACOES = [
    { k: 'curtir', e: '👍', l: 'Curtir' },
    { k: 'amei', e: '❤️', l: 'Amei' },
    { k: 'parabens', e: '👏', l: 'Parabéns' },
    { k: 'forca', e: '💪', l: 'Força' },
    { k: 'inspirador', e: '💡', l: 'Inspirador' },
    { k: 'gratidao', e: '🙏', l: 'Gratidão' },
    { k: 'apoio', e: '🤗', l: 'Apoio' }
  ];
  var REACAO = {}; REACOES.forEach(function (r) { REACAO[r.k] = r; });
  var ROTULO_NOTA = ['', 'Ruim', 'Regular', 'Bom', 'Muito bom', 'Perfeito'];
  var LIMITE_PALAVRAS = 2000;

  var CS = {
    meuId: null,
    admin: false,
    perfis: {},          // id -> perfil público
    ocultos: new Set(),  // quem eu restringi/bloqueei
    posts: {},           // id -> post (inclui originais de reposts)
    reacoes: {},         // post_id -> [{mentor_id, tipo}]
    nComentarios: {},
    nReposts: {},
    chat: { aberto: false, minimizado: false, outro: null, conversas: [], canal: null, timer: null, rtOk: false, rtCaiu: false, visOuvinte: false, saiuEm: 0 },
    aval: { lista: [], minha: null, filtro: 0, nota: 0, canal: null, carregando: false, pendente: false, timer: null, desatualizada: false }
  };
  window.MentoraSocial = CS;

  /* ───────────── utilidades ───────────── */
  function esc(v) { return typeof escMural === 'function' ? escMural(v) : String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // Imagens válidas: endereço do nosso Storage (novo) ou imagem embutida (posts/fotos antigos)
  var RX_STORAGE = /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/mentora-imagens\/[A-Za-z0-9\/_.-]+$/;
  function imgOk(v) {
    if (typeof v === 'string' && RX_STORAGE.test(v)) return v;
    return typeof imagemSeguraMural === 'function' ? imagemSeguraMural(v) : '';
  }
  function imgPost(p) { return imgOk(p && p.imagem_url) || imgOk(p && p.imagem); }
  function nomeMural(v) { return typeof nomeExibicaoMural === 'function' ? nomeExibicaoMural(v) : String(v || 'Mentor(a)'); }
  function linkOk(u) { u = String(u || '').trim(); return /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : ''; }
  function $(id) { return document.getElementById(id); }
  function dataHora(d) {
    var o = new Date(d || Date.now());
    return o.toLocaleDateString('pt-BR') + ' às ' + o.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  function dataCurta(d) {
    var o = new Date(d || Date.now()), hoje = new Date();
    if (o.toDateString() === hoje.toDateString()) return o.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return o.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }
  function contarPalavras(t) { t = String(t || '').trim(); return t ? t.split(/\s+/).length : 0; }
  function msgErro(e) { return (e && (e.message || e.details)) || String(e); }

  async function sb() {
    if (typeof initSupabaseComunidade === 'function') await initSupabaseComunidade();
    return window.supabaseClient || null;
  }
  async function sessao() {
    var c = await sb(); if (!c) return null;
    var r = await c.auth.getSession();
    var u = r && r.data && r.data.session && r.data.session.user;
    CS.meuId = u ? u.id : null;
    CS.admin = !!(u && typeof checkIsAdmin === 'function' && checkIsAdmin(String(u.email || '').toLowerCase()));
    return u || null;
  }

  async function carregarPerfis(ids) {
    var faltam = Array.from(new Set((ids || []).filter(function (i) { return i && !CS.perfis[i]; })));
    if (!faltam.length) return;
    var c = await sb(); if (!c) return;
    var r = await c.rpc('mentora_perfis_publicos', { p_ids: faltam });
    if (r.error) { console.warn('Perfis públicos:', r.error.message); return; }
    (r.data || []).forEach(function (p) { CS.perfis[p.id] = p; });
  }
  function perfilDe(id, nomeReserva) {
    return CS.perfis[id] || { id: id, nome: nomeMural(nomeReserva), foto: null };
  }
  function avatar(p, tam, clicavel) {
    tam = tam || 44;
    var nome = (p && p.nome) || 'M';
    var foto = imgOk(p && p.foto);
    var attrs = clicavel && p && p.id ? ' data-cs="perfil" data-id="' + esc(p.id) + '" role="button" tabindex="0" title="Ver perfil de ' + esc(nome) + '"' : '';
    return '<span class="cs-av' + (clicavel ? ' cs-link' : '') + '" style="width:' + tam + 'px;height:' + tam + 'px;font-size:' + Math.round(tam * 0.4) + 'px"' + attrs + '>' +
      (foto ? '<img src="' + foto + '" alt="" loading="lazy" decoding="async">' : esc(nome.charAt(0).toUpperCase())) + '</span>';
  }

  /* ───────────── estilos ───────────── */
  function injetarEstilos() {
    if ($('cs-estilos')) return;
    var css = `
.cs-link{cursor:pointer}
.cs-av{border-radius:50%;background:linear-gradient(135deg,#5B2DA3 0%,#4f46e5 100%);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;overflow:hidden}
.cs-av img{width:100%;height:100%;object-fit:cover}
.cs-badge-tipo{background:#f1f5f9;color:#475569;font-size:10px;padding:2px 6px;border-radius:4px;font-weight:600}
.cs-selo-hab{margin:.3rem 0 .15rem;background:#f3eeff;color:#5b2da3;border:1px solid #d9ccf5;font-size:12px;font-weight:700;padding:3px 10px;border-radius:100px}
.cs-post{background:#fff;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 10px 25px -5px rgba(0,0,0,.05);overflow:visible}
.cs-repost-tag{display:flex;align-items:center;gap:6px;font-size:13px;color:#64748B;padding:.85rem 1.25rem 0}
.cs-repost-tag b{color:#334155;cursor:pointer}
.cs-head{display:flex;justify-content:space-between;align-items:flex-start;padding:1.1rem 1.25rem .75rem}
.cs-autor{display:flex;align-items:center;gap:.75rem}
.cs-nome{font-weight:700;font-size:15px;color:#334155;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}
.cs-nome .cs-link:hover{text-decoration:underline}
.cs-data{font-size:12px;color:#64748B;margin-top:2px}
.cs-menu-btn{background:none;border:none;color:#64748B;cursor:pointer;font-size:20px;line-height:1;padding:4px 8px;border-radius:8px}
.cs-menu-btn:hover{background:#f1f5f9}
.cs-menu{display:none;position:absolute;right:0;top:32px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 8px 20px rgba(0,0,0,.08);min-width:190px;z-index:20;overflow:hidden}
.cs-menu.aberto{display:block}
.cs-menu button{display:block;width:100%;text-align:left;background:none;border:none;border-bottom:1px solid #f1f5f9;padding:.7rem 1rem;font-size:14px;color:#475569;cursor:pointer;font-family:inherit}
.cs-menu button:last-child{border-bottom:none}
.cs-menu button:hover{background:#f8fafc}
.cs-menu button.perigo{color:#ef4444}
.cs-corpo{padding:0 1.25rem 1rem}
.cs-titulo{font-weight:700;font-size:16px;color:#1e293b;margin:0 0 .5rem}
.cs-texto{color:#334155;font-size:14px;line-height:1.6;margin:0;white-space:pre-wrap;word-break:break-word}
.cs-img{width:100%;max-height:800px;object-fit:contain;display:block;background:#f8fafc}
.cs-retido{background:#FEF3C7;border:1px solid #FDE68A;color:#92400E;font-size:12px;font-weight:700;padding:6px 10px;border-radius:8px;margin-bottom:.75rem}
.cs-original{border:1px solid #e2e8f0;border-radius:12px;margin:.25rem 1.25rem 1rem;overflow:hidden;background:#fff}
.cs-original .cs-head{padding:.85rem 1rem .5rem}
.cs-original .cs-corpo{padding:0 1rem .9rem}
.cs-original-credito{font-size:11px;color:#5B2DA3;font-weight:600;margin-top:2px}
.cs-indisp{margin:.25rem 1.25rem 1rem;padding:1rem;border:1px dashed #cbd5e1;border-radius:12px;color:#64748B;font-size:13px;text-align:center}
.cs-stats{display:flex;justify-content:space-between;align-items:center;gap:1rem;font-size:13px;color:#64748B;padding:.75rem 1.25rem .5rem;flex-wrap:wrap}
.cs-stats-reac{display:flex;align-items:center;gap:6px}
.cs-stats-reac .em{display:inline-flex}
.cs-stats-reac .em span{width:22px;height:22px;border-radius:50%;background:#fff;border:1px solid #e2e8f0;display:inline-flex;align-items:center;justify-content:center;font-size:12px;margin-left:-5px}
.cs-stats-reac .em span:first-child{margin-left:0}
.cs-stats-dir button{background:none;border:none;color:#64748B;font-size:13px;cursor:pointer;padding:0;font-family:inherit}
.cs-stats-dir button:hover{color:#5B2DA3;text-decoration:underline}
.cs-acoes{display:flex;gap:.5rem;padding:.5rem 1.25rem 1rem;border-top:1px solid #f1f5f9}
.cs-acao{flex:1;background:#f8fafc;border:1px solid transparent;color:#475569;cursor:pointer;font-size:14px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:.4rem;padding:.7rem;border-radius:10px;font-family:inherit;transition:background .15s}
.cs-acao:hover{background:#f1f5f9}
.cs-acao.ativa{color:#5B2DA3;background:rgba(91,45,163,.08)}
.cs-acao:disabled{opacity:.45;cursor:not-allowed}
.cs-reagir{position:relative;flex:1;display:flex}
.cs-picker{display:none;position:absolute;bottom:calc(100% + 8px);left:0;background:#fff;border:1px solid #e2e8f0;border-radius:30px;box-shadow:0 10px 25px rgba(0,0,0,.12);padding:6px 8px;gap:2px;z-index:30}
.cs-picker.aberto{display:flex}
.cs-picker::before{content:'';position:absolute;left:0;right:0;top:100%;height:12px}
.cs-picker button{background:none;border:none;cursor:pointer;font-size:24px;padding:4px 5px;border-radius:50%;position:relative;transition:transform .15s}
.cs-picker button:hover,.cs-picker button:focus-visible{transform:translateY(-4px) scale(1.25);outline:none}
.cs-picker button::after{content:attr(data-rotulo);position:absolute;bottom:calc(100% + 4px);left:50%;transform:translateX(-50%);background:#1e293b;color:#fff;font-size:11px;padding:3px 7px;border-radius:6px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .15s}
.cs-picker button:hover::after{opacity:1}
.cs-coments{display:none;border-top:1px solid #f1f5f9;padding:1rem 1.25rem 1.25rem;background:#fcfcfd;border-radius:0 0 16px 16px}
.cs-coments.aberto{display:block}
.cs-coment-novo{display:flex;gap:.6rem;align-items:flex-start;margin-bottom:1rem}
.cs-coment-novo textarea{flex:1;min-height:42px;max-height:160px;resize:vertical;border:1px solid #e2e8f0;border-radius:20px;padding:.6rem 1rem;font-family:inherit;font-size:14px;outline:none;box-sizing:border-box}
.cs-coment-novo textarea:focus{border-color:#5B2DA3}
.cs-btn{border:none;border-radius:20px;padding:.55rem 1.1rem;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit}
.cs-btn.prim{background:#5B2DA3;color:#fff}
.cs-btn.prim:hover{background:#482382}
.cs-btn.sec{background:#fff;color:#5B2DA3;border:1.5px solid #DDD6FE}
.cs-btn:disabled{opacity:.55;cursor:wait}
.cs-coment{display:flex;gap:.6rem;margin-bottom:.75rem}
.cs-coment-bolha{background:#f1f5f9;border-radius:4px 14px 14px 14px;padding:.6rem .85rem;flex:1;min-width:0}
.cs-coment-bolha .n{font-weight:700;font-size:13px;color:#334155;display:flex;justify-content:space-between;gap:.5rem}
.cs-coment-bolha .n small{font-weight:400;color:#94A3B8}
.cs-coment-bolha p{margin:.25rem 0 0;font-size:14px;color:#334155;line-height:1.5;white-space:pre-wrap;word-break:break-word}
.cs-coment-acoes{display:flex;gap:.9rem;margin-top:.45rem}
.cs-coment-acoes button{background:none;border:none;font-size:12px;font-weight:600;cursor:pointer;padding:0;font-family:inherit;display:inline-flex;align-items:center;gap:4px}
.cs-coment-acoes .ed{color:#5B2DA3}
.cs-coment-acoes .ex{color:#DC2626}
.cs-coment-acoes button:hover{text-decoration:underline}
.cs-coment-edit textarea{width:100%;box-sizing:border-box;min-height:60px;margin-top:.35rem;border:1px solid #5B2DA3;border-radius:10px;padding:.5rem .7rem;font-family:inherit;font-size:14px;resize:vertical;outline:none}
.cs-coment-edit div{display:flex;gap:.5rem;justify-content:flex-end;margin-top:.4rem}
.cs-coment-edit .cs-btn{padding:.35rem .9rem;font-size:13px}
.cs-vazio{color:#64748B;font-size:14px;text-align:center;padding:1.5rem}
.cs-topo-botoes{display:flex;gap:.5rem;align-items:center}
.cs-btn-msg{position:relative;display:inline-flex;align-items:center;gap:.4rem;background:#fff;color:#5B2DA3;border:1.5px solid #DDD6FE;border-radius:8px;padding:.5rem 1rem;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap}
.cs-btn-msg:hover{background:#faf7ff}
.cs-badge-n{display:none;position:absolute;top:-7px;right:-7px;background:#ef4444;color:#fff;font-size:10px;font-weight:700;min-width:18px;height:18px;border-radius:9px;padding:0 4px;align-items:center;justify-content:center;box-sizing:border-box}
.cs-badge-n.on{display:inline-flex}
/* ── Modal ── */
.cs-modal-fundo{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:3000;display:flex;align-items:center;justify-content:center;padding:1rem}
.cs-modal{background:#fff;border-radius:18px;width:100%;max-width:560px;max-height:92vh;overflow:auto;box-shadow:0 25px 50px rgba(0,0,0,.25)}
.cs-modal-top{display:flex;justify-content:space-between;align-items:center;padding:1.1rem 1.4rem;border-bottom:1px solid #f1f5f9}
.cs-modal-top h3{margin:0;font-size:18px;color:#1e293b}
.cs-x{background:none;border:none;font-size:24px;color:#64748B;cursor:pointer;line-height:1}
.cs-modal-corpo{padding:1.25rem 1.4rem}
.cs-modal-rod{display:flex;justify-content:flex-end;gap:.5rem;padding:0 1.4rem 1.25rem}
.cs-nota-aviso{font-size:12px;color:#64748B;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:.65rem .85rem;margin-top:.75rem;line-height:1.5}
/* ── Perfil ── */
.cs-perfil-cab{display:block;max-width:1000px;margin:0 auto 2rem;padding-bottom:2rem;border-bottom:1px solid #e2e8f0}
.cs-pf-topo{display:flex;align-items:flex-start;gap:1.75rem;background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:1.5rem 1.75rem;box-shadow:0 10px 25px -12px rgba(91,45,163,.18)}
.cs-pf-topo>.cs-av{border:3px solid #fff;box-shadow:0 0 0 3px #d8ccef}
.cs-perfil-info{flex:1;min-width:0}
.cs-perfil-info .cs-perfil-botoes{margin-top:1rem}
.cs-pf-blocos{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;margin-top:1rem}
.cs-pf-bloco{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:1.1rem 1.25rem}
.cs-pf-bloco.largo{grid-column:1 / -1}
.cs-pf-tit{font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#5B2DA3;margin:0 0 .55rem}
.cs-pf-txt{font-size:14px;color:#475569;line-height:1.6;margin:0;white-space:pre-wrap;word-break:break-word;display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden}
.cs-pf-txt.aberto{display:block;-webkit-line-clamp:unset}
.cs-pf-mais{background:none;border:none;padding:0;margin-top:.4rem;color:#5B2DA3;font-weight:600;font-size:13px;cursor:pointer;font-family:inherit}
.cs-pf-tags{display:flex;flex-wrap:wrap;gap:.45rem}
.cs-pf-tag{background:#f3effb;color:#4c2590;border:1px solid #e4dbf5;border-radius:999px;padding:.3rem .8rem;font-size:13px;font-weight:600}
.cs-pf-dica{font-size:13px;color:#64748B;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:14px;padding:.9rem 1.1rem;margin-top:1rem}
.cs-pf-dica a{color:#5B2DA3;font-weight:600;cursor:pointer}
.cs-pf-layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:1.5rem;max-width:1000px;margin:0 auto;align-items:start}
.cs-pf-feed{min-width:0}
.cs-pf-lateral{position:sticky;top:90px;display:flex;flex-direction:column;gap:1rem}
.cs-quadro{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:1rem 1.1rem;box-shadow:0 10px 25px -15px rgba(15,23,42,.15)}
.cs-quadro-top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:.2rem}
.cs-quadro-top h4{margin:0;font-size:17px;color:#1e293b}
.cs-quadro-top button{background:none;border:none;padding:0;color:#5B2DA3;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.cs-quadro-sub{font-size:13px;color:#64748B;margin-bottom:.8rem}
.cs-quadro-grade{display:flex;flex-direction:column;margin:0 -.45rem}
.cs-quadro-grade .cs-seg-item{padding:.5rem .45rem;gap:.65rem}
.cs-quadro-grade .cs-seg-nome{font-size:14px}
.cs-quadro-grade .cs-seg-esp{font-size:12px}
.cs-quadro-grade .cs-seg-btn{padding:.3rem .75rem;font-size:12px}
.cs-quadro-item{cursor:pointer;min-width:0}
.cs-quadro-foto{width:100%;aspect-ratio:1/1;border-radius:10px;overflow:hidden;background:linear-gradient(135deg,#5B2DA3 0%,#4f46e5 100%);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:26px}
.cs-quadro-foto img{width:100%;height:100%;object-fit:cover}
.cs-quadro-item:hover .cs-quadro-foto{opacity:.88}
.cs-quadro-nome{font-size:12.5px;font-weight:600;color:#334155;margin-top:.3rem;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media (max-width:900px){.cs-pf-layout{grid-template-columns:1fr}.cs-pf-lateral{position:static;order:-1}}
.cs-num-btn{background:none;border:none;padding:0;font:inherit;color:inherit;cursor:pointer}
.cs-num-btn:hover{text-decoration:underline;color:#5B2DA3}
.cs-seg-modal{max-width:460px;display:flex;flex-direction:column;overflow:hidden}
.cs-seg-abas{display:flex;border-bottom:1px solid #e2e8f0}
.cs-seg-aba{flex:1;background:none;border:none;border-bottom:3px solid transparent;padding:.8rem .5rem;font:inherit;font-size:14px;font-weight:600;color:#64748B;cursor:pointer}
.cs-seg-aba.ativa{color:#5B2DA3;border-bottom-color:#5B2DA3}
.cs-seg-busca{margin:.85rem 1.1rem .35rem;padding:.6rem .9rem;border:1px solid #e2e8f0;border-radius:999px;font:inherit;font-size:14px;outline:none;background:#f8fafc}
.cs-seg-busca:focus{border-color:#5B2DA3;background:#fff}
.cs-seg-lista{overflow-y:auto;max-height:min(60vh,520px);padding:.25rem .5rem .75rem}
.cs-seg-item{display:flex;align-items:center;gap:.8rem;padding:.6rem .6rem;border-radius:12px}
.cs-seg-item:hover{background:#f8fafc}
.cs-seg-info{flex:1;min-width:0}
.cs-seg-nome{font-weight:700;font-size:15px;color:#1e293b;cursor:pointer;display:inline-block}
.cs-seg-nome:hover{text-decoration:underline}
.cs-seg-esp{font-size:13px;color:#64748B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cs-seg-btn{border-radius:999px;padding:.4rem .95rem;font:inherit;font-size:13px;font-weight:600;cursor:pointer;border:1px solid #5B2DA3;background:#5B2DA3;color:#fff;flex-shrink:0}
.cs-seg-btn.sigo{background:#fff;color:#5B2DA3}
.cs-seg-voce{font-size:12px;color:#64748B;flex-shrink:0}
@media (max-width:640px){.cs-pf-topo{flex-direction:column;align-items:center;text-align:center;padding:1.25rem}.cs-perfil-nome,.cs-perfil-num,.cs-perfil-info .cs-perfil-botoes{justify-content:center}.cs-pf-blocos{grid-template-columns:1fr}}
.cs-perfil-nome{font-weight:700;font-size:22px;color:#1e293b;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}
.cs-perfil-esp{font-size:15px;color:#64748B;margin-top:4px}
.cs-perfil-bio{font-size:14px;color:#475569;line-height:1.55;margin:.6rem 0 0;white-space:pre-wrap}
.cs-perfil-num{display:flex;gap:1.25rem;margin-top:.75rem;font-size:14px;color:#64748B}
.cs-perfil-num b{color:#1e293b}
.cs-perfil-redes{display:flex;gap:.4rem;margin-top:.6rem}
.cs-perfil-redes a{font-size:13px;text-decoration:none;color:#5B2DA3;background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:3px 9px}
.cs-perfil-botoes{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;position:relative}
.cs-rede{position:relative;width:40px;height:40px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;border:none;cursor:pointer;text-decoration:none;transition:transform .15s,opacity .15s;padding:0}
.cs-rede:hover{transform:translateY(-2px)}
.cs-rede-instagram{background:radial-gradient(circle at 30% 107%,#fdf497 0%,#fdf497 5%,#fd5949 45%,#d6249f 60%,#285AEB 90%)}
.cs-rede-linkedin{background:#0A66C2}
.cs-rede.vazio{opacity:.45;filter:grayscale(.2)}
.cs-rede.vazio:hover{opacity:.8}
.cs-rede-mais{position:absolute;right:-3px;bottom:-3px;width:17px;height:17px;border-radius:50%;background:#5B2DA3;color:#fff;font-size:13px;font-weight:700;line-height:17px;text-align:center;border:2px solid #fff}
.cs-redes-editor{position:absolute;right:0;top:calc(100% + 8px);z-index:50;width:300px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 14px 34px rgba(15,23,42,.14);padding:14px}
.cs-redes-tit{font-weight:700;color:#1B2559;font-size:14px;margin-bottom:8px}
.cs-redes-editor label{display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:8px}
.cs-redes-editor input{display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:8px 10px;border:1px solid #CBD5E1;border-radius:8px;font-size:13px;font-family:inherit}
.cs-redes-acoes{display:flex;justify-content:flex-end;gap:8px;margin-top:6px}
.cs-redes-msg{font-size:12px;color:#B91C1C;margin-top:6px;min-height:14px}
@media (max-width:640px){.cs-redes-editor{right:auto;left:0;width:min(300px,86vw)}}
.cs-seguindo{background:#fff!important;color:#5B2DA3!important;border:1.5px solid #5B2DA3!important}
/* ── Chat flutuante ── */
.cs-chat{position:fixed;right:20px;bottom:0;width:360px;max-width:calc(100vw - 24px);height:520px;max-height:calc(100vh - 90px);background:#fff;border:1px solid #e2e8f0;border-bottom:none;border-radius:14px 14px 0 0;box-shadow:0 -4px 30px rgba(15,23,42,.18);z-index:2500;display:none;flex-direction:column;font-family:inherit}
.cs-chat.aberto{display:flex}
.cs-chat.mini{height:52px}
.cs-chat.mini .cs-chat-corpo{display:none}
.cs-chat-top{display:flex;align-items:center;gap:.6rem;padding:.7rem .9rem;border-bottom:1px solid #f1f5f9;cursor:pointer;min-height:52px;box-sizing:border-box}
.cs-chat-top .t{font-weight:700;color:#1e293b;font-size:15px;flex:1;display:flex;align-items:center;gap:.5rem;min-width:0}
.cs-chat-top .t span.nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cs-chat-top button{background:none;border:none;color:#64748B;cursor:pointer;font-size:18px;width:30px;height:30px;border-radius:8px;line-height:1}
.cs-chat-top button:hover{background:#f1f5f9}
.cs-chat-top .cs-badge-n{position:static}
.cs-chat-corpo{flex:1;display:flex;flex-direction:column;min-height:0}
.cs-chat-busca{padding:.6rem .8rem;border-bottom:1px solid #f1f5f9}
.cs-chat-busca input{width:100%;box-sizing:border-box;border:none;background:#f1f5f9;border-radius:8px;padding:.55rem .8rem;font-size:14px;outline:none;font-family:inherit}
.cs-chat-lista{flex:1;overflow-y:auto}
.cs-chat-item{display:flex;gap:.7rem;align-items:center;padding:.7rem .9rem;cursor:pointer;border-bottom:1px solid #f8fafc}
.cs-chat-item:hover{background:#f8fafc}
.cs-chat-item .meio{flex:1;min-width:0}
.cs-chat-item .n{font-size:14px;color:#1e293b;font-weight:600;display:flex;justify-content:space-between;gap:.5rem}
.cs-chat-item .n small{font-weight:400;color:#94A3B8;font-size:11px}
.cs-chat-item .u{font-size:13px;color:#64748B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cs-chat-item.nl .u{color:#1e293b;font-weight:600}
.cs-chat-rot{font-size:11px;font-weight:700;color:#94A3B8;padding:.6rem .9rem .2rem;letter-spacing:.02em}
.cs-chat-msgs{flex:1;overflow-y:auto;padding:1rem .9rem;display:flex;flex-direction:column;gap:.35rem;background:#fff}
.cs-bolha{max-width:78%;padding:.55rem .8rem;border-radius:16px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-break:break-word}
.cs-bolha.dela{align-self:flex-start;background:#f1f5f9;color:#1e293b;border-bottom-left-radius:4px}
.cs-bolha.minha{align-self:flex-end;background:#5B2DA3;color:#fff;border-bottom-right-radius:4px}
.cs-bolha small{display:block;font-size:10px;opacity:.65;margin-top:2px;text-align:right}
.cs-chat-dia{align-self:center;font-size:11px;color:#94A3B8;margin:.5rem 0}
.cs-chat-env{display:flex;gap:.5rem;align-items:flex-end;padding:.6rem .8rem;border-top:1px solid #f1f5f9}
.cs-chat-env textarea{flex:1;resize:none;border:1px solid #e2e8f0;border-radius:18px;padding:.55rem .9rem;font-family:inherit;font-size:14px;outline:none;max-height:110px;min-height:38px;box-sizing:border-box}
.cs-chat-env textarea:focus{border-color:#5B2DA3}
.cs-chat-env button{background:#5B2DA3;color:#fff;border:none;border-radius:50%;width:38px;height:38px;cursor:pointer;font-size:16px;flex-shrink:0}
@media (max-width:600px){.cs-chat{right:0;width:100vw;max-width:100vw;border-radius:14px 14px 0 0}}
/* ── Nos Avalie ── */
.cs-av-wrap{max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:1.5rem}
.cs-av-cab{display:flex;justify-content:space-between;align-items:flex-end;gap:1rem;flex-wrap:wrap}
.cs-av-cab h2{font-family:'Playfair Display',serif;font-size:28px;color:#334155;margin:0}
.cs-av-cab p{margin:.35rem 0 0;color:#64748B;font-size:14px}
.cs-termo{background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:1.6rem;display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:2rem;align-items:center}
@media (max-width:720px){.cs-termo{grid-template-columns:1fr}}
.cs-termo-media{display:flex;align-items:baseline;gap:.6rem}
.cs-termo-media .num{font-size:56px;font-weight:800;color:#17224D;line-height:1;font-variant-numeric:tabular-nums}
.cs-termo-media .de{font-size:16px;color:#94A3B8;font-weight:600}
.cs-termo-zona{font-size:15px;font-weight:700;margin-top:.35rem}
.cs-termo-total{font-size:13px;color:#64748B;margin-top:2px}
.cs-termo-barra{position:relative;height:14px;border-radius:10px;margin:1.6rem 0 .5rem;background:linear-gradient(90deg,#EF4444 0%,#F97316 25%,#F59E0B 50%,#84CC16 75%,#10B981 100%)}
.cs-termo-marca{position:absolute;top:50%;width:26px;height:26px;border-radius:50%;background:#fff;border:4px solid #17224D;transform:translate(-50%,-50%);box-shadow:0 2px 8px rgba(0,0,0,.2);transition:left .9s cubic-bezier(.22,1,.36,1)}
.cs-termo-esc{display:flex;justify-content:space-between;font-size:11px;color:#94A3B8;font-weight:600}
.cs-dist{display:flex;flex-direction:column;gap:.45rem}
.cs-dist-l{display:grid;grid-template-columns:34px 1fr 34px;align-items:center;gap:.6rem;font-size:13px;color:#475569;background:none;border:none;padding:2px 4px;border-radius:6px;cursor:pointer;font-family:inherit;text-align:left}
.cs-dist-l:hover,.cs-dist-l.sel{background:#f5f3ff}
.cs-dist-t{height:8px;background:#f1f5f9;border-radius:6px;overflow:hidden}
.cs-dist-t div{height:100%;background:#F59E0B;border-radius:6px;transition:width .6s}
.cs-dist-l .q{text-align:right;color:#94A3B8;font-variant-numeric:tabular-nums}
.cs-estrelas{color:#F59E0B;letter-spacing:1px}
.cs-estrelas .off{color:#E2E8F0}
.cs-aval{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:1.2rem 1.3rem}
.cs-aval-top{display:flex;gap:.75rem;align-items:center}
.cs-aval-top .n{font-weight:700;color:#1e293b;font-size:15px}
.cs-aval-top .d{font-size:12px;color:#94A3B8}
.cs-aval p{margin:.75rem 0 0;font-size:14px;line-height:1.6;color:#334155;white-space:pre-wrap;word-break:break-word}
.cs-aval .mais{background:none;border:none;color:#5B2DA3;font-weight:600;cursor:pointer;padding:0;font-size:13px;margin-top:.35rem;font-family:inherit}
.cs-resposta{margin-top:.9rem;background:#faf7ff;border-left:3px solid #5B2DA3;border-radius:0 10px 10px 0;padding:.75rem .95rem}
.cs-resposta .r{font-size:12px;font-weight:700;color:#5B2DA3}
.cs-resposta p{margin:.3rem 0 0;font-size:14px}
.cs-analise{display:inline-block;background:#FEF3C7;color:#92400E;font-size:11px;font-weight:700;padding:3px 8px;border-radius:6px;margin-left:.4rem}
.cs-sel-estrelas{display:flex;gap:.35rem;justify-content:center;margin:.25rem 0 .35rem}
.cs-sel-estrelas button{background:none;border:none;font-size:40px;line-height:1;cursor:pointer;color:#E2E8F0;padding:0 2px;transition:transform .12s,color .12s}
.cs-sel-estrelas button.on{color:#F59E0B}
.cs-sel-estrelas button:hover{transform:scale(1.12)}
.cs-sel-rotulo{text-align:center;font-weight:700;color:#475569;min-height:22px;margin-bottom:1rem}
.cs-aval-txt{width:100%;min-height:170px;border:1px solid #e2e8f0;border-radius:12px;padding:.8rem 1rem;font-family:inherit;font-size:14px;line-height:1.55;resize:vertical;outline:none;box-sizing:border-box}
.cs-aval-txt:focus{border-color:#5B2DA3}
.cs-contador{text-align:right;font-size:12px;color:#94A3B8;margin-top:4px;font-variant-numeric:tabular-nums}
.cs-contador.estourou{color:#ef4444;font-weight:700}
@media (prefers-reduced-motion:reduce){.cs-termo-marca,.cs-dist-t div,.cs-picker button,.cs-sel-estrelas button{transition:none}}
`;
    var st = document.createElement('style');
    st.id = 'cs-estilos';
    st.textContent = css;
    document.head.appendChild(st);
  }

  /* ───────────── dados do mural ───────────── */
  async function carregarRestricoes() {
    CS.ocultos = new Set();
    var lista = [];
    if (!CS.meuId) return lista;
    var c = await sb();
    var r = await c.from('Comunidade_Bloqueios').select('alvo_id, alvo_nome, tipo').eq('autor_id', CS.meuId);
    lista = r.data || [];
    lista.forEach(function (x) { CS.ocultos.add(x.alvo_id); });
    return lista;
  }

  function visivel(p) {
    var st = p.status || 'ativo';
    if (st === 'removido') return false;
    if (p.mentor_id && CS.ocultos.has(p.mentor_id)) return false;
    if (st === 'bloqueado' || st === 'excluido') return (CS.meuId && p.mentor_id === CS.meuId) || CS.admin;
    return true;
  }

  // Busca originais de reposts, reações, comentários, reposts e perfis de uma vez
  async function enriquecer(posts) {
    var c = await sb();
    posts.forEach(function (p) { CS.posts[p.id] = p; });
    var faltaOrig = posts.filter(function (p) { return p.repost_de != null && !CS.posts[p.repost_de]; }).map(function (p) { return p.repost_de; });
    if (faltaOrig.length) {
      var ro = await c.from('Comunidade_Posts').select('*').in('id', Array.from(new Set(faltaOrig)));
      (ro.data || []).forEach(function (p) { CS.posts[p.id] = p; });
    }
    var alvos = Array.from(new Set(posts.map(function (p) { return p.repost_de != null ? p.repost_de : p.id; })));
    var autores = [];
    posts.forEach(function (p) { autores.push(p.mentor_id); var o = CS.posts[p.repost_de]; if (o) autores.push(o.mentor_id); });
    if (!alvos.length) { await carregarPerfis(autores); return; }

    var res = await Promise.all([
      c.from('Comunidade_Reacoes').select('post_id, mentor_id, tipo').in('post_id', alvos),
      c.from('Comunidade_Comentarios').select('post_id').in('post_id', alvos),
      c.from('Comunidade_Posts').select('repost_de, status').in('repost_de', alvos),
      carregarPerfis(autores)
    ]);
    alvos.forEach(function (id) { CS.reacoes[id] = []; CS.nComentarios[id] = 0; CS.nReposts[id] = 0; });
    (res[0].data || []).forEach(function (r) { (CS.reacoes[r.post_id] = CS.reacoes[r.post_id] || []).push(r); });
    (res[1].data || []).forEach(function (r) { CS.nComentarios[r.post_id] = (CS.nComentarios[r.post_id] || 0) + 1; });
    (res[2].data || []).forEach(function (r) { if ((r.status || 'ativo') === 'ativo') CS.nReposts[r.repost_de] = (CS.nReposts[r.repost_de] || 0) + 1; });
    if (res[0].error) console.warn('Reações:', res[0].error.message);
  }

  /* ───────────── cartão do post ───────────── */
  function cabecalho(p, extraData) {
    var pf = perfilDe(p.mentor_id, p.autor);
    var nome = pf.nome || nomeMural(p.autor);
    return '<div class="cs-autor">' + avatar(pf, extraData ? 40 : 48, !!p.mentor_id) +
      '<div><div class="cs-nome"><span' + (p.mentor_id ? ' class="cs-link" data-cs="perfil" data-id="' + esc(p.mentor_id) + '"' : '') + '>' + esc(nome) + '</span>' +
      '<span class="cs-badge-tipo">MENTOR(A)</span></div>' +
      '<div class="cs-data">' + dataHora(p.created_at) + '</div>' + (extraData || '') + '</div></div>';
  }

  function conteudo(p) {
    var h = '';
    if (p.status === 'bloqueado') h += '<div class="cs-retido">Retido para análise da moderação — visível só para você e para a administração.</div>';
    if (p.titulo) h += '<h4 class="cs-titulo">' + esc(p.titulo) + '</h4>';
    if (p.conteudo) h += '<p class="cs-texto">' + esc(p.conteudo) + '</p>';
    return h;
  }

  function menu(p) {
    var dono = CS.meuId && p.mentor_id === CS.meuId;
    var itens = '';
    if (!dono && p.mentor_id) {
      itens += '<button data-cs="restringir" data-id="' + esc(p.mentor_id) + '" data-tipo="restringir">Restringir</button>';
      itens += '<button class="perigo" data-cs="restringir" data-id="' + esc(p.mentor_id) + '" data-tipo="bloquear">Bloquear</button>';
    }
    if (dono || CS.admin) itens += '<button class="perigo" data-cs="excluir" data-id="' + esc(p.id) + '">' + (p.repost_de != null ? 'Desfazer repost' : 'Excluir postagem') + '</button>';
    if (!itens) return '';
    return '<div style="position:relative"><button class="cs-menu-btn" data-cs="menu" aria-label="Opções">⋮</button><div class="cs-menu">' + itens + '</div></div>';
  }

  function resumoReacoes(alvoId) {
    var lista = CS.reacoes[alvoId] || [];
    if (!lista.length) return '<span>Seja a primeira pessoa a reagir</span>';
    var cont = {};
    lista.forEach(function (r) { cont[r.tipo] = (cont[r.tipo] || 0) + 1; });
    var top = Object.keys(cont).sort(function (a, b) { return cont[b] - cont[a]; }).slice(0, 3);
    return '<span class="em">' + top.map(function (k) { return '<span title="' + esc(REACAO[k] ? REACAO[k].l : k) + ' (' + cont[k] + ')">' + (REACAO[k] ? REACAO[k].e : '') + '</span>'; }).join('') + '</span>' +
      '<span>' + lista.length + (lista.length === 1 ? ' reação' : ' reações') + '</span>';
  }

  function cartao(p) {
    var ehRepost = p.repost_de != null;
    var orig = ehRepost ? CS.posts[p.repost_de] : p;
    var origOk = orig && visivel(orig) && (orig.status || 'ativo') === 'ativo' || (!ehRepost && orig);
    var alvoId = ehRepost ? p.repost_de : p.id;
    var h = '<article class="cs-post" data-post="' + esc(p.id) + '" data-alvo="' + esc(alvoId) + '">';

    if (ehRepost) {
      var rp = perfilDe(p.mentor_id, p.autor);
      h += '<div class="cs-repost-tag">↻ <b data-cs="perfil" data-id="' + esc(p.mentor_id) + '">' + esc(rp.nome) + '</b> repostou</div>';
      h += '<div class="cs-head">' + cabecalho(p) + menu(p) + '</div>';
      if (p.conteudo) h += '<div class="cs-corpo"><p class="cs-texto">' + esc(p.conteudo) + '</p></div>';
      if (origOk) {
        var credito = '<div class="cs-original-credito">Autoria original</div>';
        h += '<div class="cs-original"><div class="cs-head">' + cabecalho(orig, credito) + '</div>' +
          '<div class="cs-corpo">' + conteudo(orig) + '</div>' +
          (imgPost(orig) ? '<img class="cs-img" src="' + imgPost(orig) + '" alt="" loading="lazy" decoding="async">' : '') + '</div>';
      } else {
        h += '<div class="cs-indisp">Esta publicação não está mais disponível.</div>';
      }
    } else {
      h += '<div class="cs-head">' + cabecalho(p) + menu(p) + '</div>';
      h += '<div class="cs-corpo">' + conteudo(p) + '</div>';
      if (imgPost(p)) h += '<img class="cs-img" src="' + imgPost(p) + '" alt="" loading="lazy" decoding="async">';
    }

    var interagir = origOk && (orig.status || 'ativo') === 'ativo';
    if (interagir) {
      var minha = (CS.reacoes[alvoId] || []).find(function (r) { return r.mentor_id === CS.meuId; });
      var nc = CS.nComentarios[alvoId] || 0, nr = CS.nReposts[alvoId] || 0;
      var origDono = CS.meuId && orig.mentor_id === CS.meuId;
      h += '<div class="cs-stats"><div class="cs-stats-reac">' + resumoReacoes(alvoId) + '</div>' +
        '<div class="cs-stats-dir"><button data-cs="comentarios">' + nc + (nc === 1 ? ' comentário' : ' comentários') + '</button>' +
        (nr ? ' · ' + nr + (nr === 1 ? ' repostagem' : ' repostagens') : '') + '</div></div>';
      h += '<div class="cs-acoes">' +
        '<div class="cs-reagir"><button class="cs-acao' + (minha ? ' ativa' : '') + '" data-cs="reagir-btn" aria-haspopup="true">' +
        (minha && REACAO[minha.tipo] ? REACAO[minha.tipo].e + ' ' + REACAO[minha.tipo].l : 'Reagir') + '</button>' +
        '<div class="cs-picker" role="menu">' + REACOES.map(function (r) {
          return '<button data-cs="reagir" data-tipo="' + r.k + '" data-rotulo="' + r.l + '" aria-label="' + r.l + '">' + r.e + '</button>';
        }).join('') + '</div></div>' +
        '<button class="cs-acao" data-cs="comentarios">Comentar</button>' +
        '<button class="cs-acao" data-cs="repostar"' + (origDono ? ' disabled title="Você não pode repostar a sua própria publicação"' : '') + '>Repostar</button>' +
        '</div>';
      h += '<div class="cs-coments"></div>';
    }
    return h + '</article>';
  }

  function atualizarCartoes(alvoId) {
    document.querySelectorAll('.cs-post[data-alvo="' + alvoId + '"]').forEach(function (el) {
      var p = CS.posts[el.getAttribute('data-post')];
      if (!p) return;
      var abertos = el.querySelector('.cs-coments.aberto');
      var tmp = document.createElement('div');
      tmp.innerHTML = cartao(p);
      var novo = tmp.firstChild;
      if (abertos) { var nc = novo.querySelector('.cs-coments'); nc.innerHTML = abertos.innerHTML; nc.classList.add('aberto'); }
      el.replaceWith(novo);
    });
  }

  /* ───────────── mural, meu perfil, perfil público ───────────── */
  // Mural carregado aos poucos: 15 publicações por vez, e mais quando a pessoa chega ao fim
  var POR_PAGINA = 15;
  CS.mural = { pos: 0, fim: false, carregando: false, obs: null };

  function barraRestricoes(restr) {
    if (!restr.length) return '';
    return '<details style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:.75rem 1rem;margin-bottom:1rem;font-size:13px;color:#475569;">' +
      '<summary style="cursor:pointer;font-weight:600;">Você restringiu ou bloqueou ' + restr.length + ' pessoa(s) — gerenciar</summary>' +
      '<div style="display:flex;flex-direction:column;gap:6px;margin-top:.75rem;">' + restr.map(function (x) {
        return '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;"><span>' + esc(x.alvo_nome || 'Mentor(a)') +
          ' <small style="color:#94A3B8;">(' + (x.tipo === 'bloquear' ? 'bloqueio' : 'restrição') + ')</small></span>' +
          '<button data-cs="desfazer-restricao" data-id="' + esc(x.alvo_id) + '" style="background:#fff;border:1px solid #CBD5E1;border-radius:8px;padding:4px 10px;font-size:12px;cursor:pointer;">Desfazer</button></div>';
      }).join('') + '</div></details>';
  }

  async function carregarMaisMural() {
    var m = CS.mural, feed = $('comunidade-forum-feed');
    if (!feed || m.carregando || m.fim) return;
    m.carregando = true;
    var mais = $('cs-mural-mais'); if (mais) mais.innerHTML = '<p class="cs-vazio">Carregando publicações...</p>';
    var c = await sb();
    var r = await c.from('Comunidade_Posts').select('*').order('created_at', { ascending: false }).range(m.pos, m.pos + POR_PAGINA - 1);
    m.carregando = false;
    if (r.error) { if (mais) mais.innerHTML = '<p class="cs-vazio">Não foi possível carregar: ' + esc(r.error.message) + '</p>'; return; }
    var lote = r.data || [];
    m.pos += lote.length;
    if (lote.length < POR_PAGINA) m.fim = true;
    var posts = lote.filter(visivel);
    await enriquecer(posts);
    var lista = $('cs-mural-lista'); if (!lista) return;
    lista.insertAdjacentHTML('beforeend', posts.map(cartao).join(''));
    mais = $('cs-mural-mais');
    if (m.fim) {
      if (mais) mais.innerHTML = lista.querySelector('.cs-post') ? '<p class="cs-vazio" style="font-size:13px;">Você chegou ao fim do mural.</p>'
        : '<p class="cs-vazio">Ainda não há publicações. Que tal começar a conversa?</p>';
      if (m.obs) { m.obs.disconnect(); m.obs = null; }
    } else if (mais) {
      mais.innerHTML = '<button class="cs-btn sec" data-cs="mural-mais" style="display:block;margin:0 auto;">Ver mais publicações</button>';
      // se o lote veio quase todo filtrado, já busca o próximo
      if (posts.length < 3) carregarMaisMural();
    }
  }

  window.renderizarPostsForum = async function () {
    var feed = $('comunidade-forum-feed'); if (!feed) return;
    injetarEstilos();
    var c = await sb(); if (!c) return;
    await sessao();
    var restr = await carregarRestricoes();
    if (CS.mural.obs) { CS.mural.obs.disconnect(); }
    CS.mural = { pos: 0, fim: false, carregando: false, obs: null };
    feed.innerHTML = barraRestricoes(restr) + '<div id="cs-mural-lista" style="display:flex;flex-direction:column;gap:1.5rem;"></div><div id="cs-mural-mais" style="padding:1rem 0;"></div>';
    await carregarMaisMural();
    var alvo = $('cs-mural-mais');
    if (alvo && 'IntersectionObserver' in window && !CS.mural.fim) {
      CS.mural.obs = new IntersectionObserver(function (ents) {
        if (ents.some(function (e) { return e.isIntersecting; })) carregarMaisMural();
      }, { rootMargin: '600px 0px' });
      CS.mural.obs.observe(alvo);
    }
  };

  window.renderizarMeusPosts = async function () {
    var feed = $('comunidade-meus-posts-feed'); if (!feed) return;
    injetarEstilos();
    var c = await sb(); if (!c) return;
    var u = await sessao();
    if (!u) { feed.innerHTML = '<p class="cs-vazio">Faça login para ver o seu perfil.</p>'; return; }
    delete CS.perfis[u.id]; await carregarPerfis([u.id]); // números sempre atualizados
    var eu = perfilDe(u.id, 'Você');
    var cab = $('cs-meu-cabecalho');
    if (cab) cab.innerHTML = cabecalhoPerfil(eu, true);
    await carregarRestricoes();
    quadroSeguidores(u.id, layoutMeuPerfil());

    var r = await c.from('Comunidade_Posts').select('*').eq('mentor_id', u.id).order('created_at', { ascending: false }).limit(40);
    var posts = (r.data || []).filter(function (p) { return (p.status || 'ativo') !== 'removido'; });
    await carregarRestricoes();
    await enriquecer(posts);
    feed.innerHTML = posts.length ? posts.map(cartao).join('') : '<p class="cs-vazio">Você ainda não tem publicações.</p>';
  };
  window.renderizarMeusPostsPerfil = window.renderizarMeusPosts;

  // ── Redes sociais (Instagram e LinkedIn) ao lado do botão de mensagens ──
  var ICO_INSTA = '<svg viewBox="0 0 24 24" width="18" height="18" fill="#fff" aria-hidden="true"><path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 8.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4zM17.3 5.5a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zM21.9 7.1c-.1-1.6-.4-3-1.6-4.2S17.6 1.4 16 1.3C14.3 1.2 9.7 1.2 8 1.3c-1.6.1-3 .4-4.2 1.6S2.3 5.5 2.2 7.1c-.1 1.7-.1 6.3 0 8 .1 1.6.4 3 1.6 4.2s2.6 1.5 4.2 1.6c1.7.1 6.3.1 8 0 1.6-.1 3-.4 4.2-1.6s1.5-2.6 1.6-4.2c.1-1.7.1-6.3 0-8zm-2.1 9.8a3.2 3.2 0 0 1-1.8 1.8c-1.3.5-4.3.4-5.7.4s-4.4.1-5.7-.4a3.2 3.2 0 0 1-1.8-1.8c-.5-1.3-.4-4.3-.4-5.7s-.1-4.4.4-5.7A3.2 3.2 0 0 1 6.6 3.7c1.3-.5 4.3-.4 5.7-.4s4.4-.1 5.7.4a3.2 3.2 0 0 1 1.8 1.8c.5 1.3.4 4.3.4 5.7s.1 4.4-.4 5.7z"/></svg>';
  var ICO_LINKEDIN = '<svg viewBox="0 0 24 24" width="17" height="17" fill="#fff" aria-hidden="true"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.5h4V21H3V9.5zm6.5 0h3.8v1.6h.1c.5-1 1.8-2 3.8-2 4 0 4.8 2.6 4.8 6V21h-4v-5.2c0-1.2 0-2.9-1.8-2.9s-2 1.4-2 2.8V21h-4V9.5z"/></svg>';
  // aceita @usuario, instagram.com/usuario, linkedin.com/in/usuario (com ou sem https)
  function normalizarRede(tipo, v) {
    v = String(v || '').trim();
    if (!v) return '';
    if (tipo === 'instagram') {
      var m = v.match(/^@?([A-Za-z0-9._]{1,30})$/);
      if (m) return 'https://www.instagram.com/' + m[1];
    }
    if (!/^https?:\/\//i.test(v)) v = 'https://' + v.replace(/^\/+/, '');
    var ok = tipo === 'instagram' ? /^https:\/\/(www\.)?instagram\.com\/[^\s"'<>]+$/i : /^https:\/\/([a-z]{2,3}\.)?(www\.)?linkedin\.com\/[^\s"'<>]+$/i;
    return ok.test(v.replace(/^http:/i, 'https:')) ? v.replace(/^http:/i, 'https:') : null;
  }
  function botaoRede(tipo, url, meu) {
    var nome = tipo === 'instagram' ? 'Instagram' : 'LinkedIn';
    var ico = tipo === 'instagram' ? ICO_INSTA : ICO_LINKEDIN;
    var link = linkOk(url);
    if (meu) {
      return '<button type="button" class="cs-rede cs-rede-' + tipo + (link ? '' : ' vazio') + '" data-cs="redes-editar" title="' + (link ? 'Editar o seu ' + nome : 'Adicionar o seu ' + nome) + '">' + ico + (link ? '' : '<span class="cs-rede-mais">+</span>') + '</button>';
    }
    return link ? '<a class="cs-rede cs-rede-' + tipo + '" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer" title="' + nome + '">' + ico + '</a>' : '';
  }
  function editorRedes(p) {
    return '<div class="cs-redes-editor" id="cs-redes-editor" style="display:none;">' +
      '<div class="cs-redes-tit">Suas redes sociais</div>' +
      '<label>Instagram<input type="text" id="cs-rede-instagram" maxlength="200" placeholder="@seuperfil ou link do Instagram" value="' + esc(p.instagram || '') + '"></label>' +
      '<label>LinkedIn<input type="text" id="cs-rede-linkedin" maxlength="200" placeholder="linkedin.com/in/seu-perfil" value="' + esc(p.linkedin || '') + '"></label>' +
      '<div class="cs-redes-acoes"><button type="button" class="cs-btn-msg" data-cs="redes-cancelar">Cancelar</button><button type="button" class="btn btn-primary" style="padding:.5rem 1.2rem;font-size:14px;" data-cs="redes-salvar">Salvar</button></div>' +
      '<div class="cs-redes-msg" id="cs-redes-msg"></div></div>';
  }
  async function salvarRedes() {
    var msg = $('cs-redes-msg');
    var ig = normalizarRede('instagram', ($('cs-rede-instagram') || {}).value);
    var li = normalizarRede('linkedin', ($('cs-rede-linkedin') || {}).value);
    if (ig === null) { msg.textContent = 'Instagram inválido. Use @seuperfil ou o link do seu perfil.'; return; }
    if (li === null) { msg.textContent = 'LinkedIn inválido. Use o link do seu perfil (linkedin.com/in/...).'; return; }
    var c = await sb(); var u = await sessao();
    if (!c || !u) { msg.textContent = 'Faça login para salvar.'; return; }
    msg.textContent = 'Salvando...';
    // junta com o resto do perfil público (nome, especialidade, biografia...) para não apagar nada
    var atual = {};
    try { var r0 = await c.from('Usuarios').select('perfil_publico').eq('id', u.id).maybeSingle(); atual = (r0.data && r0.data.perfil_publico) || {}; } catch (e) {}
    if (typeof atual === 'string') { try { atual = JSON.parse(atual); } catch (e) { atual = {}; } }
    var novo = Object.assign({}, atual, { instagram: ig, linkedin: li });
    var r = await c.from('Usuarios').update({ perfil_publico: novo }).eq('id', u.id);
    if (r.error) { msg.textContent = 'Não foi possível salvar: ' + msgErro(r.error); return; }
    if (window.mpPerfil) { window.mpPerfil.instagram = ig; window.mpPerfil.linkedin = li; }
    ['perfil-instagram', 'perfil-linkedin'].forEach(function (id) { var el = $(id); if (el) el.value = id === 'perfil-instagram' ? ig : li; });
    window.renderizarMeusPosts();
  }

  // Selo de habilitação verificada (psicólogo com CRP / formação em psicanálise): só o rótulo público
  var seloCache = {};
  function preencherSelos() {
    var alvos = document.querySelectorAll('.cs-selo-hab:not([data-ok])');
    Array.prototype.forEach.call(alvos, function (el) {
      el.setAttribute('data-ok', '1');
      var id = el.getAttribute('data-mentor'); if (!id) return;
      var mostrar = function (txt) { if (txt) { el.textContent = txt; el.style.display = 'inline-block'; } };
      if (id in seloCache) return mostrar(seloCache[id]);
      if (!window.supabaseClient) return;
      window.supabaseClient.rpc('mentora_selo_habilitacao', { p_mentor: id }).then(function (r) {
        seloCache[id] = (r && !r.error && r.data) ? String(r.data) : '';
        mostrar(seloCache[id]);
      }, function () {});
    });
  }
  function cabecalhoPerfil(p, meu) {
    setTimeout(preencherSelos, 0);
    var redes = botaoRede('instagram', p.instagram, meu) + botaoRede('linkedin', p.linkedin, meu);
    var botoes = meu
      ? '<button class="cs-btn-msg" data-cs="abrir-chat">Mensagens<span class="cs-badge-n"></span></button>' + redes
      : (p.bloqueado ? '' :
        '<button class="btn btn-primary ' + (p.eu_sigo ? 'cs-seguindo' : '') + '" style="padding:.5rem 1.4rem;font-size:14px;" data-cs="seguir" data-id="' + esc(p.id) + '">' + (p.eu_sigo ? 'Seguindo' : 'Seguir') + '</button>' +
        '<button class="cs-btn-msg" data-cs="mensagem" data-id="' + esc(p.id) + '">Mensagem</button>' + redes);
    return '<div class="cs-pf-topo">' + avatar(p, 112, false) +
      '<div class="cs-perfil-info"><div class="cs-perfil-nome">' + esc(p.nome) + ' <span class="cs-badge-tipo">MENTOR(A)</span></div>' +
      '<div class="cs-selo-hab" data-mentor="' + esc(p.id) + '" style="display:none"></div>' +
      (p.especialidade ? '<div class="cs-perfil-esp">' + esc(p.especialidade) + '</div>' : '') +
      '<div class="cs-perfil-num">' +
        '<button type="button" class="cs-num-btn" data-cs="ver-seguidores" data-aba="seguidores" data-id="' + esc(p.id) + '"><b>' + (p.seguidores || 0) + '</b> ' + ((p.seguidores || 0) === 1 ? 'seguidor' : 'seguidores') + '</button>' +
        '<button type="button" class="cs-num-btn" data-cs="ver-seguidores" data-aba="seguindo" data-id="' + esc(p.id) + '"><b>' + (p.seguindo || 0) + '</b> seguindo</button></div>' +
      '<div class="cs-perfil-botoes">' + botoes + (meu ? editorRedes(p) : '') + '</div>' +
      '</div></div>' + blocosPerfil(p, meu);
  }

  // Bio em blocos: pessoal ("Sobre mim"), profissional ("Trajetória") e etiquetas das áreas.
  // Quem ainda só tem a bio antiga aparece com um bloco "Sobre".
  function blocosPerfil(p, meu) {
    function texto(tit, txt, largo) {
      txt = String(txt || '').trim(); if (!txt) return '';
      var longo = txt.length > 320 || (txt.match(/\n/g) || []).length > 5;
      return '<section class="cs-pf-bloco' + (largo ? ' largo' : '') + '"><h4 class="cs-pf-tit">' + tit + '</h4>' +
        '<p class="cs-pf-txt">' + esc(txt) + '</p>' +
        (longo ? '<button type="button" class="cs-pf-mais" onclick="var t=this.previousElementSibling;t.classList.toggle(\'aberto\');this.textContent=t.classList.contains(\'aberto\')?\'ver menos\':\'ver mais\'">ver mais</button>' : '') +
        '</section>';
    }
    var sobre = String(p.sobre_mim || '').trim(), traj = String(p.trajetoria || '').trim();
    var tags = String(p.areas || '').split(',').map(function (t) { return t.trim(); }).filter(Boolean).slice(0, 8);
    var h = '';
    if (sobre || traj) {
      var soUm = !(sobre && traj);
      h += texto('Sobre mim', sobre, soUm) + texto('Trajetória profissional', traj, soUm);
    } else if (p.biografia) {
      h += texto('Sobre', p.biografia, true);
    }
    if (tags.length) h += '<section class="cs-pf-bloco largo"><h4 class="cs-pf-tit">Áreas em que mentoro</h4><div class="cs-pf-tags">' +
      tags.map(function (t) { return '<span class="cs-pf-tag">' + esc(t) + '</span>'; }).join('') + '</div></section>';
    if (h) h = '<div class="cs-pf-blocos">' + h + '</div>';
    if (meu && !(sobre && traj && tags.length)) {
      h += '<div class="cs-pf-dica">Deixe o seu perfil mais completo: preencha <b>Sobre mim</b>, <b>Trajetória profissional</b> e <b>Áreas em que mentoro</b> em ' +
        '<a onclick="abrirAbaComunidade(\'perfil\')">Configuração</a>.</div>';
    }
    return h;
  }

  window.verPerfilPublicoMentor = async function (id) {
    var u = await sessao();
    if (!id || typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return;
    if (u && id === u.id) { abrirAbaComunidade('posts'); return; }
    abrirAbaComunidade('publico');
    var aba = $('comunidade-aba-perfil-publico');
    aba.innerHTML = '<p class="cs-vazio">Carregando perfil...</p>';
    delete CS.perfis[id];
    await carregarPerfis([id]);
    var p = CS.perfis[id];
    if (!p) { aba.innerHTML = '<p class="cs-vazio">Perfil não encontrado.</p>'; return; }
    if (p.bloqueado) {
      aba.innerHTML = '<div class="cs-perfil-cab">' + cabecalhoPerfil(p, false) + '</div><p class="cs-vazio">Este perfil não está disponível para você.</p>';
      return;
    }
    aba.innerHTML = '<div class="cs-perfil-cab">' + cabecalhoPerfil(p, false) + '</div>' +
      '<div class="cs-pf-layout"><div class="cs-pf-feed"><h3 style="font-size:18px;color:#334155;margin:0 0 1rem;">Publicações</h3><div id="cs-feed-publico" style="display:flex;flex-direction:column;gap:1.5rem;"><p class="cs-vazio">Carregando...</p></div></div>' +
      '<aside class="cs-pf-lateral" id="cs-publico-lateral" aria-label="Seguidores"></aside></div>';
    var c = await sb();
    var r = await c.from('Comunidade_Posts').select('*').eq('mentor_id', id).order('created_at', { ascending: false }).limit(40);
    await carregarRestricoes();
    quadroSeguidores(id, $('cs-publico-lateral'));
    var posts = (r.data || []).filter(visivel);
    await enriquecer(posts);
    var f = $('cs-feed-publico');
    if (f) f.innerHTML = posts.length ? posts.map(cartao).join('') : '<p class="cs-vazio">Ainda não há publicações.</p>';
  };

  /* ───────────── ações do mural ───────────── */
  async function reagir(alvoId, tipo) {
    var u = await sessao(); if (!u) { alert('Faça login para reagir.'); return; }
    var c = await sb();
    var lista = CS.reacoes[alvoId] = CS.reacoes[alvoId] || [];
    var minha = lista.find(function (r) { return r.mentor_id === u.id; });
    var r;
    if (minha && minha.tipo === tipo) {
      r = await c.from('Comunidade_Reacoes').delete().eq('post_id', alvoId).eq('mentor_id', u.id);
      if (!r.error) CS.reacoes[alvoId] = lista.filter(function (x) { return x !== minha; });
    } else {
      r = await c.from('Comunidade_Reacoes').upsert([{ post_id: alvoId, mentor_id: u.id, tipo: tipo }], { onConflict: 'post_id,mentor_id' });
      if (!r.error) { if (minha) minha.tipo = tipo; else lista.push({ post_id: alvoId, mentor_id: u.id, tipo: tipo }); }
    }
    if (r.error) { alert('Não foi possível registrar a reação: ' + msgErro(r.error)); return; }
    atualizarCartoes(alvoId);
  }

  async function abrirComentarios(art) {
    var box = art.querySelector('.cs-coments'); if (!box) return;
    if (box.classList.contains('aberto') && box.dataset.carregado) { box.classList.remove('aberto'); return; }
    box.classList.add('aberto');
    var alvoId = art.getAttribute('data-alvo');
    box.innerHTML = '<p class="cs-vazio">Carregando comentários...</p>';
    var u = await sessao();
    var c = await sb();
    var r = await c.from('Comunidade_Comentarios').select('*').eq('post_id', alvoId).order('created_at', { ascending: true });
    var lista = (r.data || []).filter(function (x) { return !CS.ocultos.has(x.mentor_id); });
    await carregarPerfis(lista.map(function (x) { return x.mentor_id; }).concat(u ? [u.id] : []));
    var orig = CS.posts[alvoId];
    var eu = u ? perfilDe(u.id, 'Você') : null;
    box.dataset.carregado = '1';
    box.innerHTML = (u ? '<div class="cs-coment-novo">' + avatar(eu, 36) +
      '<textarea maxlength="3000" placeholder="Escreva um comentário..." aria-label="Escreva um comentário"></textarea>' +
      '<button class="cs-btn prim" data-cs="comentar">Enviar</button></div>' : '') +
      '<div class="cs-coments-lista">' + (lista.length ? lista.map(function (cm) {
        var pf = perfilDe(cm.mentor_id, cm.autor_nome);
        var meu = u && cm.mentor_id === u.id;
        var podeApagar = u && (meu || CS.admin || (orig && orig.mentor_id === u.id));
        return '<div class="cs-coment">' + avatar(pf, 34, true) + '<div class="cs-coment-bolha"><div class="n"><span class="cs-link" data-cs="perfil" data-id="' + esc(cm.mentor_id) + '">' + esc(pf.nome || cm.autor_nome) + '</span><small>' + dataHora(cm.created_at) + (cm.editado ? ' · editado' : '') + '</small></div>' +
          '<p data-original="' + esc(cm.conteudo) + '">' + esc(cm.conteudo) + '</p>' +
          (podeApagar ? '<div class="cs-coment-acoes">' +
            (meu ? '<button class="ed" data-cs="editar-comentario" data-id="' + esc(cm.id) + '">Editar</button>' : '') +
            '<button class="ex" data-cs="apagar-comentario" data-id="' + esc(cm.id) + '">Excluir</button></div>' : '') +
          '</div></div>';
      }).join('') : '<p class="cs-vazio" style="padding:.5rem;">Nenhum comentário ainda.</p>') + '</div>';
    var ta = box.querySelector('textarea'); if (ta) ta.focus();
  }

  async function comentar(art, btn) {
    var ta = art.querySelector('.cs-coment-novo textarea');
    var txt = ta ? ta.value.trim() : '';
    if (!txt) return;
    btn.disabled = true;
    var c = await sb();
    var alvoId = art.getAttribute('data-alvo');
    var r = await c.from('Comunidade_Comentarios').insert([{ post_id: alvoId, conteudo: txt }]);
    btn.disabled = false;
    if (r.error) { alert(msgErro(r.error)); return; }
    CS.nComentarios[alvoId] = (CS.nComentarios[alvoId] || 0) + 1;
    var box = art.querySelector('.cs-coments'); box.dataset.carregado = ''; box.classList.remove('aberto');
    atualizarCartoes(alvoId);
    document.querySelectorAll('.cs-post[data-alvo="' + alvoId + '"]').forEach(function (el) { abrirComentarios(el); });
  }

  async function apagarComentario(art, id) {
    if (!confirm('Excluir este comentário? Essa ação não pode ser desfeita.')) return;
    var c = await sb();
    var r = await c.from('Comunidade_Comentarios').delete().eq('id', id).select();
    if (r.error || !r.data || !r.data.length) { alert('Não foi possível excluir o comentário.'); return; }
    var alvoId = art.getAttribute('data-alvo');
    CS.nComentarios[alvoId] = Math.max(0, (CS.nComentarios[alvoId] || 1) - 1);
    atualizarCartoes(alvoId);
    document.querySelectorAll('.cs-post[data-alvo="' + alvoId + '"]').forEach(function (el) { abrirComentarios(el); });
  }

  function editarComentario(btn) {
    var bolha = btn.closest('.cs-coment-bolha');
    if (!bolha || bolha.querySelector('.cs-coment-edit')) return;
    var p = bolha.querySelector('p');
    var acoes = bolha.querySelector('.cs-coment-acoes');
    p.style.display = 'none'; if (acoes) acoes.style.display = 'none';
    var box = document.createElement('div');
    box.className = 'cs-coment-edit';
    box.innerHTML = '<textarea maxlength="3000" aria-label="Editar comentário"></textarea><div>' +
      '<button class="cs-btn sec" data-cs="cancelar-edicao">Cancelar</button>' +
      '<button class="cs-btn prim" data-cs="salvar-comentario" data-id="' + esc(btn.getAttribute('data-id')) + '">Salvar</button></div>';
    p.after(box);
    var ta = box.querySelector('textarea');
    ta.value = p.getAttribute('data-original');
    ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
  }

  function cancelarEdicao(btn) {
    var bolha = btn.closest('.cs-coment-bolha');
    bolha.querySelector('.cs-coment-edit').remove();
    bolha.querySelector('p').style.display = '';
    var acoes = bolha.querySelector('.cs-coment-acoes'); if (acoes) acoes.style.display = '';
  }

  async function salvarComentario(art, btn, id) {
    var bolha = btn.closest('.cs-coment-bolha');
    var txt = bolha.querySelector('.cs-coment-edit textarea').value.trim();
    if (!txt) { alert('O comentário não pode ficar vazio. Para tirá-lo, use Excluir.'); return; }
    btn.disabled = true;
    var c = await sb();
    var r = await c.from('Comunidade_Comentarios').update({ conteudo: txt }).eq('id', id).select();
    btn.disabled = false;
    if (r.error) { alert(msgErro(r.error)); return; }
    if (!r.data || !r.data.length) { alert('Não foi possível editar o comentário.'); return; }
    var alvoId = art.getAttribute('data-alvo');
    document.querySelectorAll('.cs-post[data-alvo="' + alvoId + '"]').forEach(function (el) {
      var box = el.querySelector('.cs-coments'); box.dataset.carregado = ''; box.classList.remove('aberto');
      abrirComentarios(el);
    });
  }

  function abrirModalRepost(alvoId) {
    var orig = CS.posts[alvoId]; if (!orig) return;
    var pf = perfilDe(orig.mentor_id, orig.autor);
    var fundo = document.createElement('div');
    fundo.className = 'cs-modal-fundo';
    fundo.innerHTML = '<div class="cs-modal" role="dialog" aria-modal="true" aria-label="Repostar"><div class="cs-modal-top"><h3>Repostar</h3><button class="cs-x" data-fechar aria-label="Fechar">×</button></div>' +
      '<div class="cs-modal-corpo"><textarea class="cs-aval-txt" style="min-height:90px" maxlength="3000" placeholder="Adicione um comentário seu (opcional)"></textarea>' +
      '<div class="cs-original" style="margin:1rem 0 0;"><div class="cs-head">' + cabecalho(orig, '<div class="cs-original-credito">Autoria original</div>') + '</div><div class="cs-corpo">' + conteudo(orig) + '</div></div>' +
      '<div class="cs-nota-aviso">A publicação continua sendo de <b>' + esc(pf.nome) + '</b>, com o nome e a data originais. O seu nome aparece apenas como quem compartilhou, e você não pode editar o conteúdo. Se quem publicou excluir o post, ele sai também do seu repost.</div></div>' +
      '<div class="cs-modal-rod"><button class="cs-btn sec" data-fechar>Cancelar</button><button class="cs-btn prim" data-ok>Repostar</button></div></div>';
    document.body.appendChild(fundo);
    fundo.addEventListener('click', async function (ev) {
      if (ev.target === fundo || ev.target.hasAttribute('data-fechar')) { fundo.remove(); return; }
      if (ev.target.hasAttribute('data-ok')) {
        ev.target.disabled = true;
        var eu = await (typeof obterIdentidadeComunidade === 'function' ? obterIdentidadeComunidade() : null);
        if (!eu) { alert('Faça login para repostar.'); fundo.remove(); return; }
        var c = await sb();
        var r = await c.from('Comunidade_Posts').insert([{ repost_de: alvoId, conteudo: fundo.querySelector('textarea').value.trim(), autor: eu.nome, likes: 0, comentarios: 0 }]).select();
        if (r.error) { ev.target.disabled = false; alert(msgErro(r.error)); return; }
        fundo.remove();
        var novo = r.data && r.data[0];
        if (novo && novo.status === 'bloqueado') alert('Seu comentário no repost foi retido para análise porque contém termos que violam as Diretrizes.');
        else alert('Repostado! A publicação continua creditada à autoria original.');
        renderizarPostsForum();
        if ($('comunidade-aba-posts') && $('comunidade-aba-posts').style.display !== 'none') renderizarMeusPosts();
      }
    });
  }

  async function seguir(id, btn) {
    var u = await sessao(); if (!u) { alert('Faça login para seguir.'); return; }
    var c = await sb();
    var p = CS.perfis[id] || {};
    btn.disabled = true;
    var r = p.eu_sigo
      ? await c.from('Comunidade_Seguidores').delete().eq('seguidor_id', u.id).eq('seguido_id', id)
      : await c.from('Comunidade_Seguidores').insert([{ seguidor_id: u.id, seguido_id: id }]);
    btn.disabled = false;
    if (r.error) { alert('Não foi possível concluir: ' + msgErro(r.error)); return; }
    verPerfilPublicoMentor(id);
  }

  /* ───────────── quadro lateral de seguidores (estilo Facebook) ───────────── */
  async function quadroSeguidores(donoId, alvo) {
    if (!alvo) return;
    var c = await sb(); if (!c) return;
    var dono = CS.perfis[donoId] || {};
    var total = dono.seguidores || 0;
    alvo.innerHTML = '<section class="cs-quadro"><div class="cs-quadro-top"><h4>Seguidores</h4>' +
      (total ? '<button type="button" data-cs="ver-seguidores" data-aba="seguidores" data-id="' + esc(donoId) + '">Ver todos</button>' : '') + '</div>' +
      '<div class="cs-quadro-sub">' + total + ' ' + (total === 1 ? 'seguidor' : 'seguidores') + '</div>' +
      '<div class="cs-quadro-grade"><p class="cs-vazio" style="grid-column:1/-1;margin:0;">' + (total ? 'Carregando...' : 'Ainda não há seguidores.') + '</p></div></section>';
    if (!total) return;
    var r = await c.from('Comunidade_Seguidores').select('seguidor_id, created_at').eq('seguido_id', donoId).order('created_at', { ascending: false }).limit(40);
    var grade = alvo.querySelector('.cs-quadro-grade'); if (!grade) return;
    if (r.error) { grade.innerHTML = '<p class="cs-vazio" style="grid-column:1/-1;margin:0;">Não foi possível carregar agora.</p>'; return; }
    var ids = Array.from(new Set((r.data || []).map(function (x) { return x.seguidor_id; }))).filter(function (i) { return i !== donoId; });
    await carregarPerfis(ids);
    var lista = ids.map(function (i) { return CS.perfis[i]; }).filter(function (p) { return p && !p.bloqueado && !CS.ocultos.has(p.id); }).slice(0, 8);
    grade.innerHTML = lista.length ? lista.map(function (p) {
      var acao = p.id === CS.meuId ? '<span class="cs-seg-voce">Você</span>'
        : '<button type="button" class="cs-seg-btn' + (p.eu_sigo ? ' sigo' : '') + '" data-cs="seguir-quadro" data-id="' + esc(p.id) + '">' + (p.eu_sigo ? 'Seguindo' : 'Seguir') + '</button>';
      return '<div class="cs-seg-item">' + avatar(p, 40, true) +
        '<div class="cs-seg-info"><span class="cs-seg-nome" data-cs="perfil" data-id="' + esc(p.id) + '">' + esc(p.nome) + '</span>' +
        (p.especialidade ? '<div class="cs-seg-esp">' + esc(p.especialidade) + '</div>' : '') + '</div>' + acao + '</div>';
    }).join('') : '<p class="cs-vazio" style="margin:0;">Ainda não há seguidores para mostrar.</p>';
  }

  async function seguirDoQuadro(alvo, btn) {
    var u = await sessao(); if (!u) { alert('Faça login para seguir.'); return; }
    var c = await sb(); var pf = CS.perfis[alvo] || {};
    btn.disabled = true;
    var r = pf.eu_sigo
      ? await c.from('Comunidade_Seguidores').delete().eq('seguidor_id', u.id).eq('seguido_id', alvo)
      : await c.from('Comunidade_Seguidores').insert([{ seguidor_id: u.id, seguido_id: alvo }]);
    btn.disabled = false;
    if (r.error) { alert('Não foi possível concluir: ' + msgErro(r.error)); return; }
    pf.eu_sigo = !pf.eu_sigo;
    document.querySelectorAll('[data-cs="seguir-quadro"][data-id="' + alvo + '"]').forEach(function (b) {
      b.classList.toggle('sigo', pf.eu_sigo); b.textContent = pf.eu_sigo ? 'Seguindo' : 'Seguir';
    });
    // no meu perfil, o número "seguindo" do cabeçalho muda
    var cab = $('cs-meu-cabecalho');
    if (cab && $('comunidade-aba-posts') && $('comunidade-aba-posts').style.display !== 'none' && CS.perfis[u.id]) {
      CS.perfis[u.id].seguindo = Math.max(0, (CS.perfis[u.id].seguindo || 0) + (pf.eu_sigo ? 1 : -1));
      cab.innerHTML = cabecalhoPerfil(CS.perfis[u.id], true);
    }
  }

  // Meu Perfil: coloca as publicações e o quadro lado a lado (a página tem só a lista de posts)
  function layoutMeuPerfil() {
    var feed = $('comunidade-meus-posts-feed'); if (!feed) return null;
    if (!feed.parentElement.classList.contains('cs-pf-feed')) {
      var lay = document.createElement('div'); lay.className = 'cs-pf-layout'; lay.style.marginTop = '2rem';
      var col = document.createElement('div'); col.className = 'cs-pf-feed';
      var lat = document.createElement('aside'); lat.className = 'cs-pf-lateral'; lat.id = 'cs-meu-lateral'; lat.setAttribute('aria-label', 'Seguidores');
      feed.parentElement.insertBefore(lay, feed);
      col.appendChild(feed); lay.appendChild(col); lay.appendChild(lat);
      feed.style.maxWidth = 'none'; feed.style.margin = '0';
    }
    return $('cs-meu-lateral');
  }

  /* ───────────── janela de seguidores / seguindo ───────────── */
  async function abrirListaSeguidores(donoId, abaInicial) {
    if (!donoId || !/^[0-9a-f-]{36}$/i.test(donoId)) return;
    var u = await sessao(); if (!u) { alert('Faça login para ver as conexões.'); return; }
    var c = await sb(); if (!c) return;
    var dono = perfilDe(donoId, 'Mentor(a)');
    var estado = { aba: abaInicial === 'seguindo' ? 'seguindo' : 'seguidores', listas: { seguidores: [], seguindo: [] }, busca: '', mudou: false };
    var fundo = document.createElement('div');
    fundo.className = 'cs-modal-fundo';
    fundo.innerHTML = '<div class="cs-modal cs-seg-modal" role="dialog" aria-modal="true" aria-label="Conexões de ' + esc(dono.nome) + '">' +
      '<div class="cs-modal-top"><h3>' + esc(dono.nome) + '</h3><button class="cs-x" data-fechar aria-label="Fechar">×</button></div>' +
      '<div class="cs-seg-abas" role="tablist"><button class="cs-seg-aba" data-aba="seguidores" role="tab">Seguidores</button><button class="cs-seg-aba" data-aba="seguindo" role="tab">Seguindo</button></div>' +
      '<input type="search" class="cs-seg-busca" placeholder="Pesquisar" aria-label="Pesquisar pelo nome" maxlength="80">' +
      '<div class="cs-seg-lista"><p class="cs-vazio">Carregando...</p></div></div>';
    document.body.appendChild(fundo);
    var listaEl = fundo.querySelector('.cs-seg-lista');

    function fechar() {
      document.removeEventListener('keydown', teclaEsc);
      fundo.remove();
      // se algum "Seguir" mudou, atualiza os números do perfil que está aberto
      if (estado.mudou) {
        if (donoId === CS.meuId) { if (typeof renderizarMeusPosts === 'function') renderizarMeusPosts(); }
        else verPerfilPublicoMentor(donoId);
      }
    }
    function teclaEsc(ev) { if (ev.key === 'Escape') fechar(); }
    document.addEventListener('keydown', teclaEsc);

    function desenhar() {
      fundo.querySelectorAll('.cs-seg-aba').forEach(function (b) {
        var n = estado.listas[b.getAttribute('data-aba')].length;
        b.textContent = (b.getAttribute('data-aba') === 'seguidores' ? 'Seguidores' : 'Seguindo') + ' · ' + n;
        b.classList.toggle('ativa', b.getAttribute('data-aba') === estado.aba);
        b.setAttribute('aria-selected', b.getAttribute('data-aba') === estado.aba ? 'true' : 'false');
      });
      var termo = estado.busca.toLowerCase();
      var lista = estado.listas[estado.aba].filter(function (p) { return !termo || String(p.nome || '').toLowerCase().indexOf(termo) !== -1; });
      if (!lista.length) {
        listaEl.innerHTML = '<p class="cs-vazio">' + (termo ? 'Ninguém com esse nome.' :
          estado.aba === 'seguidores' ? 'Ainda não há seguidores.' : 'Ainda não segue ninguém.') + '</p>';
        return;
      }
      listaEl.innerHTML = lista.map(function (p) {
        var acao = p.id === CS.meuId ? '<span class="cs-seg-voce">Você</span>'
          : '<button type="button" class="cs-seg-btn' + (p.eu_sigo ? ' sigo' : '') + '" data-seg="' + esc(p.id) + '">' + (p.eu_sigo ? 'Seguindo' : 'Seguir') + '</button>';
        return '<div class="cs-seg-item">' + avatar(p, 48, true) +
          '<div class="cs-seg-info"><span class="cs-seg-nome" data-cs="perfil" data-id="' + esc(p.id) + '">' + esc(p.nome) + '</span>' +
          (p.especialidade ? '<div class="cs-seg-esp">' + esc(p.especialidade) + '</div>' : '') + '</div>' + acao + '</div>';
      }).join('');
    }

    fundo.addEventListener('click', async function (ev) {
      var t = ev.target;
      if (t === fundo || t.hasAttribute('data-fechar')) { fechar(); return; }
      var aba = t.closest('.cs-seg-aba');
      if (aba) { estado.aba = aba.getAttribute('data-aba'); desenhar(); return; }
      // abrir o perfil de alguém da lista: fecha a janela (o clique segue para a navegação normal)
      if (t.closest('[data-cs="perfil"]')) { document.removeEventListener('keydown', teclaEsc); fundo.remove(); return; }
      var b = t.closest('[data-seg]');
      if (b) {
        var alvo = b.getAttribute('data-seg'), pf = CS.perfis[alvo] || {};
        b.disabled = true;
        var r = pf.eu_sigo
          ? await c.from('Comunidade_Seguidores').delete().eq('seguidor_id', CS.meuId).eq('seguido_id', alvo)
          : await c.from('Comunidade_Seguidores').insert([{ seguidor_id: CS.meuId, seguido_id: alvo }]);
        b.disabled = false;
        if (r.error) { alert('Não foi possível concluir: ' + msgErro(r.error)); return; }
        pf.eu_sigo = !pf.eu_sigo; estado.mudou = true;
        // na minha própria janela, a aba "Seguindo" acompanha na hora
        if (donoId === CS.meuId) {
          estado.listas.seguindo = pf.eu_sigo ? estado.listas.seguindo.concat([pf]) : estado.listas.seguindo.filter(function (x) { return x.id !== alvo; });
        }
        desenhar();
      }
    });
    fundo.querySelector('.cs-seg-busca').addEventListener('input', function () { estado.busca = this.value.trim(); desenhar(); });

    // carrega as duas listas de uma vez
    var r = await c.from('Comunidade_Seguidores').select('seguidor_id, seguido_id, created_at')
      .or('seguido_id.eq.' + donoId + ',seguidor_id.eq.' + donoId)
      .order('created_at', { ascending: false }).limit(1000);
    if (!document.body.contains(fundo)) return;
    if (r.error) { listaEl.innerHTML = '<p class="cs-vazio">Não foi possível carregar agora.</p>'; return; }
    var linhas = r.data || [];
    var unicos = function (a) { return Array.from(new Set(a)).filter(function (i) { return i !== donoId; }); };
    var idsSeguidores = unicos(linhas.filter(function (x) { return x.seguido_id === donoId; }).map(function (x) { return x.seguidor_id; }));
    var idsSeguindo = unicos(linhas.filter(function (x) { return x.seguidor_id === donoId; }).map(function (x) { return x.seguido_id; }));
    await carregarRestricoes();
    var todos = Array.from(new Set(idsSeguidores.concat(idsSeguindo)));
    todos.forEach(function (i) { delete CS.perfis[i]; }); // "Seguindo/Seguir" sempre atualizado
    await carregarPerfis(CS.perfis[donoId] ? todos : todos.concat([donoId]));
    if (CS.perfis[donoId]) fundo.querySelector('.cs-modal-top h3').textContent = CS.perfis[donoId].nome;
    function montar(ids) {
      return ids.map(function (i) { return CS.perfis[i]; })
        .filter(function (p) { return p && !p.bloqueado && !CS.ocultos.has(p.id); });
    }
    estado.listas.seguidores = montar(idsSeguidores);
    estado.listas.seguindo = montar(idsSeguindo);
    desenhar();
  }

  /* ───────────── cliques (delegação) ───────────── */
  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-cs]');
    // fecha menus e seletores abertos ao clicar fora
    document.querySelectorAll('.cs-menu.aberto, .cs-picker.aberto').forEach(function (m) {
      if (!el || !m.parentElement.contains(el)) m.classList.remove('aberto');
    });
    if (!el) return;
    var acao = el.getAttribute('data-cs');
    var art = el.closest('.cs-post');
    var id = el.getAttribute('data-id');
    switch (acao) {
      case 'perfil': verPerfilPublicoMentor(id); break;
      case 'mural-mais': carregarMaisMural(); break;
      case 'menu': el.nextElementSibling.classList.toggle('aberto'); break;
      case 'restringir':
        var pf = CS.perfis[id];
        if (typeof restringirMentora === 'function') restringirMentora(id, pf ? pf.nome : 'esta pessoa', el.getAttribute('data-tipo'));
        break;
      case 'desfazer-restricao': if (typeof desfazerRestricaoMentora === 'function') desfazerRestricaoMentora(id); break;
      case 'excluir': if (typeof excluirPostForum === 'function') excluirPostForum(id); break;
      case 'reagir-btn': el.nextElementSibling.classList.toggle('aberto'); break;
      case 'reagir': el.parentElement.classList.remove('aberto'); reagir(art.getAttribute('data-alvo'), el.getAttribute('data-tipo')); break;
      case 'comentarios': abrirComentarios(art); break;
      case 'comentar': comentar(art, el); break;
      case 'apagar-comentario': apagarComentario(art, id); break;
      case 'editar-comentario': editarComentario(el); break;
      case 'cancelar-edicao': cancelarEdicao(el); break;
      case 'salvar-comentario': salvarComentario(art, el, id); break;
      case 'repostar': abrirModalRepost(art.getAttribute('data-alvo')); break;
      case 'seguir': seguir(id, el); break;
      case 'ver-seguidores': abrirListaSeguidores(id, el.getAttribute('data-aba')); break;
      case 'seguir-quadro': seguirDoQuadro(id, el); break;
      case 'mensagem': abrirChat(id); break;
      case 'abrir-chat': abrirChat(); break;
      case 'redes-editar': var ed = $('cs-redes-editor'); if (ed) { ed.style.display = ed.style.display === 'none' ? 'block' : 'none'; var i1 = $('cs-rede-instagram'); if (i1 && ed.style.display === 'block') i1.focus(); } break;
      case 'redes-cancelar': var ed2 = $('cs-redes-editor'); if (ed2) ed2.style.display = 'none'; break;
      case 'redes-salvar': salvarRedes(); break;
      case 'avaliar': abrirModalAvaliacao(); break;
      case 'filtro-nota': CS.aval.filtro = Number(el.getAttribute('data-n')) === CS.aval.filtro ? 0 : Number(el.getAttribute('data-n')); desenharAvaliacoes(); break;
      case 'ler-mais': var pp = el.previousElementSibling; pp.textContent = pp.getAttribute('data-completo'); el.remove(); break;
    }
  });
  // reações: passar o mouse também abre o seletor (computador)
  document.addEventListener('mouseover', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-cs="reagir-btn"]');
    if (b && window.matchMedia('(hover:hover)').matches) b.nextElementSibling.classList.add('aberto');
  });
  document.addEventListener('mouseout', function (ev) {
    var box = ev.target.closest && ev.target.closest('.cs-reagir');
    if (box && !box.contains(ev.relatedTarget)) { var pk = box.querySelector('.cs-picker'); if (pk) pk.classList.remove('aberto'); }
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') {
      document.querySelectorAll('.cs-menu.aberto, .cs-picker.aberto').forEach(function (m) { m.classList.remove('aberto'); });
      var md = document.querySelector('.cs-modal-fundo'); if (md) md.remove();
    }
    if (ev.key === 'Enter' && ev.target.matches && ev.target.matches('[data-cs="perfil"]')) ev.target.click();
  });

  /* ═════════════ CHAT FLUTUANTE ═════════════ */
  function montarChat() {
    if ($('cs-chat')) return;
    injetarEstilos();
    var d = document.createElement('div');
    d.id = 'cs-chat';
    d.className = 'cs-chat';
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-label', 'Mensagens');
    d.innerHTML = '<div class="cs-chat-top" id="cs-chat-top"><button id="cs-chat-voltar" aria-label="Voltar" style="display:none">‹</button>' +
      '<div class="t" id="cs-chat-titulo">Mensagens <span class="cs-badge-n"></span></div>' +
      '<button id="cs-chat-min" aria-label="Minimizar">▾</button><button id="cs-chat-fechar" aria-label="Fechar">×</button></div>' +
      '<div class="cs-chat-corpo" id="cs-chat-corpo"></div>';
    document.body.appendChild(d);
    $('cs-chat-top').addEventListener('click', function (ev) {
      if (ev.target.id === 'cs-chat-fechar') { fecharChat(); return; }
      if (ev.target.id === 'cs-chat-voltar') { ev.stopPropagation(); CS.chat.outro = null; desenharListaChat(); return; }
      CS.chat.minimizado = !CS.chat.minimizado;
      d.classList.toggle('mini', CS.chat.minimizado);
      $('cs-chat-min').textContent = CS.chat.minimizado ? '▴' : '▾';
    });
  }

  async function abrirChat(outroId) {
    var u = await sessao();
    if (!u) { alert('Faça login para usar as mensagens.'); return; }
    montarChat();
    CS.chat.aberto = true; CS.chat.minimizado = false;
    var d = $('cs-chat'); d.classList.add('aberto'); d.classList.remove('mini'); $('cs-chat-min').textContent = '▾';
    iniciarTempoReal();
    if (outroId) abrirConversa(outroId); else desenharListaChat();
  }
  window.abrirChatMentora = abrirChat;

  function fecharChat() {
    CS.chat.aberto = false; CS.chat.outro = null;
    var d = $('cs-chat'); if (d) d.classList.remove('aberto');
  }

  async function atualizarConversas() {
    var c = await sb(); if (!c || !CS.meuId) return;
    var r = await c.rpc('mentora_chat_conversas');
    if (r.error) { console.warn('Conversas:', r.error.message); return; }
    CS.chat.conversas = (r.data || []).sort(function (a, b) { return new Date(b.ultima_em) - new Date(a.ultima_em); });
    await carregarPerfis(CS.chat.conversas.map(function (x) { return x.outro_id; }));
    var total = CS.chat.conversas.reduce(function (s, x) { return s + (x.nao_lidas || 0); }, 0);
    document.querySelectorAll('.cs-badge-n').forEach(function (b) {
      if (b.closest('.cs-aval')) return;
      b.textContent = total > 99 ? '99+' : String(total);
      b.classList.toggle('on', total > 0);
    });
  }

  async function desenharListaChat(termo) {
    var corpo = $('cs-chat-corpo'); if (!corpo) return;
    $('cs-chat-voltar').style.display = 'none';
    $('cs-chat-titulo').innerHTML = 'Mensagens <span class="cs-badge-n"></span>';
    if (termo === undefined) {
      corpo.innerHTML = '<div class="cs-chat-busca"><input id="cs-chat-q" type="search" placeholder="Buscar mentores para conversar..." aria-label="Buscar mentores"></div><div class="cs-chat-lista" id="cs-chat-lista"><p class="cs-vazio">Carregando...</p></div>';
      var q = $('cs-chat-q'), t;
      q.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { desenharListaChat(q.value); }, 300); });
      await atualizarConversas();
    }
    var lista = $('cs-chat-lista'); if (!lista) return;
    var html = '';
    termo = String(termo || '').trim().toLowerCase();
    var convs = CS.chat.conversas.filter(function (x) {
      var p = perfilDe(x.outro_id); return !termo || String(p.nome || '').toLowerCase().indexOf(termo) >= 0;
    });
    if (convs.length) {
      html += '<div class="cs-chat-rot">Conversas</div>' + convs.map(function (x) {
        var p = perfilDe(x.outro_id);
        return '<div class="cs-chat-item' + (x.nao_lidas ? ' nl' : '') + '" data-outro="' + esc(x.outro_id) + '" role="button" tabindex="0">' + avatar(p, 42) +
          '<div class="meio"><div class="n"><span>' + esc(p.nome || 'Mentor(a)') + '</span><small>' + dataCurta(x.ultima_em) + '</small></div>' +
          '<div class="u">' + (x.minha ? 'Você: ' : '') + esc(x.ultima) + '</div></div>' +
          (x.nao_lidas ? '<span class="cs-badge-n on" style="position:static">' + x.nao_lidas + '</span>' : '') + '</div>';
      }).join('');
    }
    if (termo) {
      var c = await sb();
      var r = await c.rpc('mentora_buscar_mentores', { p_termo: termo });
      var ja = new Set(convs.map(function (x) { return x.outro_id; }));
      var novos = (r.data || []).filter(function (m) { return !ja.has(m.id); });
      novos.forEach(function (m) { if (!CS.perfis[m.id]) CS.perfis[m.id] = m; });
      if (novos.length) html += '<div class="cs-chat-rot">Mentores</div>' + novos.map(function (m) {
        return '<div class="cs-chat-item" data-outro="' + esc(m.id) + '" role="button" tabindex="0">' + avatar(m, 42) +
          '<div class="meio"><div class="n"><span>' + esc(m.nome) + '</span></div><div class="u">' + esc(m.especialidade || 'Iniciar conversa') + '</div></div></div>';
      }).join('');
    }
    if (!html) html = termo ? '<p class="cs-vazio">Ninguém encontrado com esse nome.</p>'
      : '<p class="cs-vazio">Nenhuma conversa ainda.<br>Busque um nome acima ou clique em <b>Mensagem</b> no perfil de alguém.</p>';
    lista.innerHTML = html;
    lista.querySelectorAll('.cs-chat-item').forEach(function (it) {
      it.addEventListener('click', function () { abrirConversa(it.getAttribute('data-outro')); });
      it.addEventListener('keydown', function (e) { if (e.key === 'Enter') it.click(); });
    });
    await atualizarConversas();
  }

  async function abrirConversa(outroId) {
    CS.chat.outro = outroId;
    await carregarPerfis([outroId]);
    var p = perfilDe(outroId);
    $('cs-chat-voltar').style.display = '';
    $('cs-chat-titulo').innerHTML = avatar(p, 30) + '<span class="nm">' + esc(p.nome || 'Mentor(a)') + '</span>';
    var corpo = $('cs-chat-corpo');
    if (p.bloqueado) { corpo.innerHTML = '<p class="cs-vazio">Não é possível trocar mensagens com esta pessoa.</p>'; return; }
    corpo.innerHTML = '<div class="cs-chat-msgs" id="cs-chat-msgs"><p class="cs-vazio">Carregando...</p></div>' +
      '<div class="cs-chat-env"><textarea id="cs-chat-txt" rows="1" maxlength="4000" placeholder="Escreva uma mensagem..." aria-label="Mensagem"></textarea><button id="cs-chat-enviar" aria-label="Enviar">➤</button></div>';
    var ta = $('cs-chat-txt');
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMensagem(); } });
    ta.addEventListener('input', function () { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 110) + 'px'; });
    $('cs-chat-enviar').addEventListener('click', enviarMensagem);
    var c = await sb();
    var r = await c.from('Chat_Mensagens').select('*')
      .or('and(remetente_id.eq.' + CS.meuId + ',destinatario_id.eq.' + outroId + '),and(remetente_id.eq.' + outroId + ',destinatario_id.eq.' + CS.meuId + ')')
      .order('created_at', { ascending: true }).limit(300);
    if (CS.chat.outro !== outroId) return;
    var box = $('cs-chat-msgs');
    box.innerHTML = '';
    var msgs = r.data || [];
    if (!msgs.length) box.innerHTML = '<p class="cs-vazio" id="cs-chat-vazio">Diga olá para ' + esc(p.nome || 'esta pessoa') + '!</p>';
    msgs.forEach(adicionarBolha);
    ta.focus();
    await c.rpc('mentora_chat_marcar_lidas', { p_outro: outroId });
    atualizarConversas();
  }

  function adicionarBolha(m) {
    var box = $('cs-chat-msgs'); if (!box) return;
    var vz = $('cs-chat-vazio'); if (vz) vz.remove();
    var dia = new Date(m.created_at).toLocaleDateString('pt-BR');
    if (box.getAttribute('data-ultimo-dia') !== dia) {
      box.insertAdjacentHTML('beforeend', '<div class="cs-chat-dia">' + dia + '</div>');
      box.setAttribute('data-ultimo-dia', dia);
    }
    var minha = m.remetente_id === CS.meuId;
    box.insertAdjacentHTML('beforeend', '<div class="cs-bolha ' + (minha ? 'minha' : 'dela') + '">' + esc(m.conteudo) +
      '<small>' + new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '</small></div>');
    box.scrollTop = box.scrollHeight;
  }

  async function enviarMensagem() {
    var ta = $('cs-chat-txt'); var txt = ta ? ta.value.trim() : '';
    if (!txt || !CS.chat.outro) return;
    var c = await sb();
    ta.value = ''; ta.style.height = 'auto';
    var r = await c.from('Chat_Mensagens').insert([{ destinatario_id: CS.chat.outro, conteudo: txt }]).select();
    if (r.error) { ta.value = txt; alert('A mensagem não foi enviada: ' + msgErro(r.error)); return; }
    if (r.data && r.data[0]) adicionarBolha(r.data[0]);
    atualizarConversas();
  }

  async function iniciarTempoReal() {
    var u = await sessao(); if (!u) return;
    var c = await sb();
    if (!CS.chat.canal && c.channel) {
      CS.chat.canal = c.channel('cs-chat-' + u.id)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'Chat_Mensagens', filter: 'destinatario_id=eq.' + u.id }, function (payload) {
          var m = payload.new;
          if (CS.chat.aberto && !CS.chat.minimizado && CS.chat.outro === m.remetente_id) {
            adicionarBolha(m);
            c.rpc('mentora_chat_marcar_lidas', { p_outro: m.remetente_id }).then(atualizarConversas);
          } else {
            atualizarConversas().then(function () { if (CS.chat.aberto && !CS.chat.outro) desenharListaChat(); });
          }
        })
        .subscribe(function (status) {
          /* Fase 6: a consulta de reserva só roda quando o tempo real NÃO está conectado. */
          var ligado = status === 'SUBSCRIBED';
          if (ligado && CS.chat.rtCaiu) atualizarConversas(); // reconectou: 1 conferência para pegar o que perdeu
          CS.chat.rtOk = ligado;
          CS.chat.rtCaiu = !ligado && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED');
        });
    }
    // reserva: a cada 30s, apenas se o tempo real caiu e a aba está visível
    if (!CS.chat.timer) CS.chat.timer = setInterval(function () {
      if (CS.meuId && !CS.chat.rtOk && document.visibilityState === 'visible') atualizarConversas();
    }, 30000);
    if (!CS.chat.visOuvinte) {
      CS.chat.visOuvinte = true;
      // ao voltar para a aba depois de um tempo fora, confere uma vez
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') CS.chat.saiuEm = Date.now();
        else if (CS.meuId && CS.chat.saiuEm && Date.now() - CS.chat.saiuEm > 60000) atualizarConversas();
      });
    }
    atualizarConversas();
  }

  /* ═════════════ NOS AVALIE ═════════════ */
  function estrelas(n, tam) {
    var h = '<span class="cs-estrelas" style="font-size:' + (tam || 15) + 'px" aria-label="' + n + ' de 5 estrelas">';
    for (var i = 1; i <= 5; i++) h += i <= Math.round(n) ? '★' : '<span class="off">★</span>';
    return h + '</span>';
  }
  function corNota(m) { return m >= 4.5 ? '#059669' : m >= 3.5 ? '#65A30D' : m >= 2.5 ? '#D97706' : m >= 1.5 ? '#EA580C' : '#DC2626'; }

  /* Fase 6: evita recargas em cascata. Pedidos que chegam durante uma carga
     (tempo real + salvamento + troca de aba) viram UMA recarga extra no fim,
     e os avisos do tempo real são agrupados em uma janela de 800 ms. */
  window.carregarAvaliacoes = async function () {
    if (CS.aval.carregando) { CS.aval.pendente = true; return; }
    CS.aval.carregando = true;
    try { await carregarAvaliacoesAgora(); }
    finally {
      CS.aval.carregando = false;
      if (CS.aval.pendente) { CS.aval.pendente = false; setTimeout(window.carregarAvaliacoes, 0); }
    }
  };
  function agendarRecargaAvaliacoes() {
    clearTimeout(CS.aval.timer);
    CS.aval.timer = setTimeout(function () {
      var aba = $('comunidade-aba-avaliacoes');
      if (aba && aba.style.display !== 'none') window.carregarAvaliacoes();
      else CS.aval.desatualizada = true;
    }, 800);
  }
  async function carregarAvaliacoesAgora() {
    var aba = $('comunidade-aba-avaliacoes'); if (!aba) return;
    CS.aval.desatualizada = false;
    injetarEstilos();
    if (!$('cs-av-lista')) {
      aba.innerHTML = '<div class="cs-av-wrap">' +
        '<div class="cs-av-cab"><div><h2>Nos Avalie</h2><p>Como está a sua experiência com a Mentóra? Sua opinião ajuda a construir a plataforma.</p></div>' +
        '<button class="btn btn-primary" style="padding:.65rem 1.4rem;font-size:14px;border-radius:10px;" data-cs="avaliar" id="cs-btn-avaliar">Avaliar a Mentóra</button></div>' +
        '<div class="cs-termo" id="cs-termo"></div>' +
        '<div id="cs-av-lista" style="display:flex;flex-direction:column;gap:1rem;"><p class="cs-vazio">Carregando avaliações...</p></div></div>';
    }
    var u = await sessao();
    var c = await sb(); if (!c) return;
    var r = await c.from('Mentora_Avaliacoes').select('*').neq('status', 'removido').order('created_at', { ascending: false });
    if (r.error) { $('cs-av-lista').innerHTML = '<p class="cs-vazio">Não foi possível carregar as avaliações: ' + esc(r.error.message) + '</p>'; return; }
    CS.aval.lista = r.data || [];
    CS.aval.minha = u ? CS.aval.lista.find(function (a) { return a.mentor_id === u.id; }) || null : null;
    await carregarPerfis(CS.aval.lista.map(function (a) { return a.mentor_id; }));
    var b = $('cs-btn-avaliar'); if (b) b.textContent = CS.aval.minha ? 'Editar minha avaliação' : 'Avaliar a Mentóra';
    desenharAvaliacoes();
    if (!CS.aval.canal && c.channel) {
      CS.aval.canal = c.channel('cs-avaliacoes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'Mentora_Avaliacoes' }, agendarRecargaAvaliacoes)
        .subscribe();
    }
  }

  function desenharAvaliacoes() {
    var publicas = CS.aval.lista.filter(function (a) { return a.status === 'ativo'; });
    var total = publicas.length;
    var soma = publicas.reduce(function (s, a) { return s + a.nota; }, 0);
    var media = total ? soma / total : 0;
    var dist = [0, 0, 0, 0, 0, 0];
    publicas.forEach(function (a) { dist[a.nota]++; });
    var pos = total ? ((media - 1) / 4) * 100 : 0;
    var zona = total ? ROTULO_NOTA[Math.min(5, Math.max(1, Math.round(media)))] : 'Sem avaliações ainda';

    var termo = $('cs-termo');
    var marcaAnterior = termo.querySelector('.cs-termo-marca');
    var leftAnterior = marcaAnterior ? marcaAnterior.style.left : '0%';
    termo.innerHTML = '<div><div class="cs-termo-media"><span class="num">' + (total ? media.toFixed(1).replace('.', ',') : '–') + '</span><span class="de">de 5</span></div>' +
      '<div style="margin-top:.35rem">' + estrelas(media, 20) + '</div>' +
      '<div class="cs-termo-zona" style="color:' + (total ? corNota(media) : '#94A3B8') + '">' + zona + '</div>' +
      '<div class="cs-termo-total">' + total + (total === 1 ? ' avaliação' : ' avaliações') + ' · soma de ' + soma + ' pontos</div>' +
      '<div class="cs-termo-barra" role="meter" aria-valuemin="1" aria-valuemax="5" aria-valuenow="' + media.toFixed(1) + '" aria-label="Termômetro de notas">' +
      (total ? '<div class="cs-termo-marca" style="left:' + leftAnterior + '"></div>' : '') + '</div>' +
      '<div class="cs-termo-esc"><span>1 Ruim</span><span>3 Bom</span><span>5 Perfeito</span></div></div>' +
      '<div class="cs-dist">' + [5, 4, 3, 2, 1].map(function (n) {
        var pct = total ? Math.round((dist[n] / total) * 100) : 0;
        return '<button class="cs-dist-l' + (CS.aval.filtro === n ? ' sel' : '') + '" data-cs="filtro-nota" data-n="' + n + '" title="Mostrar só as de ' + n + ' estrela(s)"><span>' + n + ' ★</span><div class="cs-dist-t"><div style="width:' + pct + '%"></div></div><span class="q">' + dist[n] + '</span></button>';
      }).join('') + '</div>';
    if (total) requestAnimationFrame(function () { requestAnimationFrame(function () { var m = termo.querySelector('.cs-termo-marca'); if (m) m.style.left = pos + '%'; }); });

    var lista = CS.aval.lista.filter(function (a) { return a.status === 'ativo' || a.mentor_id === CS.meuId; });
    if (CS.aval.filtro) lista = lista.filter(function (a) { return a.nota === CS.aval.filtro; });
    var el = $('cs-av-lista');
    if (!lista.length) {
      el.innerHTML = '<p class="cs-vazio">' + (CS.aval.filtro ? 'Nenhuma avaliação com ' + CS.aval.filtro + ' estrela(s).' : 'Ainda não há avaliações. Seja a primeira pessoa a avaliar!') + '</p>';
      return;
    }
    el.innerHTML = (CS.aval.filtro ? '<div style="font-size:13px;color:#64748B;">Mostrando avaliações de ' + CS.aval.filtro + ' estrela(s) · <button data-cs="filtro-nota" data-n="' + CS.aval.filtro + '" style="background:none;border:none;color:#5B2DA3;font-weight:600;cursor:pointer;padding:0;">ver todas</button></div>' : '') +
      lista.map(function (a) {
        var pf = perfilDe(a.mentor_id, a.autor_nome);
        var nome = pf.nome && pf.nome !== 'Mentor(a)' ? pf.nome : (a.autor_nome || 'Mentor(a)');
        var txt = a.comentario || '';
        var longo = txt.length > 700;
        return '<article class="cs-aval"><div class="cs-aval-top">' + avatar({ id: a.mentor_id, nome: nome, foto: pf.foto }, 42, true) +
          '<div><div class="n">' + esc(nome) + (a.mentor_id === CS.meuId ? ' <span style="font-weight:500;color:#94A3B8;font-size:13px;">(você)</span>' : '') +
          (a.status === 'retido' ? '<span class="cs-analise">Em análise pela moderação</span>' : '') + '</div>' +
          '<div>' + estrelas(a.nota, 14) + ' <span class="d">' + ROTULO_NOTA[a.nota] + ' · ' + dataHora(a.created_at) + (a.editada ? ' · editada' : '') + '</span></div></div></div>' +
          (txt ? '<p data-completo="' + esc(txt) + '">' + esc(longo ? txt.slice(0, 700) + '…' : txt) + '</p>' + (longo ? '<button class="mais" data-cs="ler-mais">Ler mais</button>' : '') : '') +
          (a.resposta ? '<div class="cs-resposta"><div class="r">Resposta da Mentóra' + (a.respondido_em ? ' · ' + dataHora(a.respondido_em) : '') + '</div><p>' + esc(a.resposta) + '</p></div>' : '') +
          '</article>';
      }).join('');
  }

  async function abrirModalAvaliacao() {
    var u = await sessao(); if (!u) { alert('Faça login para avaliar.'); return; }
    await carregarPerfis([u.id]);
    var eu = perfilDe(u.id, 'Você');
    var m = CS.aval.minha;
    CS.aval.nota = m ? m.nota : 0;
    var fundo = document.createElement('div');
    fundo.className = 'cs-modal-fundo';
    fundo.innerHTML = '<div class="cs-modal" role="dialog" aria-modal="true" aria-label="Avaliar a Mentóra"><div class="cs-modal-top"><h3>' + (m ? 'Editar minha avaliação' : 'Avaliar a Mentóra') + '</h3><button class="cs-x" data-fechar aria-label="Fechar">×</button></div>' +
      '<div class="cs-modal-corpo"><div style="display:flex;align-items:center;gap:.6rem;margin-bottom:1rem;font-size:14px;color:#64748B;">' + avatar(eu, 36) + '<span>Avaliando como <b style="color:#1e293b">' + esc(eu.nome) + '</b></span></div>' +
      '<div style="text-align:center;font-size:14px;font-weight:600;color:#334155;">Qual nota você dá para a Mentóra?</div>' +
      '<div class="cs-sel-estrelas" role="radiogroup" aria-label="Nota de 1 a 5">' + [1, 2, 3, 4, 5].map(function (n) {
        return '<button type="button" role="radio" data-n="' + n + '" aria-label="' + n + ' - ' + ROTULO_NOTA[n] + '">★</button>';
      }).join('') + '</div><div class="cs-sel-rotulo" id="cs-sel-rotulo"></div>' +
      '<label for="cs-aval-txt" style="font-size:14px;font-weight:600;color:#334155;display:block;margin-bottom:.4rem;">Comentário, sugestão ou reclamação <span style="font-weight:400;color:#94A3B8">(opcional)</span></label>' +
      '<textarea id="cs-aval-txt" class="cs-aval-txt" placeholder="Conte o que está funcionando bem, o que pode melhorar ou o que te incomodou..."></textarea>' +
      '<div class="cs-contador" id="cs-contador">0 / 2.000 palavras</div>' +
      '<div class="cs-nota-aviso">Sua avaliação é pública: aparece na comunidade com o seu nome e a sua foto, e as melhores também podem aparecer na página inicial da Mentóra, com a sua foto, o seu primeiro nome e a inicial do sobrenome. Você pode editá-la quando quiser, e a equipe da Mentóra pode respondê-la.</div></div>' +
      '<div class="cs-modal-rod"><button class="cs-btn sec" data-fechar>Cancelar</button><button class="cs-btn prim" data-ok>' + (m ? 'Salvar alterações' : 'Enviar avaliação') + '</button></div></div>';
    document.body.appendChild(fundo);
    var ta = fundo.querySelector('#cs-aval-txt');
    if (m) ta.value = m.comentario || '';
    function pintar(n) {
      fundo.querySelectorAll('.cs-sel-estrelas button').forEach(function (b) {
        var bn = Number(b.getAttribute('data-n'));
        b.classList.toggle('on', bn <= n);
        b.setAttribute('aria-checked', bn === CS.aval.nota ? 'true' : 'false');
      });
      $('cs-sel-rotulo').textContent = n ? ROTULO_NOTA[n] : 'Toque nas estrelas';
    }
    function contar() {
      var n = contarPalavras(ta.value);
      var ct = $('cs-contador');
      ct.textContent = n.toLocaleString('pt-BR') + ' / 2.000 palavras';
      ct.classList.toggle('estourou', n > LIMITE_PALAVRAS);
      return n;
    }
    pintar(CS.aval.nota); contar();
    ta.addEventListener('input', contar);
    var est = fundo.querySelector('.cs-sel-estrelas');
    est.addEventListener('mouseover', function (e) { var b = e.target.closest('button'); if (b) pintar(Number(b.getAttribute('data-n'))); });
    est.addEventListener('mouseleave', function () { pintar(CS.aval.nota); });
    fundo.addEventListener('click', async function (ev) {
      var t = ev.target;
      if (t === fundo || t.hasAttribute('data-fechar')) { fundo.remove(); return; }
      var sb1 = t.closest('.cs-sel-estrelas button');
      if (sb1) { CS.aval.nota = Number(sb1.getAttribute('data-n')); pintar(CS.aval.nota); return; }
      if (t.hasAttribute('data-ok')) {
        if (!CS.aval.nota) { alert('Escolha uma nota de 1 a 5 estrelas.'); return; }
        if (contar() > LIMITE_PALAVRAS) { alert('O comentário passou do limite de 2.000 palavras.'); return; }
        t.disabled = true;
        var c = await sb();
        var dados = { nota: CS.aval.nota, comentario: ta.value.trim() };
        var r = m
          ? await c.from('Mentora_Avaliacoes').update(dados).eq('id', m.id).select()
          : await c.from('Mentora_Avaliacoes').insert([dados]).select();
        t.disabled = false;
        if (r.error) { alert('Não foi possível enviar: ' + msgErro(r.error)); return; }
        fundo.remove();
        var nova = r.data && r.data[0];
        if (nova && nova.status === 'retido') alert('Obrigada! Sua avaliação foi recebida, mas ficou em análise porque o texto tem termos que as Diretrizes pedem para revisar. A equipe da Mentóra vai liberar em breve.');
        else alert('Obrigada pela sua avaliação!');
        carregarAvaliacoes();
      }
    });
  }

  /* ═════════════ inicialização ═════════════ */
  document.addEventListener('DOMContentLoaded', function () {
    injetarEstilos();
    setTimeout(async function () {
      var u = await sessao();
      if (u) iniciarTempoReal();
    }, 1500);
  });
  var cli = null;
  setTimeout(async function () {
    cli = await sb();
    if (cli && cli.auth && cli.auth.onAuthStateChange) {
      cli.auth.onAuthStateChange(function (evento) {
        if (evento === 'SIGNED_OUT') {
          fecharChat();
          CS.meuId = null; CS.perfis = {};
          if (CS.chat.canal) { try { cli.removeChannel(CS.chat.canal); } catch (e) {} CS.chat.canal = null; }
          document.querySelectorAll('.cs-badge-n').forEach(function (b) { b.classList.remove('on'); });
        }
        // consultas ao Supabase só DEPOIS que o login termina (dentro da escuta travava o login)
        if (evento === 'SIGNED_IN') { CS.perfis = {}; setTimeout(iniciarTempoReal, 0); }
      });
    }
  }, 800);
})();
