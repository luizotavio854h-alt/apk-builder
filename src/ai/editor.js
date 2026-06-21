export async function callAIEditor(instruction, files, apiKey) {
  const prompt = `
Você é um engenheiro Android senior.

Tarefa:
- Edite o projeto Android conforme instrução
- NÃO quebre Gradle
- NÃO remova arquivos essenciais
- Mantenha XML válido
- Mantenha Kotlin/Java compilável

INSTRUÇÃO:
${instruction}

ARQUIVOS:
${JSON.stringify(files, null, 2)}

RETORNE APENAS JSON:
{
  "files": {
    "path/file": "conteúdo atualizado"
  }
}
`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: "You are an Android build system expert." },
        { role: "user", content: prompt }
      ],
      temperature: 0.2
    })
  });

  const data = await res.json();
  const text = data.choices[0].message.content;

  return JSON.parse(text);
}
