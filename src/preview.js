export async function handlePreview(interaction, env, ctx) {
  const { options } = interaction.data;
  const attachmentOption = options?.find(opt => opt.name === 'arquivo');
  
  if (!attachmentOption || !interaction.data.resolved?.attachments) {
    return { content: '❌ Erro: Por favor, anexe um arquivo .xml válido.' };
  }

  const attachment = interaction.data.resolved.attachments[attachmentOption.value];
  const xmlUrl = attachment.url;
  const userId = interaction.member?.user?.id || interaction.user?.id;

  // Dispara a chamada para o GitHub em background (não trava a resposta)
  ctx.waitUntil((async () => {
    try {
      const githubUrl = `https://api.github.com/repos/${env.GITHUB_USER}/${env.GITHUB_REPO}/actions/workflows/preview.yml/dispatches`;
      
      const response = await fetch(githubUrl, {
        method: 'POST',
        headers: {
          'Authorization': `token ${env.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Cloudflare-Worker'
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: {
            xml_url: xmlUrl,
            channel_id: interaction.channel_id,
            user_id: userId
          }
        })
      });

      if (!response.ok) {
        console.error('Erro no GitHub Actions:', await response.text());
      }
    } catch (e) {
      console.error('Erro ao disparar preview:', e);
    }
  })());

  // Responde INSTANTANEAMENTE ao Discord
  return {
    content: `🖼️ **PROCESSANDO XML...**\nO seu preview está sendo gerado nos servidores do GitHub. Em instantes a imagem aparecerá aqui!`
  };
