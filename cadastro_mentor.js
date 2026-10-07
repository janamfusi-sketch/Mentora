// cadastro_mentor.js
// Lógica de cadastro blindada para evitar perda de dados por sobrescrita de HTML
// Autenticação por CPF: o Supabase só autentica por e-mail/telefone por baixo dos
// panos, então usamos um e-mail técnico derivado do CPF (ex: 12345678900@mentora.internal)
// só para essa finalidade. O e-mail real digitado é guardado à parte, como contato.

function validarCPF(cpfStr) {
    const cpf = (cpfStr || '').replace(/\D/g, '');
    if (cpf.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(cpf)) return false; // todos os dígitos iguais (000.000.000-00 etc.)

    let soma = 0;
    for (let i = 0; i < 9; i++) soma += parseInt(cpf.charAt(i), 10) * (10 - i);
    let resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(cpf.charAt(9), 10)) return false;

    soma = 0;
    for (let i = 0; i < 10; i++) soma += parseInt(cpf.charAt(i), 10) * (11 - i);
    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(cpf.charAt(10), 10)) return false;

    return true;
}

// Login técnico da conta: um código aleatório que NÃO contém o CPF.
// Quem entra com CPF pergunta ao servidor (função login-id) qual é o login técnico da conta.
function cpfParaEmailTecnico(cpfDigits) {
    // 128 bits aleatórios do navegador, em 32 caracteres hexadecimais (sem fallback com Math.random, que é previsível)
    if (!(window.crypto && crypto.getRandomValues)) throw new Error('Seu navegador é antigo demais para criar a conta com segurança. Atualize o navegador e tente de novo.');
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return 'u-' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('') + '@mentora.internal';
}

// Regra de senha da Mentóra (usada no cadastro e na redefinição). Devolve a mensagem do problema, ou null se estiver boa.
// Comprimento é o que mais protege: 10 ou mais caracteres. Frases com espaços são bem-vindas.
window.mentoraValidarSenha = function (s) {
    s = String(s == null ? '' : s);
    if (s.length < 10) return 'A senha precisa ter pelo menos 10 caracteres. Dica: uma frase curta, como "meu cafe da manha 2026", é fácil de lembrar e forte.';
    if (s.length > 72) return 'A senha pode ter no máximo 72 caracteres.';
    if (new Set(s.toLowerCase().split('')).size < 5) return 'Use uma senha com mais variedade de caracteres.';
    const baixa = s.toLowerCase();
    const comuns = ['1234567890', '0123456789', '9876543210', '12345678910', 'qwertyuiop', 'asdfghjkl', 'abcdefghij', 'senha12345', 'senha123456', 'password123', 'mentora123', 'mentora2026', '1234512345'];
    if (comuns.some(f => baixa.indexOf(f) !== -1 && baixa.length <= f.length + 4)) return 'Essa senha é muito comum e fácil de adivinhar. Escolha outra.';
    return null;
};

function initCadastroMentor() {
    // Procura o formulário de cadastro na página
    const form = document.getElementById('form-cadastro-mentor');
    if (form) {
        // Se os campos CPF e Especialidade não existirem, injetamos
        if (!document.getElementById('cadastro-cpf')) {
            const submitBtn = form.querySelector('button[type="submit"]');

            // Container para CPF
            const divCpf = document.createElement('div');
            divCpf.style.marginBottom = '15px';
            divCpf.innerHTML = `
                <label style="display:block; margin-bottom:5px; color:#ccc; font-size:14px;">CPF (será seu login na plataforma)</label>
                <input type="text" id="cadastro-cpf" required placeholder="Apenas números (11 dígitos)" style="width:100%; padding:10px; border-radius:8px; border:1px solid #444; background:#2a2a3c; color:#fff; box-sizing:border-box;">
            `;

            // Container para Especialidade
            const divEspec = document.createElement('div');
            divEspec.style.marginBottom = '20px';
            divEspec.innerHTML = `
                <label style="display:block; margin-bottom:5px; color:#ccc; font-size:14px;">Especialidade (Ex: Liderança, Vendas, etc)</label>
                <input type="text" id="cadastro-espec" required style="width:100%; padding:10px; border-radius:8px; border:1px solid #444; background:#2a2a3c; color:#fff; box-sizing:border-box;">
            `;

            // Inserir antes do botão de submit
            if (submitBtn) {
                form.insertBefore(divCpf, submitBtn);
                form.insertBefore(divEspec, submitBtn);
            }
        }

        // Campo para digitar o e-mail de novo (evita erro de digitação: é para ele que vai a recuperação de senha)
        if (!document.getElementById('cadastro-email-confirma')) {
            const campoEmail = form.querySelector('input[type="email"]');
            if (campoEmail) {
                const conf = document.createElement('input');
                conf.type = 'email'; conf.id = 'cadastro-email-confirma'; conf.required = true;
                conf.placeholder = 'Confirme o e-mail de contato'; conf.className = campoEmail.className;
                conf.autocomplete = 'off';
                conf.addEventListener('paste', e => e.preventDefault()); // digitar de novo, sem colar
                campoEmail.insertAdjacentElement('afterend', conf);
            }
        }

        // Remove listeners antigos para evitar duplicidade e adiciona o nosso blindado
        const newForm = form.cloneNode(true);
        form.parentNode.replaceChild(newForm, form);
        newForm.addEventListener('submit', submitCadastroMentor);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCadastroMentor);
} else {
    initCadastroMentor();
}

function openCadastro(plano, msg) {
    var modal = document.getElementById('modal-cadastro-mentor');
    var spanPlano = document.getElementById('cadastro-plano-selecionado');
    var inputPlano = document.getElementById('cadastro-plano');

    if (modal) {
        modal.style.display = 'flex';
        if (spanPlano) spanPlano.textContent = plano || 'FREE';
        if (inputPlano) inputPlano.value = plano || 'FREE';

        var modalContent = modal.querySelector('div');
        if (modalContent) {
            modalContent.style.transform = 'scale(0.9)';
            modalContent.style.opacity = '0';
            setTimeout(function () {
                modalContent.style.transition = 'all 0.3s ease-out';
                modalContent.style.transform = 'scale(1)';
                modalContent.style.opacity = '1';
            }, 10);
        }
    } else {
        console.warn("Modal de cadastro não encontrado na página.");
    }
}

function fecharCadastro() {
    var modal = document.getElementById('modal-cadastro-mentor');
    if (modal) {
        var modalContent = modal.querySelector('div');
        if (modalContent) {
            modalContent.style.transform = 'scale(0.9)';
            modalContent.style.opacity = '0';
            setTimeout(function () {
                modal.style.display = 'none';
            }, 300);
        } else {
            modal.style.display = 'none';
        }
    }
}

async function submitCadastroMentor(event) {
    event.preventDefault();

    const form = event.target;
    const val = id => { const el = form.querySelector('#' + id) || document.getElementById(id); return el ? String(el.value || '') : ''; };

    // campos lidos pelo id (o formulário tem outros campos de texto: habilitação, etc.)
    const nome = val('cadastro-nome').trim();
    const email = val('cadastro-email').trim();
    const emailConfirma = val('cadastro-email-confirma').trim();
    const telefone = val('cadastro-tel').trim();
    const plano = val('cadastro-plano') || 'FREE';
    const docCpf = val('cadastro-cpf').replace(/\D/g, ''); // só números
    const especialidade = val('cadastro-espec').trim();
    const senha = val('cadastro-senha');

    if (nome.length < 3) { alert('Escreva seu nome completo.'); return; }

    if (!window.supabaseClient) {
        alert("Erro: Conexão com o banco de dados (Supabase) não inicializada.");
        return;
    }

    if (!validarCPF(docCpf)) {
        alert("Este CPF não é válido. Confira os números antes de continuar — é ele que você vai usar pra entrar na plataforma.");
        return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        alert("Confira o e-mail de contato: ele parece incompleto. É para ele que enviamos o link de recuperação de senha.");
        return;
    }
    if (email.toLowerCase() !== emailConfirma.toLowerCase()) {
        alert("Os dois e-mails digitados não são iguais. Confira e digite de novo.");
        return;
    }

    const problemaSenha = window.mentoraValidarSenha(senha);
    if (problemaSenha) {
        alert(problemaSenha);
        return;
    }

    // Habilitação profissional (opcional): confere tudo ANTES de criar a conta
    const habs = cadHabColetar();
    if (habs.erro) { alert(habs.erro); return; }

    // Altera o botão para Loading
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Verificando dados...';
    submitBtn.disabled = true;

    try {
        // 1. O CPF ou o e-mail de contato já estão em uso? (consulta segura: responde só sim/não)
        const { data: disp, error: checkError } = await window.supabaseClient.rpc('mentora_cadastro_disponivel', { p_cpf: docCpf, p_email: email });
        if (checkError && /Muitas verifica/i.test(checkError.message || '')) {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
            alert(checkError.message);
            return;
        }
        if (!checkError && disp && (disp.cpf_em_uso || disp.email_em_uso)) {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
            if (disp.cpf_em_uso && disp.email_em_uso) alert('Este CPF e este e-mail já têm conta na Mentóra.\n\nEntre com seu CPF e sua senha. Se não lembrar a senha, use "Esqueci minha senha".');
            else if (disp.cpf_em_uso) alert('Este CPF já tem uma conta na Mentóra.\n\nEntre com seu CPF e sua senha. Se não lembrar a senha, use "Esqueci minha senha".');
            else alert('Este e-mail já está em uso em outra conta da Mentóra. Use outro e-mail de contato ou, se a conta for sua, entre com seu CPF.');
            return;
        }

        // 2. Criar a conta de login de verdade no Supabase Auth — autenticando pelo CPF.
        //    O Supabase só autentica por e-mail/telefone, então usamos um e-mail técnico
        //    derivado do CPF só pra essa finalidade (nunca aparece pra ninguém). O e-mail
        //    real digitado vai como contato, dentro dos metadados.
        //    O cadastro na tabela Usuarios é feito automaticamente por um gatilho no banco
        //    (veja setup_trigger_cadastro_mentor.sql) assim que a conta é criada.
        submitBtn.textContent = 'Criando sua conta...';
        const emailTecnico = cpfParaEmailTecnico(docCpf);
        const captchaTk = window.MentoraCaptcha ? await window.MentoraCaptcha.tokenOuNada() : undefined;
        const { data: authData, error: authError } = await window.supabaseClient.auth.signUp({
            email: emailTecnico,
            password: senha,
            options: {
                ...(captchaTk ? { captchaToken: captchaTk } : {}),
                data: {
                    tipo_cadastro: 'mentor',
                    nome: nome,
                    telefone: telefone,
                    plano: plano,
                    cpf: docCpf,
                    especialidade: especialidade,
                    email_contato: email
                }
            }
        });

        if (authError) throw authError;
        if (!authData || !authData.user) throw new Error('Não foi possível criar a conta de acesso.');

        const planoPago = ['VIP', 'PREMIUM'].includes(String(plano || '').toUpperCase());
        // Com a sessão já aberta: envia a foto de perfil e os pedidos de habilitação
        let pendencias = [];
        if (authData.session) {
            submitBtn.textContent = 'Enviando foto e documentos...';
            pendencias = await cadEnviarExtras(authData.user.id, habs.lista);
        } else if (cadFotoArquivo || habs.lista.length) {
            pendencias.push('a foto e/ou os comprovantes (entre na plataforma e envie em Comunidade > Configuração)');
        }
        const avisoExtras = pendencias.length ? '\n\nAtenção: não foi possível enviar ' + pendencias.join(' e ') + '. Você pode enviar depois em Comunidade > Configuração.' : '';
        const avisoHab = habs.lista.length && !pendencias.some(p => /habilita|comprovante/i.test(p)) ? '\n\nSeu pedido de habilitação foi enviado. A administração confere o documento e o resultado aparece em Comunidade > Configuração.' : '';
        if (authData.session) {
            // conta criada e já conectada: recarrega a página logada
            if (planoPago) {
                // evita que o aviso antigo de pagamento abra junto
                try { localStorage.setItem('mentora_checkout_pos_cadastro_' + authData.user.id, '1'); } catch (e) {}
                try { sessionStorage.setItem('mentora_pagar_apos_cadastro', String(plano).toUpperCase()); } catch (e) {}
                alert('Conta criada! Agora vamos ativar o plano ' + (String(plano).toUpperCase() === 'PREMIUM' ? 'Premium' : 'VIP') + ': conclua o pagamento na próxima tela.\n\nNas próximas vezes, entre com seu CPF e a senha que você criou.' + avisoHab + avisoExtras);
            } else {
                alert('Conta criada! Você já está conectado(a) à Mentóra.\n\nNas próximas vezes, entre com seu CPF e a senha que você criou.' + avisoHab + avisoExtras);
            }
            fecharCadastro();
            location.reload();
            return;
        }
        alert('Conta criada! Use seu CPF e a senha que você criou para entrar na plataforma.' + avisoExtras);
        fecharCadastro();

    } catch (err) {
        console.error("Erro ao cadastrar mentor no Supabase:", err);
        const msg = String((err && err.message) || '');
        if (/already registered|already been registered|already exists|user_already_exists|database error saving new user|duplicate key|unique/i.test(msg)) {
            alert('Este CPF já tem uma conta na Mentóra.\n\nEntre com seu CPF e sua senha. Se não lembrar a senha, use "Esqueci minha senha" na tela de login.');
        } else if (/captcha/i.test(msg)) {
            alert('Não foi possível confirmar a verificação de segurança. Recarregue a página e tente de novo.');
        } else if (/password/i.test(msg) && /(weak|short|least|characters|pwned|leaked|compromised)/i.test(msg)) {
            alert('A senha não foi aceita (muito curta ou conhecida por ter vazado em outros sites). Crie uma senha com pelo menos 10 caracteres, de preferência uma frase só sua.');
        } else if (/rate limit|too many/i.test(msg)) {
            alert('Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.');
        } else {
            alert('Não foi possível concluir o cadastro agora. Confira os dados e tente novamente em instantes.');
        }
    } finally {
        if (submitBtn) {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    }
}


// ════════════════════════════════════════════════════════════════════
// FOTO DE PERFIL E HABILITAÇÃO NO CADASTRO (03/10/2026)
// ════════════════════════════════════════════════════════════════════
var cadFotoArquivo = null;
var CAD_HAB_MAX = 5 * 1024 * 1024;
var CAD_HAB_TIPOS = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function cadEscolherFoto() { var i = document.getElementById('cadastro-foto'); if (i) i.click(); }
async function cadFotoEscolhida(event) {
    var file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (!/^image\//.test(file.type)) { alert('Escolha um arquivo de imagem (JPG, PNG ou WebP).'); return; }
    if (file.size > 15 * 1024 * 1024) { alert('A imagem é muito grande. Escolha uma foto de até 15 MB.'); return; }
    var final = file;
    if (window.MentoraFoto) {
        try { final = await window.MentoraFoto.ajustar(file); } catch (e) { alert(e.message || 'Não foi possível abrir esta imagem.'); return; }
        if (!final) return; // cancelou
    }
    cadFotoArquivo = final;
    var prev = document.getElementById('cadastro-foto-prev');
    if (prev) {
        var url = URL.createObjectURL(final);
        prev.innerHTML = '';
        var img = document.createElement('img'); img.alt = 'Prévia da foto de perfil'; img.src = url;
        prev.appendChild(img);
    }
}
function cadHabMostrar() {
    var psico = !!(document.getElementById('cad-hab-psico') || {}).checked;
    var psican = !!(document.getElementById('cad-hab-psican') || {}).checked;
    var mostra = function (id, on) { var el = document.getElementById(id); if (el) el.style.display = on ? 'flex' : 'none'; };
    mostra('cad-hab-comum', psico || psican);
    mostra('cad-hab-psico-campos', psico);
    mostra('cad-hab-psican-campos', psican);
    mostra('cad-hab-aceite-linha', psico || psican);
    var nomeHab = document.getElementById('cad-hab-nome'), nomeConta = document.getElementById('cadastro-nome');
    if ((psico || psican) && nomeHab && !nomeHab.value && nomeConta) nomeHab.value = nomeConta.value;
}
// Lê e confere os pedidos marcados. Devolve { lista: [...], erro: 'mensagem' | null }
function cadHabColetar() {
    var v = function (id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
    var arq = function (id) { var el = document.getElementById(id); return el && el.files && el.files[0] ? el.files[0] : null; };
    var marcado = function (id) { var el = document.getElementById(id); return !!(el && el.checked); };
    var lista = [];
    var psico = marcado('cad-hab-psico'), psican = marcado('cad-hab-psican');
    if (!psico && !psican) return { lista: lista, erro: null };
    var nome = v('cad-hab-nome');
    if (nome.length < 5) return { lista: lista, erro: 'Habilitação: escreva o nome completo, igual ao documento.' };
    var confereArquivo = function (a, rotulo) {
        if (!a) return 'Habilitação (' + rotulo + '): anexe o comprovante.';
        if (!CAD_HAB_TIPOS[a.type]) return 'Habilitação (' + rotulo + '): o comprovante precisa ser PDF, JPG, PNG ou WebP.';
        if (a.size > CAD_HAB_MAX) return 'Habilitação (' + rotulo + '): o arquivo passa de 5 MB. Envie uma versão menor.';
        return null;
    };
    if (psico) {
        var num = v('cad-hab-crp-num').replace(/\D/g, ''), rgn = parseInt(v('cad-hab-crp-reg').replace(/\D/g, ''), 10);
        if (num.length < 3) return { lista: lista, erro: 'Habilitação (CRP): informe o número do CRP.' };
        if (!(rgn >= 1 && rgn <= 24)) return { lista: lista, erro: 'Habilitação (CRP): informe a região do CRP (de 01 a 24).' };
        var a1 = arq('cad-hab-psico-arq'), e1 = confereArquivo(a1, 'CRP'); if (e1) return { lista: lista, erro: e1 };
        lista.push({ tipo: 'psicologo', arquivo: a1, reg: { nome_completo: nome, crp_numero: num, crp_regiao: ('0' + rgn).slice(-2) } });
    }
    if (psican) {
        var inst = v('cad-hab-inst'), curso = v('cad-hab-curso');
        if (inst.length < 3 || curso.length < 3) return { lista: lista, erro: 'Habilitação (psicanálise): informe a instituição e o nome do curso.' };
        var a2 = arq('cad-hab-psican-arq'), e2 = confereArquivo(a2, 'psicanálise'); if (e2) return { lista: lista, erro: e2 };
        lista.push({ tipo: 'psicanalista', arquivo: a2, reg: { nome_completo: nome, instituicao: inst, curso: curso, instituicao_cnpj: v('cad-hab-cnpj') || null, carga_horaria: v('cad-hab-carga') || null } });
    }
    if (!marcado('cad-hab-aceite')) return { lista: lista, erro: 'Habilitação: marque a declaração para enviar o comprovante.' };
    return { lista: lista, erro: null };
}
// Logo após o signUp (a sessão já está aberta): foto no bucket mentora-imagens e
// comprovantes no bucket privado habilitacoes. Devolve o que não deu certo.
async function cadEnviarExtras(uid, habs) {
    var sb = window.supabaseClient, falhas = [];
    if (cadFotoArquivo) {
        try {
            if (typeof mentoraEnviarImagem !== 'function') throw new Error('envio de imagem indisponível');
            var url = await mentoraEnviarImagem(cadFotoArquivo, 'perfil', 512, 0.85);
            var r = await sb.from('Usuarios').update({ foto_url: url, foto_perfil_base64: null }).eq('id', uid).select('id');
            if (r.error || !r.data || !r.data.length) throw r.error || new Error('foto não gravada');
        } catch (e) { console.warn('Cadastro - foto:', e && e.message); falhas.push('a foto de perfil'); }
    }
    for (var i = 0; i < (habs || []).length; i++) {
        var h = habs[i];
        try {
            var caminho = uid + '/' + Date.now() + '_' + h.tipo + '.' + CAD_HAB_TIPOS[h.arquivo.type];
            var up = await sb.storage.from('habilitacoes').upload(caminho, h.arquivo, { contentType: h.arquivo.type, upsert: false });
            if (up.error) throw up.error;
            var ins = await sb.from('Habilitacoes_Profissionais').insert([Object.assign({ mentor_id: uid, tipo: h.tipo, arquivo_path: caminho }, h.reg)]);
            if (ins.error) throw ins.error;
        } catch (e) { console.warn('Cadastro - habilitação:', e && e.message); falhas.push('o comprovante de ' + (h.tipo === 'psicologo' ? 'CRP' : 'psicanálise')); }
    }
    return falhas;
}
window.cadEscolherFoto = cadEscolherFoto;
window.cadFotoEscolhida = cadFotoEscolhida;
window.cadHabMostrar = cadHabMostrar;
