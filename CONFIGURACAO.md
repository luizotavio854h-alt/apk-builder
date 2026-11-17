# Configuração Aurora

## Armazenamento de arquivos

APKs, ZIPs importados e projetos editados pela Aurora AI são armazenados no GoFile Guest. O KV `TICKETS` guarda apenas metadados e credenciais Guest para reabrir os arquivos. O portal `/upload` envia ZIPs diretamente do navegador ao GoFile, aceita até 20 GB e associa cada envio ao ticket que criou o link.

Para editar com IA, `/editar` baixa e indexa o ZIP no GitHub Actions, lista todos os arquivos em uma grade paginada no ticket e abre um modal para descrever a alteração. O limite desse processamento é 600 MB compactados, 3 GB descompactados e 10.000 arquivos. A IA recebe o arquivo de texto escolhido (até 64 KB) e os principais arquivos de configuração do projeto; binários, arquivos protegidos e arquivos maiores aparecem na lista, mas não podem ser alterados por esse editor. O conteúdo enviado à IA é processado pela API da Groq. `/importar` com URL direta continua limitado a 12 MB no Worker; para ZIPs maiores, use `/enviar-zip` e depois `/editar`.

## Cloudflare Worker

Mantenha o namespace KV `TICKETS`. Configure os seguintes secrets e variáveis:

- Secrets: `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `CALLBACK_SECRET`, `GITHUB_TOKEN` e `REGISTER_SECRET`.
- Variáveis gerais: `DISCORD_APPLICATION_ID`, `GITHUB_USER`, `GITHUB_REPO`, `GITHUB_REF`.
- IDs antigos do servidor principal (opcionais): `TICKET_CATEGORY_ID`, `SUPPORT_CATEGORY_ID`, `SUPPORT_PANEL_CHANNEL_ID`, `SUPPORT_LOG_CHANNEL_ID`, `STAFF_ROLE_ID`.

Configure o mesmo valor de `CALLBACK_SECRET` nos secrets do GitHub Actions e no Worker. Nenhum token GoFile precisa ser configurado.

### Configurar servidores e canais pelo Discord

Convide o bot para cada servidor usando os escopos `bot` e `applications.commands`. Depois faça `/registrar` uma vez: os comandos ficam globais e aparecem nos servidores em que a aplicação está instalada.

Em cada servidor, um administrador executa `/configurar-servidor` e escolhe as categorias/canais nos próprios menus do Discord:

- `categoria-build`: onde `/build-ticket` cria os tickets de APK.
- `canal-painel-apk`: onde `/setup-ticket` publica o painel de compilação. Opcional; se vazio, `/setup-ticket` publica no canal atual.
- `categoria-suporte`: onde `/ticket` cria atendimentos privados.
- `canal-painel-suporte`: onde `/ticket` publica o painel de atendimento.
- `canal-logs`: canal privado opcional que recebe registros de atendimentos fechados.
- `cargo-equipe`: cargo opcional com acesso aos tickets.

O comando salva a configuração separada por servidor no KV `TICKETS`; use-o novamente em cada servidor para escolher destinos diferentes. Sem opções, ele mostra o estado atual; passe apenas as opções que deseja alterar para manter as demais. Conceda ao bot permissões de ver canais, enviar mensagens, incorporar links, anexar arquivos, ler histórico e gerenciar canais.

As variáveis antigas de categoria/canal do Worker continuam servindo como padrão inicial. Depois que `/configurar-servidor` é usado, os destinos salvos no KV daquele servidor têm prioridade.

### Arquivo de diagnóstico da compilação

Se a build falhar, o workflow gera `build_failure.txt` com os trechos finais do log e o link da execução. O Worker envia esse `.txt` como anexo no canal do ticket junto com a mensagem de falha. O envio remove padrões comuns de tokens e chaves antes de anexar o relatório.

## GitHub Actions

O branch indicado por `GITHUB_REF` precisa conter `.github/workflows/engine.yml` para compilar APKs e `.github/workflows/aurora-ai.yml` para indexar/editar projetos. Configure `CALLBACK_SECRET` e `GROQ_API_KEY` em **Settings → Secrets and variables → Actions**. O primeiro precisa ter o mesmo valor salvo no Worker; o segundo é uma chave da API Groq gratuita. O workflow de IA usa o modelo `qwen/qwen3.8-27b`; a cota gratuita é compartilhada e pode exigir aguardar antes de tentar outra edição. Não é necessário configurar Hugging Face nem R2.

## Inicializacao

Depois do deploy, execute `/registrar` no Discord. Use `/setup-ticket` para publicar o painel de compilação e `/ticket` para publicar o painel de atendimento comum. Dentro do ticket de compilação, `/enviar-zip` cria um link temporário para o portal; o botão de upload também aparece ao abrir tickets novos.
