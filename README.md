# Aurora Android Engine

Cloudflare Worker para interações do Discord, importação e edição de sources, tickets de compilação e despacho de builds Android pelo GitHub Actions.

## Deploy do Worker

```sh
npm ci
npm run dev
npm run deploy
```

O namespace KV e as variáveis do Worker estão em `wrangler.toml`. Configure secrets no painel Cloudflare. Consulte [CONFIGURACAO.md](CONFIGURACAO.md) para GoFile Guest, tickets comuns, serviço de voz e as variáveis necessárias.

## Publicação e progresso do APK

O workflow `.github/workflows/engine.yml` mantém o processo de detecção de projeto/toolchain, Gradle, coleta dos APKs e artefatos diagnósticos. Ele envia o APK ao GoFile Guest por multipart stream e informa o `downloadPage` verificado pelo callback final autenticado. O Worker edita a mensagem original de acompanhamento. ZIPs importados e versões editadas pela IA também são armazenados no GoFile; o KV guarda somente metadados e os ponteiros necessários para reabrir cada arquivo.

## Comandos

- `/ticket` publica o painel com as duas opções de atendimento comum.
- `/build-ticket` abre um ticket de compilação APK; `/setup-ticket` publica o painel antigo desse fluxo.
- `/registrar` atualiza os comandos de guild depois de configurar os secrets e os canais.
