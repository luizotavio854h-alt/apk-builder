# Configuração Aurora

## Armazenamento de arquivos

APKs, ZIPs importados e projetos editados pela Aurora AI são armazenados no GoFile Guest. O KV `TICKETS` guarda apenas metadados e credenciais Guest para reabrir os arquivos. O portal `/upload` envia ZIPs diretamente do navegador ao GoFile, aceita até 20 GB e associa cada envio ao ticket que criou o link.

Para editar com IA, `/editar` baixa e indexa o ZIP no GitHub Actions, lista todos os arquivos em uma grade paginada no ticket e abre um modal para descrever a alteração. O limite desse processamento é 600 MB compactados, 3 GB descompactados e 10.000 arquivos. A IA recebe o arquivo de texto escolhido (até 64 KB) e os principais arquivos de configuração do projeto; binários, arquivos protegidos e arquivos maiores aparecem na lista, mas não podem ser alterados por esse editor. O conteúdo enviado à IA é processado pela API da Groq. `/importar` com URL direta continua limitado a 12 MB no Worker; para ZIPs maiores, use `/enviar-zip` e depois `/editar`.

## Cloudflare Worker

Mantenha o namespace KV `TICKETS`. Configure os seguintes secrets e variáveis:

- Secrets: `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `CALLBACK_SECRET`, `GITHUB_TOKEN` e `REGISTER_SECRET`.
- Variáveis gerais: `DISCORD_APPLICATION_ID`, `GITHUB_USER`, `GITHUB_REPO`, `GITHUB_REF`.
- Servidores e destinos Discord: `DISCORD_SERVERS_JSON`, definido em `wrangler.toml` na seção `[vars]`.

Configure o mesmo valor de `CALLBACK_SECRET` nos secrets do GitHub Actions e no Worker. Nenhum token GoFile precisa ser configurado.

### Adicionar um ou mais servidores Discord

Edite `DISCORD_SERVERS_JSON` em `wrangler.toml`. Use um objeto para cada servidor. Exemplo de um servidor:

```toml
DISCORD_SERVERS_JSON = '[{"guild_id":"ID_DO_SERVIDOR","ticket_category_id":"ID_CATEGORIA_COMPILACAO","build_panel_channel_id":"ID_CANAL_PAINEL_APK","support_category_id":"ID_CATEGORIA_SUPORTE","support_panel_channel_id":"ID_CANAL_PAINEL_SUPORTE","support_log_channel_id":"ID_CANAL_LOG","staff_role_id":"ID_CARGO_EQUIPE"}]'
```

Para adicionar outro servidor, coloque outro objeto na mesma lista JSON, separado por vírgula. Cada servidor tem seus próprios IDs; não reutilize as categorias, canais ou cargos do primeiro servidor.

- `guild_id`: ID do servidor.
- `ticket_category_id`: categoria onde `/build-ticket` cria tickets para APK.
- `build_panel_channel_id`: canal onde `/setup-ticket` publica o painel de compilação. Se omitido, o painel aparece no canal onde o comando foi usado.
- `support_category_id`: categoria onde os atendimentos de `/ticket` são criados.
- `support_panel_channel_id`: canal onde `/ticket` publica o painel de suporte.
- `support_log_channel_id`: canal privado opcional para os registros de atendimentos fechados.
- `staff_role_id`: cargo opcional que também pode ver os tickets.

Ative o **Modo Desenvolvedor** no Discord e use **Copiar ID** ao clicar com o botão direito no servidor, categoria, canal ou cargo. Depois salve `wrangler.toml` e faça o deploy do Worker. Execute `/registrar` uma vez em qualquer servidor configurado: os comandos serão registrados em todos os servidores listados.

O bot ainda precisa ser convidado para cada servidor usando a mesma aplicação, com os escopos `bot` e `applications.commands`. Para criar tickets, conceda ao bot permissões de ver canais, enviar mensagens, incorporar links, anexar arquivos, ler histórico e gerenciar canais.

`DISCORD_GUILD_ID`, `TICKET_CATEGORY_ID`, `SUPPORT_CATEGORY_ID`, `SUPPORT_PANEL_CHANNEL_ID`, `SUPPORT_LOG_CHANNEL_ID` e `STAFF_ROLE_ID` continuam aceitos como configuração antiga de um único servidor quando `DISCORD_SERVERS_JSON` está vazio.

### Arquivo de diagnóstico da compilação

Se a build falhar, o workflow gera `build_failure.txt` com os trechos finais do log e o link da execução. O Worker envia esse `.txt` como anexo no canal do ticket junto com a mensagem de falha. O envio remove padrões comuns de tokens e chaves antes de anexar o relatório.

## GitHub Actions

O branch indicado por `GITHUB_REF` precisa conter `.github/workflows/engine.yml` para compilar APKs e `.github/workflows/aurora-ai.yml` para indexar/editar projetos. Configure `CALLBACK_SECRET` e `GROQ_API_KEY` em **Settings → Secrets and variables → Actions**. O primeiro precisa ter o mesmo valor salvo no Worker; o segundo é uma chave da API Groq gratuita. O workflow de IA usa o modelo `qwen/qwen3.8-27b`; a cota gratuita é compartilhada e pode exigir aguardar antes de tentar outra edição. Não é necessário configurar Hugging Face nem R2.

## Inicializacao

Depois do deploy, execute `/registrar` no Discord. Use `/setup-ticket` para publicar o painel de compilação e `/ticket` para publicar o painel de atendimento comum. Dentro do ticket de compilação, `/enviar-zip` cria um link temporário para o portal; o botão de upload também aparece ao abrir tickets novos.
