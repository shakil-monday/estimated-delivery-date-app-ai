import type { AdminClient } from "./sync.server";

export interface StoreInfo {
  storeUrl: string | null;
  previewUrl: string | null;
  /** true/false when the live theme could be checked, null when it couldn't. */
  blockInstalled: boolean | null;
  addBlockUrl: string;
}

const STORE_INFO_QUERY = `#graphql
  query DeliveryStoreInfo {
    shop { primaryDomain { url } }
    products(first: 1, query: "status:active", sortKey: UPDATED_AT, reverse: true) {
      nodes { handle onlineStoreUrl }
    }
  }`;

const THEME_FILES_QUERY = `#graphql
  query DeliveryThemeFiles {
    themes(first: 1, roles: [MAIN]) {
      nodes {
        files(first: 250, filenames: ["templates/*.json", "sections/*.json"]) {
          nodes {
            filename
            body { ... on OnlineStoreThemeFileBodyText { content } }
          }
        }
      }
    }
  }`;

const BLOCK_HANDLE = "delivery-estimate";

async function getUrls(admin: AdminClient, fallback: string) {
  try {
    const json = await (await admin.graphql(STORE_INFO_QUERY)).json();
    const storeUrl: string = json.data?.shop?.primaryDomain?.url ?? fallback;
    const product = json.data?.products?.nodes?.[0];
    const previewUrl: string = product ? product.onlineStoreUrl ?? `${storeUrl}/products/${product.handle}` : storeUrl;
    return { storeUrl, previewUrl };
  } catch (error) {
    console.error("Store info query failed", error);
    return { storeUrl: fallback, previewUrl: fallback };
  }
}

async function isBlockInstalled(admin: AdminClient) {
  try {
    const json = await (await admin.graphql(THEME_FILES_QUERY)).json();
    const files = json.data?.themes?.nodes?.[0]?.files?.nodes;
    if (!Array.isArray(files)) return null;
    return files.some((f: { body?: { content?: string } }) => f.body?.content?.includes(`/blocks/${BLOCK_HANDLE}/`));
  } catch (error) {
    console.error("Theme files query failed", error);
    return null;
  }
}

/**
 * Storefront preview link, theme-editor deep link, and whether the app block is
 * in the live theme. Never throws. Loaders return it un-awaited so the page
 * renders immediately and the buttons stream in.
 */
export async function getStoreInfo(admin: AdminClient, shop: string): Promise<StoreInfo> {
  const storeHandle = shop.replace(".myshopify.com", "");
  const addBlockUrl =
    `https://admin.shopify.com/store/${storeHandle}/themes/current/editor` +
    `?template=product&addAppBlockId=${process.env.SHOPIFY_API_KEY}/${BLOCK_HANDLE}&target=mainSection`;
  const [urls, blockInstalled] = await Promise.all([getUrls(admin, `https://${shop}`), isBlockInstalled(admin)]);
  return { ...urls, blockInstalled, addBlockUrl };
}
