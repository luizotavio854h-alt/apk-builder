export async function editProject(files, instruction) {
  const OPENAI_KEY = process.env.OPENAI_API_KEY;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
Você é um assistente que edita projetos Android.

Você recebe:
- arquivos do projeto
- instruções do usuário

Você deve responder APENAS em JSON assim:

{
  "files": {
    "caminho/do/arquivo": "conteudo novo"
  }
}

Não explique nada.
Não escreva texto fora do JSON.
`
        },
        {
          role: "user",
          content: `
INSTRUÇÃO:
${instruction}

ARQUIVOS:
${JSON.stringify(files)}
`
        }
      ]
    })
  });

  const data = await response.json();

  const text = data.choices[0].message.content;

  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error("IA retornou JSON inválido");
  }
}
