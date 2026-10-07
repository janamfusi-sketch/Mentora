/* =====================================================================
   Mentóra — verificação anti-robô (Cloudflare Turnstile): PRONTA E DESLIGADA.
   Enquanto SITEKEY estiver vazia, NADA muda no site (nenhum script externo é carregado).

   Para ligar (nesta ORDEM, para ninguém ficar sem conseguir entrar):
     1) Cloudflare → Turnstile → criar um widget (modo "Managed" ou "Invisible") para o seu domínio.
        Guarde a "Site key" (pública) e a "Secret key" (privada).
     2) Cole a Site key em SITEKEY abaixo e publique o site (arquivos captcha_mentora.js e os que já mudaram).
     3) Teste o login e o cadastro no site publicado (devem continuar funcionando normalmente).
     4) SÓ ENTÃO: Supabase → Authentication → Attack Protection → ligar "Enable CAPTCHA protection",
        escolher Cloudflare Turnstile e colar a Secret key.
   Se algo der errado, desligue o passo 4 no Supabase (e/ou esvazie SITEKEY): tudo volta ao normal.
   ===================================================================== */
(function () {
  'use strict';
  var SITEKEY = ''; // ← cole aqui a Site key do Turnstile (começa com 0x...)

  var scriptPromise = null, widgetId = null, container = null;

  function carregarScript() {
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise(function (resolve, reject) {
      if (window.turnstile) return resolve();
      var s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { scriptPromise = null; reject(new Error('turnstile-script')); };
      document.head.appendChild(s);
    });
    return scriptPromise;
  }

  // Devolve uma Promise com o token (uso único: cada tentativa de entrar/cadastrar pede um novo).
  // Sem chave configurada devolve undefined na hora. Se der erro, quem chama segue sem token
  // (o Supabase, se estiver exigindo captcha, responde com uma mensagem clara).
  function token() {
    if (!SITEKEY) return Promise.resolve(undefined);
    return carregarScript().then(function () {
      return new Promise(function (resolve, reject) {
        var limite = setTimeout(function () { reject(new Error('turnstile-tempo')); }, 20000);
        if (!container) {
          container = document.createElement('div');
          container.id = 'mentora-turnstile';
          container.style.cssText = 'position:fixed; bottom:12px; right:12px; z-index:2147483000;';
          document.body.appendChild(container);
        }
        if (widgetId !== null) { try { window.turnstile.remove(widgetId); } catch (e) {} widgetId = null; }
        widgetId = window.turnstile.render(container, {
          sitekey: SITEKEY,
          appearance: 'interaction-only', // só aparece algo na tela se o Cloudflare precisar de interação
          callback: function (t) { clearTimeout(limite); resolve(t); },
          'error-callback': function () { clearTimeout(limite); reject(new Error('turnstile-erro')); }
        });
      });
    });
  }

  window.MentoraCaptcha = {
    ativo: function () { return !!SITEKEY; },
    token: token,
    // atalho: nunca lança erro; devolve undefined se não houver token
    tokenOuNada: function () { return token().catch(function () { return undefined; }); }
  };
})();
