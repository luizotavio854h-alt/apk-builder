export async function callAIEditor(instruction, files, apiKey) {
  const prompt = `
Você é um engenheiro Android senior.

INSTRUÇÃO:
${instruction}

Arquivos:
${JSON.stringify(files)}

Mantenha o projeto compilável.
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

  return {
    files: {
      "result.txt": data.choices?.[0]?.message?.content || ""
    }
  };
}
