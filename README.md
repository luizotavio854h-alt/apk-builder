# Aurora Android Engine

Cloudflare Worker para Discord, tickets privados, envio de ZIP ao GoFile, edição de projetos pela Aurora AI e compilação Android pelo GitHub Actions.

## Deploy do Worker

```sh
npm ci
npm run dev
npm run deploy
```

O Worker usa o namespace KV `TICKETS`. Configure os secrets e variáveis descritos em [CONFIGURACAO.md](CONFIGURACAO.md).

## Envio e compilacao

Dentro de um ticket, use `/enviar-zip` para abrir o portal privado de upload. O portal recebe ZIPs de até 12 MB e salva o arquivo no GoFile sem depender de um link externo acessível ao Worker. Também é possível usar `/importar` com um link público direto.

Use `/editar` para pedir alterações pela Aurora AI e `/compilar` para gerar o APK. O workflow `.github/workflows/engine.yml` acompanha a build, envia o APK ao GoFile Guest e atualiza a mensagem do ticket.

## Tickets

- `/setup-ticket` publica o painel de compilação Android.
- `/ticket` publica o painel de atendimento comum.
- `/registrar` atualiza os comandos do servidor depois do deploy.
