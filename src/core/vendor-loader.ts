export type VendorName = 'mermaid' | 'katex';

export type VendorLoader = (vendor: VendorName) => Promise<void>;

interface VendorGlobals {
  __usherMermaid?: unknown;
  __usherKatex?: unknown;
}

const GLOBAL_KEYS: Record<VendorName, keyof VendorGlobals> = {
  mermaid: '__usherMermaid',
  katex: '__usherKatex',
};

export function vendorGlobal<T>(vendor: VendorName): T | undefined {
  return (globalThis as VendorGlobals)[GLOBAL_KEYS[vendor]] as T | undefined;
}

const pending = new Map<VendorName, Promise<void>>();

/** Loads a lazy bundle at most once per realm, regardless of how many callers ask. */
export async function ensureVendor(vendor: VendorName, loader: VendorLoader): Promise<void> {
  if (vendorGlobal(vendor)) {
    return;
  }
  let inFlight = pending.get(vendor);
  if (!inFlight) {
    inFlight = loader(vendor).finally(() => pending.delete(vendor));
    pending.set(vendor, inFlight);
  }
  await inFlight;
}

/** Extension pages can just append a script tag; content scripts cannot. */
export function createScriptTagLoader(assetUrl: (path: string) => string): VendorLoader {
  return (vendor) =>
    new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = assetUrl(`vendor/${vendor}.js`);
      script.async = true;
      script.addEventListener('load', () => resolve());
      script.addEventListener('error', () => reject(new Error(`Failed to load ${vendor}`)));
      document.head.appendChild(script);
    });
}
