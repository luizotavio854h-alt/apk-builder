import { InteractionType, InteractionResponseType, verifyKey } from 'discord-interactions';

export default {
  async fetch(request, env, ctx) {
    // 1. Endpoint de Callback (GitHub -> Worker)
    const url = new URL(request.url);
    if (url.pathname === '/build-callback') {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || authHeader !== `Bearer ${env.DISCORD_BOT_TOKEN}`) {
        return new Response('Unauthorized', { status: 401 });
      }
      try {
        const payload = await request.json();
        const { user_id } = payload;
        if (user_id) {
          await env.TICKETS.delete(`build_lock:${user_id}`);
          console.log(`Lock released for ${user_id}`);
        }
        return new Response('OK', { status: 200 });
      } catch (err) {
        return new Response('Error', { status: 500 });
      }
    }

    if (request.method !== 'POST') {
      return new Response('Not Found', { status: 404 });
    }

    // 2. Validação de Assinatura do Discord
    const signature = request.headers.get('x-signature-ed25519');
    const timestamp = request.headers.get('x-signature-timestamp');
    const body = await request.clone().text();
    
    const isValidRequest = await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY);
    if (!isValidRequest) {
      return new Response('Bad request signature.', { status: 401 });
    }
    
    const interaction = JSON.parse(body);

    // 3. Resposta ao PING
    if (interaction.type === InteractionType.PING) {
      return Response.json({ type: InteractionResponseType.PONG });
    }

    // 4. Tratamento de Comandos (Slash Commands)
    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
      const { name, options } = interaction.data;
      const userId = interaction.member?.user?.id || interaction.user?.id;

      // Comando /preview-layout
      if (name === 'preview-layout') {
        const attachmentOption = options && options.find(opt => opt.name === 'arquivo');
        const attachment = interaction.data.resolved.attachments[attachmentOption.value];
        const xmlUrl = attachment.url;

        ctx.waitUntil((async () => {
          await fetch(`https://api.github.com/repos/${env.GITHUB_USER}/${env.GITHUB_REPO}/actions/workflows/preview.yml/dispatches`, {
            method: 'POST',
            headers: {
              'Authorization': `token ${env.GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'Cloudflare-Worker'
            },
            body: JSON.stringify({
              ref: 'main',
              inputs: { xml_url: xmlUrl, channel_id: interaction.channel_id, user_id: userId }
            })
          });
        })());

        return Response.json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: `🖼️ **PROCESSANDO XML...**\nEstou gerando o preview do seu layout. Aguarde alguns instantes!` }
        });
      }

      // Comando /compilar
      if (name === 'compilar') {
        const urlOption = options && options.find(opt => opt.name === 'url');
        const zipUrl = urlOption.value;
        const lockKey = `build_lock:${userId}`;

        const existingLock = await env.TICKETS.get(lockKey);
        if (existingLock) {
          return Response.json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: '⚠️ **ERRO:** Você já tem uma compilação em andamento. Aguarde!' }
          });
        }

        ctx.waitUntil((async () => {
          await env.TICKETS.put(lockKey, 'active', { expirationTtl: 2400 });
          await fetch(`https://api.github.com/repos/${env.GITHUB_USER}/${env.GITHUB_REPO}/actions/workflows/engine.yml/dispatches`, {
            method: 'POST',
            headers: {
              'Authorization': `token ${env.GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'Cloudflare-Worker'
            },
            body: JSON.stringify({
              ref: 'main',
              inputs: { zip_url: zipUrl.trim(), channel_id: interaction.channel_id, user_id: userId, worker_url: new URL(request.url).origin }
            })
          });
        })());

        return Response.json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: `💻 **BUILD INICIADO!**\nEnviarei o link do APK neste canal assim que terminar.` }
        });
      }

      // Comando /destravar
      if (name === 'destravar') {
        const usuarioOption = options && options.find(opt => opt.name === 'usuario');
        const targetUserId = usuarioOption ? usuarioOption.value : userId;
        await env.TICKETS.delete(`build_lock:${targetUserId}`);
        return Response.json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: `🔓 **TRAVA REMOVIDA!** O usuário <@${targetUserId}> já pode compilar novamente.` }
        });
      }
//commit
      // Comando /setup-ticket
      if (name === 'setup-ticket') {
        return Response.json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [{
              title: '🎫 Suporte & Compilação',
              description: 'Clique no botão abaixo para abrir um canal de atendimento privado.',
              color: 5814783,
            }],
            components: [{
              type: 1,
              components: [{ type: 2, style: 1, label: 'Abrir Ticket', custom_id: 'abrir_ticket', emoji: { name: '🎫' } }]
            }]
          }
        });
      }
    }

    // 5. Tratamento de Botões (Tickets)
    if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
      const { custom_id } = interaction.data;
      if (custom_id === 'abrir_ticket') {
        const guildId = interaction.guild_id;
        const userId = interaction.member.user.id;

        ctx.waitUntil((async () => {
          try {
            const createChannelRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
              method: 'POST',
              headers: { 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: `【🔨】ᴄᴏᴍᴘɪʟᴀʀ-${Math.floor(Math.random() * 9000) + 1000}`,
                type: 0,
                parent_id: '1510734520553308160',
                permission_overwrites: [
                  { id: guildId, type: 0, deny: '1024' },
                  { id: userId, type: 1, allow: '3072' }
                ]
              })
            });
            const newChannel = await createChannelRes.json();
            await fetch(`https://discord.com/api/v10/channels/${newChannel.id}/messages`, {
              method: 'POST',
              headers: { 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                content: `👋 Olá <@${userId}>! Este é seu canal de compilação.\n\n- Use \`/compilar\` para gerar seu APK.\n- Use \`/preview-layout\` para ver um XML.`
              })
            });
          } catch (e) { console.error(e); }
        })());

        return Response.json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { flags: 64, content: '✅ **TICKET CRIADO!** Verifique a lista de canais.' }
        });
      }
    }

    return new Response('Not Found', { status: 404 });
  }
};
        // Responde de imediato ao Discord com uma mensagem pensando temporária (Deffered ephemeral)
        return Response.json({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: 64 // Ephemeral (só visível para quem clicou)
          }
        });
      }

      // Clique em "Compilar APK" dentro do Ticket
      if (custom_id === 'compilar_apk') {
        const userId = interaction.member?.user?.id || interaction.user?.id;
        const lockKey = `build_lock:${userId}`;
        const existingLock = await env.TICKETS.get(lockKey);
        if (existingLock) {
          return Response.json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags: 64, // Ephemeral
              content: '⚠️ **Compilação em andamento!** Você já possui uma compilação ativa. Por favor, aguarde a conclusão antes de iniciar uma nova.'
            }
          });
        }

        // Retorna o Modal pedindo a URL da source e a senha
        return Response.json({
          type: 9, // MODAL
          data: {
            title: 'Compilar Source Code',
            custom_id: 'modal_compilar',
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 4, // TEXT_INPUT
                    custom_id: 'zip_url_input',
                    label: 'Link direto ou do MediaFire (.zip)',
                    style: 1, // Short text/Single line
                    placeholder: 'https://www.mediafire.com/file/...',
                    required: true
                  }
                ]
              },
              {
                type: 1,
                components: [
                  {
                    type: 4, // TEXT_INPUT
                    custom_id: 'zip_password_input',
                    label: 'Senha do .zip (Deixe em branco se não tiver)',
                    style: 1, // Short text/Single line
                    placeholder: 'Senha secreta para extrair (opcional)',
                    required: false
                  }
                ]
              }
            ]
          }
        });
      }

      // Clique em "Fechar Ticket"
      if (custom_id === 'fechar_ticket') {
        const channelId = interaction.channel_id;
        
        // Deleta o canal após um pequeno atraso
        ctx.waitUntil(
          new Promise(resolve => setTimeout(resolve, 3000)).then(() =>
            fetch(`https://discord.com/api/v10/channels/${channelId}`, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`
              }
            })
          )
        );

        return Response.json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '🔒 Este ticket será fechado e deletado em alguns segundos...'
          }
        });
      }
    }

    // 3. Tratamento de Envios de Modal (Modal Submit)
    if (interaction.type === 5) {
      const { custom_id, components } = interaction.data;

      if (custom_id === 'modal_compilar') {
        // Encontra o valor digitado no input do modal
        const urlActionRow = components.find(row => row.components[0].custom_id === 'zip_url_input');
        const passActionRow = components.find(row => row.components[0].custom_id === 'zip_password_input');
        
        const zipUrl = urlActionRow.components[0].value;
        const zipPassword = passActionRow ? passActionRow.components[0].value : '';

        if (!zipUrl || (!zipUrl.startsWith('http://') && !zipUrl.startsWith('https://'))) {
          return Response.json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ URL inválida. O link fornecido deve iniciar com http:// ou https://.'
            }
          });
        }

        const userId = interaction.member?.user?.id || interaction.user?.id;
        const lockKey = `build_lock:${userId}`;
        const existingLock = await env.TICKETS.get(lockKey);
        if (existingLock) {
          return Response.json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '⚠️ **Compilação em andamento!** Você já possui uma compilação ativa. Por favor, aguarde a conclusão antes de iniciar uma nova.'
            }
          });
        }

        await env.TICKETS.put(lockKey, 'active', { expirationTtl: 2400 });

        const workerUrl = new URL(request.url).origin;
        const githubUrl = `https://api.github.com/repos/${env.GITHUB_USER}/${env.GITHUB_REPO}/actions/workflows/engine.yml/dispatches`;

        // Dispara o GitHub Actions em background
        ctx.waitUntil(
          fetch(githubUrl, {
            method: 'POST',
            headers: {
              'Authorization': `token ${env.GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'Cloudflare-Worker'
            },
            body: JSON.stringify({
              ref: 'main',
              inputs: {
                zip_url: zipUrl.trim(),
                zip_password: zipPassword.trim(),
                channel_id: interaction.channel_id,
                user_id: userId,
                worker_url: workerUrl
              }
            })
          }).then(async (res) => {
            if (!res.ok) {
              const errText = await res.text();
              console.error(`Erro ao disparar Action: ${errText}`);
              await env.TICKETS.delete(lockKey);
            }
          }).catch(async (err) => {
            console.error('Erro de rede ao disparar GitHub Actions', err);
            await env.TICKETS.delete(lockKey);
          })
        );

        return Response.json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `💻 **COMPILAÇÃO INICIADA!**\n\n📡 Conectando aos servidores do GitHub...\n🔗 **Source Code:** <${zipUrl}>\n\n_Quando a compilação terminar (em média 5 a 15 minutos), enviarei o link do APK final aqui mesmo neste canal!_`
          }
        });
      }
    }

    return new Response('Unknown Type', { status: 400 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(cleanupTickets(env));
  }
};

async function cleanupTickets(env) {
  if (!env.DISCORD_BOT_TOKEN) {
    console.error('cleanupTickets: DISCORD_BOT_TOKEN is missing');
    return;
  }
  try {
    const guildsRes = await fetch('https://discord.com/api/v10/users/@me/guilds', {
      headers: { 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` }
    });
    if (!guildsRes.ok) {
      console.error('cleanupTickets: Failed to fetch guilds', guildsRes.statusText);
      return;
    }
    const guilds = await guildsRes.json();

    for (const guild of guilds) {
      const channelsRes = await fetch(`https://discord.com/api/v10/guilds/${guild.id}/channels`, {
        headers: { 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` }
      });
      if (!channelsRes.ok) {
        console.error(`cleanupTickets: Failed to fetch channels for guild ${guild.id}`);
        continue;
      }
      const channels = await channelsRes.json();
      const ticketChannels = channels.filter(c => c.parent_id === '1510734520553308160');

      for (const channel of ticketChannels) {
        const messagesRes = await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages?limit=1`, {
          headers: { 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` }
        });
        if (!messagesRes.ok) {
          console.error(`cleanupTickets: Failed to fetch messages for channel ${channel.id}`);
          continue;
        }
        const messages = await messagesRes.json();

        let lastMessageTime = 0;
        if (messages.length > 0) {
          lastMessageTime = new Date(messages[0].timestamp).getTime();
        } else {
          // Fallback: Decripta o ID do canal (Snowflake do Discord) para saber a data de criação
          const idInt = BigInt(channel.id);
          lastMessageTime = Number((idInt >> 22n) + 1420070400000n);
        }

        const hoursInactive = (Date.now() - lastMessageTime) / (1000 * 60 * 60);

        if (hoursInactive >= 24) {
          console.log(`cleanupTickets: Deletando ticket inativo: ${channel.name} (${channel.id}), inativo por ${hoursInactive.toFixed(1)} horas.`);
          const deleteRes = await fetch(`https://discord.com/api/v10/channels/${channel.id}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
              'X-Audit-Log-Reason': 'Limpeza automática de tickets inativos'
            }
          });
          if (!deleteRes.ok) {
            console.error(`cleanupTickets: Failed to delete channel ${channel.id}`);
          }
        }
      }
    }
  } catch (err) {
    console.error('cleanupTickets: Unhandled error in cleanup', err);
  }
}
