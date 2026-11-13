# Configuração Aurora

## Armazenamento

Todos os arquivos binários do projeto agora são enviados ao GoFile Guest: APKs compilados, ZIPs importados e versões geradas pela Aurora AI. O Worker mantém no KV somente dados de controle e ponteiros de download; não há binding R2 no `wrangler.toml`.

Uploads do Worker criam uma conta Guest automaticamente. O token retornado pela API é guardado no KV junto dos metadados do arquivo e usado pelo Worker para reabrir o ZIP para a IA. Não configure token GoFile e não compartilhe esse token. Os links `downloadPage` são links públicos não listados; qualquer pessoa que receba o link pode acessar o arquivo.

O importador ainda limita ZIPs a 12 MB para edição dentro do Worker. Arquivos maiores não são carregados na memória do Worker. O workflow do GitHub Actions envia APKs como stream multipart diretamente do disco.

## Cloudflare Worker

Mantenha o namespace KV `TICKETS`. O Worker não tem mais binding R2. Remova o binding `STORAGE` da configuração do Worker e o secret `DOWNLOAD_SECRET`, que pertenciam às rotas antigas de download; não é necessário apagar o bucket existente. Configure como vars/secrets:

- Já existentes: `DISCORD_BOT_TOKEN`, `CALLBACK_SECRET`, `GITHUB_TOKEN`, `GITHUB_USER`, `GITHUB_REPO`, `GITHUB_REF`, `DISCORD_APPLICATION_ID`, `DISCORD_GUILD_ID`, `HF_TOKEN`, `REGISTER_SECRET`.
- Atendimento comum: `SUPPORT_CATEGORY_ID` e `SUPPORT_PANEL_CHANNEL_ID` (IDs reais de categoria/canal); `STAFF_ROLE_ID` (cargo real da equipe); `SUPPORT_LOG_CHANNEL_ID` é opcional e recebe o registro/transcrição compacta do encerramento.
- `TICKET_CATEGORY_ID` segue reservado aos tickets de compilação APK.

O `CALLBACK_SECRET` continua protegido e disponível nos GitHub Actions Secrets. Nenhum token GoFile é necessário no GitHub.

Depois de configurar, execute `/registrar` para atualizar os comandos de guild. Use `/setup-ticket` para publicar o painel antigo de compilação e `/ticket` para publicar o painel de atendimento comum.

## Tickets independentes

- O ticket de compilação Android usa `TICKET_CATEGORY_ID`, o seu fluxo atual e chaves de KV próprias. `/build-ticket` abre um ticket APK; `/setup-ticket` publica o painel antigo.
- `/ticket` publica somente 🛒 Comprar Aplicativos e 🛠️ Suporte Técnico. Os canais usam `SUPPORT_CATEGORY_ID` e chaves `support-ticket:*` separadas.

## Dados existentes no R2

Os arquivos antigos que já estavam no R2 não são migrados automaticamente. Antes de retirar o bucket, reimporte os projetos antigos necessários pelo comando `/importar`; depois do deploy sem o binding, links antigos de APK e projetos assinados do R2 deixam de funcionar.
