export function publicAssetPath(path: string) {
  const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");
  const assetPath = path.startsWith("/") ? path : `/${path}`;
  return `${basePath}${assetPath}`;
}
