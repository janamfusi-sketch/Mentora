# Plano: teste de invasão externo e monitoramento contínuo

Estes dois itens dependem de contratação/configuração fora do código. Este documento deixa tudo pronto para executar.

## A. Teste de invasão (pentest) externo
**Escopo sugerido:** site (`index.html`, `dashboard.html`, telas do mentorado `onboarding.html` e `deverdecasa.html`), API do Supabase (RLS, Storage), Edge Functions (`login-id`, `pagamento-webhook`, `buscador-noticias`, `limpeza-prints`, robôs), fluxo de pagamento (Asaas) e IA.
**Roteiro mínimo:** quebra de RLS entre mentores (IDOR), escalonamento para admin, alteração de plano/desconto, upload malicioso, XSS/injeção em textos de prontuário, abuso de limites e captcha, vazamento de chaves, webhook sem assinatura.
**Como contratar:** pedir proposta a 2–3 empresas/profissionais (ex.: com certificações OSCP/CEH), exigir contrato de confidencialidade (NDA), ambiente de teste ou janela combinada, **relatório com severidade e reteste incluso**. Nunca testar com dados reais de mentorados sem NDA e cláusula LGPD (operador de dados).
**Periodicidade:** anual e a cada mudança grande (pagamento, IA, novo perfil de acesso).

## B. Monitoramento contínuo
| O que vigiar | Onde | Alerta |
|---|---|---|
| Falhas/picos de login, MFA | Supabase → Logs → Auth | muitas falhas por minuto |
| Erros 4xx/5xx e picos na API | Supabase → Logs → API | pico fora do padrão |
| Erros das Edge Functions | Supabase → Logs → Edge Functions | qualquer erro em `pagamento-webhook` |
| Alterações em `Usuarios` (plano, vip_ate, role) | tabela de auditoria (trigger) | mudança de plano fora do webhook |
| Falhas de cobrança/webhook | painel Asaas + log | webhook rejeitado |
| Disponibilidade do site | UptimeRobot/Better Stack (gratuito) | site fora > 2 min |
| Vulnerabilidades do banco | Supabase `get_advisors` (security) | qualquer item novo |

**Passos práticos:** (1) ativar Log Drains/alertas do Supabase (plano Pro) ou exportar logs; (2) criar trigger de auditoria em `Usuarios` gravando quem/quando/antes/depois; (3) cadastrar o e-mail do responsável em todos os alertas; (4) configurar monitor de disponibilidade.

## C. Exigir 2FA também no servidor (recomendado após cadastrar o fator)
O painel já exige o código no navegador. Para valer **no banco** (mesmo que alguém use a API direto), a função `mentora_eh_admin` deve exigir `aal2`, por exemplo adicionando à condição:

```sql
and coalesce((auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
```

Faça isso **somente depois** de todos os administradores cadastrarem o autenticador e terem testado o acesso — senão a administração fica trancada para fora. Aplicar primeiro numa branch do Supabase e testar.
