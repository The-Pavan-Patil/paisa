/**
 * Node can install a `globalThis.localStorage` accessor that throws on **any read**
 * (including `typeof localStorage`) unless Node is started with `--localstorage-file`.
 * SSR dependencies may still touch it. Replace it without ever reading the old value.
 */
function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(String(key)) ? map.get(String(key))! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(String(key));
    },
    setItem(key: string, value: string) {
      map.set(String(key), String(value));
    },
  };
}

let installed = false;

export function installNodeLocalStorageShim(): void {
  if (installed) {
    return;
  }

  const shim = createMemoryStorage();

  try {
    Reflect.deleteProperty(globalThis, "localStorage");
  } catch {
    // ignore
  }

  try {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: shim,
    });
  } catch {
    try {
      Reflect.defineProperty(globalThis, "localStorage", {
        configurable: true,
        enumerable: true,
        writable: true,
        value: shim,
      });
    } catch {
      console.warn(
        "[fintrack] Could not replace globalThis.localStorage; try Node 20 LTS or `npm run dev:webpack`.",
      );
    }
  }

  installed = true;
}
