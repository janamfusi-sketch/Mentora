// admin_suporte.js - Lógica do Painel Administrativo para o Suporte Alice

// Proteção contra código malicioso nos textos dos chamados
if (typeof window.escapeHTML !== 'function') {
    window.escapeHTML = function (v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    };
}
var escapeHTML = window.escapeHTML;



// Função para renderizar as tags de plano

function getPlanBadge(plan) {

    if (!plan) return `<span class="badge" style="background:#E2E8F0; color:#475569">Free</span>`;

    var p = plan.toLowerCase();

    if (p.includes('vip')) return `<span class="badge" style="background:rgba(47, 91, 255, 0.1); color:var(--blue)">VIP</span>`;

    if (p.includes('premium')) return `<span class="badge premium">Premium</span>`;

    if (p.includes('pro business')) return `<span class="badge" style="background:rgba(212, 175, 55, 0.4); color:#6b530c">Pro Business</span>`;

    return `<span class="badge" style="background:#E2E8F0; color:#475569">${plan}</span>`;

}



// Carregar tickets do banco

async function carregarTicketsSuporte() {

    if (!window.supabaseClient) {

        console.error("Supabase client não encontrado");

        return;

    }



    var tbody = document.getElementById('suporte-tbody');

    if (!tbody) return;



    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">Buscando chamados...</td></tr>';



    try {

        var { data, error } = await window.supabaseClient

            .from('support_tickets')

            .select('*')

            .order('created_at', { ascending: false })
            
            .range(0, 49);



        if (error) throw error;



        // Atualiza a badge

        var badge = document.getElementById('badge-suporte');

        if (badge) {

            var abertos = data.filter(t => t.status === 'open').length;

            if (abertos > 0) {

                badge.style.display = 'inline-flex';

                badge.textContent = abertos;

            } else {

                badge.style.display = 'none';

            }

        }



        if (!data || data.length === 0) {

            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">Nenhum chamado de suporte encontrado.</td></tr>';

            return;

        }



        tbody.innerHTML = '';



        data.forEach(ticket => {

            var tr = document.createElement('tr');

            

            // Format data

            var d = new Date(ticket.created_at);

            var dataStr = d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});

            

            // Format link de imagem
            var imgHtml = '-';
            if (ticket.image_url && ticket.image_url.startsWith('https://')) {
                imgHtml = `<a href="#" data-print="${escapeHTML(ticket.image_url)}" onclick="abrirPrintSuporte(this.getAttribute('data-print')); return false;" style="color:var(--blue); text-decoration:none; font-weight:600; font-size:13px;">Ver Print</a>`;
            }

            var tdPlano = document.createElement('td');
            tdPlano.innerHTML = getPlanBadge(escapeHTML(ticket.mentor_plan || ''));

            var tdNome = document.createElement('td');
            var strong = document.createElement('strong');
            strong.style.color = 'var(--text)';
            strong.textContent = ticket.mentor_name;
            tdNome.appendChild(strong);

            var tdTelefone = document.createElement('td');
            tdTelefone.textContent = ticket.mentor_phone || '-';

            var tdDescricao = document.createElement('td');
            tdDescricao.style.maxWidth = '250px';
            tdDescricao.style.whiteSpace = 'pre-wrap';
            tdDescricao.style.wordBreak = 'break-word';
            tdDescricao.textContent = ticket.description;

            var tdImagem = document.createElement('td');
            tdImagem.innerHTML = imgHtml;

            var tdData = document.createElement('td');
            tdData.style.fontSize = '12px';
            tdData.style.color = 'var(--text-muted)';
            tdData.innerHTML = dataStr;

            var tdAcoes = document.createElement('td');
            tdAcoes.innerHTML = `
                <button class="btn btn-outline" style="padding: 4px 10px; font-size: 11px; border-color:${escapeHTML(ticket.status) === 'resolved' ? '#10B981' : '#CBD5E1'}; color:${escapeHTML(ticket.status) === 'resolved' ? '#10B981' : 'var(--text-muted)'};" onclick="resolverTicket('${escapeHTML(ticket.id)}')" ${escapeHTML(ticket.status) === 'resolved' ? 'disabled' : ''}>
                    ${escapeHTML(ticket.status) === 'resolved' ? 'Resolvido' : 'Marcar Resolvido'}
                </button>
                <button class="btn btn-outline" style="padding: 4px 10px; font-size: 11px; border-color:#ef4444; color:#ef4444; margin-left: 5px;" onclick="deletarTicket('${escapeHTML(ticket.id)}')">Excluir</button>
            `;

            tr.innerHTML = '';
            tr.appendChild(tdPlano);
            tr.appendChild(tdNome);
            tr.appendChild(tdTelefone);
            tr.appendChild(tdDescricao);
            tr.appendChild(tdImagem);
            tr.appendChild(tdData);
            tr.appendChild(tdAcoes);

            tbody.appendChild(tr);

        });



    } catch (err) {

        console.error("Erro ao carregar tickets de suporte", err);

        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #ef4444; padding: 2rem;">Erro ao carregar chamados.</td></tr>';

    }

}



// Abrir o print do chamado por um link temporário (1 hora). A janela é aberta
// no clique (evita bloqueio de pop-up) e recebe o endereço assim que ele fica pronto.
async function abrirPrintSuporte(url) {
    var janela = window.open('', '_blank');
    var destino = url;
    try {
        var m = String(url || '').match(/\/storage\/v1\/object\/(?:public|sign)\/(support_images|suporte-prints)\/([^?#]+)/);
        if (m && window.supabaseClient) {
            var r = await window.supabaseClient.storage.from(m[1]).createSignedUrl(decodeURIComponent(m[2]), 3600);
            if (!r.error && r.data && r.data.signedUrl) destino = r.data.signedUrl;
        }
    } catch (e) { console.warn('Link temporário do print indisponível:', e); }
    if (janela) janela.location.href = destino; else window.location.href = destino;
}
window.abrirPrintSuporte = abrirPrintSuporte;



// Resolver um ticket

async function resolverTicket(id) {

    if (!confirm("Deseja marcar este chamado como resolvido?")) return;

    

    try {

        var { error } = await window.supabaseClient

            .from('support_tickets')

            .update({ status: 'resolved' })

            .eq('id', id);

        

        if (error) throw error;

        carregarTicketsSuporte();

    } catch (err) {

        console.error("Erro ao resolver ticket", err);

        alert("Erro ao atualizar o chamado.");

    }

}



// Deletar ticket manualmente

async function deletarTicket(id) {

    if (!confirm("Tem certeza que deseja excluir permanentemente este chamado? A imagem será apagada também.")) return;

    

    try {

        // 1) apaga o print pelo caminho oficial do armazenamento (o banco não permite apagar direto)
        var { data: tk } = await window.supabaseClient.from('support_tickets').select('image_url').eq('id', id).maybeSingle();
        var m = tk && String(tk.image_url || '').match(/\/storage\/v1\/object\/(?:public|sign)\/(support_images|suporte-prints)\/([^?#]+)/);
        if (m) {
            var { error: errArq } = await window.supabaseClient.storage.from(m[1]).remove([decodeURIComponent(m[2])]);
            if (errArq) console.warn('Não foi possível apagar o print do chamado:', errArq.message);
        }

        // 2) apaga o chamado
        var { error } = await window.supabaseClient

            .from('support_tickets')

            .delete()

            .eq('id', id);

        

        if (error) throw error;

        carregarTicketsSuporte();

    } catch (err) {

        console.error("Erro ao excluir ticket", err);

        alert("Erro ao excluir o chamado.");

    }

}



// Escutar mudança de aba para carregar tickets quando clicar em Suporte

var originalSwitchTab = window.switchTab;

if (typeof originalSwitchTab === 'function') {

    window.switchTab = function(sectionId, element) {

        originalSwitchTab(sectionId, element);

        if (sectionId === 'suporte') {

            carregarTicketsSuporte();

        }

    };

} else {

    console.warn("Aviso: Função switchTab original não encontrada, os tickets podem não carregar automaticamente ao mudar de aba.");

}



// Inicializar a leitura para mostrar o badge se estiver na página admin e já houver supabase

document.addEventListener('DOMContentLoaded', () => {

    setTimeout(() => {

        carregarTicketsSuporte(); // Chama para inicializar a badge mesmo sem abrir a aba

    }, 1500);

});

