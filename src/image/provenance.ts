import { ImageInput, ProvenanceResult } from './types';

/**
 * Extracts raw buffer from various ImageInput types safely.
 */
async function getRawBuffer(input: ImageInput): Promise<Uint8Array | null> {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    return new Uint8Array(await input.arrayBuffer());
  }
  if (typeof input === 'string') {
    if (typeof process !== 'undefined' && process.versions?.node) {
      const fs = await import('fs/promises');
      const buf = await fs.readFile(input);
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    }
  }
  return null;
}

/**
 * Extracts and cryptographically inspects C2PA/JUMBF manifests and metadata hints.
 * Leverages @contentauth/c2pa-node on Node.js and @contentauth/c2pa-web in browsers.
 */
export async function extractProvenance(input: ImageInput): Promise<ProvenanceResult> {
  const buffer = await getRawBuffer(input);
  if (!buffer) {
    return { status: 'none' };
  }

  const isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);

  // 1. NODE.JS C2PA VALIDATION
  if (isNode) {
    try {
      const c2paNode: any = await import('@contentauth/c2pa-node');
      const nodeBuffer = Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      
      let reader = null;
      if (c2paNode.Reader && typeof c2paNode.Reader.fromAsset === 'function') {
        reader = await c2paNode.Reader.fromAsset({
          buffer: nodeBuffer,
          mimeType: 'image/jpeg'
        });
      }

      if (reader) {
        const active = reader.getActive ? reader.getActive() : null;
        const store = reader.json ? reader.json() : null;
        const activeManifest = active || (store && store.active_manifest);

        if (activeManifest) {
          const assertions = activeManifest.assertions || [];
          const isAiAsserted = assertions.some((a: any) =>
            a.label?.includes('c2pa.trained_algorithmic_media') ||
            a.label?.includes('ai.generated') ||
            a.data?.metadata?.digitalSourceType?.includes('trainedAlgorithmicMedia')
          );

          if (isAiAsserted) {
            return {
              status: 'validated_ai',
              source: activeManifest.claim_generator || 'C2PA Manifest',
              details: { title: activeManifest.title, issuer: activeManifest.signature_info?.issuer }
            };
          }

          const isEditAsserted = assertions.some((a: any) =>
            a.label?.includes('c2pa.actions') || a.label?.includes('edited')
          );

          if (isEditAsserted) {
            return {
              status: 'validated_edit',
              source: activeManifest.claim_generator || 'C2PA Manifest',
              details: { title: activeManifest.title }
            };
          }

          return {
            status: 'present_unknown',
            source: activeManifest.claim_generator || 'C2PA Manifest'
          };
        }
      }
    } catch {
      // If C2PA manifest is not present or library fails, continue to metadata hints
    }
  }

  // 2. BROWSER C2PA VALIDATION
  if (!isNode && typeof window !== 'undefined') {
    try {
      const c2paWeb: any = await import('@contentauth/c2pa-web');
      if (typeof c2paWeb.createC2pa === 'function') {
        const c2pa = await c2paWeb.createC2pa();
        const blob = new Blob([buffer as BlobPart]);
        const res = await c2pa.read(blob);

        if (res && res.manifestStore && res.manifestStore.activeManifest) {
          const active = res.manifestStore.activeManifest;
          const isAi = active.ingredients?.some((ing: any) =>
            ing.relationship === 'parentOf' && ing.title?.toLowerCase().includes('ai')
          );

          return {
            status: isAi ? 'validated_ai' : 'present_unknown',
            source: active.claimGenerator?.split(' ')[0] || 'C2PA Manifest'
          };
        }
      }
    } catch {
      // Browser C2PA absent or invalid
    }
  }

  // 3. METADATA HINT INSPECTION (Weak evidence, not cryptographic)
  const headerSlice = buffer.subarray(0, Math.min(buffer.length, 65536));
  const headerText = new TextDecoder('utf-8', { fatal: false }).decode(headerSlice);

  const generatorHints = ['Midjourney', 'Stable Diffusion', 'DALL-E', 'com.adobe.generative-ai', 'ComfyUI', 'NovelAI'];
  for (const hint of generatorHints) {
    if (headerText.includes(hint)) {
      return {
        status: 'present_unknown',
        source: `Metadata Hint (${hint})`
      };
    }
  }

  return { status: 'none' };
}
