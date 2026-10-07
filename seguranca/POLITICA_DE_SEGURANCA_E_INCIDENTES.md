# Mentóra — Política de segurança e resposta a incidentes (rascunho v1)

> Rascunho técnico para revisão. Pelo tratamento de dados sensíveis (LGPD, art. 5º, II e art. 11), recomenda-se revisão por advogado(a) e pelo(a) encarregado(a) de dados (DPO) antes de publicar.

## 1. Responsáveis
- **Responsável pela segurança:** _(nome / e-mail / telefone)_
- **Encarregado(a) de dados (DPO):** _(nome / e-mail)_ — canal com titulares e com a ANPD.
- **Suplente:** _(nome / telefone)_

## 2. Dados sensíveis tratados
Telemetrias psicoemocionais, traumas, anotações de sessão, CPF, telefone e e-mail de mentores e mentorados. Acesso restrito por RLS no Supabase; arquivos de dever de casa em armazenamento privado com link temporário.

## 3. Controles em vigor
RLS por tabela; bloqueio de campos de plano/cobrança; limite de tentativas (hash, sem e-mail/IP); captcha; arquivos privados com URL de 10 min; robôs com chave secreta; dados mínimos/mascarados; integridade das instruções da IA; HTTPS e criptografia em repouso/backups (Supabase).
**Novo:** segundo fator (TOTP) obrigatório para entrar no painel administrativo (`dashboard.html`).

## 4. Resposta a incidentes
**O que é incidente:** acesso indevido, vazamento, perda/alteração de dados, conta comprometida, credencial exposta, indisponibilidade causada por ataque.

| Fase | Ação | Prazo alvo |
|---|---|---|
| 1. Detectar e registrar | Quem perceber avisa o responsável de segurança; registrar data/hora, o que viu, sistemas envolvidos | imediato |
| 2. Conter | Revogar sessões e chaves suspeitas (Supabase → Auth/API keys), trocar senhas, desativar a função/robô afetado, bloquear a conta | até 1 h |
| 3. Avaliar | Quais dados, quantos titulares, risco/dano relevante? Consultar logs (Auth, API, Edge Functions, Postgres) | até 24 h |
| 4. Comunicar | Se houver risco ou dano relevante: comunicar a **ANPD** e os **titulares afetados** (LGPD art. 48; a ANPD indica prazo de 3 dias úteis na Res. CD/ANPD nº 15/2024 — confirmar com jurídico) | até 3 dias úteis |
| 5. Erradicar e recuperar | Corrigir a causa, restaurar de backup se preciso, rotacionar todas as chaves envolvidas | conforme gravidade |
| 6. Aprender | Relatório pós-incidente (causa, linha do tempo, ação preventiva) em até 7 dias | 7 dias |

**Conteúdo mínimo da comunicação (art. 48 §1º):** natureza dos dados, titulares envolvidos, medidas de proteção adotadas, riscos, motivos de eventual demora e medidas para reverter/mitigar.

## 5. Rotinas
- **Mensal:** revisar usuários admin, chaves e secrets; rodar `get_advisors` (segurança) do Supabase; conferir backups.
- **Trimestral:** testar restauração de backup; revisar esta política.
- **Anual:** teste de invasão externo (ver `PLANO_TESTE_DE_INVASAO_E_MONITORAMENTO.md`).
- **Saída de pessoa com acesso:** revogar acessos no mesmo dia.

## 6. 2FA da administração
- Todo administrador cadastra um aplicativo autenticador no primeiro acesso ao painel.
- Guardar os códigos de recuperação/secret em cofre de senhas. Perdeu o aparelho: outro administrador remove o fator (Supabase → Auth → Users → MFA) — por isso manter **pelo menos 2 administradores**.
