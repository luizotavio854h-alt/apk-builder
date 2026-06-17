export async function handlePreview(interaction, env, ctx) {
  const { options } = interaction.data;
  const attachmentOption = options.find(opt => opt.name === 'arquivo');
  const attachment = interaction.data.resolved.attachments[attachmentOption.value];
  const xmlUrl = attachment.url;
  const userId = interaction.member?.user?.id || interaction.user?.id;

  const githubUrl = `https://api.github.com/repos/${env.GITHUB_USER}/${env.GITHUB_REPO}/actions/workflows/preview.yml/dispatches`;

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
          xml_url: xmlUrl,
          channel_id: interaction.channel_id,
          user_id: userId
        }
      })
    })
  );

  return {
    content: `🖼️ **GERANDO PREVIEW...**\nEstou processando o seu arquivo XML. Em breve enviarei a imagem renderizada aqui!`
  };
}
