export async function callAIEditorFromZip(instruction, zipBuffer, apiKey) {
  const prompt = `
Você é um engenheiro Android senior.

Você recebe um ZIP de projeto Android.

INSTRUÇÃO:
${instruction}

Regras:
- manter projeto compilável
- não quebrar Gradle
- não quebrar XML
- não remover arquivos essenciais

Retorne o projeto editado.
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
        { role: "system", content: "You are an Android build AI." },
        { role: "user", content: prompt }
      ],
      temperature: 0.2
    })
  });

  const data = await res.json();
  return data.choices[0].message.content;
}
