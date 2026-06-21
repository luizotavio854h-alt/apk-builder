import JSZip from "jszip";

export async function downloadAndExtractZip(zipUrl) {
  const res = await fetch(zipUrl);

  if (!res.ok) {
    throw new Error("Falha ao baixar ZIP");
  }

  const buffer = await res.arrayBuffer();

  const zip = await JSZip.loadAsync(buffer);

  const files = {};

  for (const [path, file] of Object.entries(zip.files)) {
    if (!file.dir) {
      files[path] = await file.async("string");
    }
  }

  return files;
}
