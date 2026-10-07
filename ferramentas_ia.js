// ============================================================
// ferramentas_ia.js — Módulo de Ferramentas de IA da Mentóra
// Conectado à Supabase Edge Function: proxy-ia
// URL: https://duhaqygpyamjelwxylmn.supabase.co/functions/v1/proxy-ia
// ============================================================

const EDGE_FUNCTION_URL = 'https://duhaqygpyamjelwxylmn.supabase.co/functions/v1/proxy-ia';
// Nome ÚNICO da tabela de sessões. Outros arquivos devem usar esta constante em vez de digitar o nome.
const MENTORA_TABELA_SESSOES = 'Sessoes_Mentoria';
window.MENTORA_TABELA_SESSOES = MENTORA_TABELA_SESSOES;
// Chave publicável (anon) do Supabase — necessária no header Authorization para a
// Edge Function aceitar a chamada. Sem ela, as 3 funções de IA abaixo falhavam
// silenciosamente (erro 401), que era a causa real de "a análise de IA não gera".
const SUPABASE_ANON_KEY = 'sb_publishable_n2qLPXvOmwCZRHCcCziVlg_rWRiiDcB';

// A IA agora exige login: a chamada leva a sessão do(a) mentor(a), e não só a chave pública.
// Assim ninguém de fora consegue usar (e gastar) a IA da Mentóra.
async function cabecalhosIA() {
    let token = null;
    try {
        if (window.supabaseClient) {
            const { data } = await window.supabaseClient.auth.getSession();
            token = data && data.session ? data.session.access_token : null;
        }
    } catch (e) {}
    if (!token) throw new Error('Faça login para usar as ferramentas de IA.');
    return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'apikey': SUPABASE_ANON_KEY };
}
// Mensagem clara quando a IA recusa (limite diário, sessão expirada etc.)
async function mensagemErroIA(response) {
    try { const j = await response.json(); if (j && j.error) return j.error; } catch (e) {}
    return 'A IA não respondeu agora. Tente novamente em instantes.';
}
function htmlErroIA(err, padrao) {
    const msg = (err && err.message) ? String(err.message) : padrao;
    const div = document.createElement('span');
    div.style.color = '#e05c6a';
    div.textContent = msg;
    return div.outerHTML;
}

// ──────────────────────────────────────────────────────────────
// 1. BUSCADOR DE NOTÍCIAS — Exibe notícias do banco Supabase
// ──────────────────────────────────────────────────────────────
async function carregarNoticiasIA() {
    const container = document.getElementById('noticias-ia-container');
    if (!container) return;

    container.innerHTML = `
        <div style="text-align:center; padding: 2rem; color: var(--text-muted);">
            <div style="font-size: 28px; margin-bottom: 0.5rem;">⏳</div>
            Carregando tendências curadas pela IA...
        </div>`;

    try {
        if (!window.supabaseClient) return;

        const { data, error } = await window.supabaseClient
            .from('noticias')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(6);

        if (error || !data || data.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding: 2rem; color: var(--text-muted);">
                    <div style="font-size: 28px; margin-bottom: 0.5rem;">🔍</div>
                    Nenhuma notícia disponível no momento. O robô curador irá buscar em breve.
                </div>`;
            return;
        }

        const categoriaColors = {
            'Liderança Regenerativa':     { bg: 'rgba(91,45,163,0.1)',  border: '#5B2DA3', tag: '#5B2DA3' },
            'Escalando o Impacto B2B':    { bg: 'rgba(47,91,255,0.1)',  border: '#2F5BFF', tag: '#2F5BFF' },
            'Mentorando a Geração Alpha': { bg: 'rgba(212,175,55,0.1)', border: '#D4AF37', tag: '#B4850A' },
            'O uso da IA como Co-Piloto': { bg: 'rgba(58,175,138,0.1)', border: '#3aaf8a', tag: '#3aaf8a' },
        };

        container.innerHTML = data.map(n => {
            const cor = categoriaColors[n.categoria] || { bg: 'rgba(139,92,246,0.1)', border: '#8B5CF6', tag: '#8B5CF6' };
            const dataFormatada = n.data_publicacao
                ? new Date(n.data_publicacao).toLocaleDateString('pt-BR')
                : new Date(n.created_at).toLocaleDateString('pt-BR');

            return `
            <a href="${n.link || '#'}" target="_blank" rel="noopener noreferrer"
               style="display:block; text-decoration:none; background:${cor.bg}; border:1px solid ${cor.border}30;
                      border-left: 4px solid ${cor.border}; border-radius:12px; padding:1.25rem 1.5rem;
                      transition: all 0.2s ease; cursor:pointer;"
               onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 8px 24px rgba(0,0,0,0.1)'"
               onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; margin-bottom:0.6rem;">
                    <span style="font-size:11px; font-weight:700; color:${cor.tag}; text-transform:uppercase; letter-spacing:0.5px;
                                 background:${cor.bg}; border:1px solid ${cor.border}40; border-radius:100px; padding:3px 10px;">
                        ${n.categoria || 'Tendência'}
                    </span>
                    <span style="font-size:11px; color:var(--text-muted); white-space:nowrap; flex-shrink:0;">${dataFormatada}</span>
                </div>
                <div style="font-weight:600; font-size:14px; color:var(--white); margin-bottom:0.5rem; line-height:1.4;">
                    ${n.titulo}
                </div>
                <div style="font-size:13px; color:var(--text-muted); line-height:1.6;">
                    ${n.resumo}
                </div>
                <div style="margin-top:0.75rem; font-size:12px; color:${cor.tag}; font-weight:600;">
                    Ler artigo completo →
                </div>
            </a>`;
        }).join('');

    } catch (err) {
        console.warn('Erro ao carregar notícias:', err);
        container.innerHTML = `
            <div style="text-align:center; padding: 2rem; color: var(--text-muted);">
                Não foi possível carregar as tendências agora. Tente novamente mais tarde.
            </div>`;
    }
}

async function salvarFerramentaTimeline(nomeFerramenta, resultadoIA, observacaoMentor, btnElement) {
    // Busca o ID do mentorado atual (do escopo do prontuário ou da URL)
    let menteeId = null;
    if (typeof cp_currentMentee !== 'undefined' && cp_currentMentee) menteeId = cp_currentMentee.id;
    if (!menteeId) menteeId = new URLSearchParams(window.location.search).get('id');

    if (!menteeId) {
        alert("⚠️ Por favor, selecione um mentorado no prontuário primeiro para poder salvar na linha do tempo.");
        return;
    }

    if (!window.supabaseClient) {
        alert("Erro: Banco de dados não conectado.");
        return;
    }

    if (btnElement) {
        btnElement.disabled = true;
        btnElement.textContent = "💾 Salvando...";
    }

    // O banco só aceita a gravação se mentor_id for o do mentor logado (e é assim que a linha do tempo
    // encontra o registro depois). Por isso o ID vem da sessão, nunca de um campo da tela.
    let mentorId = null;
    try {
        const { data: sessaoData } = await window.supabaseClient.auth.getSession();
        mentorId = sessaoData && sessaoData.session && sessaoData.session.user ? sessaoData.session.user.id : null;
    } catch (e) {}
    if (!mentorId) {
        alert("⚠️ Sua sessão expirou. Entre novamente para salvar na linha do tempo.");
        if (btnElement) {
            btnElement.disabled = false;
            btnElement.textContent = "💾 Salvar na Linha do Tempo";
        }
        return;
    }

    // Estrutura do payload compatível com a tabela de sessões do prontuário
    const payloadSupabase = {
        mentorado_id: menteeId,
        mentor_id: mentorId,
        tipo: 'ferramenta_ia', // Usaremos esse tipo para diferenciar na linha do tempo
        dados: {
            date: new Date().toISOString().split('T')[0],
            createdAt: Date.now(),
            mentorNotes: observacaoMentor || '',
            aiAnalysis: `[Ferramenta: ${nomeFerramenta}]\n\n${resultadoIA}`
        }
    };

    try {
        const { error } = await window.supabaseClient.from(MENTORA_TABELA_SESSOES).insert([payloadSupabase]);
        if (error) throw error;
        
        alert(`✅ Resultado da ferramenta '${nomeFerramenta}' salvo com sucesso no prontuário do mentorado!`);
        
        // Tenta atualizar a interface da linha do tempo se a função existir
        if (typeof cp_init === 'function') {
            await cp_init();
            if (cp_currentMentee) cp_openProfile(cp_currentMentee.id);
        }
    } catch (err) {
        console.error("Erro ao salvar ferramenta no histórico:", err);
        // P0001 = mensagem escrita pelo próprio banco para o usuário (ex.: limite do plano)
        if (err && err.code === 'P0001' && err.message) {
            alert("⚠️ " + err.message);
        } else if (err && err.code === '42501') {
            alert("❌ Sem permissão para salvar neste mentorado. Entre novamente e tente de novo.");
        } else {
            alert("❌ Ocorreu um erro ao salvar na linha do tempo.");
        }
    } finally {
        if (btnElement) {
            btnElement.disabled = false;
            btnElement.textContent = "💾 Salvar na Linha do Tempo";
        }
    }
}

// Expõe funções globalmente para chamadas de outros scripts/HTML
window.carregarNoticiasIA   = carregarNoticiasIA;
window.salvarFerramentaTimeline = salvarFerramentaTimeline;
window.EDGE_FUNCTION_URL     = EDGE_FUNCTION_URL;
