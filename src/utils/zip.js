import JSZip from "jszip";

export async function downloadAndExtractZip(url) {
  const res = await fetch(url);
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
