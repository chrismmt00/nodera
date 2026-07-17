import { ApiDocs } from "@/components/api-docs.js";

export const metadata = {
  title: "API documentation - Nodera",
  description: "Quickstart and complete API reference for Nodera jobs, providers, artifacts, and webhooks.",
};

export default function DocsPage() {
  return <ApiDocs />;
}
