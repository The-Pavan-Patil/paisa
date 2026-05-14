import { installNodeLocalStorageShim } from "@/lib/polyfills/node-localstorage";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  installNodeLocalStorageShim();
}
