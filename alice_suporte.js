// alice_suporte.js - Widget do Agente de Suporte (Alice)



(function() {

    // Inject CSS for the widget

    var style = document.createElement('style');

    style.innerHTML = `

        #alice-widget-container {

            position: fixed;

            bottom: 20px;

            right: 20px;

            z-index: 99999;

            font-family: 'Inter', sans-serif;

        }

        #alice-button {

            width: 60px;

            height: 60px;

            border-radius: 50%;

            background: linear-gradient(135deg, #1B2559 0%, #5B2DA3 100%);

            box-shadow: 0 4px 15px rgba(0,0,0,0.2);

            cursor: pointer;

            display: flex;

            align-items: center;

            justify-content: center;

            transition: transform 0.2s;

            color: #fff;

            font-weight: bold;

            font-size: 24px;

            border: 2px solid #D4AF37;

        }

        #alice-button:hover {

            transform: scale(1.05);

        }

        #alice-button {
            touch-action: none;
            user-select: none;
            transition: width 0.2s, height 0.2s, border-radius 0.2s, opacity 0.2s, transform 0.2s;
        }

        /* Minimizado: vira uma linha fina e discreta */
        #alice-button.minimizado {
            width: 44px;
            height: 6px;
            border-radius: 3px;
            border: none;
            font-size: 0;
            opacity: 0.55;
            box-shadow: 0 2px 6px rgba(0,0,0,0.15);
        }

        #alice-button.minimizado:hover {
            opacity: 1;
            height: 8px;
            transform: none;
        }

        #alice-widget-container.arrastando #alice-button {
            cursor: grabbing;
            transition: none;
        }

        #alice-chat-box {

            display: none;

            position: fixed;

            width: min(350px, calc(100vw - 24px));

            max-width: calc(100vw - 24px);

            max-height: calc(100vh - 24px);

            max-height: calc(100dvh - 24px);

            box-sizing: border-box;

            background: #fff;

            border-radius: 12px;

            box-shadow: 0 5px 25px rgba(0,0,0,0.15);

            border: 1px solid rgba(0,0,0,0.05);

            overflow: hidden;

            flex-direction: column;

        }

        #alice-chat-header {

            background: linear-gradient(135deg, #1B2559 0%, #5B2DA3 100%);

            color: #fff;

            padding: 15px;

            display: flex;

            justify-content: space-between;

            align-items: center;

        }

        #alice-chat-header h3 {

            margin: 0;

            font-size: 16px;

            display: flex;

            align-items: center;

            gap: 8px;

        }

        #alice-close-btn {

            background: transparent;

            border: none;

            color: #fff;

            font-size: 20px;

            cursor: pointer;

        }

        #alice-chat-body {

            padding: 15px;

            flex: 1 1 auto;

            min-height: 0;

            -webkit-overflow-scrolling: touch;

            overscroll-behavior: contain;

            overflow-y: auto;

            background: #F8FAFC;

        }

        .alice-msg {

            background: #E0E7FF;

            padding: 12px;

            border-radius: 8px 8px 8px 0;

            font-size: 14px;

            color: #334155;

            margin-bottom: 15px;

            line-height: 1.4;

        }

        .alice-form-group {

            margin-bottom: 12px;

        }

        .alice-form-group label {

            display: block;

            font-size: 12px;

            font-weight: 600;

            color: #475569;

            margin-bottom: 4px;

        }

        .alice-input, .alice-select, .alice-textarea {

            width: 100%;

            padding: 8px 10px;

            border: 1px solid #CBD5E1;

            border-radius: 6px;

            font-family: inherit;

            font-size: 13px;

        }

        .alice-textarea {

            resize: vertical;

            min-height: 60px;

        }

        #alice-submit-btn {

            background: #2F5BFF;

            color: #fff;

            border: none;

            padding: 10px;

            width: 100%;

            border-radius: 6px;

            font-weight: 600;

            cursor: pointer;

            transition: background 0.2s;

        }

        #alice-submit-btn:hover {

            background: #1e3ebd;

        }

        #alice-status {

            font-size: 12px;

            text-align: center;

            margin-top: 10px;

            font-weight: 600;

        }

    `;

    document.head.appendChild(style);



    // Inject HTML

    var container = document.createElement('div');

    container.id = 'alice-widget-container';

    

    container.innerHTML = `

        <div id="alice-chat-box">

            <div id="alice-chat-header">

                <h3><span>A</span> Suporte Alice</h3>

                <button id="alice-close-btn">&times;</button>

            </div>

            <div id="alice-chat-body">

                <div class="alice-msg">

                    Olá! Sou a Alice, sua assistente de suporte. Se encontrou algum erro ou falha, por favor, preencha os dados abaixo e me envie. A equipe técnica será notificada!

                </div>

                

                <div id="alice-aviso-login" style="display:none; font-size:14px; color:#334155; line-height:1.5; text-align:center; padding:10px 4px;">
                    Para abrir um chamado, entre na sua conta da Mentóra.<br><br>
                    <a href="javascript:void(0)" id="alice-btn-entrar" style="display:inline-block; background:#2F5BFF; color:#fff; padding:10px 18px; border-radius:6px; font-weight:600; text-decoration:none;">Entrar</a>
                    <div style="font-size:12px; color:#64748B; margin-top:12px;">Se o problema for no acesso, use "Esqueci minha senha" na tela de entrada.</div>
                </div>

                <form id="alice-support-form">

                    <div class="alice-form-group">

                        <label>Nome Completo</label>

                        <input type="text" id="alice-nome" class="alice-input" required>

                    </div>

                    <div class="alice-form-group">

                        <label>Telefone / WhatsApp</label>

                        <input type="text" id="alice-telefone" class="alice-input" placeholder="(00) 00000-0000" required>

                    </div>

                    <div class="alice-form-group" style="display:none;">

                        <label>Seu Plano Atual</label>

                        <select id="alice-plano" class="alice-select">

                            <option value="free">Free (Gratuito)</option>

                            <option value="vip">VIP</option>

                            <option value="premium">Premium</option>

                            <option value="pro business">Pro Business</option>

                        </select>

                    </div>

                    <div class="alice-form-group">

                        <label>Descreva o erro ou falha detalhadamente</label>

                        <textarea id="alice-descricao" class="alice-textarea" required></textarea>

                    </div>

                    <div class="alice-form-group">

                        <label>Tem um print? (Opcional)</label>

                        <input type="file" id="alice-imagem" accept="image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif" class="alice-input">
                        <div style="font-size:11px; color:#64748B; margin-top:4px;">Imagem de até 5 MB.</div>

                    </div>

                    

                    <button type="submit" id="alice-submit-btn">Enviar Relato para o Suporte</button>

                    <div id="alice-status"></div>

                </form>

            </div>

        </div>

        <div id="alice-button" role="button" tabindex="0" aria-label="Suporte Alice"
             title="1 clique: minimizar ou mostrar  •  2 cliques: abrir o suporte  •  arraste para mover">A</div>

    `;

    document.body.appendChild(container);



    // Event Listeners

    var btn = document.getElementById('alice-button');

    var box = document.getElementById('alice-chat-box');

    var closeBtn = document.getElementById('alice-close-btn');

    var form = document.getElementById('alice-support-form');

    var statusDiv = document.getElementById('alice-status');



    // ── Posição e estado salvos neste navegador (conveniência da mentora) ──
    function lerPref(chave) { try { return localStorage.getItem(chave); } catch (e) { return null; } }
    function gravarPref(chave, valor) { try { localStorage.setItem(chave, valor); } catch (e) {} }

    function aplicarMinimizado(min) {
        btn.classList.toggle('minimizado', min);
        if (min) box.style.display = 'none';
        gravarPref('alice_minimizada', min ? '1' : '0');
        posicionarCaixa();
    }

    function abrirChat() {
        aplicarMinimizado(false);
        box.style.display = 'flex';
        posicionarCaixa();
        prepararFormulario();
    }

    // Só quem está logado abre chamado; nome e telefone vêm do cadastro
    async function prepararFormulario() {
        var aviso = document.getElementById('alice-aviso-login');
        var c = window.supabaseClient;
        var sessao = null;
        try { if (c) { var r = await c.auth.getSession(); sessao = r && r.data ? r.data.session : null; } } catch (e) {}
        form.style.display = sessao ? '' : 'none';
        aviso.style.display = sessao ? 'none' : 'block';
        if (!sessao) return;
        try {
            var q = await c.from('Usuarios').select('nome, telefone').eq('id', sessao.user.id).maybeSingle();
            var cad = q && q.data;
            var nomeEl = document.getElementById('alice-nome'), telEl = document.getElementById('alice-telefone');
            if (cad && cad.nome && !nomeEl.value) nomeEl.value = cad.nome;
            if (cad && cad.telefone && !telEl.value) telEl.value = cad.telefone;
        } catch (e) {}
    }
    document.getElementById('alice-btn-entrar').addEventListener('click', function () {
        box.style.display = 'none';
        if (typeof abrirLogin === 'function') abrirLogin();
    });

    // Mantém a janela do chamado dentro da tela, onde quer que o botão esteja
    function posicionarCaixa() {
        // Janela flutuante (position: fixed) em qualquer tela: fica sempre inteira
        // dentro da área visível, acima ou abaixo do botão conforme o espaço.
        var vv = window.visualViewport;
        var vw = vv ? vv.width : window.innerWidth;
        var vh = vv ? vv.height : window.innerHeight;
        var ox = vv ? vv.offsetLeft : 0, oy = vv ? vv.offsetTop : 0;
        var m = 12, gap = 12;
        var r = container.getBoundingClientRect();
        var w = Math.min(350, vw - 2 * m);
        var espacoAcima = r.top - oy - m - gap;
        var espacoAbaixo = oy + vh - r.bottom - m - gap;
        var acima = espacoAcima >= Math.min(420, espacoAbaixo) || espacoAcima >= espacoAbaixo;
        var altMax = Math.max(220, Math.min(acima ? espacoAcima : espacoAbaixo, vh - 2 * m));
        var left = r.right - w;
        left = Math.max(ox + m, Math.min(ox + vw - w - m, left));
        box.style.width = w + 'px';
        box.style.left = left + 'px';
        box.style.right = 'auto';
        box.style.maxHeight = altMax + 'px';
        if (acima) {
            box.style.top = 'auto';
            box.style.bottom = (window.innerHeight - r.top + gap) + 'px';
        } else {
            box.style.bottom = 'auto';
            box.style.top = (r.bottom + gap) + 'px';
        }
    }

    function moverPara(x, y) {
        var w = container.offsetWidth, h = container.offsetHeight;
        x = Math.max(8, Math.min(window.innerWidth - w - 8, x));
        y = Math.max(8, Math.min(window.innerHeight - h - 8, y));
        container.style.left = x + 'px';
        container.style.top = y + 'px';
        container.style.right = 'auto';
        container.style.bottom = 'auto';
    }

    // Restaura o que a mentora deixou da última vez
    if (lerPref('alice_minimizada') === '1') btn.classList.add('minimizado');
    try {
        var pos = JSON.parse(lerPref('alice_posicao') || 'null');
        if (pos && typeof pos.x === 'number') moverPara(pos.x, pos.y);
    } catch (e) {}
    window.addEventListener('resize', function () {
        var r = container.getBoundingClientRect();
        if (container.style.left) moverPara(r.left, r.top);
        posicionarCaixa();
    });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', posicionarCaixa);
        window.visualViewport.addEventListener('scroll', posicionarCaixa);
    }

    // ── Arrastar (mouse e toque) ──
    var arrasto = null, arrastou = false;
    btn.addEventListener('pointerdown', function (e) {
        var r = container.getBoundingClientRect();
        arrasto = { dx: e.clientX - r.left, dy: e.clientY - r.top, x0: e.clientX, y0: e.clientY };
        arrastou = false;
        btn.setPointerCapture(e.pointerId);
    });
    btn.addEventListener('pointermove', function (e) {
        if (!arrasto) return;
        if (!arrastou && Math.abs(e.clientX - arrasto.x0) + Math.abs(e.clientY - arrasto.y0) < 6) return;
        arrastou = true;
        container.classList.add('arrastando');
        moverPara(e.clientX - arrasto.dx, e.clientY - arrasto.dy);
        posicionarCaixa();
    });
    btn.addEventListener('pointerup', function () {
        if (arrastou) {
            var r = container.getBoundingClientRect();
            gravarPref('alice_posicao', JSON.stringify({ x: r.left, y: r.top }));
        }
        container.classList.remove('arrastando');
        arrasto = null;
    });

    // ── 1 clique: minimiza/mostra  •  2 cliques: abre o chamado ──
    var cliques = 0, timerClique = null;
    btn.addEventListener('click', function () {
        if (arrastou) { arrastou = false; return; } // foi um arrasto, não um clique
        cliques++;
        if (cliques === 1) {
            timerClique = setTimeout(function () {
                cliques = 0;
                aplicarMinimizado(!btn.classList.contains('minimizado'));
            }, 280);
        } else {
            clearTimeout(timerClique);
            cliques = 0;
            abrirChat();
        }
    });
    btn.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirChat(); }
    });



    closeBtn.addEventListener('click', () => {

        box.style.display = 'none';

    });



    form.addEventListener('submit', async (e) => {

        e.preventDefault();

        

        if (!window.supabaseClient) {
            statusDiv.style.color = 'red';
            statusDiv.textContent = 'Não foi possível conectar agora. Recarregue a página e tente novamente.';
            return;
        }
        var sessaoEnvio = null;
        try { var rs = await window.supabaseClient.auth.getSession(); sessaoEnvio = rs && rs.data ? rs.data.session : null; } catch (e) {}
        if (!sessaoEnvio) { prepararFormulario(); return; }

        var arq = document.getElementById('alice-imagem').files[0];
        if (arq) {
            var tiposOk = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
            if (tiposOk.indexOf(arq.type) === -1) { statusDiv.style.color = 'red'; statusDiv.textContent = 'O print precisa ser uma imagem (PNG, JPG, WEBP, GIF ou foto do iPhone).'; return; }
            if (arq.size > 5 * 1024 * 1024) { statusDiv.style.color = 'red'; statusDiv.textContent = 'O print passa de 5 MB. Envie uma imagem menor.'; return; }
        }



        var btnSubmit = document.getElementById('alice-submit-btn');

        btnSubmit.disabled = true;

        btnSubmit.textContent = 'Enviando...';

        statusDiv.textContent = '';



        var nome = document.getElementById('alice-nome').value;

        var telefone = document.getElementById('alice-telefone').value;

        var plano = document.getElementById('alice-plano').value;

        var descricao = document.getElementById('alice-descricao').value;

        var imagemInput = document.getElementById('alice-imagem');



        var imageUrl = null;



        try {

            // Se tiver imagem, fazer upload primeiro

            if (imagemInput.files && imagemInput.files.length > 0) {

                var file = imagemInput.files[0];

                var fileExt = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif' })[file.type] || 'png';

                // cada mentor na própria pasta (o banco só aceita a pasta da própria conta)
                var fileName = `${sessaoEnvio.user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${fileExt}`;

                

                var { data: uploadData, error: uploadError } = await window.supabaseClient.storage

                    .from('support_images')

                    .upload(fileName, file, { contentType: file.type });

                

                if (uploadError) throw new Error('Não foi possível enviar o print. Tente uma imagem menor ou envie o chamado sem print.');



                var { data: publicUrlData } = window.supabaseClient.storage

                    .from('support_images')

                    .getPublicUrl(fileName);

                

                imageUrl = publicUrlData.publicUrl;

            }



            // Inserir ticket no banco

            var { data, error } = await window.supabaseClient

                .from('support_tickets')

                .insert([

                    {

                        mentor_name: nome,

                        mentor_phone: telefone,

                        mentor_plan: plano,

                        description: descricao,

                        image_url: imageUrl

                    }

                ]);



            if (error) throw new Error('Não foi possível registrar o chamado agora. Tente novamente em instantes.');



            statusDiv.style.color = 'green';

            statusDiv.textContent = 'Chamado enviado com sucesso! A equipe técnica já foi notificada.';

            form.reset();

            

            setTimeout(() => {

                box.style.display = 'none';

                statusDiv.textContent = '';

            }, 3000);



        } catch (err) {

            console.error(err);

            statusDiv.style.color = 'red';

            statusDiv.textContent = err.message || 'Ocorreu um erro ao enviar o chamado.';

        } finally {

            btnSubmit.disabled = false;

            btnSubmit.textContent = 'Enviar Relato para o Suporte';

        }

    });



})();

