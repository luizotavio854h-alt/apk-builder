# Configuração Aurora

## Armazenamento de arquivos

APKs, ZIPs importados e projetos editados pela Aurora AI são armazenados no GoFile Guest. O KV `TICKETS` guarda apenas metadados e credenciais Guest para reabrir os arquivos. O portal `/upload` envia ZIPs diretamente do navegador ao GoFile, aceita até 20 GB e associa cada envio ao ticket que criou o link. `/importar` por URL e a leitura para edição com IA seguem limitados a 12 MB porque o Worker baixa e processa esses ZIPs.

## Cloudflare Worker

Mantenha o namespace KV `TICKETS`. Configure os seguintes secrets e variáveis:

- Já existentes: `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `CALLBACK_SECRET`, `GITHUB_TOKEN`, `GITHUB_USER`, `GITHUB_REPO`, `GITHUB_REF`, `DISCORD_APPLICATION_ID`, `DISCORD_GUILD_ID`, `HF_TOKEN`, `REGISTER_SECRET`.
- Tickets de compilacao: `TICKET_CATEGORY_ID`.
- Atendimento comum: `SUPPORT_CATEGORY_ID`, `SUPPORT_PANEL_CHANNEL_ID` e, opcionalmente, `STAFF_ROLE_ID` e `SUPPORT_LOG_CHANNEL_ID`.

Configure o mesmo valor de `CALLBACK_SECRET` nos secrets do GitHub Actions e no Worker. Nenhum token GoFile precisa ser configurado.

## GitHub Actions

O branch indicado por `GITHUB_REF` precisa conter `.github/workflows/engine.yml` com o input `build_id` e os scripts atuais. O workflow envia o APK ao GoFile e atualiza o Worker com o progresso e o resultado.

## Inicializacao

Depois do deploy, execute `/registrar` no Discord. Use `/setup-ticket` para publicar o painel de compilação e `/ticket` para publicar o painel de atendimento comum. Dentro do ticket de compilação, `/enviar-zip` cria um link temporário para o portal; o botão de upload também aparece ao abrir tickets novos.
