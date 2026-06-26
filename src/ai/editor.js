export async function callAIEditor(instruction, files, apiKey) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",

      // 🔥 FORÇA JSON (ESSENCIAL)
      response_format: { type: "json_object" },

      messages: [
        {
          role: "system",
          content: `
Você edita projetos Android Studio.

REGRAS:
- NÃO quebrar Gradle
- NÃO remover arquivos
- manter estrutura completa
- retornar SOMENTE JSON no formato:

{
  "files": {
    "path/file": "conteudo"
  }
}
`
        },
        {
          role: "user",
          content: `INSTRUÇÃO: ${instruction}\n\nPROJETO:\n${JSON.stringify(files)}`
        }
      ],

      temperature: 0.2
    })
  });

  const data = await res.json();

  const text = data.choices?.[0]?.message?.content;

  if (!text) {
    return {
      files: {
        "error.txt": "Empty AI response"
      }
    };
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    console.log("AI INVALID JSON:", text);

    return {
      files: {
        "error.txt": text
      }
    };
  }
}
