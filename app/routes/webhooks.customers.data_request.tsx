import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// The app stores no customer data, so there is nothing to report.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  return new Response();
};
