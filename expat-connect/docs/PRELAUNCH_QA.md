# Checklist de QA pré-lançamento

## Visual (novo — verificar o design implementado nesta rodada)
- [ ] Abrir a home e conferir: paleta Atlantic/Cerrado/Ipê aplicada, sem azul/branco genérico
- [ ] Badge "PROTÓTIPO" visível ao lado do wordmark, inclusive ao rolar a página
- [ ] OriginBadge (pílula bicolor) aparece nos cards e no perfil, com dados reais
- [ ] Contraste de texto legível em fundo claro e nos badges coloridos
- [ ] Fontes carregando corretamente (Fraunces nos títulos, Public Sans no corpo, mono nos números)

## Funcional
- [ ] Busca com filtros; página de profissional com contato/credenciais/idiomas
- [ ] Criar conta → confirmar e-mail → login
- [ ] Favoritar, avaliar (entra em moderação), cadastrar-se como profissional
- [ ] Reivindicar perfil sem dono; reportar informação incorreta
- [ ] /account: redefinir senha, baixar dados, excluir conta
- [ ] Admin: aprovar/rejeitar tudo; criar/editar listagem; ver /admin/stats e /admin/audit
- [ ] Profissional aprovado edita o próprio perfil, envia foto, vê analytics

## Segurança
- [ ] Deslogado NÃO vê listagens pendentes
- [ ] Não-admin não acessa /admin
- [ ] Profissional não consegue alterar status/verified/plan
- [ ] service_role key não está em código de cliente nem no Git
- [ ] `npm test` passa (26 testes)

## Conteúdo e legal
- [ ] Termos/Privacidade revisados por advogado (cobrindo LGPD + CCPA)
- [ ] Credenciais de saúde/jurídico verificadas antes da aprovação
- [ ] Nenhum dado inventado em perfis

## SEO
- [ ] Link de perfil no WhatsApp mostra prévia com nome/descrição (Open Graph)
- [ ] /sitemap.xml e /robots.txt corretos

## Mobile
- [ ] Home, busca e perfil funcionam bem no celular
